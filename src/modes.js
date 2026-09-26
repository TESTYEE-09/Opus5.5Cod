// Game modes. Team Deathmatch is the plain game; Ground War adds five capture points you can
// spawn on; Undercover is co-op against the whole garrison, wearing their uniform.
//
// A mode is created for every match on every peer. The host (or solo game) runs update();
// clients only mirror what netState() sends them, so HUD code can read the same fields.
import * as THREE from 'three';
import { flags, sites, spawns, walkable, overlaps, lineOfSight, randomWalkable, objects, SIZE, STEP } from './world.js';

const r2 = (v) => Math.round(v * 100) / 100;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// a random free spot in a ring around (x, z)
function spotNear(x, z, r0, r1) {
  for (let n = 0; n < 40; n++) {
    const a = Math.random() * Math.PI * 2, d = r0 + Math.random() * (r1 - r0);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (walkable(Math.floor(px), Math.floor(pz)) && !overlaps(px, pz, 0.45, STEP, 1.8)) return { x: px, z: pz };
  }
  return null;
}

class Tdm {
  constructor(game) { this.game = game; this.kind = 'tdm'; }
  get calls() { return true; }
  teamBots(team, humans) { return Math.max(0, (this.game.mapDef?.teamSize || 8) - humans); }
  setup() {}
  pickSpawn() { return null; }
  botGoal() { return null; }
  vehicleGoal() { return null; }
  canTarget() { return true; }
  update() {}
  onKill() {}
  alert() {}
  interaction() { return null; }
  act() {}
  netState() { return null; }
  applyNet() {}
  lookFor(s) { return s.team; }
  respawnDelay() { return 4 + Math.random() * 1.5; }
  aiCalls() { return this.calls; }
  hostileIds() { return []; }
  marker() { return null; }
}

// ---------- Ground War ----------
const CAP_R = 10;
export class GroundWar extends Tdm {
  constructor(game) {
    super(game);
    this.kind = 'gw';
    this.flags = flags.map(f => {
      const owner = f.id === 'A' || f.id === 'B' ? 0 : f.id === 'D' || f.id === 'E' ? 1 : -1;
      return { id: f.id, x: f.x, z: f.z, owner, cap: owner === 0 ? 1 : owner === 1 ? -1 : 0, contest: false, n: [0, 0] };
    });
    this.tick = 0;
  }

  get calls() { return true; }

  // spawn options for a team: its base, and every flag it owns that no enemy is standing on
  spawnOptions(team) {
    const out = [{ id: 'base' }];
    for (const f of this.flags) if (f.owner === team && !f.contest && f.n[1 - team] === 0) out.push({ id: f.id, f });
    return out;
  }

  // the owned flag closest to the fight: fewest steps from a flag we don't own
  frontFlag(team) {
    const opts = this.spawnOptions(team).filter(o => o.f);
    if (!opts.length) return null;
    const enemyFlags = this.flags.filter(f => f.owner !== team);
    let best = null, bd = Infinity;
    for (const o of opts) {
      const d = Math.min(...enemyFlags.map(e => Math.hypot(e.x - o.f.x, e.z - o.f.z)), 1e9) + Math.random() * 60;
      if (d < bd) { bd = d; best = o.f; }
    }
    return best;
  }

