// Ambient traffic: kei cars, taxis, minivans and kei trucks driving on the left, keeping
// their distance, slowing for bends and the player, and recycled around the player so the
// roads near you are always alive. Hit one and it is shoved with a proper 2D rigid-body
// impulse, spins out with its hazards on, and is quietly recycled later. Passing close at
// speed is a near miss.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { satBoxBox } from '../physics/collide.js';
import { mulberry } from '../world/noise.js';

const SPEED = { expressway: 27, highway: 19, coast: 17, road: 14, street: 11, touge: 12 };
const PAINTS = [0xf4f4f2, 0xe9e9e6, 0x1c1c1e, 0x9aa0a6, 0x2b3f63, 0x8a1b1b, 0xd9d3c3, 0x3d5a3e, 0xb8c2c8, 0xefe3b0, 0x6a6f75, 0x1f4d7a];
// part material slots: 0 paint, 1 glass, 2 trim, 3 head, 4 tail, 5 tyre, 6 extra (taxi sign, bed)
const MODELS = {
  kei: { len: 3.4, wid: 1.47, hgt: 1.78, wb: 2.52, r: 0.28, mass: 950 },
  taxi: { len: 4.7, wid: 1.7, hgt: 1.5, wb: 2.7, r: 0.31, mass: 1400 },
  van: { len: 4.95, wid: 1.85, hgt: 1.93, wb: 3.0, r: 0.34, mass: 2000 },
  truck: { len: 3.4, wid: 1.47, hgt: 1.76, wb: 1.9, r: 0.28, mass: 900 },
};

function part(geo, slot, x, y, z) { geo.translate(x, y, z); geo.userData.slot = slot; return geo; }
const rbox = (w, h, d, r, slot, x, y, z) => part(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)), slot, x, y, z);
const box = (w, h, d, slot, x, y, z) => part(new THREE.BoxGeometry(w, h, d), slot, x, y, z);

function buildModel(kind) {
  const M = MODELS[kind], L = M.len, W = M.wid, H = M.hgt, r = M.r;
  const p = [];
  const wheel = (x, z) => { const g = new THREE.CylinderGeometry(r, r, 0.2, 18); g.rotateZ(Math.PI / 2); p.push(part(g, 5, x, r, z)); const h = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.21, 12); h.rotateZ(Math.PI / 2); p.push(part(h, 2, x, r, z)); };
  const lamps = (zf, zr, y, wf = 0.3) => {
    for (const s of [-1, 1]) {
      p.push(box(wf, 0.12, 0.05, 3, s * (W / 2 - wf / 2 - 0.06), y, zf));
      p.push(box(0.22, 0.2, 0.05, 4, s * (W / 2 - 0.17), y + 0.05, zr));
    }
  };
  if (kind === 'kei') {
    p.push(rbox(W, H - 0.62, L, 0.12, 0, 0, 0.3 + (H - 0.62) / 2, 0));
    p.push(rbox(W - 0.04, 0.62, L * 0.72, 0.1, 1, 0, H - 0.34, -L * 0.1));
    p.push(rbox(W - 0.02, 0.1, L * 0.62, 0.05, 0, 0, H - 0.02, -L * 0.14));
    p.push(box(W - 0.3, 0.5, 0.05, 1, 0, H - 0.4, L / 2 - 0.62));
    lamps(L / 2 + 0.01, -L / 2 - 0.01, 0.82);
    p.push(box(W * 0.9, 0.1, 0.08, 2, 0, 0.36, L / 2 - 0.02), box(W * 0.9, 0.1, 0.08, 2, 0, 0.36, -L / 2 + 0.02));
  } else if (kind === 'taxi') {
    p.push(rbox(W, 0.62, L, 0.1, 0, 0, 0.62, 0));
    p.push(rbox(W - 0.1, 0.52, L * 0.46, 0.08, 1, 0, 1.18, -0.15));
    p.push(rbox(W - 0.12, 0.06, L * 0.4, 0.03, 0, 0, 1.44, -0.15));
    p.push(rbox(0.36, 0.14, 0.14, 0.03, 6, 0, 1.53, 0));
    lamps(L / 2 + 0.01, -L / 2 - 0.01, 0.74, 0.34);
    p.push(box(W * 0.94, 0.1, 0.08, 2, 0, 0.4, L / 2 - 0.02), box(W * 0.94, 0.1, 0.08, 2, 0, 0.4, -L / 2 + 0.02));
    p.push(box(W * 0.5, 0.16, 0.04, 2, 0, 0.66, L / 2 + 0.01));
  } else if (kind === 'van') {
    p.push(rbox(W, H - 0.72, L, 0.14, 0, 0, 0.36 + (H - 0.72) / 2, 0));
    p.push(rbox(W - 0.04, 0.66, L * 0.76, 0.12, 1, 0, H - 0.38, -L * 0.07));
    p.push(rbox(W - 0.02, 0.1, L * 0.68, 0.05, 0, 0, H - 0.03, -L * 0.1));
    p.push(box(W * 0.72, 0.34, 0.05, 2, 0, 0.75, L / 2 + 0.005));
    lamps(L / 2 + 0.01, -L / 2 - 0.01, 0.95, 0.36);
  } else {
    // kei truck: cab and flat bed with drop sides
    p.push(rbox(W, 1.2, 1.25, 0.1, 0, 0, 0.9, L / 2 - 0.62));
    p.push(box(W - 0.06, 0.5, 0.05, 1, 0, 1.25, L / 2 + 0.005));
    p.push(box(0.05, 0.4, 0.7, 1, W / 2, 1.28, L / 2 - 0.55), box(0.05, 0.4, 0.7, 1, -W / 2, 1.28, L / 2 - 0.55));
    p.push(box(W, 0.1, L - 1.3, 6, 0, 0.66, -0.65 + 0.02));
    for (const s of [-1, 1]) p.push(box(0.04, 0.3, L - 1.3, 6, s * W / 2, 0.86, -0.63));
    p.push(box(W, 0.3, 0.04, 6, 0, 0.86, -L / 2 + 0.02), box(W, 0.4, 0.04, 6, 0, 1.0, L / 2 - 1.28));
    lamps(L / 2 + 0.01, -L / 2 - 0.03, 0.62);
  }
  const zf = M.wb / 2, zr = -M.wb / 2;
  for (const s of [-1, 1]) { wheel(s * (W / 2 - 0.12), zf); wheel(s * (W / 2 - 0.12), zr); }
  // group by material slot
  const bySlot = new Map();
  for (const g of p) { const k = g.userData.slot; const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv'); (bySlot.get(k) ?? bySlot.set(k, []).get(k)).push(ng); }
  const merged = [], slots = [];
  for (const [k, list] of [...bySlot].sort((a, b) => a[0] - b[0])) { merged.push(mergeGeometries(list)); slots.push(k); }
  const geo = mergeGeometries(merged, true);
  geo.computeBoundingSphere();
  return { geo, slots };
}

