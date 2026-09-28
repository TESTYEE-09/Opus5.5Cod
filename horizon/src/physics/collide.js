// Collisions in the ground plane: every car is an oriented box, static things are oriented
// boxes (buildings, houses, guardrail and barrier segments given a thickness) or circles
// (tree trunks, poles). A 2D separating-axis test finds the push-out axis and depth, then an
// impulse with restitution and friction is applied at the contact point, at bumper height so
// glancing hits yaw the car the way they should. Static geometry sits in a spatial hash.
import * as THREE from 'three';

const CELL = 24;
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _j = new THREE.Vector3();

function boxFromSegment(w, thick) {
  const dx = w.bx - w.ax, dz = w.bz - w.az, len = Math.hypot(dx, dz) || 1e-3;
  const ux = dx / len, uz = dz / len;
  // local x runs along the segment
  return { type: 'box', x: (w.ax + w.bx) / 2, z: (w.az + w.bz) / 2, ux, uz, vx: -uz, vz: ux, hx: len / 2 + 0.05, hz: thick, y0: w.y0, y1: w.y1, kind: w.rail ? 'rail' : w.median ? 'median' : 'wall', soft: w.rail ? 0.2 : 0.15 };
}

function prepBox(c) {
  // three.js rotation.y = rot: local x -> (cos, -sin), local z -> (sin, cos)
  const r = c.rot ?? 0;
  return { ...c, ux: Math.cos(r), uz: -Math.sin(r), vx: Math.sin(r), vz: Math.cos(r), kind: c.kind ?? 'building', soft: c.soft ?? 0.15 };
}

// oriented rectangle overlap by SAT; returns depth and the normal pointing from b to a
export function satBoxBox(a, b, out) {
  const axes = [a.ux, a.uz, a.vx, a.vz, b.ux, b.uz, b.vx, b.vz];
  const dx = a.x - b.x, dz = a.z - b.z;
  let best = Infinity, bx = 0, bz = 0;
  for (let k = 0; k < 4; k++) {
    const lx = axes[k * 2], lz = axes[k * 2 + 1];
    const ra = a.hx * Math.abs(a.ux * lx + a.uz * lz) + a.hz * Math.abs(a.vx * lx + a.vz * lz);
    const rb = b.hx * Math.abs(b.ux * lx + b.uz * lz) + b.hz * Math.abs(b.vx * lx + b.vz * lz);
    const d = dx * lx + dz * lz;
    const o = ra + rb - Math.abs(d);
    if (o <= 0) return null;
    if (o < best) { best = o; const s = d < 0 ? -1 : 1; bx = lx * s; bz = lz * s; }
  }
  out.depth = best; out.nx = bx; out.nz = bz;
  // contact point: the centre of a's corners inside b, else of b's corners inside a, else the
  // point of a facing b (edge crossing edge)
  if (!cornersInside(a, b, out) && !cornersInside(b, a, out)) {
    const ea = a.hx * Math.abs(a.ux * bx + a.uz * bz) + a.hz * Math.abs(a.vx * bx + a.vz * bz);
    out.px = a.x - bx * (ea - best / 2); out.pz = a.z - bz * (ea - best / 2);
  }
  return out;
}

const SIGNS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
function cornersInside(p, q, out) {
  let n = 0, sx = 0, sz = 0;
  for (const [su, sv] of SIGNS) {
    const x = p.x + p.ux * p.hx * su + p.vx * p.hz * sv, z = p.z + p.uz * p.hx * su + p.vz * p.hz * sv;
    const dx = x - q.x, dz = z - q.z;
    if (Math.abs(dx * q.ux + dz * q.uz) <= q.hx + 0.02 && Math.abs(dx * q.vx + dz * q.vz) <= q.hz + 0.02) { n++; sx += x; sz += z; }
  }
  if (!n) return false;
  out.px = sx / n; out.pz = sz / n;
  return true;
}

function satBoxCircle(a, c, out) {
  const dx = c.x - a.x, dz = c.z - a.z;
  const lu = dx * a.ux + dz * a.uz, lv = dx * a.vx + dz * a.vz;
  const cu = Math.max(-a.hx, Math.min(a.hx, lu)), cv = Math.max(-a.hz, Math.min(a.hz, lv));
  const px = a.x + a.ux * cu + a.vx * cv, pz = a.z + a.uz * cu + a.vz * cv;
  let ex = px - c.x, ez = pz - c.z, d = Math.hypot(ex, ez);
  if (d >= c.r) return null;
  if (d < 1e-4) { ex = a.x - c.x; ez = a.z - c.z; d = Math.hypot(ex, ez) || 1; out.depth = c.r; }
  else out.depth = c.r - d;
  out.nx = ex / d; out.nz = ez / d; out.px = px; out.pz = pz;
  return out;
}

export class Collisions {
  constructor() {
    this.grid = new Map();
    this.hit = { depth: 0, nx: 0, nz: 0, px: 0, pz: 0 };
    this.stamp = 0;
    this.count = 0;
  }

  key(i, j) { return i * 73856 + j; }