  pickSpawn(team, who) {
    const g = this.game;
    let f = null;
    const choice = who?.isPlayer ? g.spawnChoice : null;
    if (choice && choice !== 'base') f = this.flags.find(x => x.id === choice && x.owner === team && x.n[1 - team] === 0) || null;
    else if (choice !== 'base' && Math.random() < 0.8) f = this.frontFlag(team);
    if (!f) return null;
    for (let n = 0; n < 6; n++) {
      const p = spotNear(f.x, f.z, 5, 16);
      if (!p) continue;
      if (g.soldiers.some(s => s.alive && s.team !== team && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 22)) continue;
      const enemy = this.flags.filter(x => x.owner !== team).sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z))[0];
      const yaw = enemy ? Math.atan2(-(enemy.x - p.x), -(enemy.z - p.z)) : (team === 0 ? Math.PI : 0);
      return { x: p.x, z: p.z, yaw };
    }
    return null;
  }

  // most bots push the nearest flag they don't own; some hold what they have
  botGoal(bot) {
    const mine = this.flags.filter(f => f.owner === bot.team), other = this.flags.filter(f => f.owner !== bot.team);
    const near = (list) => list.map(f => ({ f, d: Math.hypot(f.x - bot.pos.x, f.z - bot.pos.z) + Math.random() * 70 })).sort((a, b) => a.d - b.d)[0]?.f;
    let f;
    const threatened = mine.filter(x => x.contest || x.n[1 - bot.team] > 0);
    if (threatened.length && Math.random() < 0.5) f = near(threatened);
    else if (other.length && Math.random() < 0.8) f = near(other);
    else f = near(mine) || near(other);
    if (!f) return null;
    const p = spotNear(f.x, f.z, 1, CAP_R - 2) || { x: f.x, z: f.z };
    return { x: p.x, z: p.z, flag: f.id };
  }

  vehicleGoal(team) {
    const other = this.flags.filter(f => f.owner !== team);
    const f = other[Math.floor(Math.random() * other.length)] || this.flags[2];
    return f ? { x: f.x + (Math.random() - 0.5) * 20, z: f.z + (Math.random() - 0.5) * 20 } : null;
  }

  update(dt) {
    const g = this.game;
    for (const f of this.flags) {
      f.n[0] = 0; f.n[1] = 0;
      for (const s of g.soldiers) {
        if (!s.alive || Math.abs(s.pos.y) > 6) continue;
        if (s.vehicle?.air) continue;
        if (Math.hypot(s.pos.x - f.x, s.pos.z - f.z) < CAP_R) f.n[s.team]++;
      }
      f.contest = f.n[0] > 0 && f.n[1] > 0;
      if (f.contest || (!f.n[0] && !f.n[1])) continue;
      const t = f.n[0] ? 0 : 1, dir = t === 0 ? 1 : -1, before = f.cap;
      f.cap = Math.max(-1, Math.min(1, f.cap + dir * dt * 0.1 * Math.min(3, f.n[t])));
      if (f.owner === 1 - t && before * dir < 0 && f.cap * dir >= 0) {
        f.owner = -1;
        g.announce(t, `Enemy flag ${f.id} neutralized`, `Flag ${f.id} lost`);
      }
      if (f.owner !== t && Math.abs(f.cap) >= 1) {
        f.owner = t;
        g.announce(t, `Flag ${f.id} secured`, `Enemy captured ${f.id}`);
        for (const s of g.soldiers) if (s.alive && s.team === t && Math.hypot(s.pos.x - f.x, s.pos.z - f.z) < CAP_R) { s.score += 200; g.popupFor(s, [['Flag captured', 200]]); }
      }
    }
    // each flag held scores a point every 4 s
    if ((this.tick += dt) >= 4) {
      this.tick = 0;
      for (const f of this.flags) if (f.owner >= 0) g.teamScore[f.owner]++;
      if (g.teamScore.some(v => v >= g.settings.scoreLimit)) g.end();
    }
  }

  onKill(killer, victim) {
    if (!killer || killer.team === victim.team) return;
    for (const f of this.flags) {
      const kd = Math.hypot(killer.pos.x - f.x, killer.pos.z - f.z), vd = Math.hypot(victim.pos.x - f.x, victim.pos.z - f.z);
      if (f.owner === killer.team && (kd < CAP_R * 1.5 || vd < CAP_R * 1.5)) { killer.score += 50; this.game.popupFor(killer, [['Defended ' + f.id, 50]]); break; }
      if (f.owner !== killer.team && vd < CAP_R * 1.5) { killer.score += 50; this.game.popupFor(killer, [['Assaulted ' + f.id, 50]]); break; }
    }
  }

  netState() { return { f: this.flags.map(f => [f.owner, r2(f.cap), f.contest ? 1 : 0, f.n[0], f.n[1]]) }; }
  applyNet(m) {
    if (!Array.isArray(m?.f)) return;
    m.f.forEach((row, i) => {
      const f = this.flags[i];
      if (!f || !Array.isArray(row)) return;
      f.owner = row[0]; f.cap = row[1]; f.contest = !!row[2]; f.n[0] = row[3] | 0; f.n[1] = row[4] | 0;
    });
  }
}

