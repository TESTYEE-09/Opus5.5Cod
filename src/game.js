import * as THREE from 'three';
import { raycastWorld, lineOfSight, pointSolid, groundAt, overlaps, spawns, SIZE, GRAVITY, STEP, materialAt, objectAt, objectsNear, breakObject } from './world.js';
import { Effects } from './effects.js';
import { Arsenal, CLASSES, falloff, FUSE } from './weapons.js';
import { Player } from './player.js';
import { Bot, DIFFICULTY } from './bots.js';
import { Jet } from './streaks.js';
import { NetSoldier } from './net.js';
import { Chopper, Tank, FighterJet, Drone, VehicleProxy, Projectiles, PROJ, VEHICLE_WEAPONS, hitSoldier, placeEmplacements, tankSpot } from './vehicles.js';

const DEG = Math.PI / 180;
const NAMES = ['Viper', 'Ghost', 'Havoc', 'Reaper', 'Nomad', 'Sarge', 'Hawk', 'Wolf', 'Rook', 'Blitz', 'Frost', 'Onyx',
  'Mako', 'Diesel', 'Kestrel', 'Tank', 'Ranger', 'Cobra', 'Spike', 'Jackal', 'Raven', 'Brick', 'Ace', 'Echo', 'Bishop', 'Dozer'];
export const STREAKS = [
  { kills: 3, id: 'uav', name: 'UAV', key: '4' },
  { kills: 5, id: 'airstrike', name: 'Airstrike', key: '5' },
  { kills: 7, id: 'chopper', name: 'Chopper Gunner', key: '6' },
];
// vehicles anyone can call in, each on its own cooldown
export const CALLS = [
  { id: 'drone', name: 'FPV Drone', key: '7', cd: 30 },
  { id: 'tank', name: 'Tank', key: '8', cd: 75 },
  { id: 'jet', name: 'Jet', key: '9', cd: 75 },
];

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();

function cone(fwd, angle, out) {
  const r = angle * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
  _right.crossVectors(fwd, Math.abs(fwd.y) > 0.99 ? _e.set(1, 0, 0) : _e.set(0, 1, 0)).normalize();
  _up.crossVectors(_right, fwd);
  const tr = Math.tan(r);
  return out.copy(fwd).addScaledVector(_right, tr * Math.cos(th)).addScaledVector(_up, tr * Math.sin(th)).normalize();
}

const zoneMul = (def, zone) => zone === 'head' ? def.head : zone === 'legs' ? 0.85 : 1;
const TEAM_SIZE = 8;
export const TEAM_NAMES = ['USA', 'RUSSIA'];
// chunk colour for each kind of breaking thing
const DEBRIS = { wood: [0.5, 0.36, 0.22], sand: [0.62, 0.56, 0.42], metal: [0.3, 0.3, 0.3], plaster: [0.78, 0.72, 0.62], plaster2: [0.7, 0.66, 0.58],
  brick: [0.58, 0.32, 0.24], planks: [0.45, 0.35, 0.25], corrugated: [0.45, 0.48, 0.5], concrete: [0.6, 0.6, 0.58] };
