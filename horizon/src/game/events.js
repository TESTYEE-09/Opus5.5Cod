// The festival's events. Races (road, street, dirt, touge, circuit and a cross-country
// Goliath) are driven against Drivatars on routes found by the GPS; PR stunts (speed traps,
// speed zones, drift zones) trigger as you drive through them. Race starts are marked by
// beams of light you can see from across the map.
import * as THREE from 'three';
import { speedProfile } from './route.js';
import { Driver, NAMES } from './ai.js';
import { CARS } from '../cars/catalog.js';
import { makeCar, syncCar } from '../cars/factory.js';
import { CarSound } from '../audio/audio.js';
import { coastZ } from '../world/layout.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const cz = (x) => coastZ(x) - 140 - 25 * Math.sin(x / 300);
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export const EVENTS = [
  { id: 'festival-sprint', kind: 'race', name: 'Festival Sprint', sub: 'Road race · festival to Minato', wps: [[-130, 1040], [40, 480], [180, -60], [420, 60], [1060, 220], [1240, 580]] },
  { id: 'coast-run', kind: 'race', name: 'Coastline Run', sub: 'Road race · the length of the coast', wps: [[-1300, cz(-1300)], [-400, cz(-400)], [600, cz(600)], [1500, cz(1500)]] },
  { id: 'haruna', kind: 'race', name: 'Haruna Downhill', sub: 'Touge · summit to the lake', wps: [[-1230, -1235], [-1330, -745], [-930, -330]] },
  { id: 'lake-loop', kind: 'race', name: 'Lake Kawa Loop', sub: 'Road circuit · 2 laps', road: 'lake', laps: 2 },
  { id: 'wangan', kind: 'race', name: 'Wangan Midnight', sub: 'Road race · the elevated expressway', wps: [[-700, -250], [480, -60], [1420, 200], [1860, 800], [1640, cz(1640) - 5]] },
  { id: 'minato-street', kind: 'street', name: 'Minato Nights', sub: 'Street race · city blocks, 2 laps', wps: [[700, 60], [1600, 40], [1600, 920], [700, 920]], closed: true, laps: 2 },
  { id: 'ginza', kind: 'street', name: 'Neon Sprint', sub: 'Street race · across downtown', wps: [[1600, 920], [1060, 580], [880, 220], [700, 40]] },
  { id: 'cedar-trail', kind: 'dirt', name: 'Cedar Trail Scramble', sub: 'Dirt race · through the forest', wps: [[-420, -1540], [-300, -950], [-420, -190]] },
  { id: 'lakeshore', kind: 'dirt', name: 'Lakeshore Trail', sub: 'Dirt race · shrine to the lake', wps: [[-900, 855], [-1300, 780], [-1530, 905]] },
  { id: 'sunrise-gp', kind: 'circuit', name: 'Sunrise Circuit GP', sub: 'Circuit · 3 laps', road: 'circuit', laps: 3 },
  { id: 'goliath', kind: 'circuit', name: 'The Goliath', sub: 'Cross-country · the whole map', wps: [[-110, 900], [-40, 700], [-470, 740], [-980, 500], [-1450, 700], [-1500, 1120], [-400, cz(-400)], [1500, cz(1500)], [1860, 800], [1420, 200], [720, 20], [180, -60], [-110, 900]] },
  // PR stunts
  { id: 'trap-wangan', kind: 'pr', pr: 'trap', name: 'Wangan Speed Trap', sub: 'Speed trap', at: [1150, 180], stars: [220, 260, 300] },
  { id: 'trap-coast', kind: 'pr', pr: 'trap', name: 'Seaside Speed Trap', sub: 'Speed trap', at: [200, cz(200)], stars: [160, 200, 240] },
  { id: 'trap-boulevard', kind: 'pr', pr: 'trap', name: 'Boulevard Speed Trap', sub: 'Speed trap', at: [100, 260], stars: [170, 210, 250] },
  { id: 'zone-festival', kind: 'pr', pr: 'zone', name: 'Festival Speed Zone', sub: 'Speed zone', from: [-110, 900], to: [40, 480], stars: [150, 185, 215] },
  { id: 'zone-ridge', kind: 'pr', pr: 'zone', name: 'Ridge Speed Zone', sub: 'Speed zone', from: [-60, -1540], to: [420, -1230], stars: [110, 135, 160] },
  { id: 'drift-haruna', kind: 'pr', pr: 'drift', name: 'Haruna Drift Zone', sub: 'Drift zone', from: [-1330, -790], to: [-1000, -960], stars: [15000, 35000, 70000] },
  { id: 'drift-docks', kind: 'pr', pr: 'drift', name: 'Harbour Drift Zone', sub: 'Drift zone', from: [700, 920], to: [1240, 920], stars: [12000, 30000, 60000] },
];

