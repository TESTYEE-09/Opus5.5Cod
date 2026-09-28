// Drivatars: the same vehicle physics as the player, driven by a pure-pursuit steering
// controller along the race route and a speed controller that follows the route's braking
// profile. Each driver has a skill level, a preferred line offset, overtakes by moving
// across, and recovers itself when stuck. Mild catch-up keeps the pack in the fight.
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const NAMES = ['KAZU', 'MIKA', 'RYO', 'HANA', 'TAKUMI', 'YUKI', 'SORA', 'KEN', 'AOI', 'REN', 'NAOMI', 'JIN'];

export class Driver {
  constructor(car, route, profile, { skill = 0.95, offset = 0, name = NAMES[0], closed = false } = {}) {
    this.car = car; this.route = route; this.prof = profile;
    this.skill = skill; this.offset = offset; this.name = name; this.closed = closed;
    this.idx = 0; this.lap = 0; this.dist = 0; this.stuck = 0; this.finished = false;
    this.side = 0; this.laneT = 0;
  }

  // progress along the route in metres (laps included)
  progress() { return this.lap * this.prof.length + this.dist; }

  locate(x, z) {
    const p = this.route, n = p.length;
    let best = this.idx, bd = Infinity;
    for (let k = -10; k <= 60; k++) {
      let i = this.idx + k;
      if (this.closed) i = (i + n) % n; else if (i < 0 || i >= n) continue;
      const d = (p[i][0] - x) ** 2 + (p[i][1] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (this.closed && best < this.idx - n / 2) this.lap++;
    this.idx = best;
    this.dist = this.prof.cum[best];
    return Math.sqrt(bd);
  }

  // look up the route point `ahead` metres past index i, with the lateral offset applied
  point(i, ahead, out, off = this.offset + this.side) {
    const p = this.route, n = p.length, cum = this.prof.cum;
    let j = i, d = 0;
    while (d < ahead) {
      const jn = this.closed ? (j + 1) % n : Math.min(n - 1, j + 1);
      if (jn === j) break;
      d += Math.abs(cum[jn] - cum[j]) || Math.hypot(p[jn][0] - p[j][0], p[jn][1] - p[j][1]);
      j = jn;
    }
    const a = p[Math.max(0, j - 1)], b = p[Math.min(n - 1, j + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    // + offset = left of travel: left of +z heading is +x -> left = (tz, -tx)
    out.set(p[j][0] + tz * off, 0, p[j][1] - tx * off);
    out.j = j;
    return out;
  }

  update(dt, others, playerCar, catchup = 0) {
    const veh = this.car.veh, inp = veh.input;
    const mp = veh.modelPosition(_p);
    const err = this.locate(mp.x, mp.z);
    const v = veh.speed;
    // overtaking: if someone is close ahead on our line, move over for a while
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.side *= 0.98;
      const fwd = veh.axes[2];
      for (const o of [...others, playerCar]) {
        if (!o || o === this.car) continue;
        const op = o.veh.modelPosition(_q);
        const dx = op.x - mp.x, dz = op.z - mp.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const lat = dx * veh.axes[0].x + dz * veh.axes[0].z;
        if (ahead > 2 && ahead < 18 && Math.abs(lat) < 2.2 && o.veh.speed < v + 2) {
          this.side = lat > 0 ? -2.4 : 2.4;
          this.laneT = 2.5;
          break;
        }
      }
    }
    // steering: pure pursuit on a look-ahead point that grows with speed
    const Ld = clamp(7 + v * 0.55, 8, 45);
    const tgt = this.point(this.idx, Ld, _t);
    const dx = tgt.x - mp.x, dz = tgt.z - mp.z;
    const fwd = veh.axes[2], left = veh.axes[0];
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const lx = (dx * left.x + dz * left.z) / fl, lz = (dx * fwd.x + dz * fwd.z) / fl;
    const alpha = Math.atan2(lx, Math.max(0.1, lz));
    const wb = veh.spec.dims.wb;
    const want = Math.atan((2 * wb * Math.sin(alpha)) / Ld);
    const P = veh.spec.phys;
    const full = P.steer ?? 0.62;
    const useful = (wb * 12) / (v * v + 1) + (P.anglePeak ?? 0.14) * 1.45;
    const lock = Math.min(full, Math.max(0.16, useful));
    inp.steer = clamp(want / lock, -1, 1);
    inp.steerRate = 1.6;
    // speed: follow the profile a little ahead (braking distance) scaled by skill
    const look = clamp(v * 0.35, 3, 40);
    const j = this.point(this.idx, look, _t).j;
    let vt = Math.min(this.prof.vs[j], this.prof.vs[this.idx] + 6) * this.skill * (1 + catchup);
    if (Math.abs(veh.driftAngle) > 0.3) vt *= 0.85;
    if (err > 12) vt = Math.min(vt, 12);
    const dv = vt - v;
    if (dv < -1.2) { inp.throttle = 0; inp.brake = clamp(-dv / 6, 0.2, 1); }
    else { inp.brake = 0; inp.throttle = clamp(dv / 3 + 0.35, 0, 1); }
    inp.handbrake = 0;
    // stuck or lost: put back on the route
    if (v < 1.5 && !this.finished) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 3.5 || err > 40 || mp.y < -5) {
      const p = this.point(this.idx, 5, _t, this.offset);
      const nx = this.point(this.idx, 9, new THREE.Vector3(), this.offset);
      const g = veh.world.ground(p.x, p.z, 1e4);
      veh.reset(new THREE.Vector3(p.x, g.h + 0.4, p.z), Math.atan2(nx.x - p.x, nx.z - p.z));
      this.stuck = 0;
    }
  }
}
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _t = new THREE.Vector3();
export { NAMES };