  add(c) {
    c._s = 0;
    let x0, x1, z0, z1;
    if (c.type === 'circle') { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; }
    else {
      const ex = Math.abs(c.ux) * c.hx + Math.abs(c.vx) * c.hz, ez = Math.abs(c.uz) * c.hx + Math.abs(c.vz) * c.hz;
      x0 = c.x - ex; x1 = c.x + ex; z0 = c.z - ez; z1 = c.z + ez;
    }
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = this.key(i, j);
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(c);
      }
    }
    this.count++;
    return c;
  }

  addWalls(walls) { for (const w of walls) this.add(boxFromSegment(w, w.median ? 0.3 : 0.18)); }
  addBoxes(list) { for (const b of list) this.add(prepBox(b)); }
  addCircles(list) { for (const c of list) this.add({ type: 'circle', kind: 'tree', soft: 0.2, ...c }); }

  // the car's footprint as an oriented box, shrunk slightly so paint scrapes are not crashes
  carBox(veh, out = {}) {
    const d = veh.spec.dims, ax = veh.axes[0], az = veh.axes[2];
    const lx = Math.hypot(ax.x, ax.z) || 1, lz = Math.hypot(az.x, az.z) || 1;
    // model origin sits cg below and behind; the box centre is the wheelbase centre
    const c = veh.modelPosition(_p);
    out.x = c.x + (az.x / lz) * (d.zc ?? 0); out.z = c.z + (az.z / lz) * (d.zc ?? 0);
    out.ux = ax.x / lx; out.uz = ax.z / lx; out.vx = az.x / lz; out.vz = az.z / lz;
    out.hx = d.wid * 0.47; out.hz = d.len * 0.48;
    out.y0 = c.y + 0.1; out.y1 = c.y + d.hgt;
    out.y = c.y + Math.min(0.55, d.hgt * 0.45);
    return out;
  }

  // resolve one car against static geometry; call a few times per frame (see Vehicle.onSubstep)
  resolveStatic(veh) {
    const A = this.carBox(veh, veh._box ?? (veh._box = {}));
    const ex = Math.abs(A.ux) * A.hx + Math.abs(A.vx) * A.hz, ez = Math.abs(A.uz) * A.hx + Math.abs(A.vz) * A.hz;
    const s = ++this.stamp;
    let any = false;
    for (let i = Math.floor((A.x - ex) / CELL); i <= Math.floor((A.x + ex) / CELL); i++) {
      for (let j = Math.floor((A.z - ez) / CELL); j <= Math.floor((A.z + ez) / CELL); j++) {
        const l = this.grid.get(this.key(i, j));
        if (!l) continue;
        for (const c of l) {
          if (c._s === s || c.dead) continue;
          c._s = s;
          if (c.y1 < A.y0 || c.y0 > A.y1) continue;
          const h = c.type === 'circle' ? satBoxCircle(A, c, this.hit) : satBoxBox(A, c, this.hit);
          if (!h) continue;
          this.respond(veh, null, h, A.y, c);
          any = true;
          // move the box with the correction so later contacts see the new position
          A.x += h.nx * h.depth; A.z += h.nz * h.depth;
        }
      }
    }
    return any;
  }

  // car-car: both move, impulses split by effective mass
  resolvePair(a, b) {
    const A = this.carBox(a, a._box ?? (a._box = {})), B = this.carBox(b, b._box ?? (b._box = {}));
    if (Math.abs(A.x - B.x) > 8 || Math.abs(A.z - B.z) > 8) return false;
    if (A.y1 < B.y0 || A.y0 > B.y1) return false;
    const h = satBoxBox(A, B, this.hit);
    if (!h) return false;
    this.respond(a, b, h, (A.y + B.y) / 2, null);
    return true;
  }

  respond(a, b, h, y, c) {
    const n = _n.set(h.nx, 0, h.nz);
    const at = _p.set(h.px, y, h.pz);
    // positional correction (split for two cars)
    const corr = Math.max(0, h.depth - 0.01);
    if (b) { a.pos.addScaledVector(n, corr * 0.5); b.pos.addScaledVector(n, -corr * 0.5); }
    else a.pos.addScaledVector(n, corr);
    const va = a.pointVelocity(at, _v);
    if (b) va.sub(b.pointVelocity(at, _v2));
    const vn = va.dot(n);
    if (vn >= 0) return;
    const e = b ? 0.15 : (c?.soft ?? 0.2);
    const k = a.invMassAt(at, n) + (b ? b.invMassAt(at, n) : 0);
    const jn = (-(1 + e) * vn) / k;
    // Coulomb friction along the tangent, capped so walls feel slippery enough to ride along
    const vt = va.addScaledVector(n, -vn);
    const vtl = vt.length();
    _j.copy(n).multiplyScalar(jn);
    if (vtl > 1e-3) {
      const t = vt.divideScalar(vtl);
      const kt = a.invMassAt(at, t) + (b ? b.invMassAt(at, t) : 0);
      const mu = b ? 0.35 : c?.kind === 'rail' || c?.kind === 'median' ? 0.12 : 0.3;
      const jt = Math.min(vtl / kt, mu * jn);
      _j.addScaledVector(t, -jt);
    }
    a.impulse(_j, at);
    if (b) { _j.negate(); b.impulse(_j, at); _j.negate(); }
    const sp = -vn;
    if (sp > 1.2) {
      const ev = { type: 'hit', speed: sp, kind: b ? 'car' : c?.kind ?? 'wall', x: h.px, y, z: h.pz, other: b };
      a.events.push(ev);
      if (b) b.events.push({ ...ev, other: a });
      a.lastImpact = Math.max(a.lastImpact, sp);
    }
  }
}