// a soft vertical beam of light for event starts
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){ float edge = pow(sin(vUv.x * 3.14159), 2.0); float up = pow(1.0 - vUv.y, 1.6);
        float band = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 3.0);
        gl_FragColor = vec4(uColor * 2.2, edge * up * band * 0.55); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

export class Events {
  constructor(game) {
    this.g = game;
    this.list = EVENTS;
    this.group = new THREE.Group(); this.group.name = 'events';
    game.scene.add(this.group);
    this.beams = [];
    const beamGeo = new THREE.CylinderGeometry(3.2, 3.2, 90, 24, 1, true); beamGeo.translate(0, 45, 0);
    const ringGeo = new THREE.RingGeometry(5.5, 7, 48); ringGeo.rotateX(-Math.PI / 2);
    const mats = { race: beamMaterial(0xff2d8a), pr: beamMaterial(0x29e0ff) };
    const ringMats = { race: new THREE.MeshBasicMaterial({ color: 0xff2d8a, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }), pr: new THREE.MeshBasicMaterial({ color: 0x29e0ff, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }) };
    this.mats = Object.values(mats);
    for (const e of this.list) {
      const at = e.at ?? e.from ?? e.wps?.[0] ?? this.roadStart(e);
      const n = game.world.nearestRoad(at[0], at[1], 300);
      if (!n) continue;
      e.x = n.x; e.z = n.z; e.y = n.y; e.hdg = n.hdg;
      if (e.pr === 'zone' || e.pr === 'drift') { const m = game.world.nearestRoad(e.to[0], e.to[1], 300); e.tx = m.x; e.tz = m.z; }
      const k = e.kind === 'pr' ? 'pr' : 'race';
      const beam = new THREE.Mesh(beamGeo, mats[k]);
      const ring = new THREE.Mesh(ringGeo, ringMats[k]);
      beam.position.set(e.x, e.y, e.z); ring.position.set(e.x, e.y + 0.15, e.z);
      beam.frustumCulled = false;
      this.group.add(beam, ring);
      this.beams.push({ e, beam, ring });
    }
    this.race = null;
    this.stunt = null;
    this.prompt = null;
  }

  roadStart(e) { const r = this.g.world.roads.find((x) => x.id === e.road); return [r.xs[0], r.zs[0]]; }

  markers() {
    return this.beams.map(({ e }) => ({ x: e.x, z: e.z, color: e.kind === 'pr' ? '#29e0ff' : '#ff2d8a', icon: e.pr === 'trap' ? '⚡' : e.pr === 'zone' ? '»' : e.pr === 'drift' ? '~' : e.kind === 'dirt' ? '⛰' : e.kind === 'street' ? '★' : e.kind === 'circuit' ? '◎' : '⚑', label: e.name, desc: e.sub, event: e.kind === 'pr' ? null : e }));
  }