// ---------- Undercover ----------
// The humans (team 0, USA) wear Russian uniforms. The garrison (team 1) ignores them until
// something gives them away: each guard who can see you builds suspicion, faster when you
// run, crouch, aim, carry on close by, or walk into a guarded place. At 100 you are made: the
// guard turns on you and radios it in unless you drop him within a few seconds. Unsuppressed
// shots, explosions, wounded guards and bodies left in sight do the same. Once the alarm is
// up the whole garrison hunts you, reinforcements roll in, and it only dies down after a
// minute with nobody seeing you.
export const OBJECTIVES = [
  { id: 'infil', text: 'Infiltrate the town at C' },
  { id: 'intel', text: 'Download the intel at the command post' },
  { id: 'hvt', text: 'Eliminate Colonel Volkov' },
  { id: 'sam', text: 'Sabotage the SAM launchers' },
  { id: 'exfil', text: 'Reach the exfil helicopter' },
];
const RADIO_T = 7;

export class Undercover extends Tdm {
  constructor(game) {
    super(game);
    this.kind = 'uc';
    this.done = OBJECTIVES.map(() => false);
    this.alarm = false; this.caution = false; this.alarmCalm = 0;
    this.susp = new Map(); this.watch = new Map();
    this.radio = null; // { t } pending alarm call
    this.bodies = [];
    this.reinforce = 16;
    this.charges = []; // { site, t, by }
    this.planted = new Set();
    this.exfilT = -1; this.heliT = 0;
    this.alarms = 0;
    this.result = null;
    this.site = (k) => sites.find(s => s.kind === k);
    const c = flags.find(f => f.id === 'C');
    this.town = c ? { x: c.x, z: c.z } : { x: SIZE / 2, z: SIZE / 2 };
    this.hvt = null;
    this.senseT = 0; this.bodyT = 0;
  }

  get calls() { return false; }
  aiCalls(team) { return team === 1 && this.alarm; }
  lookFor() { return 1; }
  teamBots() { return 0; }
  get current() { return this.done.findIndex(d => !d); }

  // the garrison: guards at every flag and mission site, patrols on the roads, the colonel
  // and his escort; called once on the host after the soldiers exist
  setup(makeBot) {
    const posts = [];
    const add = (x, z, n, kind = 'guard', extra = {}) => { for (let i = 0; i < n; i++) posts.push({ x, z, kind, ...extra }); };
    for (const f of flags) add(f.x, f.z, f.id === 'C' ? 4 : 2);
    for (const k of ['intel', 'sam1', 'sam2']) { const s = this.site(k); if (s) add(s.x, s.z, k === 'intel' ? 3 : 2); }
    const base = spawns[1].filter(s => !s.fwd);
    for (let i = 0; i < 4 && base.length; i++) { const s = base[(i * 3) % base.length]; add(s.x, s.z - 10, 1); }
    // patrols walking between flags
    const route = (ids) => ids.map(id => flags.find(f => f.id === id)).filter(Boolean).map(f => ({ x: f.x, z: f.z }));
    for (const r of [['C', 'D'], ['D', 'E'], ['B', 'C'], ['A', 'C'], ['C', 'E'], ['A', 'B']]) posts.push({ kind: 'patrol', route: route(r), x: 0, z: 0 });
    const hs = this.site('hvt');
    for (const p of posts) makeBot(p);
    if (hs) {
      this.hvt = makeBot({ kind: 'hvt', x: hs.x, z: hs.z });
      this.hvt.name = 'Col. Volkov';
      for (let i = 0; i < 3; i++) makeBot({ kind: 'guard', x: hs.x, z: hs.z, escort: true });
    }
  }

  // where each garrison soldier stands at the start
  initialSpot(bot) {
    const r = bot.role;
    if (!r) return null;
    const c = r.kind === 'patrol' ? r.route[0] : r;
    const p = spotNear(c.x, c.z, r.kind === 'hvt' ? 0.5 : 2, r.kind === 'guard' ? 9 : 4) || randomWalkable(SIZE * 0.55, SIZE - 20);
    r.home = { x: p.x, z: p.z };
    return { x: p.x, z: p.z, yaw: Math.random() * Math.PI * 2 };
  }