const r2 = (v) => Math.round(v * 100) / 100;
const arr = (v) => [r2(v.x), r2(v.y), r2(v.z)];
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Game runs in one of three roles: 'solo', 'host' (authoritative, also sends snapshots)
// or 'client' (moves its own soldier, draws the rest from the host's snapshots).
export class Game {
  constructor({ renderer, scene, camera, wscene, audio, hud, loadMap }) {
    Object.assign(this, { renderer, scene, camera, wscene, audio, hud, loadMap });
    this.effects = new Effects(scene);
    this.arsenal = new Arsenal(this, wscene);
    this.player = new Player(this);
    this.player.id = 0;
    this.jet = new Jet(scene);
    this.bots = []; this.nets = []; this.soldiers = [this.player]; this.byId = new Map();
    this.grenades = []; this.pickups = []; this.vehicles = []; this.jobs = []; this.events = [];
    this.netNades = [];
    this.projectiles = new Projectiles(this);
    this.deadVehicles = new Set();
    this.predicted = []; this.booms = [];
    this.aiCallT = [60, 60];
    this.net = null;
    this.role = 'solo';
    this.state = 'menu';
    this.time = 0; this.shake = 0; this.flashT = 0;
    this.settings = { sens: 1, fov: 80, difficulty: 'regular', cls: 'assault', map: 'crossroads', scoreLimit: 100, timeLimit: 600 };
    this.diff = DIFFICULTY.regular;
    this.nadeGeo = new THREE.SphereGeometry(0.06, 10, 8);
    this.nadeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.6, metalness: 0.2 });
    this.pickGeo = new THREE.BoxGeometry(0.45, 0.25, 0.3);
    this.pickMat = new THREE.MeshStandardMaterial({ color: 0x4f5a3a, emissive: 0x3a5a10, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.2 });
  }

  get authority() { return this.role !== 'client'; }
  emit(ev) { if (this.role === 'host') this.events.push(ev); }

  // ---------- match flow ----------
  clear() {
    for (const s of [...this.bots, ...this.nets]) s.remove();
    for (const g of this.grenades) if (g.mesh) this.scene.remove(g.mesh);
    for (const m of this.netNades) this.scene.remove(m);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const v of this.vehicles) v.remove();
    this.projectiles.clear();
    this.player.vehicle = null; this.player.inVehicle = false;
    this.deadVehicles.clear();
    this.bots = []; this.nets = []; this.grenades = []; this.netNades = []; this.pickups = []; this.vehicles = [];
    this.jobs = []; this.events = []; this.booms = [];
    this.effects.clear();
  }

  // roster: humans [{id, name, team, me}] on solo/host; every soldier on a client.
  startMatch(settings, roster = null) {
    this.settings = settings;
    this.diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.regular;
    this.role = this.net?.active ? (this.net.isHost ? 'host' : 'client') : 'solo';
    this.clear();
    this.loadMap?.(settings.map);
    roster ||= [{ id: 0, name: settings.name || 'You', team: 0, me: true }];

    const pl = this.player, me = roster.find(r => r.me);
    pl.id = me.id; pl.team = me.team; pl.name = me.name;
    pl.resetStats();
    for (const r of roster) {
      if (r.me) continue;
      if (this.role === 'client') this.nets.push(new NetSoldier(this, r.id, r.team, r.name, r.human, false));
      else this.nets.push(new NetSoldier(this, r.id, r.team, r.name, true, true));
    }
    if (this.authority) {
      const names = NAMES.slice().sort(() => Math.random() - 0.5);
      let id = 100;
      for (const team of [0, 1]) {
        const humans = roster.filter(r => r.team === team).length;
        for (let i = humans; i < TEAM_SIZE; i++) { const b = new Bot(this, team, names.pop()); b.id = id++; this.bots.push(b); }
      }
    }
    this.rebuild();
    if (this.authority) this.vehicles.push(...placeEmplacements(this));
    this.aiCallT = [50 + Math.random() * 25, 50 + Math.random() * 25];
    this.vehicleSeq = 0;
    pl.vcool = { drone: 0, tank: 0, jet: 0 };

    this.teamScore = settings.score ? settings.score.slice() : [0, 0];
    this.timeLeft = settings.timeLeft ?? settings.timeLimit;
    this.time = 0;
    this.uav = [0, 0];
    this.intel = [[], []];
    this.firstBlood = false;
    this.targeting = false;
    this.pickupId = 0;
    this.pendingCls = settings.cls;
    this.state = 'playing';
    this.hud.reset(this);

    if (this.role === 'client') {
      pl.spawn(me, me.yaw, CLASSES[settings.cls]);
      for (const n of this.nets) { const r = roster.find(x => x.id === n.id); n.pos.set(r.x, 0, r.z); n.tgt.copy(n.pos); }
      return;
    }
    const sp = this.pickSpawn(pl.team);
    pl.spawn(sp, sp.yaw, CLASSES[settings.cls]);
    for (const n of this.nets) { const s = this.pickSpawn(n.team); n.place(s.x, 0, s.z, s.yaw); }
    for (const b of this.bots) { const s = this.pickSpawn(b.team); b.spawn(s, s.yaw); }
  }

  // client: the host's start message
  startClient(msg, myId) {
    const roster = (msg.roster || []).map(r => ({ ...r, me: r.id === myId }));
    if (!roster.some(r => r.me)) return;
    const rules = msg.rules || {};
    this.startMatch({ ...this.settings, map: typeof rules.map === 'string' ? rules.map : 'crossroads', scoreLimit: rules.scoreLimit, timeLimit: rules.timeLimit, timeLeft: rules.timeLeft, score: msg.score }, roster);
    if (Array.isArray(msg.br)) for (const id of msg.br.slice(0, 5000)) breakObject(Number(id));
  }

  rebuild() {
    this.soldiers = [this.player, ...this.nets, ...this.bots];
    this.byId = new Map(this.soldiers.map(s => [s.id, s]));
  }

  rosterList() {
    return this.soldiers.map(s => ({ id: s.id, name: s.name, team: s.team, human: !!(s.isPlayer || s.human), x: r2(s.pos.x), z: r2(s.pos.z), yaw: r2(s.yaw) }));
  }

  // host: a player joined or left mid-match
  addRemote(id, name, team) {
    const n = new NetSoldier(this, id, team, name, true, true);
    this.nets.push(n);
    const bot = this.bots.find(b => b.team === team);
    if (bot && this.soldiers.filter(s => s.team === team).length >= TEAM_SIZE) { bot.remove(); this.bots.splice(this.bots.indexOf(bot), 1); }
    this.rebuild();
    const s = this.pickSpawn(team);
    n.place(s.x, 0, s.z, s.yaw);
    this.emit({ k: 'roster', r: this.rosterList() });
    this.hud.toast(`${name} joined`);
  }

  removeRemote(id) {
    const n = this.nets.find(x => x.id === id);
    if (!n) return;
    n.remove();
    this.nets.splice(this.nets.indexOf(n), 1);
    if (this.soldiers.filter(s => s.team === n.team).length - 1 < TEAM_SIZE) {
      const b = new Bot(this, n.team, NAMES[Math.floor(Math.random() * NAMES.length)]);
      b.id = 100 + Math.max(0, ...this.bots.map(x => x.id - 99));
      this.bots.push(b);
      this.rebuild();
      const s = this.pickSpawn(b.team);
      b.spawn(s, s.yaw);
    } else this.rebuild();
    this.emit({ k: 'roster', r: this.rosterList() });
    this.hud.toast(`${n.name} left`);
  }

  respawnRemote(n) {
    const s = this.pickSpawn(n.team);
    n.place(s.x, 0, s.z, s.yaw);
    this.emit({ k: 'spawn', to: n.id, x: s.x, z: s.z, yaw: s.yaw });
  }

  end() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    for (const v of this.vehicles) v.remove();
    this.vehicles = [];
    this.projectiles.clear();
    this.emit({ k: 'end', sc: this.teamScore });
    this.net?.flush();
    this.hud.showEnd(this);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pickSpawn(team) {
    let best = spawns[team].find(s => !s.fwd) || spawns[team][0], bestScore = -Infinity;
    for (const sp of spawns[team]) {
      let minEnemy = 60, crowd = 0;
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        const d = Math.hypot(s.pos.x - sp.x, s.pos.z - sp.z);
        if (s.team !== team) minEnemy = Math.min(minEnemy, d);
        else if (d < 1.5) crowd++;
      }
      if (sp.fwd && minEnemy < 32) continue;
      const score = minEnemy + Math.random() * 8 - crowd * 50 + (sp.fwd ? 5 : 0);
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    return best;
  }

  respawn(bot) {
    const s = this.pickSpawn(bot.team);
    bot.spawn(s, s.yaw);
  }

  // ---------- queries ----------
  targetsFor(team) {
    const out = [];
    for (const s of this.soldiers) if (s.alive && s.team !== team && !s.inVehicle) out.push(s);
    for (const v of this.vehicles) if (v.alive && v.team !== team && v.t > 5 && !(v.kind === 'aa' && !v.driver && !(v.driverId >= 0))) out.push(v);
    return out;
  }

  nearestEnemy(bot) {
    let best = null, bd = Infinity;
    for (const s of this.soldiers) {
      if (!s.alive || s.team === bot.team || s.inVehicle) continue;
      const d = s.pos.distanceToSquared(bot.pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  dangerNear(bot, r) {
    for (const g of this.grenades) {
      if (g.fuse > 2.6 || (g.team === bot.team && g.owner !== bot)) continue;
      if (g.pos.distanceTo(bot.pos) < r) return g;
    }
    return null;
  }

  reportIntel(team, pos) {
    const list = this.intel[team];
    for (const i of list) if (Math.abs(i.x - pos.x) + Math.abs(i.z - pos.z) < 4) { i.t = this.time; i.x = pos.x; i.z = pos.z; return; }
    list.push({ x: pos.x, z: pos.z, t: this.time });
  }

  noise(source, pos, radius) {
    for (const b of this.bots) {
      if (b.team === source.team || !b.alive) continue;
      if (b.pos.distanceTo(pos) < radius) b.hear(source, pos);
    }
  }

  traceShot(o, d, maxT, shooter) {
    const wh = raycastWorld(o, d, maxT);
    let t = wh ? wh.t : maxT, entity = null, zone = null;
    for (const s of this.soldiers) {
      if (!s.alive || s === shooter || s.team === shooter.team || s.inVehicle) continue;
      const h = hitSoldier(s, o, d, t);
      if (h) { t = h.t; entity = s; zone = h.zone; }
    }
    for (const v of this.vehicles) {
      if (!v.alive || v === shooter || v.team === shooter.team) continue;
      const h = v.hit(o, d, t);
      if (h) { t = h.t; entity = v; zone = 'body'; }
    }
    return { t, entity, zone, world: !entity && wh ? wh : null };
  }

  // ---------- combat (authority only) ----------
  damage(victim, amount, attacker, weapon, headshot, fromPos, extra = {}) {
    if (!this.authority || !victim.alive || this.state !== 'playing') return null;
    if (attacker && attacker !== victim && attacker.team === victim.team) return null;
    if (victim.isVehicle) {
      const d = victim.driver;
      if (d && (d.isPlayer || d.human) && attacker && !attacker.isPlayer && !attacker.human) amount *= this.diff.dmg;
      victim.applyDamage(amount, attacker, weapon);
      this.hitFeedback(attacker, !victim.alive, false);
      return victim.alive ? 'hit' : 'kill';
    }
    if (victim.protect > 0) return null;
    if (victim.human && attacker && !attacker.human && !attacker.isPlayer) amount *= this.diff.dmg;
    if (victim.isPlayer && attacker && !attacker.isPlayer && !attacker.human) amount *= this.diff.dmg;
    victim.health -= amount;
    if (attacker && attacker !== victim) victim.damagers.set(attacker, (victim.damagers.get(attacker) || 0) + amount);
    if (victim.isPlayer) {
      victim.lastHurt = this.time;
      this.audio.hurt();
      if (fromPos) this.hud.damageFrom(fromPos, this.player);
    } else if (victim.isRemote) {
      victim.lastHurt = this.time;
      if (fromPos) this.emit({ k: 'hurt', to: victim.id, x: r2(fromPos.x), z: r2(fromPos.z) });
    } else if (attacker && victim.hurtBy) victim.hurtBy(attacker);
    const killed = victim.health <= 0;
    if (victim !== attacker) this.hitFeedback(attacker, killed, headshot);
    if (killed) { victim.health = 0; this.kill(attacker, victim, weapon, headshot, extra); }
    return killed ? 'kill' : 'hit';
  }

  hitFeedback(attacker, kill, head) {
    if (attacker === this.player) { this.hud.hitmarker(kill, head); this.audio.hit(kill ? 'kill' : head ? 'head' : 'hit'); }
    else if (attacker?.isRemote) this.emit({ k: 'hm', to: attacker.id, kill, head });
  }

  kill(killer, victim, weapon, headshot, extra) {
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    if (victim.isPlayer) this.localDeath(killer, weapon);
    else { victim.die(); this.dropPickup(victim.pos); }
    const valid = killer && killer !== victim && killer.team !== victim.team && !killer.isVehicle;
    if (valid) {
      killer.kills++;
      killer.score += 100;
      this.teamScore[killer.team]++;
      if (!extra.streak) {
        killer.streak++;
        killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
        this.checkStreak(killer);
      }
      if (killer.isPlayer || killer.isRemote) this.medals(killer, victim, weapon, headshot);
      else this.firstBlood = true;
    }
    victim.nemesis = valid ? killer : null;
    for (const [a, dmg] of victim.damagers) {
      if (a === killer || a.team === victim.team || dmg < 20) continue;
      a.assists++; a.score += 25;
      this.popupFor(a, [['Assist', 25]]);
    }
    victim.damagers.clear();
    this.hud.feed(killer, victim, weapon, headshot, this.player);
    this.emit({ k: 'kill', a: killer ? killer.id : -1, v: victim.id, w: weapon, h: !!headshot });
    if (valid && this.teamScore[killer.team] >= this.settings.scoreLimit) this.end();
  }

  localDeath(killer, weapon) {
    const pl = this.player;
    if (pl.vehicle) this.leftVehicle(pl, pl.vehicle);
    pl.alive = false;
    this.deadT = 4;
    this.killer = killer && killer !== pl ? killer : null;
    this.deathYaw = pl.yaw;
    this.targeting = false;
    this.hud.hint('');
    this.hud.showDeath(this.killer, weapon, pl);
  }

  medals(killer, victim, weapon, headshot) {
    const lines = [['Enemy killed', 100]];
    if (!this.firstBlood) { this.firstBlood = true; lines.push(['First blood', 100]); }
    if (headshot) lines.push(['Headshot', 50]);
    killer.multi = this.time - (killer.lastKillT ?? -99) < 4 ? (killer.multi || 1) + 1 : 1;
    killer.lastKillT = this.time;
    if (killer.multi === 2) lines.push(['Double kill', 50]);
    else if (killer.multi === 3) lines.push(['Triple kill', 75]);
    else if (killer.multi >= 4) lines.push(['Multi kill', 100]);
    if (killer.pos.distanceTo(victim.pos) > 40 && !VEHICLE_WEAPONS.has(weapon)) lines.push(['Longshot', 50]);
    if (killer.nemesis === victim) { lines.push(['Revenge', 50]); killer.nemesis = null; }
    if (weapon === 'Knife') lines.push(['Knifed', 50]);
    for (const [, s] of lines.slice(1)) killer.score += s;
    this.popupFor(killer, lines);
  }

  popupFor(s, lines) {
    if (s.isPlayer) this.hud.popup(lines);
    else if (s.isRemote) this.emit({ k: 'pop', to: s.id, l: lines });
  }

  // host: tell clients about a shot so they can draw and hear it
  emitShot(shooter, muzzle, end, kind, normal, key, color) {
    if (this.role !== 'host') return;
    this.emit({ k: 'shot', id: shooter.id, m: arr(muzzle), e: arr(end), i: kind, n: normal ? arr(normal) : null, key, c: color });
  }

  // draw and play a shot described by the network (a client's or the host's)
  renderShot(ev) {
    if (!Array.isArray(ev.m) || !Array.isArray(ev.e)) return;
    const m = v3(ev.m), end = v3(ev.e);
    const shooter = this.byId.get(ev.id);
    if (shooter) shooter.firedT = this.time;
    this.effects.tracer(m, end, ev.c || 0xffe0a0);
    if (ev.i === 1 && Array.isArray(ev.n)) { const n = v3(ev.n); this.effects.impact(end, n, materialAt(end, n)); this.audio.impact(end); }
    else if (ev.i === 2) this.bleed(end, end.clone().sub(m).normalize());
    if (!shooter?.isVehicle && ev.key !== 'heli') this.effects.flash(m, 0.5);
    this.audio.shot(String(ev.key || 'ar'), m);
    const dir = end.clone().sub(m);
    const len = dir.length();
    if (len > 0.01) this.whizz(m, dir.divideScalar(len), { t: len, entity: null });
  }

  // host: a client fired; show it here and pass it on
  remoteShot(s, d) {
    const shots = Array.isArray(d.e) ? d.e.slice(0, 3) : [];
    for (const e of shots) {
      if (!Array.isArray(e) || e.length < 4) continue;
      const ev = { k: 'shot', id: s.id, m: d.m, e: e.slice(0, 3), i: e[3], n: e.length >= 7 ? e.slice(4, 7) : null, key: String(d.key || 'ar'), c: 0xffe0a0 };
      this.renderShot(ev);
      this.emit(ev);
    }
  }

  playerShoot(def, spreadDeg, muzzle) {
    const pl = this.player;
    this.camera.getWorldDirection(_fwd);
    _o.copy(this.camera.position);
    const hits = new Map(), sent = [], objHits = new Map();
    const pellets = def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      cone(_fwd, spreadDeg * DEG, _d);
      const h = this.traceShot(_o, _d, 300, pl);
      const end = _o.clone().addScaledVector(_d, h.t);
      let kind = 0, normal = null;
      if (h.entity) {
        const dmg = h.entity.isVehicle ? def.dmg[0] * 0.7 : falloff(def, h.t) * zoneMul(def, h.zone);
        const cur = hits.get(h.entity) || { dmg: 0, head: false };
        cur.dmg += dmg; cur.head ||= h.zone === 'head';
        hits.set(h.entity, cur);
        if (h.entity.isVehicle) this.effects.impact(end, _d.clone().negate(), 'metal');
        else { this.bleed(end, _d); kind = 2; }
      } else if (h.world) {
        this.effects.impact(end, h.world.normal, materialAt(end, h.world.normal)); this.audio.impact(end); kind = 1; normal = h.world.normal;
        const ob = objectAt(end, normal);
        if (ob && !ob.spec.blast) objHits.set(ob, (objHits.get(ob) || 0) + falloff(def, h.t));
      }
      if (i === 0 || i % 3 === 0) {
        this.effects.tracer(muzzle, end);
        sent.push([...arr(end), kind, ...(normal ? arr(normal) : [])]);
        if (this.role === 'host') this.emitShot(pl, muzzle, end, kind, normal, def.model);
      }
    }
    for (const [o, dmg] of objHits) this.hitObject(o, dmg, pl, false);
    if (this.role === 'client') {
      for (const [e, r] of hits) this.net.send({ t: 'hit', id: e.id, d: Math.round(r.dmg * 10) / 10, h: r.head, w: def.name });
      this.net.send({ t: 'fire', m: arr(muzzle), e: sent, key: def.model });
    } else for (const [e, r] of hits) this.damage(e, r.dmg, pl, def.name, r.head, pl.pos);
    const fx = this.effects;
    fx.muzzleLight.position.copy(muzzle); fx.muzzleLight.intensity = 6; fx.muzzleT = 0.05;
    this.audio.shot(def.model);
    pl.firedT = this.time;
    if (this.authority) this.noise(pl, pl.pos, 45);
  }

  botShot(bot, o, dir, muzzle, tracer) {
    const def = bot.def;
    const h = this.traceShot(o, dir, 200, bot);
    const end = o.clone().addScaledVector(dir, h.t);
    let kind = 0, normal = null;
    if (h.entity) {
      const dmg = h.entity.isVehicle ? 13 : falloff(def, h.t) * zoneMul(def, h.zone);
      this.damage(h.entity, dmg, bot, def.name, h.zone === 'head', bot.pos);
      if (!h.entity.isVehicle && !h.entity.isPlayer) { this.bleed(end, dir); kind = 2; }
    } else if (h.world) {
      const ob = objectAt(end, h.world.normal);
      if (ob && !ob.spec.blast) this.hitObject(ob, falloff(def, h.t) * 0.5, bot, false);
      if (Math.random() < 0.6) { this.effects.impact(end, h.world.normal, materialAt(end, h.world.normal)); this.audio.impact(end); kind = 1; normal = h.world.normal; }
    }
    const color = bot.team ? 0xffa070 : 0xffe0a0;
    if (tracer) { this.effects.tracer(muzzle, end, color); this.emitShot(bot, muzzle, end, kind, normal, def.model, color); }
    this.whizz(o, dir, h);
  }

  // A vehicle's gun: hitscan rounds, or explosive rounds when blast > 0 (the chopper's cannon).
  vehicleGun(v, o, dir, weapon, dmg, color = 0xffc080, key = 'lmg', tracer = true, blast = 0) {
    const shooter = v.driver || v.owner || v;
    const h = this.traceShot(o, dir, 400, v);
    const end = o.clone().addScaledVector(dir, h.t);
    let kind = 0, normal = null;
    if (blast) {
      if (this.authority) this.explode(end, shooter, blast, dmg, weapon, { streak: true });
      else if (v.local) { this.net?.send({ t: 'blast', w: weapon, p: arr(end), e: -1 }); this.predictBoom(end, 0.4); }
    } else if (h.entity) {
      const head = h.zone === 'head';
      const amt = h.entity.isVehicle ? dmg : dmg * (head ? 1.5 : 1);
      if (this.authority) this.damage(h.entity, amt, shooter, weapon, head, v.pos, { streak: true });
      else this.net.send({ t: 'hit', id: h.entity.id, d: Math.min(250, amt), h: head, w: weapon });
      if (!h.entity.isVehicle) { this.bleed(end, dir); kind = 2; } else this.effects.impact(end, dir.clone().negate(), 'metal');
    } else if (h.world) {
      this.effects.impact(end, h.world.normal, materialAt(end, h.world.normal));
      if (Math.random() < 0.3) this.audio.impact(end);
      const ob = objectAt(end, h.world.normal);
      if (ob && !ob.spec.blast && (this.authority || v.local)) this.hitObject(ob, dmg, shooter, false);
      kind = 1; normal = h.world.normal;
    }
    if (tracer) this.effects.tracer(o, end, color, 600);
    if (key) {
      this.audio.shot(key, v.controlled ? null : o);
      if (this.role === 'host') this.emitShot(v, o, end, kind, normal, key, color);
      else if (this.role === 'client' && v.local) this.net.send({ t: 'fire', m: arr(o), e: [[...arr(end), kind, ...(normal ? arr(normal) : [])]], key });
    }
    this.whizz(o, dir, h);
  }

  // blood mist, plus a splat on whatever is just behind the target
  bleed(p, dir) {
    this.effects.blood(p, dir);
    const h = raycastWorld(p, dir, 2.5);
    if (h) this.effects.bloodSplat(_e.copy(p).addScaledVector(dir, h.t), h.normal);
  }

  whizz(o, dir, h) {
    const pl = this.player;
    if (!pl.alive || h.entity === pl || this.time - (this.lastWhizz || 0) < 0.08) return;
    _e.subVectors(this.camera.position, o);
    const tp = _e.dot(dir);
    if (tp <= 2 || tp >= h.t) return;
    const miss = _e.addScaledVector(dir, -tp);
    if (miss.length() < 1.6) {
      this.lastWhizz = this.time;
      this.audio.whizz(this.audio.spatial(o).pan);
    }
  }

  playerMelee() {
    const pl = this.player;
    this.camera.getWorldDirection(_fwd);
    let best = null, bd = 2.4;
    for (const s of this.soldiers) {
      if (!s.alive || s.team === pl.team) continue;
      _e.subVectors(s.aimPoint(_c, false), this.camera.position);
      const d = _e.length();
      if (d > bd || _e.normalize().dot(_fwd) < 0.55) continue;
      if (!lineOfSight(this.camera.position, _c)) continue;
      best = s; bd = d;
    }
    if (!best) return;
    this.audio.stab();
    this.bleed(best.aimPoint(_c, false), _fwd);
    pl.vel.x += _fwd.x * 4; pl.vel.z += _fwd.z * 4;
    if (this.role === 'client') this.net.send({ t: 'hit', id: best.id, d: 200, h: false, w: 'Knife' });
    else this.damage(best, 200, pl, 'Knife', false, pl.pos);
  }

  // ---------- grenades ----------
  throwGrenade(pl, cookT) {
    this.camera.getWorldDirection(_fwd);
    const pos = this.camera.position.clone().addScaledVector(_fwd, 0.4);
    const vel = _fwd.clone().multiplyScalar(17).add(new THREE.Vector3(pl.vel.x * 0.5, 2.5, pl.vel.z * 0.5));
    const fuse = Math.max(0.02, FUSE - cookT);
    if (this.role === 'client') { this.net.send({ t: 'nade', p: arr(pos), v: arr(vel), f: fuse }); return; }
    if (fuse <= 0.05) { this.explode(pos, pl, 7, 150, 'Frag'); return; }
    this.spawnGrenade(pos, vel, fuse, pl);
  }

  botThrow(bot, target) {
    const pos = bot.eye(new THREE.Vector3());
    const dx = target.x - pos.x, dz = target.z - pos.z, dist = Math.hypot(dx, dz);
    const T = Math.max(0.8, Math.min(1.8, dist / 13));
    const vel = new THREE.Vector3(dx / T, (0.2 - pos.y + 0.5 * GRAVITY * T * T) / T, dz / T);
    this.spawnGrenade(pos, vel, FUSE, bot);
    this.audio.pin();
  }

  spawnGrenade(pos, vel, fuse, owner) {
    const mesh = new THREE.Mesh(this.nadeGeo, this.nadeMat);
    mesh.castShadow = true;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.grenades.push({ pos, vel, fuse, owner, team: owner.team, mesh });
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        this.explode(g.pos, g.owner, 7, 150, 'Frag');
        continue;
      }
      const h = dt / 2;
      for (let s = 0; s < 2; s++) {
        const p = g.pos, v = g.vel;
        v.y -= GRAVITY * h;
        let bounced = false;
        const nx = p.x + v.x * h;
        if (pointSolid(nx, p.y, p.z)) { v.x *= -0.4; bounced = true; } else p.x = nx;
        const nz = p.z + v.z * h;
        if (pointSolid(p.x, p.y, nz)) { v.z *= -0.4; bounced = true; } else p.z = nz;
        const ny = p.y + v.y * h;
        if (pointSolid(p.x, ny, p.z)) {
          if (v.y < -1.5) bounced = true;
          v.y = Math.abs(v.y) < 1.5 ? 0 : v.y * -0.3;
          v.x *= 0.75; v.z *= 0.75;
        } else p.y = ny;
        if (bounced && v.length() > 2) this.audio.bounce(p);
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.vel.length() * dt * 3;
    }
  }

  // visual and audio side of an explosion; the host also sends it to clients
  explodeFx(p, scale = 1, air = false) {
    this.emit({ k: 'boom', p: arr(p), s: scale, a: air ? 1 : 0 });
    if (air) { this.effects.airBurst(p, scale); this.audio.flak(p); return; }
    this.effects.explosion(p, scale);
    const gy = groundAt(p.x, p.z, 0.1, p.y + 0.5);
    if (p.y - gy < 1) this.effects.scorch(new THREE.Vector3(p.x, gy, p.z), new THREE.Vector3(0, 1, 0));
    this.audio.explosion(p);
    const dp = this.camera.position.distanceTo(p);
    this.shake = Math.max(this.shake, 0.09 * Math.max(0, 1 - dp / 30) * Math.min(1, scale + 0.3));
    if (dp < 12 && scale > 0.5 && lineOfSight(this.camera.position, _e.set(p.x, p.y + 0.5, p.z))) this.flashT = Math.max(this.flashT, 0.35 * (1 - dp / 12));
  }

  // a client shows its own drone or crash blast at once and skips the host's copy
  predictBoom(p, scale = 0.8) {
    this.effects.explosion(p, scale);
    this.audio.explosion(p);
    this.predicted.push({ p: p.clone(), t: this.time });
  }

  wasPredicted(p) {
    const i = this.predicted.findIndex(q => q.p.distanceTo(p) < 3 && this.time - q.t < 1.5);
    if (i >= 0) { this.predicted.splice(i, 1); return true; }
    this.predicted = this.predicted.filter(q => this.time - q.t < 2);
    return false;
  }

  explode(p, owner, radius, maxDmg, weapon, extra = {}) {
    this.explodeFx(p, extra.air ? 0.6 : radius / 7, !!extra.air);
    const src = _o.set(p.x, p.y + 0.3, p.z);
    for (const s of this.soldiers) {
      if (!s.alive || s.inVehicle) continue;
      const c = s.aimPoint(_c, false);
      const d = c.distanceTo(src);
      if (d > radius || !lineOfSight(src, c)) continue;
      this.damage(s, maxDmg * Math.pow(1 - d / radius, 0.7), owner, weapon, false, p, extra);
    }
    for (const v of this.vehicles) {
      if (!v.alive) continue;
      const d = Math.max(0, v.pos.distanceTo(src) - (v.size || 2));
      if (d < radius) this.damage(v, maxDmg * 1.5 * (1 - d / radius) * (v.spec?.splash?.[weapon] ?? 1), owner, weapon, false, p, extra);
    }
    // walls, crates and barrels: the blast falls off fast, so a rocket punches a hole, not a street
    for (const { o, d } of objectsNear(p, radius)) this.hitObject(o, maxDmg * 2 * (1 - d / radius) ** 2, owner, true);
    if (owner) this.noise(owner, p, 30);
  }

  // ---------- breakable objects ----------
  // Any role may call this: the host applies it, a client forwards it to the host.
  hitObject(o, amount, attacker, explosive) {
    if (!o?.alive || this.state !== 'playing' || !(amount > 0)) return;
    if (o.spec.blast && !explosive) return;
    if (!this.authority) { this.net?.send({ t: 'ob', i: o.id, d: Math.min(400, Math.round(amount)), x: explosive ? 1 : 0 }); return; }
    o.hp -= amount;
    if (o.hp <= 0) this.breakObj(o, attacker);
  }

  // a tank rolling over something: the driver sees it go at once
  crushObject(o, by) {
    if (!o?.alive || !o.spec.crush) return;
    if (this.authority) { this.breakObj(o, by); return; }
    this.net?.send({ t: 'ob', i: o.id, d: 9999, x: 1 });
    if (breakObject(o.id)) this.objectFx(o);
  }

  breakObj(o, attacker) {
    if (!breakObject(o.id)) return;
    this.objectFx(o);
    this.emit({ k: 'dx', i: o.id });
    const b = o.spec.boom;
    if (b) this.booms.push({ t: 0.12 + Math.random() * 0.15, p: new THREE.Vector3((o.x0 + o.x1) / 2, o.y0 + 0.5, (o.z0 + o.z1) / 2), owner: attacker, r: b[0], dmg: b[1], w: o.kind === 'car' ? 'Car' : 'Barrel' });
  }

  objectFx(o) {
    const mat = o.boxes.find(b => b.mat !== 'invis' && b.mat !== 'snowcap')?.mat;
    const col = o.kind === 'barrel' ? [0.55, 0.16, 0.1] : DEBRIS[mat] || DEBRIS[o.spec.debris] || DEBRIS.wood;
    if (!o.spec.wreck) this.effects.shatter(o, col);
    this.audio.crash(_c.set((o.x0 + o.x1) / 2, o.y0 + 0.5, (o.z0 + o.z1) / 2), o.kind === 'wall' || o.kind === 'sandbag');
  }

  updateBooms(dt) {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      if ((b.t -= dt) > 0) continue;
      this.booms.splice(i, 1);
      this.explode(b.p, b.owner, b.r, b.dmg, b.w);
    }
  }

  // ---------- pickups ----------
  dropPickup(pos, id = this.pickupId++) {
    if (this.pickups.length > 10) { this.scene.remove(this.pickups[0].mesh); this.pickups.shift(); }
    const mesh = new THREE.Mesh(this.pickGeo, this.pickMat);
    mesh.position.set(pos.x, pos.y + 0.2, pos.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.pickups.push({ id, mesh, t: 25 });
    this.emit({ k: 'drop', id, p: arr(pos) });
  }

  removePickup(id) {
    const i = this.pickups.findIndex(p => p.id === id);
    if (i < 0) return false;
    this.scene.remove(this.pickups[i].mesh);
    this.pickups.splice(i, 1);
    return true;
  }

  // host: someone (local or remote) took a pickup
  takePickup(id) {
    if (this.removePickup(id)) this.emit({ k: 'took', id });
  }

  updatePickups(dt) {
    const pl = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t -= dt;
      p.mesh.rotation.y += dt * 1.5;
      const near = pl.alive && Math.hypot(pl.pos.x - p.mesh.position.x, pl.pos.z - p.mesh.position.z) < 1.3 && Math.abs(pl.pos.y - p.mesh.position.y) < 1.5;
      if (near) {
        this.arsenal.refill();
        this.audio.pickup();
        this.hud.toast('Ammo resupplied');
        if (this.role === 'client') { this.net.send({ t: 'took', id: p.id }); this.removePickup(p.id); }
        else this.takePickup(p.id);
      } else if (p.t <= 0) this.removePickup(p.id);
    }
  }

  // ---------- killstreaks ----------
  checkStreak(s) {
    const r = STREAKS.find(x => x.kills === s.streak);
    if (!r) return;
    if (s.isPlayer) this.streakReady(r.id);
    else if (s.isRemote) { s.rewards.push(r.id); this.emit({ k: 'sr', to: s.id, id: r.id }); }
    else this.useStreak(s, r.id);
  }

  streakReady(id) {
    const r = STREAKS.find(x => x.id === id);
    if (!r) return;
    this.player.rewards.push(id);
    this.hud.banner(`${r.name} ready`, `Press ${r.key}`, 'ally');
    this.audio.streak();
  }

  announce(team, allyText, enemyText) {
    const mine = team === this.player.team;
    this.hud.banner(mine ? allyText : enemyText, '', mine ? 'ally' : 'enemy');
    if (mine) this.audio.beep(); else this.audio.alarm();
    this.emit({ k: 'ann', team, a: allyText, e: enemyText });
  }

  useStreak(owner, id, point, yaw) {
    const t = owner.team;
    if (id === 'uav') {
      this.uav[t] = 30;
      this.announce(t, 'Friendly UAV online', 'Enemy UAV spotted');
    } else if (id === 'chopper') {
      const c = new Chopper(this, owner, this.nextVehicleId());
      this.vehicles.push(c);
      if (owner.isPlayer) this.enterVehicle(owner, c);
      this.announce(t, 'Friendly Attack Chopper inbound', 'Enemy Attack Chopper inbound');
    } else if (id === 'airstrike') {
      if (!point) {
        const intel = this.intel[t].slice().sort((a, b) => b.t - a.t)[0];
        const e = intel || this.nearestEnemy(owner)?.pos || { x: SIZE / 2, z: SIZE / 2 };
        point = new THREE.Vector3(e.x, 0, e.z);
        yaw = Math.random() * Math.PI * 2;
      }
      this.callAirstrike(owner, point, yaw);
      this.announce(t, 'Airstrike inbound', 'Enemy airstrike inbound!');
    }
  }

  callAirstrike(owner, point, yaw) {
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    this.later(2.0, () => {
      this.jet.fly(point, dx, dz);
      this.audio.jet();
      this.emit({ k: 'jet', p: arr(point), dx: r2(dx), dz: r2(dz) });
    });
    for (let i = 0; i < 7; i++) {
      this.later(3.0 + i * 0.14, () => {
        const x = point.x + dx * (i - 3) * 3.5, z = point.z + dz * (i - 3) * 3.5;
        const y = groundAt(x, z, 0.1, 60);
        this.explode(new THREE.Vector3(x, y + 0.2, z), owner, 7.5, 170, 'Airstrike', { streak: true });
      });
    }
  }

  later(delay, fn) { this.jobs.push({ t: this.time + delay, fn }); }

  playerStreak(id, point, yaw) {
    const pl = this.player, i = pl.rewards.indexOf(id);
    if (i < 0 || !pl.alive) return;
    if (id === 'airstrike' && !point) { this.targeting = true; this.hud.hint('Aim at the ground and click to mark the airstrike. Right-click cancels.'); return; }
    pl.rewards.splice(i, 1);
    if (this.role === 'client' && id === 'chopper') {
      // a client flies its own chopper; the host only books the streak and mirrors it
      const c = new Chopper(this, pl, this.nextVehicleId());
      this.vehicles.push(c);
      this.enterVehicle(pl, c);
      this.net.send({ t: 'streak', id, own: 1 });
    } else if (this.role === 'client') this.net.send({ t: 'streak', id, p: point ? arr(point) : null, yaw });
    else this.useStreak(pl, id, point, yaw);
  }

  // ---------- vehicles ----------
  nextVehicleId() {
    this.vehicleSeq = (this.vehicleSeq || 0) + 1;
    return this.role === 'client' ? 10000 + this.player.id * 100 + (this.vehicleSeq % 100) : 1000 + this.vehicleSeq;
  }

  callVehicle(owner, kind) {
    const id = this.nextVehicleId();
    let v;
    if (kind === 'drone') {
      const yaw = owner.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const eye = new THREE.Vector3(owner.pos.x, owner.pos.y + (owner.isPlayer ? owner.eyeHeight : 1.5) - 0.2, owner.pos.z);
      const h = raycastWorld(eye, _e.set(fx, 0, fz), 1.2);
      const k = h ? Math.max(0.2, h.t - 0.4) : 0.8;
      v = new Drone(this, owner, id, eye.add(_e.set(fx * k, 0, fz * k)), yaw);
    } else if (kind === 'tank') {
      const s = tankSpot(this, owner.team);
      v = new Tank(this, owner, id, s.x, s.z, s.yaw);
    } else if (kind === 'jet') v = new FighterJet(this, owner, id);
    else return null;
    this.vehicles.push(v);
    if (owner.isPlayer) this.enterVehicle(owner, v);
    if (kind === 'tank') this.announce(owner.team, 'Friendly tank deployed', 'Enemy tank deployed!');
    else if (kind === 'jet') this.announce(owner.team, 'Friendly jet inbound', 'Enemy jet inbound!');
    return v;
  }

  playerCall(kind) {
    const pl = this.player, c = CALLS.find(x => x.id === kind);
    if (!c || !pl.alive || pl.vehicle) return;
    if (pl.vcool[kind] > 0) { this.hud.toast(`${c.name} ready in ${Math.ceil(pl.vcool[kind])}s`); return; }
    if (kind === 'tank') {
      const mine = this.vehicles.find(v => v.alive && v.kind === 'tank' && v.owner === pl && !v.driver);
      if (mine) { this.hud.toast('Your tank is still out there: walk up to it and press F'); return; }
    }
    pl.vcool[kind] = c.cd;
    this.callVehicle(pl, kind);
  }

  enterVehicle(s, v) {
    if (s.vehicle) this.leftVehicle(s, s.vehicle);
    v.driver = s; s.vehicle = v; s.inVehicle = v.seat === 'inside';
    if (v.kind !== 'heli') v.ai = false;
    if (!s.isPlayer) return;
    const a = this.arsenal;
    a.ads = 0; a.reload = null; a.cook = null; a.burstLeft = 0; a.lockTarget = null;
    if (v.kind === 'tank') { v.aimYaw = v.yaw + v.a; v.aimPitch = 0; }
    if (v.kind === 'aa') { v.aimYaw = v.a; v.aimPitch = v.b; }
    if (v.kind === 'heli') v.aimYaw = v.heading;
    this.targeting = false;
    this.hud.hint('');
    this.audio.ui();
  }

  leftVehicle(s, v) {
    if (!s || s.vehicle !== v) return;
    s.vehicle = null; s.inVehicle = false;
    if (v.driver === s) v.driver = null;
    if (!s.isPlayer) return;
    if (v.seat === 'inside' && s.alive) this.placeBeside(s, v);
    if (v.kind === 'jet' && v.local && this.role === 'client' && v.alive) v.cleanup();
    s.vel.set(0, 0, 0);
    s.yaw = v.aimYaw ?? s.yaw;
    s.pitch = 0;
  }

  placeBeside(s, v) {
    const yaw = v.yaw || 0, rx = Math.cos(yaw) * 3, rz = -Math.sin(yaw) * 3, fx = -Math.sin(yaw) * 4.5, fz = -Math.cos(yaw) * 4.5;
    for (const [ox, oz] of [[rx, rz], [-rx, -rz], [-fx, -fz], [fx, fz], [rx * 0.8, rz * 0.8]]) {
      const x = v.pos.x + ox, z = v.pos.z + oz;
      const y = groundAt(x, z, 0.35, v.pos.y + 1.5);
      if (!overlaps(x, z, 0.4, y + STEP, y + 1.75)) { s.pos.set(x, y, z); return; }
    }
    s.pos.set(v.pos.x, v.pos.y + 2.5, v.pos.z);
  }

  exitVehicle() {
    const pl = this.player, v = pl.vehicle;
    if (!v) return;
    if (v.kind === 'drone') { v.detonate(null); return; }
    this.leftVehicle(pl, v);
  }

  nearbyVehicle(pl) {
    for (const v of this.vehicles) {
      if (!v.alive || v.driver || v.seat !== 'inside' || v.team !== pl.team || v.isProxy) continue;
      if (this.role === 'client' && !v.local) continue;
      if (Math.hypot(v.pos.x - pl.pos.x, v.pos.z - pl.pos.z) < (v.kind === 'tank' ? 4.5 : 2.8) && Math.abs(v.pos.y - pl.pos.y) < 3) return v;
    }
    return null;
  }

  // bots call in drones, tanks and jets now and then
  aiCalls(dt) {
    for (const team of [0, 1]) {
      if ((this.aiCallT[team] -= dt) > 0) continue;
      this.aiCallT[team] = 30 + Math.random() * 25;
      const bots = this.bots.filter(b => b.team === team && b.alive && !b.vehicle);
      if (!bots.length) continue;
      const owner = bots[Math.floor(Math.random() * bots.length)];
      const has = (k) => this.vehicles.some(v => v.alive && v.kind === k && v.team === team);
      const r = Math.random();
      if (r < 0.45) this.callVehicle(owner, 'drone');
      else if (r < 0.75 && !has('tank')) this.callVehicle(owner, 'tank');
      else if (!has('jet')) this.callVehicle(owner, 'jet');
      else this.callVehicle(owner, 'drone');
    }
  }

  fireProjectile(kind, owner, pos, vel, target, src) {
    if (this.role === 'client') {
      this.projectiles.spawn(kind, owner, pos, vel, target, src, true);
      this.net.send({ t: 'rocket', k: kind, p: arr(pos), v: arr(vel), g: target ? target.id : -1 });
      return;
    }
    this.projectiles.spawn(kind, owner, pos, vel, target, src, false);
    this.warnTarget(target);
    this.emit({ k: 'proj', pk: kind, o: owner?.id ?? -1, tm: owner?.team ?? -1, p: arr(pos), v: arr(vel), g: target ? target.id : -1 });
  }

  warnTarget(target) {
    if (!target) return;
    if (target.controlled) target.missileWarn = 4;
    if (target.isProxy && target.owner) this.emit({ k: 'mw', to: target.owner.id, id: target.id });
  }

  playerLaunch(def, spreadDeg, lock) {
    const pl = this.player, P = PROJ[def.launcher];
    this.camera.getWorldDirection(_fwd);
    cone(_fwd, spreadDeg * DEG, _d);
    const o = this.camera.position.clone().addScaledVector(_d, 0.9);
    o.y -= 0.08;
    this.fireProjectile(def.launcher, pl, o, _d.clone().multiplyScalar(P.speed), lock || null, null);
    this.audio.launch(null);
    this.effects.flash(o, 1.2);
    this.effects.cannonBlast(this.camera.position.clone().addScaledVector(_d, -1.6), _d.clone().negate());
    this.shake = Math.max(this.shake, 0.03);
    pl.firedT = this.time;
    if (this.authority) this.noise(pl, pl.pos, 50);
  }

  botLaunch(bot, target, kind) {
    const P = PROJ[kind], o = bot.eye(new THREE.Vector3());
    const p = target.aimPoint(new THREE.Vector3(), false);
    const dist = o.distanceTo(p), e = this.diff.err * 0.4 * (1 + dist / 40);
    if (kind === 'rpg') p.addScaledVector(target.vel || _e.set(0, 0, 0), dist / 95);
    p.x += (Math.random() - 0.5) * e; p.y += (Math.random() - 0.5) * e * 0.6; p.z += (Math.random() - 0.5) * e;
    const dir = p.sub(o).normalize();
    this.fireProjectile(kind, bot, o.addScaledVector(dir, 0.7), dir.clone().multiplyScalar(P.speed || 60), kind === 'stinger' ? target : null, null);
    this.audio.launch(o);
    this.effects.flash(o, 0.8);
    this.noise(bot, bot.pos, 50);
  }

  // an enemy aircraft near the middle of the screen, for the Stinger's seeker
  lockCandidate() {
    this.camera.getWorldDirection(_fwd);
    let best = null, bd = Math.cos(6 * DEG);
    for (const v of this.vehicles) {
      if (!v.alive || !v.air || v.team === this.player.team) continue;
      _e.subVectors(v.pos, this.camera.position);
      const dist = _e.length();
      if (dist > 330 || dist < 8) continue;
      const dot = _e.divideScalar(dist).dot(_fwd);
      if (dot > bd && lineOfSight(this.camera.position, v.pos)) { bd = dot; best = v; }
    }
    return best;
  }

  // tanks shove soldiers out of their way, and run over enemies at speed
  tankContacts() {
    for (const v of this.vehicles) {
      if (!v.alive || v.kind !== 'tank') continue;
      const c = Math.cos(v.yaw), sn = Math.sin(v.yaw), speed = v.speed ?? v.vel.length();
      for (const s of this.soldiers) {
        if (!s.alive || s.inVehicle || s.isNet) continue;
        const dx = s.pos.x - v.pos.x, dz = s.pos.z - v.pos.z;
        const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
        const px = 2.1 - Math.abs(lx), pz = 3.7 - Math.abs(lz);
        if (px <= 0 || pz <= 0 || s.pos.y > v.pos.y + 2.2) continue;
        if (Math.abs(speed) > 2.5 && s.team !== v.team && this.authority) this.damage(s, 250, v.driver || v.owner || null, 'Tank', false, v.pos, { streak: true });
        let ox = 0, oz = 0;
        if (px < pz) ox = Math.sign(lx || 1) * px; else oz = Math.sign(lz || 1) * pz;
        const wx = c * ox + sn * oz, wz = -sn * ox + c * oz;
        if (!overlaps(s.pos.x + wx, s.pos.z + wz, 0.35, s.pos.y + STEP, s.pos.y + 1.7)) { s.pos.x += wx; s.pos.z += wz; }
      }
    }
  }

  // ---------- client: apply what the host sends ----------
  applySnapshot(d) {
    if (typeof d.tl === 'number') this.timeLeft = d.tl;
    if (Array.isArray(d.sc)) this.teamScore = d.sc.slice(0, 2);
    if (Array.isArray(d.uav)) this.uav = d.uav.slice(0, 2);
    const pl = this.player;
    for (const row of d.s || []) {
      const [id, x, y, z, yaw, pitch, c, alive, hp, k, dd, a, sc, st, ln, iv] = row;
      const s = this.byId.get(id);
      if (!s) continue;
      s.kills = k; s.deaths = dd; s.assists = a; s.score = sc; s.streak = st;
      if (s === pl) { if (pl.alive && alive) pl.health = hp; continue; }
      if (alive && !s.alive) s.place(x, y, z, yaw);
      else if (!alive && s.alive) s.die();
      s.setState(x, y, z, yaw, pitch, c);
      s.leanT = typeof ln === 'number' ? ln : 0;
      s.setInVehicle(!!iv);
      s.health = hp;
    }
    // vehicles: everyone else's, drawn from the host's copies
    const seen = new Set();
    for (const row of d.v || []) {
      if (!Array.isArray(row) || row.length < 15) continue;
      const id = row[0];
      if (this.vehicles.some(q => q.local && q.id === id)) continue;
      seen.add(id);
      let v = this.vehicles.find(q => q.id === id);
      if (!v) { v = new VehicleProxy(this, id, String(row[1]), row[2]); this.vehicles.push(v); }
      v.apply(row, true);
    }
    for (const v of this.vehicles) if (!v.local && !seen.has(v.id)) v.remove();
    this.vehicles = this.vehicles.filter(v => v.alive || v.persistent);
    // grenades
    const n = d.n || [];
    while (this.netNades.length < n.length) { const m = new THREE.Mesh(this.nadeGeo, this.nadeMat); this.scene.add(m); this.netNades.push(m); }
    this.grenades = n.map(([x, y, z], i) => { this.netNades[i].position.set(x, y, z); this.netNades[i].visible = true; return { pos: this.netNades[i].position }; });
    for (let i = n.length; i < this.netNades.length; i++) this.netNades[i].visible = false;
    for (const ev of d.ev || []) this.applyEvent(ev);
  }

  applyEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    const pl = this.player, mine = ev.to === pl.id;
    switch (ev.k) {
      case 'shot': if (ev.id !== pl.id) this.renderShot(ev); break;
      case 'dx': { const o = breakObject(Number(ev.i)); if (o) this.objectFx(o); break; }
      case 'boom': if (Array.isArray(ev.p)) { const p = v3(ev.p); if (!this.wasPredicted(p)) this.explodeFx(p, ev.s || 1, !!ev.a); } break;
      case 'proj': {
        if (ev.o === pl.id || !PROJ[ev.pk] || !Array.isArray(ev.p) || !Array.isArray(ev.v)) break;
        const tgt = this.vehicles.find(v => v.id === ev.g && v.alive) || null;
        this.projectiles.spawn(ev.pk, { team: ev.tm, id: ev.o }, v3(ev.p), v3(ev.v), tgt, null, true);
        break;
      }
      case 'vdead': {
        const v = this.vehicles.find(x => x.id === ev.id);
        if (v?.local) v.destroyLocal();
        else if (v?.persistent) { v.alive = false; v.m.g.visible = false; v.shown = false; }
        else if (v) v.remove();
        break;
      }
      case 'vdmg': if (mine) { const v = this.vehicles.find(x => x.id === ev.id && x.local); if (v) { if (ev.hp < v.health - 1) this.hud.vehicleHit(); v.health = Number(ev.hp) || 0; } } break;
      case 'mw': if (mine) { const v = this.vehicles.find(x => x.id === ev.id && x.local); if (v) v.missileWarn = 4; } break;
      case 'jet': if (Array.isArray(ev.p)) { this.jet.fly(v3(ev.p), ev.dx, ev.dz); this.audio.jet(); } break;
      case 'kill': {
        const killer = this.byId.get(ev.a) || null, victim = this.byId.get(ev.v);
        if (!victim) break;
        if (victim === pl) this.localDeath(killer, ev.w);
        else if (victim.alive) victim.die();
        this.hud.feed(killer, victim, ev.w, ev.h, pl);
        break;
      }
      case 'hurt': if (mine) { pl.lastHurt = this.time; this.audio.hurt(); this.hud.damageFrom({ x: ev.x, z: ev.z }, pl); } break;
      case 'hm': if (mine) { this.hud.hitmarker(ev.kill, ev.head); this.audio.hit(ev.kill ? 'kill' : ev.head ? 'head' : 'hit'); } break;
      case 'pop': if (mine && Array.isArray(ev.l)) this.hud.popup(ev.l.map(([t, s]) => [String(t), Number(s) || 0])); break;
      case 'sr': if (mine) this.streakReady(ev.id); break;
      case 'ann': {
        const own = ev.team === pl.team;
        this.hud.banner(own ? ev.a : ev.e, '', own ? 'ally' : 'enemy');
        if (own) this.audio.beep(); else this.audio.alarm();
        break;
      }
      case 'spawn': if (mine) { pl.spawn({ x: ev.x, z: ev.z }, ev.yaw, CLASSES[this.pendingCls]); this.hud.hideDeath(); } break;
      case 'drop': if (Array.isArray(ev.p)) this.dropPickup(v3(ev.p), ev.id); break;
      case 'took': this.removePickup(ev.id); break;
      case 'roster': this.syncRoster(ev.r || []); break;
      case 'end': if (Array.isArray(ev.sc)) this.teamScore = ev.sc.slice(0, 2); this.end(); break;
    }
  }

  syncRoster(list) {
    const ids = new Set(list.map(r => r.id));
    for (const n of this.nets.slice()) if (!ids.has(n.id)) { n.remove(); this.nets.splice(this.nets.indexOf(n), 1); }
    for (const r of list) {
      if (r.id === this.player.id || this.byId.has(r.id)) continue;
      const n = new NetSoldier(this, r.id, r.team, r.name, r.human, false);
      n.pos.set(r.x, 0, r.z); n.tgt.copy(n.pos);
      this.nets.push(n);
    }
    this.rebuild();
  }

  // ---------- frame ----------
  update(dt, inp) {
    if (this.state !== 'playing') return;
    const pl = this.player, ars = this.arsenal;
    this.time += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.authority && this.timeLeft <= 0) { this.end(); return; }
    this.pathBudget = 3;

    for (let t = 0; t < 2; t++) {
      if (this.uav[t] > 0) this.uav[t] -= dt;
      this.intel[t] = this.intel[t].filter(i => this.time - i.t < 12);
    }

    for (const k in pl.vcool) pl.vcool[k] = Math.max(0, pl.vcool[k] - dt);
    if (pl.alive) {
      if (inp.streak) this.playerStreak(inp.streak);
      if (inp.call) this.playerCall(inp.call);
      if (pl.vehicle && !pl.vehicle.alive) this.leftVehicle(pl, pl.vehicle);
      if (pl.vehicle) {
        if (inp.usePressed) this.exitVehicle();
        else pl.vehicle.control(dt, inp);
        pl.idle(dt);
      } else {
        if (this.targeting) {
          if (inp.firePressed) {
            this.camera.getWorldDirection(_fwd);
            const h = raycastWorld(this.camera.position, _fwd, 200);
            if (h) {
              this.targeting = false; this.hud.hint('');
              this.playerStreak('airstrike', this.camera.position.clone().addScaledVector(_fwd, h.t), pl.yaw);
            }
          }
          if (inp.adsPressed) { this.targeting = false; this.hud.hint(''); }
          inp.fire = inp.firePressed = inp.ads = false;
        } else if (inp.usePressed) {
          const v = this.nearbyVehicle(pl);
          if (v) this.enterVehicle(pl, v);
        }
        if (!pl.vehicle) {
          pl.update(dt, inp);
          ars.update(dt, inp, pl);
        }
      }
    } else {
      this.deadT -= dt;
      if (this.authority && this.deadT <= 0) {
        const sp = this.pickSpawn(pl.team);
        pl.spawn(sp, sp.yaw, CLASSES[this.pendingCls]);
        this.hud.hideDeath();
      }
    }

    if (this.authority) {
      for (const b of this.bots) b.update(dt);
      this.updateGrenades(dt);
      for (let i = this.jobs.length - 1; i >= 0; i--) {
        if (this.jobs[i].t <= this.time) { const j = this.jobs[i]; this.jobs.splice(i, 1); j.fn(); }
      }
    }
    if (this.authority && this.bots.length) this.aiCalls(dt);
    for (const n of this.nets) n.update(dt);
    for (const v of this.vehicles) v.update(dt);
    this.vehicles = this.vehicles.filter(v => v.alive || v.persistent);
    this.projectiles.update(dt);
    if (this.authority) this.updateBooms(dt);
    this.tankContacts();
    if (pl.inVehicle && pl.vehicle) pl.pos.copy(pl.vehicle.pos);
    this.updatePickups(dt);
    this.jet.update(dt);
    this.effects.update(dt);

    // camera
    this.shake *= Math.exp(-dt * 6);
    const veh = pl.alive ? pl.vehicle : null;
    let fov = this.settings.fov;
    if (veh) {
      fov = veh.view(this.camera, dt);
      this.camera.rotation.x += (Math.random() - 0.5) * this.shake;
      this.camera.rotation.y += (Math.random() - 0.5) * this.shake;
    } else if (pl.alive) { pl.updateCamera(this.camera, this.shake); fov = ars.fovFor(this.settings.fov); }
    else this.deathCam(dt);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.effects.setScale(this.renderer.domElement.height / (2 * Math.tan(this.camera.fov * DEG / 2)));
    this.camera.updateMatrixWorld();
    const L = this.audio.listener;
    L.x = this.camera.position.x; L.z = this.camera.position.z; L.y = this.camera.position.y;
    L.yaw = veh ? this.camera.rotation.y : pl.alive ? pl.yaw : this.deathYaw;
    this.audio.setMuffle(pl.alive ? Math.max(0, (40 - pl.health) / 40) * 0.55 : 0.45);
    this.audio.update(dt);
    this.flashT = Math.max(0, this.flashT - dt);

    if (pl.alive && !veh) ars.animate(dt, pl, inp.dx, inp.dy);
    ars.holder.visible = pl.alive && !veh;

    // enemy under the crosshair, and a vehicle close enough to get into
    let aimed = null;
    if ((this.useT = (this.useT || 0) - dt) <= 0) { this.useT = 0.2; this.useNear = pl.alive && !veh ? this.nearbyVehicle(pl) : null; }
    if (pl.alive && !veh) {
      this.camera.getWorldDirection(_fwd);
      const h = this.traceShot(this.camera.position, _fwd, 90, pl);
      if (h.entity && !h.entity.isVehicle) aimed = h.entity;
    }
    this.hud.update(this, dt, aimed);
    this.net?.tick(dt);
  }

  deathCam(dt) {
    const pl = this.player, cam = this.camera;
    const k = Math.min(1, Math.max(0, (4 - this.deadT) / 0.6));
    cam.position.set(pl.pos.x, pl.pos.y + 1.6 - 1.2 * k, pl.pos.z);
    if (this.killer && this.killer.alive) {
      _e.subVectors(this.killer.aimPoint(_c, false), cam.position);
      const want = Math.atan2(-_e.x, -_e.z);
      let d = want - this.deathYaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.deathYaw += d * Math.min(1, dt * 3);
      cam.rotation.set(Math.atan2(_e.y, Math.hypot(_e.x, _e.z)) * 0.8, this.deathYaw, 0.35 * k);
    } else cam.rotation.set(-0.3 * k, this.deathYaw, 0.35 * k);
  }
}