  // --------------------------------------------------------------- building a race route
  buildRoute(e) {
    const W = this.g.world;
    let pts, closed = false;
    if (e.road) {
      const r = W.roads.find((x) => x.id === e.road);
      pts = [];
      for (let i = 0; i < r.n; i++) pts.push([r.xs[i], r.zs[i], r.ys[i]]);
      closed = !!r.loop;
    } else {
      pts = [];
      for (let k = 0; k < e.wps.length - 1; k++) {
        const [ax, az] = e.wps[k], [bx, bz] = e.wps[k + 1];
        const seg = this.g.graph.path(ax, az, bx, bz);
        if (!seg) continue;
        if (pts.length) seg.shift();
        pts.push(...seg);
      }
      if (e.closed) {
        const seg = this.g.graph.path(e.wps[e.wps.length - 1][0], e.wps[e.wps.length - 1][1], e.wps[0][0], e.wps[0][1]);
        if (seg) { seg.shift(); pts.push(...seg); }
        closed = true;
      }
    }
    // resample to ~3 m so speeds and the line are even
    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc >= 3) { out.push(pts[i]); acc = 0; }
    }
    if (closed && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 4) out.pop();
    return { pts: out, closed };
  }

  // --------------------------------------------------------------- race lifecycle
  async start(e) {
    if (e.kind === 'pr') { this.g.fastTravel(e.x, e.z, e.hdg); return; }
    if (this.race) this.quit(true);
    const g = this.g;
    g.hud.note(e.name.toUpperCase(), e.sub, '#ff2d8a', 2.5);
    const { pts, closed } = this.buildRoute(e);
    if (pts.length < 20) return;
    const player = g.car;
    const P = player.entry.phys;
    const prof = speedProfile(pts, { mu: (P.grip ?? 1.1) * 0.92, vmax: 95, decel: 8.5, closed });
    const laps = e.laps ?? 1;
    // opponents: cars near the player's performance index
    const pi = player.entry.pi;
    const pool = CARS.filter((c) => c.id !== player.entry.id && (e.kind !== 'dirt' || c.phys.drive !== 'RWD' || c.group === 'Offroad')).sort((a, b) => Math.abs(a.pi - pi) - Math.abs(b.pi - pi));
    const n = Math.min(5, pool.length);
    const picks = pool.slice(0, n + 2).sort(() => Math.random() - 0.5).slice(0, n);
    g.fade(true);
    const cars = await Promise.all(picks.map((c) => makeCar(c, g.world, { lod: true })));
    // grid: two columns behind the start line, the player at the back
    const lineAt = 45;
    const idxAt = (d) => { let i = 0; while (i < pts.length - 1 && prof.cum[i] < d) i++; return i; };
    const slot = (k) => {
      const d = lineAt - 6 - Math.floor(k / 2) * 9;
      const i = idxAt(Math.max(1, d));
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const hd = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const side = (k % 2 ? -1 : 1) * 2.4;
      const x = pts[i][0] + Math.cos(hd) * side, z = pts[i][1] - Math.sin(hd) * side;
      return { x, z, hd };
    };
    const drivers = cars.map((car, k) => {
      const s = slot(k);
      const gy = g.world.ground(s.x, s.z, (pts[0][2] ?? 0) + 30).h;
      car.veh.reset(new THREE.Vector3(s.x, gy + 0.05, s.z), s.hd);
      car.veh.onSubstep = (v) => g.col.resolveStatic(v);
      car.veh.assist = { abs: true, tcs: true, stm: true, steer: 1, autoGear: true, counter: 0.3 };
      g.scene.add(car.vis.group);
      const d = new Driver(car, pts, prof, { skill: 0.9 + Math.random() * 0.08 + (k < 2 ? 0.02 : 0), offset: (Math.random() - 0.5) * 2, name: NAMES[(k * 5 + e.id.length) % NAMES.length], closed });
      if (g.audio.ctx) d.sound = new CarSound(g.audio, car.entry, { player: false });
      return d;
    });
    const ps = slot(cars.length);
    const py = g.world.ground(ps.x, ps.z, (pts[0][2] ?? 0) + 30).h;
    player.veh.reset(new THREE.Vector3(ps.x, py + 0.05, ps.z), ps.hd);
    g.ccam.inited = false;
    this.race = { e, pts, prof, closed, laps, drivers, t: -3.6, lap: 0, idx: 0, dist: 0, cps: [], finished: false, results: [], startIdx: idxAt(lineAt), lineAt };
    this.track = { idx: 0, lap: 0 };
    g.route = { pts: pts.map((p) => [p[0], p[1], p[2]]) };
    g.ribbon.set(pts, pts.map(() => [0.2, 0.6, 1, 0.9]));
    g.hud.setRoute(pts.filter((_, i) => i % 3 === 0));
    g.hud.$('hudRace').classList.remove('hidden');
    g.skills.enabled = e.kind === 'drift';
    g.skills.reset();
    g.fade(false);
    g.music?.duck(0.5);
  }

  quit(silent = false) {
    const R = this.race;
    if (!R) return;
    for (const d of R.drivers) { this.g.scene.remove(d.car.vis.group); d.car.vis.dispose?.(); d.sound?.dispose(); }
    this.race = null;
    this.g.hud.$('hudRace').classList.add('hidden');
    this.g.hud.center('');
    this.g.clearRoute();
    this.g.skills.enabled = true;
    if (!silent) this.g.hud.note('EVENT ABANDONED', '', '#555');
    this.g.music?.duck(1);
  }

  playerProgress(R) {
    const mp = this.g.playerPos(), p = R.pts, n = p.length, T = this.track;
    let best = T.idx, bd = Infinity;
    for (let k = -15; k <= 80; k++) {
      let i = T.idx + k;
      if (R.closed) i = (i + n) % n; else if (i < 0 || i >= n) continue;
      const d = (p[i][0] - mp.x) ** 2 + (p[i][1] - mp.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (R.closed && best < T.idx - n / 2 && R.t > 5) T.lap++;
    T.idx = best;
    return { prog: T.lap * R.prof.length + R.prof.cum[best] - R.lineAt, off: Math.sqrt(bd) };
  }

  update(dt) {
    const g = this.g;
    for (const m of this.mats) m.uniforms.uTime.value += dt;
    const pp = g.playerPos();
    // beams fade when close so they don't blind you
    for (const b of this.beams) {
      const d = Math.hypot(b.e.x - pp.x, b.e.z - pp.z);
      b.beam.visible = b.ring.visible = !this.race && d > 14;
      b.beam.scale.set(1 + d / 900, 1 + d / 400, 1 + d / 900);
    }
    if (this.race) return this.updateRace(dt);
    this.updateStunts(dt, pp);
    // race start prompt
    let near = null;
    for (const b of this.beams) {
      if (b.e.kind === 'pr') continue;
      if (Math.hypot(b.e.x - pp.x, b.e.z - pp.z) < 16) near = b.e;
    }
    if (near !== this.prompt) {
      this.prompt = near;
      g.hud.prompt(near ? `<b>${near.name}</b><span>${near.sub}</span><em>Press Enter · A · tap to start</em>` : null, near ? () => this.start(near) : null);
    }
    if (near && (g.input.took('Enter') || g.input.took('pad:0') && g.car.veh.speed < 3)) this.start(near);
  }

  updateRace(dt) {
    const g = this.g, R = this.race, veh = g.car.veh;
    R.t += dt;
    const total = R.prof.length * R.laps - R.lineAt;
    // countdown: everyone held on the brakes
    if (R.t < 0) {
      const c = Math.ceil(-R.t);
      const label = R.t < -3 ? '' : String(c);
      if (label !== R.cd) { R.cd = label; g.hud.center(label ? `<span class="cd">${label}</span>` : ''); if (label) g.sfx('check', 0.6); }
      veh.input.brake = 1; veh.input.throttle = Math.min(veh.input.throttle, 1);
      for (const d of R.drivers) { d.car.veh.input.brake = 1; d.car.veh.input.throttle = 0.4; d.car.veh.update(dt); syncCar(d.car); d.sound?.update(dt, d.car.veh, g.listenerRel(d.car)); }
      return;
    }
    if (!R.go) { R.go = true; g.hud.center('<span class="cd go">GO!</span>'); g.sfx('stage', 0.8); setTimeout(() => this.race === R && g.hud.center(''), 900); }
    // player progress and position
    const pl = this.playerProgress(R);
    if (!R.finished && pl.off > 60) { g.hud.note('WRONG WAY', 'Get back on the route', '#ff4d6d', 1); }
    // AI
    const others = R.drivers.map((d) => d.car);
    for (const d of R.drivers) {
      if (!d.finished) {
        const gap = (pl.prog - (d.progress() - R.lineAt)) / 100;
        d.update(dt, others, g.car, clamp(gap * 0.02, -0.06, 0.06));
      } else { d.car.veh.input.throttle = 0; d.car.veh.input.brake = 0.3; }
      d.car.veh.update(dt);
      syncCar(d.car);
      d.sound?.update(dt, d.car.veh, g.listenerRel(d.car));
      if (!d.finished && d.progress() - R.lineAt >= total) { d.finished = true; R.results.push({ name: d.name, car: d.car.entry, t: R.t }); }
    }
    // car-to-car contact
    const all = [g.car, ...others];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) g.col.resolvePair(all[i].veh, all[j].veh);
    const ranks = [{ me: true, p: pl.prog }, ...R.drivers.map((d) => ({ p: d.finished ? 1e9 - R.results.findIndex((r) => r.name === d.name) : d.progress() - R.lineAt }))];
    ranks.sort((a, b) => b.p - a.p);
    const pos = R.finished ? R.finalPos : ranks.findIndex((r) => r.me) + 1;
    const lap = Math.min(R.laps, Math.floor(Math.max(0, pl.prog + R.lineAt) / R.prof.length) + 1);
    g.hud.race(pos, R.drivers.length + 1, R.laps > 1 ? `LAP ${lap}/${R.laps}` : `${Math.max(0, (total - pl.prog) / 1000).toFixed(1)} KM`, fmtT(Math.max(0, R.t)));
    // racing line colour against the player's speed
    const S = g.profile.d.settings.line;
    const near = g.ribbon.update(dt, g.playerPos().x, g.playerPos().z, S === 'off' ? 0 : 220);
    if (near >= 0 && S !== 'off') {
      const v = veh.speed;
      g.ribbon.recolor(near, near + 90, (i) => {
        const vs = R.prof.vs[i];
        const over = (v - vs) / Math.max(vs, 5);
        if (over > 0.12) return [1, 0.12, 0.1, 0.95];
        if (over > 0.0) return [1, 0.75, 0.1, 0.9];
        return S === 'braking' ? [0.2, 0.6, 1, 0] : [0.2, 0.62, 1, 0.8];
      });
    }
    // finish
    if (!R.finished && pl.prog >= total) {
      R.finished = true;
      R.results.push({ name: 'YOU', car: g.car.entry, t: R.t, me: true });
      R.finalPos = R.results.length;
      g.sfx(R.finalPos === 1 ? 'win0' : 'lap', 0.9);
      g.hud.center(`<span class="cd">${R.finalPos === 1 ? '1ST!' : `${R.finalPos}${['', 'ST', 'ND', 'RD'][R.finalPos] ?? 'TH'}`}</span>`);
      setTimeout(() => this.results(R), 2200);
    }
  }

  results(R) {
    if (this.race !== R) return;
    const g = this.g;
    // anyone still racing is placed by progress
    const rest = R.drivers.filter((d) => !d.finished).sort((a, b) => b.progress() - a.progress());
    for (const d of rest) R.results.push({ name: d.name, car: d.car.entry, t: null });
    const pos = R.finalPos;
    const cr = [25000, 15000, 10000, 6000, 4000, 3000][pos - 1] ?? 2000;
    const xp = [3500, 2500, 1800, 1200, 1000, 800][pos - 1] ?? 600;
    const prev = g.profile.d.events[R.e.id];
    g.profile.d.events[R.e.id] = { pos: Math.min(prev?.pos ?? 99, pos), best: Math.min(prev?.best ?? 1e9, R.t) };
    if (pos === 1) g.profile.d.stats.wins++;
    g.profile.addCredits(cr);
    const up = g.profile.addXP(xp);
    g.hud.center('');
    g.showResults({
      title: R.e.name, pos,
      rows: R.results.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${r.car.make} ${r.car.model}</td><td>${r.t ? fmtT(r.t) : 'DNF'}</td></tr>`).join(''),
      rewards: `+${fmt(cr)} CR · +${fmt(xp)} XP${up ? ` · LEVEL UP! +${up} Wheelspin` : ''}`,
      onClose: () => this.quit(true),
    });
  }

  // --------------------------------------------------------------- PR stunts
  updateStunts(dt, pp) {
    const g = this.g, veh = g.car.veh;
    for (const { e } of this.beams) {
      if (e.kind !== 'pr') continue;
      const d = Math.hypot(e.x - pp.x, e.z - pp.z);
      if (e.pr === 'trap') {
        if (d < 14 && !e._in) { e._in = true; this.award(e, veh.speed * 3.6, `${Math.round(g.kmh ? veh.speed * 3.6 : veh.speed * 2.237)} ${g.kmh ? 'KM/H' : 'MPH'}`); }
        else if (d > 30) e._in = false;
      } else if (!this.stunt && d < 12 && !e._in) {
        e._in = true;
        this.stunt = { e, t: 0, dist: 0, drift: 0, lx: pp.x, lz: pp.z };
        g.hud.note(e.name.toUpperCase(), e.pr === 'drift' ? 'Drift to score' : 'Keep your average speed up', '#29e0ff', 2);
      } else if (d > 30) e._in = false;
    }
    const S = this.stunt;
    if (S) {
      S.t += dt;
      S.dist += Math.hypot(pp.x - S.lx, pp.z - S.lz); S.lx = pp.x; S.lz = pp.z;
      if (S.e.pr === 'drift') { const a = Math.abs(veh.driftAngle); if (veh.speed > 9 && a > 0.26) S.drift += dt * veh.speed * (a - 0.2) * 55 * 3; }
      const live = S.e.pr === 'drift' ? fmt(S.drift) : `${Math.round((S.dist / Math.max(S.t, 0.1)) * (g.kmh ? 3.6 : 2.237))} ${g.kmh ? 'KM/H' : 'MPH'}`;
      g.hud.stunt(S.e.name, live);
      const de = Math.hypot(S.e.tx - pp.x, S.e.tz - pp.z);
      if (de < 14 && S.t > 2) {
        const score = S.e.pr === 'drift' ? S.drift : (S.dist / S.t) * 3.6;
        this.award(S.e, score, S.e.pr === 'drift' ? `${fmt(S.drift)} PTS` : live);
        this.stunt = null; g.hud.stunt(null);
      } else if (S.t > 120 || Math.hypot(S.e.x - pp.x, S.e.z - pp.z) + de > Math.hypot(S.e.x - S.e.tx, S.e.z - S.e.tz) * 1.8 + 200) { this.stunt = null; g.hud.stunt(null); }
    }
  }

  award(e, score, label) {
    const g = this.g;
    const stars = e.stars.filter((s) => score >= s).length;
    const prev = g.profile.d.events[e.id]?.stars ?? 0;
    g.hud.note(label, `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}  ${e.name}`, stars ? '#29e0ff' : '#555', 3);
    g.sfx(stars ? 'check' : 'check_wrong', 0.7);
    if (stars > prev) {
      g.profile.d.events[e.id] = { stars, best: score };
      g.profile.addXP((stars - prev) * 500);
      g.profile.addCredits((stars - prev) * 2500);
      g.hud.pop(`+${(stars - prev) * 500} XP`, 'xp');
    }
  }
}