  pickSpawn(team) {
    if (team !== 0) {
      const base = spawns[1].filter(s => !s.fwd);
      return base[Math.floor(Math.random() * base.length)] || null;
    }
    const s = this.site('insert');
    const p = s && spotNear(s.x, s.z, 1, 6);
    return p ? { x: p.x, z: p.z, yaw: Math.PI * 0.75 } : null;
  }

  respawnDelay(bot) { return bot.team === 1 ? (this.alarm && this.reinforce > 0 ? 18 : Infinity) : 8; }

  // the garrison only shoots at people it has made
  canTarget(bot, t) {
    if (bot.team !== 1 || t.team !== 0) return true;
    return this.alarm || !!bot.hostile;
  }

  hostileTo(bot) { return this.alarm || !!bot?.hostile; }

  // calm soldiers go about their business; returns a goal and the pace to walk it at
  botGoal(bot) {
    const r = bot.role;
    if (!r || this.hostileTo(bot)) {
      if (this.alarm) {
        // hunting: head for where people were last seen
        const intel = this.game.intel[1];
        const i = intel.length ? intel[Math.floor(Math.random() * intel.length)] : null;
        if (i) return { x: i.x + (Math.random() - 0.5) * 8, z: i.z + (Math.random() - 0.5) * 8 };
        if (bot.role?.kind === 'hvt') { const b = spawns[1][0]; return b ? { x: b.x, z: b.z } : null; }
      }
      return null;
    }
    if (r.kind === 'patrol') {
      r.i = ((r.i ?? 0) + 1) % r.route.length;
      const w = r.route[r.i], p = spotNear(w.x, w.z, 0, 8) || w;
      return { x: p.x, z: p.z, pace: 0.34, wait: 3 + Math.random() * 6 };
    }
    const h = r.home || r;
    if (Math.random() < 0.55) return { x: h.x, z: h.z, pace: 0.3, wait: 6 + Math.random() * 10, idle: true };
    const p = spotNear(h.x, h.z, 2, r.kind === 'hvt' ? 5 : 8);
    return p ? { x: p.x, z: p.z, pace: 0.3, wait: 4 + Math.random() * 8, idle: true } : null;
  }

  // something turned this guard on the player (or someone): he fights, and radios it in
  alert(bot, source, pos) {
    if (!bot.alive || bot.team !== 1) return;
    const fresh = !bot.hostile;
    bot.hostile = true;
    if (source && source.alive) { bot.target = source.vehicle?.alive ? source.vehicle : source; bot.lastKnown.copy(pos || source.pos); bot.lastSeenT = this.game.time - 0.5; }
    bot.goal = null; bot.path = null;
    if (!this.alarm && fresh && !this.radio) {
      this.radio = { t: RADIO_T };
      this.game.announce(0, 'COMPROMISED: silence them before they radio it in', '');
    }
    // nearby friends hear the shouting
    for (const o of this.game.bots) {
      if (o === bot || !o.alive || o.hostile || o.team !== 1) continue;
      if (o.pos.distanceTo(bot.pos) < 18) { o.hostile = true; if (source) o.hear(source, pos || source.pos); }
    }
  }

  raiseAlarm() {
    if (this.alarm) return;
    this.alarm = true; this.alarms++;
    this.radio = null; this.alarmCalm = 0; this.caution = true;
    this.game.announce(0, 'ALARM RAISED: the garrison is hunting you', '');
    this.game.audio.siren(true);
    for (const b of this.game.bots) if (b.team === 1) { b.goal = null; b.path = null; }
  }

  clearAlarm() {
    this.alarm = false; this.radio = null;
    for (const b of this.game.bots) { b.hostile = false; b.target = null; b.goal = null; }
    this.game.announce(0, 'The search has been called off. Stay out of sight', '');
    this.game.audio.siren(false);
  }

  humans() { return this.game.soldiers.filter(s => s.team === 0 && (s.isPlayer || s.human)); }

  restricted(p) {
    for (const k of ['intel', 'sam1', 'sam2', 'hvt']) {
      const s = this.site(k);
      if (s && Math.hypot(p.x - s.x, p.z - s.z) < 20) return true;
    }
    return p.z > SIZE - 42 && Math.abs(p.x - SIZE / 2) < 95;
  }