export class Traffic {
  constructor(world, scene, col, { count = 26 } = {}) {
    this.world = world; this.col = col;
    this.rnd = mulberry(4242);
    this.group = new THREE.Group(); this.group.name = 'traffic';
    scene.add(this.group);
    this.roads = world.roads.filter((r) => SPEED[r.type]);
    this.models = Object.fromEntries(Object.keys(MODELS).map((k) => [k, buildModel(k)]));
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
    this.shared = {
      1: new THREE.MeshPhysicalMaterial({ color: 0x0b0e12, roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
      2: std(0x16171a, { roughness: 0.6 }),
      5: std(0x121212, { roughness: 0.9 }),
      6: std(0x8a8d90, { roughness: 0.7, metalness: 0.3 }),
    };
    this.cars = [];
    for (let i = 0; i < count; i++) this.cars.push(this.makeCar(i));
    this.night = 0;
    this._hit = {};
  }

  makeCar(i) {
    const kinds = ['kei', 'kei', 'taxi', 'van', 'truck', 'kei', 'taxi', 'van'];
    const kind = kinds[i % kinds.length], M = MODELS[kind], model = this.models[kind];
    const taxi = kind === 'taxi';
    const paint = new THREE.MeshPhysicalMaterial({ color: taxi ? [0x101014, 0xf2c200, 0x2f6e3a, 0xe8e4da][i % 4] : PAINTS[(this.rnd() * PAINTS.length) | 0], roughness: 0.35, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const head = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff3dc, emissiveIntensity: 0 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x5a0808, emissive: 0xff1a10, emissiveIntensity: 0.2 });
    const sign = taxi ? new THREE.MeshStandardMaterial({ color: 0xf6f0d8, emissive: 0xffe9a0, emissiveIntensity: 0 }) : this.shared[6];
    const mats = model.slots.map((s) => (s === 0 ? paint : s === 3 ? head : s === 4 ? tail : s === 6 ? sign : this.shared[s]));
    const mesh = new THREE.Mesh(model.geo, mats);
    mesh.castShadow = true;
    this.group.add(mesh);
    const c = { kind, M, mesh, head, tail, sign: taxi ? sign : null, road: null, s: 0, dir: 1, lane: 0, v: 0, vt: 0, x: 0, y: 0, z: 0, yaw: 0, knocked: 0, vel: new THREE.Vector3(), w: 0, box: {}, passed: 0 };
    return c;
  }

  // place a car on a random road 150-450 m from the player, out of sight if possible
  spawn(c, px, pz, fx = 0, fz = 1) {
    for (let tries = 0; tries < 30; tries++) {
      const r = this.roads[(this.rnd() * this.roads.length) | 0];
      const i = (this.rnd() * r.n) | 0;
      const d = Math.hypot(r.xs[i] - px, r.zs[i] - pz);
      if (d < 140 || d > 480) continue;
      // prefer spots behind or beside the camera
      if (tries < 20 && ((r.xs[i] - px) * fx + (r.zs[i] - pz) * fz) / d > 0.6 && d < 260) continue;
      c.road = r; c.s = r.cum[i]; c.dir = this.rnd() < 0.5 ? 1 : -1;
      const lanes = Math.max(1, Math.round((r.T.lanes ?? 2) / 2));
      const lw = r.T.hw / lanes;
      c.lane = lw * (Math.floor(this.rnd() * lanes) + 0.5);
      c.v = SPEED[r.type] * (0.8 + this.rnd() * 0.25); c.knocked = 0; c.passed = 0;
      c.vel.set(0, 0, 0); c.w = 0;
      this.place(c);
      c.mesh.visible = true;
      return true;
    }
    c.mesh.visible = false; c.road = null;
    return false;
  }

  // position from road distance + lane (left-hand traffic: lanes to the left of travel)
  place(c) {
    const r = c.road, n = r.n, cum = r.cum;
    let s = c.s;
    if (r.loop) s = ((s % r.length) + r.length) % r.length;
    // binary search the sample
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const f = cum[hi] > cum[lo] ? (s - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    const x = r.xs[lo] + (r.xs[hi] - r.xs[lo]) * f, z = r.zs[lo] + (r.zs[hi] - r.zs[lo]) * f;
    let hd = r.hdg[lo];
    if (c.dir < 0) hd += Math.PI;
    // left of travel = (cos hd, -sin hd) rotated... heading 0 faces +z, left is +x
    const lx = Math.cos(hd), lz = -Math.sin(hd);
    c.x = x + lx * c.lane; c.z = z + lz * c.lane;
    const g = this.world.ground(c.x, c.z, r.ys[lo] + 2);
    c.y = g.h;
    c.yaw = hd;
    c.idx = lo;
    return c;
  }

  // curvature ahead: heading change over the next ~30 m slows the car
  bendSpeed(c) {
    const r = c.road, step = c.dir * 15;
    const i0 = c.idx, i1 = r.loop ? (i0 + step + r.n) % r.n : Math.max(0, Math.min(r.n - 1, i0 + step));
    let dh = Math.abs(r.hdg[i1] - r.hdg[i0]);
    if (dh > Math.PI) dh = Math.PI * 2 - dh;
    const R = 30 / Math.max(0.02, dh);
    return Math.sqrt(0.35 * 9.81 * R);
  }

  update(dt, player, cam, skills, night) {
    const P = player.veh, pp = player.veh.modelPosition(new THREE.Vector3());
    const cd = cam.getWorldDirection(this._cd ?? (this._cd = new THREE.Vector3()));
    const cl = Math.hypot(cd.x, cd.z) || 1, fx = cd.x / cl, fz = cd.z / cl;
    const pbox = this.col.carBox(P, P._tbox ?? (P._tbox = {}));
    // lane occupancy for following distance
    for (const c of this.cars) {
      if (!c.road || (Math.hypot(c.x - pp.x, c.z - pp.z) > 620 && c.knocked <= 0) || (c.knocked < -6 && Math.hypot(c.x - pp.x, c.z - pp.z) > 120)) { this.spawn(c, pp.x, pp.z, fx, fz); continue; }
      if (c.knocked > 0) {
        // sliding after a hit: friction brings it to rest, spin decays
        c.knocked -= dt;
        const sp = c.vel.length();
        if (sp > 0) c.vel.multiplyScalar(Math.max(0, sp - 7 * dt) / sp);
        c.w *= Math.exp(-dt * 1.5);
        c.x += c.vel.x * dt; c.z += c.vel.z * dt; c.yaw += c.w * dt;
        c.y = this.world.ground(c.x, c.z, c.y + 2).h;
        if (c.knocked <= 0) c.knocked = -0.001;
      } else if (c.knocked < 0) {
        c.knocked -= dt; // parked with hazards until recycled
      } else {
        let target = Math.min(SPEED[c.road.type], this.bendSpeed(c));
        // follow: nearest car ahead in the same lane and direction, and the player
        let gap = 1e9;
        for (const o of this.cars) {
          if (o === c || o.road !== c.road || o.dir !== c.dir || Math.abs(o.lane - c.lane) > 1) continue;
          const ds = (o.s - c.s) * c.dir;
          if (ds > 0 && ds < gap) gap = ds;
        }
        const dx = pp.x - c.x, dz = pp.z - c.z;
        const ahead = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw), side = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw);
        if (ahead > 0 && ahead < 30 && Math.abs(side) < 2.2) gap = Math.min(gap, ahead);
        if (gap < 40) target = Math.min(target, Math.max(0, (gap - 8) * 0.7));
        c.vt = target;
        c.v += Math.max(-7 * dt, Math.min(2.2 * dt, target - c.v));
        c.s += c.v * c.dir * dt;
        const r = c.road;
        if (!r.loop && (c.s < 0 || c.s > r.length)) { this.spawn(c, pp.x, pp.z, fx, fz); continue; }
        this.place(c);
        c.vel.set(Math.sin(c.yaw) * c.v, 0, Math.cos(c.yaw) * c.v);
        c.w = 0;
      }
      // pose: pitch to the ground under the axles
      const m = c.mesh;
      m.position.set(c.x, c.y, c.z);
      m.rotation.set(0, c.yaw, 0);
      const hazard = c.knocked !== 0 && (performance.now() / 400) % 2 < 1;
      c.head.emissiveIntensity = night > 0.2 ? 3 : 0;
      c.tail.emissiveIntensity = (c.v < c.vt - 0.5 && c.knocked === 0) || hazard ? 3 : night > 0.2 ? 1 : 0.1;
      if (c.sign) c.sign.emissiveIntensity = night > 0.2 ? 2 : 0.3;
      // collision with the player
      const b = c.box;
      b.x = c.x; b.z = c.z; b.ux = Math.cos(c.yaw); b.uz = -Math.sin(c.yaw); b.vx = Math.sin(c.yaw); b.vz = Math.cos(c.yaw);
      b.hx = c.M.wid / 2; b.hz = c.M.len / 2;
      const dxp = pbox.x - b.x, dzp = pbox.z - b.z;
      if (dxp * dxp + dzp * dzp < 100 && Math.abs(pp.y - c.y) < 3) {
        const h = satBoxBox(pbox, b, this._hit);
        if (h) this.hit(P, c, h, pbox);
        else if (P.speed > 18 && !c.passed) {
          // near miss: the car goes past with under a metre of daylight
          const rel = dxp * pbox.vx + dzp * pbox.vz;
          const lat = Math.abs(dxp * pbox.ux + dzp * pbox.uz) - pbox.hx - Math.min(b.hx, b.hz);
          if (rel > pbox.hz && lat < 1.3 && c.knocked === 0) { c.passed = 1; skills?.nearMiss(lat < 0.6); }
        }
      } else if (dxp * dxp + dzp * dzp > 400) c.passed = 0;
    }
  }

  // 2D rigid-body impulse between the player (full 3D body) and a traffic car
  hit(P, c, h, pbox) {
    const n = new THREE.Vector3(h.nx, 0, h.nz);
    P.pos.addScaledVector(n, h.depth * 0.7);
    c.x -= h.nx * h.depth * 0.3; c.z -= h.nz * h.depth * 0.3;
    const at = new THREE.Vector3(h.px, P.pos.y, h.pz);
    const va = P.pointVelocity(at, new THREE.Vector3());
    const rx = h.px - c.x, rz = h.pz - c.z;
    const vb = new THREE.Vector3(c.vel.x - c.w * rz, 0, c.vel.z + c.w * rx);
    const vn = va.sub(vb).dot(n);
    if (vn >= 0) return;
    const mB = c.M.mass, IB = (mB / 12) * (c.M.len ** 2 + c.M.wid ** 2);
    const rn = rx * n.z - rz * n.x;
    const k = P.invMassAt(at, n) + 1 / mB + (rn * rn) / IB;
    const j = (-(1 + 0.25) * vn) / k;
    P.impulse(n.clone().multiplyScalar(j), at);
    if (c.knocked === 0) c.vel.set(Math.sin(c.yaw) * c.v, 0, Math.cos(c.yaw) * c.v);
    c.vel.addScaledVector(n, -j / mB);
    c.w -= (rn * j) / IB;
    c.knocked = 4 + Math.random() * 2; c.v = 0;
    if (-vn > 1.5) { P.events.push({ type: 'hit', speed: -vn, kind: 'traffic', x: h.px, z: h.pz }); P.lastImpact = Math.max(P.lastImpact, -vn); }
  }
}