  // how suspicious a person looks right now
  behaviour(h) {
    const g = this.game;
    let b = 1;
    const sp = Math.hypot(h.vel.x, h.vel.z);
    if (sp > 5.8) b *= 2.4;
    const crouch = h.isPlayer ? h.crouchAmt : Math.min(1, h.crouchAmt), prone = h.isPlayer ? h.proneAmt : h.proneAmt;
    if (prone > 0.5) b *= 2.5; else if (crouch > 0.5) b *= 1.6;
    const ads = h.isPlayer ? g.arsenal.ads > 0.5 : !!h.adsing;
    if (ads) b *= 3;
    if (g.time - (h.shotT ?? h.firedT) < 2) b *= 4;
    if (Math.abs(h.leanOff || 0) > 0.2) b *= 1.5;
    return b;
  }

  sense(dt) {
    const g = this.game, mult = this.caution ? 1.5 : 1;
    for (const h of this.humans()) {
      let v = this.susp.get(h.id) || 0;
      if (!h.alive || h.inVehicle) { this.susp.set(h.id, 0); this.watch.set(h.id, []); continue; }
      const b = this.behaviour(h), rz = this.restricted(h.pos);
      let rate = 0, best = 0, spotter = null;
      const watchers = [];
      const cand = [];
      for (const bot of g.bots) {
        if (!bot.alive || bot.team !== 1 || bot.hostile) continue;
        const d = Math.hypot(bot.pos.x - h.pos.x, bot.pos.z - h.pos.z);
        if (d < 42) cand.push([d, bot]);
      }
      cand.sort((p, q) => p[0] - q[0]);
      for (const [d, bot] of cand.slice(0, 6)) {
        const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
        const dot = ((h.pos.x - bot.pos.x) * fx + (h.pos.z - bot.pos.z) * fz) / Math.max(d, 0.01);
        if (dot < 0.25 && d > 4) continue;
        if (!lineOfSight(bot.eye(_a), h.aimPoint(_b, true))) continue;
        const prox = d < 4 ? 1 : d < 10 ? 0.6 : d < 24 ? 0.3 : 0.12;
        let r = prox * 18 * b * (rz ? 2.5 : 1);
        if (b < 1.3 && !rz && d > 12) r = 0;
        if (r <= 0) continue;
        rate += r; watchers.push(bot.id);
        if (r > best) { best = r; spotter = bot; }
      }
      v = rate > 0 ? v + rate * mult * dt : Math.max(0, v - 9 * dt);
      if (v >= 100 && spotter) { v = 0; this.alert(spotter, h, h.pos); }
      this.susp.set(h.id, Math.min(100, v));
      this.watch.set(h.id, watchers.slice(0, 4));
    }
  }

  onKill(killer, victim) {
    if (victim.team === 1) {
      this.bodies.push({ x: victim.pos.x, y: victim.pos.y, z: victim.pos.z, t: this.game.time });
      if (victim === this.hvt && !this.done[2]) this.complete(2);
    }
  }

  complete(i) {
    if (this.done[i]) return;
    this.done[i] = true;
    const g = this.game, next = this.current;
    g.hud.banner(`${OBJECTIVES[i].text}: done`, next >= 0 ? OBJECTIVES[next].text : '', 'ally');
    g.audio.streak();
    g.emit({ k: 'ann', team: 0, a: `${OBJECTIVES[i].text}: done`, e: '' });
    for (const h of this.humans()) { h.score += 500; g.popupFor(h, [['Objective complete', 500]]); }
  }

  // the Hold-F action nearest to a player, if any: { id, text, time, pos }
  interaction(pl) {
    if (!pl.alive) return null;
    const near = (s, r) => s && Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z) < r && Math.abs(pl.pos.y - 0) < 2;
    const intel = this.site('intel');
    if (!this.done[1] && near(intel, 2.4)) return { id: 'intel', text: 'Hold F to download the intel', time: 4, pos: intel };
    if (!this.done[3]) for (const k of ['sam1', 'sam2']) {
      const s = this.site(k);
      if (near(s, 4.2) && !this.planted.has(k) && objects[s.obj]?.alive) return { id: k, text: 'Hold F to plant a charge', time: 2.5, pos: s };
    }
    return null;
  }

  // host: a player finished a Hold-F action
  act(s, id) {
    const it = this.interaction(s);
    if (!it || it.id !== id) return;
    if (id === 'intel') this.complete(1);
    else if (id === 'sam1' || id === 'sam2') {
      this.planted.add(id);
      this.charges.push({ site: this.site(id), t: 8, by: s });
      this.game.announce(0, 'Charge planted: 8 seconds', '');
    }
  }

  update(dt) {
    const g = this.game;
    if (this.result) return;
    if ((this.senseT -= dt) <= 0) { this.senseT = 0.1; this.sense(0.1); }
    const hs = this.humans();
    // objectives
    if (!this.done[0] && hs.some(h => h.alive && Math.hypot(h.pos.x - this.town.x, h.pos.z - this.town.z) < 18)) this.complete(0);
    if (!this.done[3]) {
      const sams = ['sam1', 'sam2'].map(k => this.site(k)).filter(Boolean);
      if (sams.length && sams.every(s => !objects[s.obj]?.alive)) this.complete(3);
    }
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      if ((c.t -= dt) > 0) continue;
      this.charges.splice(i, 1);
      const o = objects[c.site.obj];
      g.explode(new THREE.Vector3(c.site.x, 1.2, c.site.z), c.by, 8, 260, 'C4');
      if (o?.alive) g.breakObj(o, c.by);
      this.raiseAlarm();
    }
    // exfil once everything else is done
    if (this.done.slice(0, 4).every(Boolean) && !this.done[4]) {
      const lz = this.site('lz'), inZone = lz && hs.some(h => h.alive && Math.hypot(h.pos.x - lz.x, h.pos.z - lz.z) < 14);
      if (this.exfilT < 0 && inZone) { this.exfilT = 30; g.announce(0, 'Exfil inbound: hold the LZ for 30 seconds', ''); }
      if (this.exfilT > 0 && inZone) this.exfilT = Math.max(0, this.exfilT - dt);
      if (this.exfilT === 0 && inZone) { this.complete(4); this.finish(true); return; }
    }
    // the radio call: kill every guard who has seen you before it goes through
    if (this.radio && !this.alarm) {
      if (!g.bots.some(b => b.alive && b.team === 1 && b.hostile)) { this.radio = null; g.announce(0, 'Threat silenced', ''); }
      else if ((this.radio.t -= dt) <= 0) this.raiseAlarm();
    }
    // bodies found by calm guards
    if ((this.bodyT -= dt) <= 0) {
      this.bodyT = 0.5;
      this.bodies = this.bodies.filter(b => g.time - b.t < 90);
      for (const bot of g.bots) {
        if (!bot.alive || bot.team !== 1 || bot.hostile || this.alarm) continue;
        for (const body of this.bodies) {
          const d = Math.hypot(body.x - bot.pos.x, body.z - bot.pos.z);
          if (d > 16 || !lineOfSight(bot.eye(_a), _b.set(body.x, body.y + 0.3, body.z))) continue;
          this.alert(bot, null, _b);
          bot.goal = { x: body.x, z: body.z }; bot.path = null;
          break;
        }
      }
    }
    // the alarm dies down after a minute with nobody seen
    if (this.alarm) {
      const seen = g.bots.some(b => b.alive && b.team === 1 && b.visible && b.target && (b.target.team === 0));
      this.alarmCalm = seen ? 0 : this.alarmCalm + dt;
      if (this.alarmCalm > 60) this.clearAlarm();
    }
    if (this.hvt?.model) this.hvt.model.tag.visible = this.current === 2 && this.hvt.alive;
  }

  finish(win) {
    this.result = win ? 'complete' : 'failed';
    const g = this.game;
    g.teamScore[0] = win ? 1 : 0; g.teamScore[1] = win ? 0 : 1;
    g.audio.siren(false);
    g.end();
  }

  // where the HUD points: the current objective
  marker() {
    const i = this.current;
    if (i < 0) return null;
    const id = OBJECTIVES[i].id;
    if (id === 'infil') return { x: this.town.x, z: this.town.z, y: 2, label: 'C' };
    if (id === 'intel') { const s = this.site('intel'); return s && { x: s.x, z: s.z, y: 1.2, label: 'INTEL' }; }
    if (id === 'hvt') return this.hvtPos ? { ...this.hvtPos, label: 'HVT' } : null;
    if (id === 'sam') {
      const s = ['sam1', 'sam2'].map(k => this.site(k)).find(x => x && objects[x.obj]?.alive && !this.planted.has(x.kind));
      return s && { x: s.x, z: s.z, y: 3, label: 'SAM' };
    }
    const lz = this.site('lz');
    return lz && { x: lz.x, z: lz.z, y: 1, label: 'EXFIL' };
  }

  // garrison soldiers actively fighting someone (for the red "!" markers)
  hostileIds() {
    if (this.game.role === 'client') return this.hostileNet || [];
    return this.game.bots.filter(b => b.alive && b.team === 1 && (b.hostile || this.alarm) && b.visible).slice(0, 16).map(b => b.id);
  }

  get hvtPos() { const h = this.hvt; return h?.alive ? { x: h.pos.x, y: h.pos.y + 2.3, z: h.pos.z } : this.hvtNet || null; }

  netState() {
    const s = {}, w = {};
    for (const [id, v] of this.susp) s[id] = Math.round(v);
    for (const [id, v] of this.watch) w[id] = v;
    const h = this.hvt;
    return {
      d: this.done.map(x => (x ? 1 : 0)), a: this.alarm ? 1 : 0, c: this.caution ? 1 : 0, r: this.radio ? r2(this.radio.t) : -1,
      s, w, x: r2(this.exfilT), p: [...this.planted], ch: this.charges.map(c => r2(c.t)), res: this.result,
      h: h?.alive ? [r2(h.pos.x), r2(h.pos.y + 2.3), r2(h.pos.z), h.id] : null, k: this.hostileIds(),
    };
  }

  applyNet(m) {
    if (!m || typeof m !== 'object') return;
    if (Array.isArray(m.d)) m.d.forEach((v, i) => { if (i < this.done.length) this.done[i] = !!v; });
    const was = this.alarm;
    this.alarm = !!m.a; this.caution = !!m.c;
    if (this.alarm !== was) this.game.audio.siren(this.alarm);
    this.radio = m.r >= 0 ? { t: m.r } : null;
    this.susp = new Map(Object.entries(m.s || {}).map(([k, v]) => [Number(k), Number(v) || 0]));
    this.watch = new Map(Object.entries(m.w || {}).map(([k, v]) => [Number(k), Array.isArray(v) ? v : []]));
    this.exfilT = Number(m.x ?? -1);
    this.planted = new Set(Array.isArray(m.p) ? m.p : []);
    this.chargeT = Array.isArray(m.ch) ? m.ch : [];
    this.result = m.res || null;
    this.hvtNet = Array.isArray(m.h) ? { x: m.h[0], y: m.h[1], z: m.h[2] } : null;
    this.hostileNet = Array.isArray(m.k) ? m.k.slice(0, 16) : [];
    const hb = Array.isArray(m.h) ? this.game.byId.get(m.h[3]) : null;
    if (hb?.model && this.hvtId !== m.h[3]) { this.hvtId = m.h[3]; hb.name = 'Col. Volkov'; }
  }
}

// ---------- FPV Hunt ----------
// 1 v 1 on a big map. The hider starts somewhere far from the hunter and has a head start;
// the hunter stays back and flies FPV drones (5 or 10 inch) and a slow recon drone with a
// thermal camera. The hider wins by surviving the clock, the hunter by killing them.
// Solo, a bot plays the other role: it hides in cover, or it hunts with drones.
export const HUNTER = 0, HIDER = 1;
const HEAD_START = 45;
export class Hunt extends Tdm {
  constructor(game) {
    super(game);
    this.kind = 'hunt';
    this.hideSpot = null; this.lastLaunch = 0; this.reconUp = false; this.over = false;
    this.told = false;
  }
  get calls() { return true; }
  get headStart() { return Math.max(0, HEAD_START - this.game.time); }
  teamBots(team, humans) { return humans ? 0 : 1; }
  aiCalls() { return false; }
  allowCall(kind, owner) { return owner?.team === HUNTER && this.headStart <= 0 && (kind === 'drone' || kind === 'recon'); }
  respawnDelay(s) { return s.team === HUNTER ? 5 : 9999; }

  pickSpawn(team) {
    if (team === HUNTER) { const b = spawns[0].find(s => !s.fwd) || spawns[0][0]; return b; }
    if (!this.hideSpot) {
      const b = spawns[0].find(s => !s.fwd) || spawns[0][0];
      for (let n = 0; n < 200; n++) {
        const p = randomWalkable(20, SIZE - 20);
        if (p && Math.hypot(p.x - b.x, p.z - b.z) > SIZE * 0.45) { this.hideSpot = { x: p.x, z: p.z, yaw: Math.random() * 6.28 }; break; }
      }
      this.hideSpot ||= { x: SIZE / 2, z: SIZE * 0.8, yaw: 0 };
    }
    return this.hideSpot;
  }

  // a bot hider finds cover near its start and stays low; a bot hunter stays at base
  botGoal(bot) {
    if (bot.team === HUNTER) return { x: bot.pos.x, z: bot.pos.z, wait: 30 };
    if (!this.cover) this.cover = spotNear(this.hideSpot?.x ?? bot.pos.x, this.hideSpot?.z ?? bot.pos.z, 10, 45) || { x: bot.pos.x, z: bot.pos.z };
    return { x: this.cover.x, z: this.cover.z, wait: 60, pace: 0.6 };
  }

  update(dt) {
    const g = this.game;
    if (this.over) return;
    if (!this.told) {
      this.told = true;
      const me = g.player;
      g.hud.toast(me.team === HUNTER ? `Hunt them down. Drones in ${HEAD_START}s (7 FPV, 0 recon)` : 'Hide. Survive the clock. Shoot drones down.');
    }
    const hider = g.soldiers.find(s => s.team === HIDER);
    for (const b of g.bots) if (b.team === HIDER && b.alive && this.cover && Math.hypot(b.pos.x - this.cover.x, b.pos.z - this.cover.z) < 2) b.crouched = true;
    // bot hunter: keeps a recon drone up over the rough area and sends FPVs at what it finds
    const hb = g.bots.find(b => b.team === HUNTER && b.alive && !b.vehicle);
    if (hb && hider && this.headStart <= 0) {
      const guess = this.guess ||= { x: hider.pos.x + (Math.random() - 0.5) * 140, z: hider.pos.z + (Math.random() - 0.5) * 140 };
      if (hider.marked > g.time) { guess.x = hider.pos.x; guess.z = hider.pos.z; }
      const mine = g.vehicles.filter(v => v.alive && v.owner === hb);
      if (!mine.some(v => v.kind === 'recon')) { const r = g.callVehicle(hb, 'recon'); if (r) r.search = guess; }
      if (g.time - this.lastLaunch > 22 && mine.filter(v => v.spec.drone && !v.spec.recon).length < 1) {
        this.lastLaunch = g.time;
        const d = g.callVehicle(hb, 'drone');
        if (d) { d.search = guess; d.searchR = 70; d.needSight = true; }
      }
      // the guess drifts toward the truth as the search goes on
      guess.x += (hider.pos.x - guess.x) * dt * 0.01; guess.z += (hider.pos.z - guess.z) * dt * 0.01;
    }
    if (g.timeLeft <= 0.5 && g.teamScore[HUNTER] === 0) { g.teamScore[HIDER] = Math.max(1, g.teamScore[HIDER]); this.over = true; g.end(); }
  }

  onKill(killer, victim) {
    if (victim.team === HIDER && !this.over) {
      this.over = true;
      const g = this.game;
      g.teamScore[HUNTER] = 1; g.teamScore[HIDER] = 0;
      setTimeout(() => g.end(), 1500);
    }
  }
}

export function createMode(kind, game) {
  if (kind === 'hunt') return new Hunt(game);
  if (kind === 'gw') return new GroundWar(game);
  if (kind === 'uc') return new Undercover(game);
  return new Tdm(game);
}
