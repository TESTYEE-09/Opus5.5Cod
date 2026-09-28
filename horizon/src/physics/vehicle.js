// Vehicle dynamics.
//
// One rigid body with four raycast suspension corners. Each tyre uses a combined-slip model
// (normalised slip ratio and slip angle sharing one friction ellipse, a peak and a sliding
// plateau) with load sensitivity. Wheel spin is integrated semi-implicitly against the tyre's
// secant stiffness so it stays stable at any speed. The engine drives the wheels through a
// clutch that slips below its engagement speed, a gearbox with shift times, and an open,
// limited-slip or locked differential; AWD splits torque front/rear and hybrids add an
// electric axle. Aero drag and downforce, rolling resistance, brakes with bias, ABS, traction
// and stability control and a counter-steer assist for drifting complete it.
//
// Car space: +z forward, +x left, +y up. Units SI. Designed to run at ~480 Hz substeps.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const _r = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion();
const _b1 = new THREE.Vector3(), _b2 = new THREE.Vector3(), _b3 = new THREE.Vector3(), _b4 = new THREE.Vector3(), _b5 = new THREE.Vector3(), _b6 = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const G = 9.81, RHO = 1.2;

// engine torque (Nm) at rpm from a curve of [rpm, Nm]
function torqueAt(curve, rpm) {
  if (rpm <= curve[0][0]) return curve[0][1] * clamp(rpm / curve[0][0], 0.3, 1);
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i][0]) {
      const a = curve[i - 1], b = curve[i], t = (rpm - a[0]) / (b[0] - a[0]);
      const s = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * (0.5 * t + 0.5 * s);
    }
  }
  const last = curve[curve.length - 1];
  return last[1];
}

// normalised tyre curve: rises to 1 at s = 1, falls to the sliding value by s = 3
function tyreCurve(s, slide) {
  if (s < 1) return s * (2 - s);
  const t = clamp((s - 1) / 2, 0, 1);
  return 1 - (1 - slide) * t * t * (3 - 2 * t);
}

export class Vehicle {
  constructor(spec, world) {
    this.spec = spec;
    this.world = world;
    const d = spec.dims, P = spec.phys;
    this.mass = P.mass;
    const L = d.len, W = d.wid, H = d.hgt;
    const k = P.inertia ?? 0.85;
    // principal inertia about local x (pitch), y (yaw), z (roll)
    this.Iinv = new THREE.Vector3(1 / (k * (P.mass / 12) * (H * H + L * L)), 1 / (k * (P.mass / 12) * (W * W + L * L)), 1 / (k * 0.9 * (P.mass / 12) * (W * W + H * H)));
    this.cg = new THREE.Vector3(0, P.cgH, d.wb * (P.wf - 0.5)); // CG in model space
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3();
    this.axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    // wheels: fl, fr, rl, rr
    const loadF = (P.mass * G * P.wf) / 2, loadR = (P.mass * G * (1 - P.wf)) / 2;
    const su = P.susp ?? {};
    const kF = (loadF / G) * (2 * Math.PI * (su.freqF ?? 1.9)) ** 2;
    const kR = (loadR / G) * (2 * Math.PI * (su.freqR ?? 2.1)) ** 2;
    this.wheels = [];
    const L0 = su.rest ?? 0.22;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const r = front ? d.rF : d.rR;
      const kk = front ? kF : kR, load = front ? loadF : loadR;
      const cs = load / kk; // static compression
      const mass = (front ? loadF : loadR) / G;
      this.wheels.push({
        front, left, r, k: kk, load0: load,
        c: 2 * Math.sqrt(kk * mass) * (su.damp ?? 0.32),
        L0, travel: su.travel ?? 0.1, droop: su.droop ?? 0.08,
        mount: new THREE.Vector3((left ? 1 : -1) * (front ? d.trackF : d.trackR) / 2, r + L0 - cs - P.cgH, (front ? d.wb / 2 : -d.wb / 2) - this.cg.z),
        width: front ? d.wF : d.wR,
        I: P.wheelI ?? (front ? 1.1 : 1.3) * (r / 0.34) ** 2,
        omega: 0, spin: 0, comp: cs, compPrev: cs, len: L0 - cs, contact: false,
        Fz: load, Fx: 0, Fy: 0, slipRatio: 0, slipAngle: 0, slide: 0, surface: 0, grip: 1,
        drive: 0, brakeT: 0, steer: 0,
        cp: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0), center: new THREE.Vector3(),
      });
    }
    this.arbF = (P.susp?.arbF ?? 0.5) * kF;
    this.arbR = (P.susp?.arbR ?? 0.35) * kR;
    // drivetrain
    const E = P.engine;
    this.engine = { rpm: E.idle, torque: 0, load: 0, limiter: false, boost: 0 };
    this.gear = 1; this.shiftTimer = 0; this.clutch = 1; this.nextGear = 1;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    this.assist = { abs: true, tcs: true, stm: true, steer: 1, autoGear: true, counter: 0.6 };
    this.steerAngle = 0;
    this.airTime = 0; this.onGround = false;
    this.driftAngle = 0; this.speed = 0; this.fwdSpeed = 0;
    this.reverseTimer = 0;
    this.gForce = new THREE.Vector3();
    this.events = [];
    this.lastImpact = 0;
    this.revLimitHit = 0;
  }

  // place the car with its model origin (ground level) at p, facing heading (radians, 0 = +z)
  reset(p, heading = 0) {
    this.quat.setFromAxisAngle(_v.set(0, 1, 0), heading);
    this.pos.copy(this.cg).applyQuaternion(this.quat).add(p);
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    for (const w of this.wheels) { w.omega = 0; w.comp = w.compPrev = w.load0 / w.k; w.Fx = w.Fy = 0; }
    this.engine.rpm = this.spec.phys.engine.idle;
    this.gear = 1; this.shiftTimer = 0;
    this.steerAngle = 0;
  }

  // model-space origin (ground level under the wheelbase centre) in world space
  modelPosition(out) { return out.copy(this.cg).negate().applyQuaternion(this.quat).add(this.pos); }

  get rpm() { return this.engine.rpm; }

  shift(dir) {
    const n = this.spec.phys.gears.length;
    const g = clamp(this.gear + dir, -1, n);
    if (g === this.gear || this.shiftTimer > 0) return;
    if (g === 0) { this.gear = 0; return; }
    this.nextGear = g;
    this.shiftTimer = this.spec.phys.shift ?? 0.12;
    this.events.push({ type: 'shift', up: dir > 0 });
  }

  // total ratio engine -> wheel for a gear
  ratio(g = this.gear) {
    const P = this.spec.phys;
    if (g === 0) return 0;
    if (g < 0) return -(P.reverse ?? 3) * P.final;
    return P.gears[g - 1] * P.final;
  }

  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 480)));
    const h = dt / steps;
    this.events.length = 0;
    this.controls(dt);
    for (let i = 0; i < steps; i++) this.step(h);
    // derived values for HUD, audio and skills
    const fwd = this.axes[2];
    this.speed = this.vel.length();
    this.fwdSpeed = this.vel.dot(fwd);
    const lat = this.vel.dot(this.axes[0]);
    this.driftAngle = this.speed > 5 ? Math.atan2(-lat, Math.abs(this.fwdSpeed)) : 0;
    for (const w of this.wheels) w.spin = (w.spin + w.omega * dt) % (Math.PI * 2000);
  }

  // input shaping, gear logic and assists, once per frame
  controls(dt) {
    const P = this.spec.phys, inp = this.input, A = this.assist;
    const v = this.vel.dot(this.axes[2]);
    // FH-style reverse: hold brake at a standstill
    if (this.gear > 0 && Math.abs(v) < 0.8 && inp.brake > 0.5 && inp.throttle < 0.1) {
      this.reverseTimer += dt;
      if (this.reverseTimer > 0.35 && A.autoGear) { this.gear = -1; this.reverseTimer = 0; }
    } else if (this.gear < 0 && Math.abs(v) < 0.8 && inp.throttle > 0.5 && inp.brake < 0.1) {
      this.reverseTimer += dt;
      if (this.reverseTimer > 0.2) { this.gear = 1; this.reverseTimer = 0; }
    } else this.reverseTimer = 0;
    // steering: limit lock with speed, rate-limit, add counter-steer
    const sp = Math.abs(v);
    const lock = (P.steer ?? 0.62) * (A.steer > 0 ? 1 / (1 + sp / 28) + 0.08 : 1);
    let target = inp.steer * lock;
    if (A.counter > 0 && sp > 4) {
      const lat = this.vel.dot(this.axes[0]);
      const beta = Math.atan2(lat, Math.max(sp, 1));
      target += clamp(beta * A.counter * 1.1, -lock * 0.9, lock * 0.9);
    }
    const rate = (A.steer > 0 ? 2.8 : 5) * (inp.steerRate ?? 1);
    this.steerAngle += clamp(target - this.steerAngle, -rate * dt, rate * dt);
    // auto gearbox
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) this.gear = this.nextGear;
    } else if (A.autoGear && this.gear > 0) {
      const E = P.engine;
      const up = E.shiftUp ?? E.redline * 0.96, down = E.shiftDown ?? E.redline * 0.45;
      if (this.engine.rpm > up && this.gear < P.gears.length && inp.throttle > 0.1 && this.onGround) this.shift(1);
      else if (this.gear > 1) {
        // downshift when the lower gear would still be below the shift point
        const lower = (this.engine.rpm * this.ratio(this.gear - 1)) / this.ratio(this.gear);
        if (this.engine.rpm < down && lower < up * 0.92) this.shift(-1);
        else if (inp.brake > 0.5 && lower < E.redline * 0.82 && this.engine.rpm < E.redline * 0.6) this.shift(-1);
      }
    }
  }

  step(dt) {
    const P = this.spec.phys, E = P.engine, inp = this.input, A = this.assist;
    const [ax, ay, az] = this.axes;
    ax.set(1, 0, 0).applyQuaternion(this.quat);
    ay.set(0, 1, 0).applyQuaternion(this.quat);
    az.set(0, 0, 1).applyQuaternion(this.quat);
    const force = _f.set(0, -this.mass * G, 0);
    const torque = _t.set(0, 0, 0);
    const world = this.world;
    const vFwd = this.vel.dot(az);
    const reversing = this.gear < 0;
    let throttle = reversing ? inp.brake : inp.throttle;
    let brake = reversing ? inp.throttle : inp.brake;
    if (this.gear > 0 && vFwd < -0.5) { brake = Math.max(brake, inp.throttle); throttle = inp.throttle * 0.3; }
    if (this.gear < 0 && vFwd > 0.5) { brake = Math.max(brake, inp.brake); }

    // ---- suspension and contact
    let grounded = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const mount = _r.copy(w.mount).applyQuaternion(this.quat).add(this.pos);
      // ray along -up; find the ground by a few fixed-point iterations
      const maxLen = w.L0 + w.droop + w.r;
      let t = 0;
      const g = world.ground(mount.x, mount.z, mount.y);
      if (Math.abs(ay.y) > 0.2) {
        t = (mount.y - g.h) / ay.y;
        for (let it = 0; it < 2; it++) {
          const gx = mount.x - ay.x * t, gz = mount.z - ay.z * t;
          const g2 = world.ground(gx, gz, mount.y);
          t = (mount.y - g2.h) / ay.y;
        }
      } else t = Infinity;
      const gg = world.lastGround;
      w.compPrev = w.comp;
      if (t < maxLen && t > -0.3) {
        w.contact = true; grounded++;
        const len = Math.max(t - w.r, w.L0 - w.travel);
        w.comp = w.L0 - len;
        w.len = len;
        w.n.set(gg.nx, gg.ny, gg.nz);
        w.surface = gg.surface; w.grip = gg.grip; w.bump = gg.bump ?? 0;
        w.cp.copy(ay).multiplyScalar(-t).add(mount);
        w.center.copy(ay).multiplyScalar(-len).add(mount);
      } else {
        w.contact = false;
        w.comp = -w.droop; w.len = w.L0 + w.droop;
        w.center.copy(ay).multiplyScalar(-w.len).add(mount);
      }
    }
    this.onGround = grounded > 0;
    if (grounded === 0) this.airTime += dt; else this.airTime = 0;

    // spring, damper, bump stop and anti-roll bars
    const arb = [(this.wheels[0].comp - this.wheels[1].comp) * this.arbF, (this.wheels[2].comp - this.wheels[3].comp) * this.arbR];
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.contact) { w.Fz = 0; continue; }
      const rate = (w.comp - w.compPrev) / dt;
      let F = w.k * w.comp + w.c * clamp(rate, -3, 3) * (rate > 0 ? 1 : 1.4);
      if (w.comp > w.travel * 0.85) F += (w.comp - w.travel * 0.85) * w.k * 12 + rate * w.c * 2;
      const bar = i < 2 ? arb[0] : arb[1];
      F += (i % 2 === 0 ? bar : -bar);
      w.Fz = Math.max(0, F);
      // suspension pushes along the car's up axis at the wheel
      _w.copy(ay).multiplyScalar(w.Fz);
      force.add(_w);
      _s.copy(w.cp).sub(this.pos);
      torque.add(_v.crossVectors(_s, _w));
    }

    // ---- drivetrain
    const ratio = this.ratio();
    const driven = P.drive === 'FWD' ? [0, 1] : P.drive === 'AWD' ? [0, 1, 2, 3] : [2, 3];
    let wheelOmega = 0;
    for (const i of driven) wheelOmega += this.wheels[i].omega;
    wheelOmega /= driven.length;
    if (P.drive === 'AWD') {
      // centre coupling: engine speed follows the faster-reacting rear with a bias
      const fr = (this.wheels[0].omega + this.wheels[1].omega) / 2, rr = (this.wheels[2].omega + this.wheels[3].omega) / 2;
      wheelOmega = fr * (P.awdFront ?? 0.4) + rr * (1 - (P.awdFront ?? 0.4));
    }
    const shifting = this.shiftTimer > 0;
    const idle = E.idle, redline = E.redline, limiter = E.limiter ?? redline + 150;
    const wheelRpm = Math.abs(wheelOmega * ratio) * (60 / (2 * Math.PI));
    // clutch: slips until the wheels carry the engine above its engagement speed
    const engage = idle + 700 + throttle * (E.launch ?? 2200);
    const eng = this.engine;
    let locked = this.gear !== 0 && !shifting && wheelRpm > engage * 0.85;
    let tcCut = 1;
    if (A.tcs) {
      let slip = 0;
      for (const i of driven) slip = Math.max(slip, this.wheels[i].slipRatio);
      tcCut = clamp(1 - (slip - 0.12) * 6, 0.1, 1);
    }
    if (A.stm && Math.abs(this.driftAngle) > 0.35 && vFwd > 8) tcCut *= clamp(1 - (Math.abs(this.driftAngle) - 0.35) * 2, 0.3, 1);
    let thr = throttle * tcCut;
    if (eng.rpm >= limiter) { this.revLimitHit = 0.06; }
    if (this.revLimitHit > 0) { this.revLimitHit -= dt; thr = 0; eng.limiter = true; } else eng.limiter = false;
    if (shifting) thr = 0;
    // boost builds with throttle and rpm for turbo cars
    const turbo = E.turbo ?? 0;
    if (turbo) {
      const target = thr * clamp((eng.rpm - (E.boostRpm ?? 2500)) / 2500, 0, 1);
      eng.boost += (target - eng.boost) * Math.min(1, dt * (target > eng.boost ? 2.2 : 6));
    } else eng.boost = thr;
    const tMax = torqueAt(E.curve, eng.rpm);
    const tGen = turbo ? tMax * (0.55 + 0.45 * eng.boost) : tMax;
    const engBrake = (E.brake ?? 0.12) * tMax * clamp((eng.rpm - idle) / (redline - idle), 0, 1) + 20;
    let tEng = thr * tGen - (1 - thr) * engBrake;
    eng.load = thr;
    let driveTorque = 0;
    if (locked) {
      eng.rpm = Math.max(idle * 0.9, wheelRpm);
      driveTorque = tEng * ratio * (P.eff ?? 0.9);
      this.clutch = 1;
    } else {
      // free-revving engine: rises toward the throttle's target, clutch transmits torque
      const target = this.gear === 0 || shifting ? idle + thr * (redline - idle) * 0.85 : Math.max(engage, idle);
      const revRate = (E.revRate ?? 9000) * (thr > 0.05 ? 1 : 0.6);
      eng.rpm += clamp(target - eng.rpm, -revRate * dt, revRate * dt);
      if (shifting) eng.rpm += (wheelRpm * Math.abs(this.ratio(this.nextGear) / (ratio || 1)) - eng.rpm) * Math.min(1, dt * 18);
      this.clutch = this.gear === 0 || shifting ? 0 : clamp(wheelRpm / engage, 0, 1);
      if (this.gear !== 0 && !shifting) driveTorque = Math.max(0, thr * tGen) * ratio * (P.eff ?? 0.9) * clamp(0.35 + this.clutch, 0, 1);
    }
    eng.rpm = clamp(eng.rpm, idle * 0.8, limiter + 50);
    eng.torque = tEng;
    // split to axles and wheels (limited slip by speed difference)
    const lsd = P.lsd ?? 0.3;
    const split = (T, a, b) => {
      const wa = this.wheels[a], wb = this.wheels[b];
      const bias = clamp((wa.omega - wb.omega) * lsd * 60, -Math.abs(T) * 0.45, Math.abs(T) * 0.45);
      wa.drive += T / 2 - bias; wb.drive += T / 2 + bias;
    };
    for (const w of this.wheels) w.drive = 0;
    if (P.drive === 'AWD') {
      const fF = P.awdFront ?? 0.4;
      split(driveTorque * fF, 0, 1); split(driveTorque * (1 - fF), 2, 3);
    } else split(driveTorque, driven[0], driven[1]);
    // electric axle (E-Ray, ZR1X, NSX): torque falls off with speed
    if (P.emotor) {
      const em = P.emotor, v = Math.abs(vFwd);
      const Te = thr * em.torque * clamp(em.vBase / Math.max(v, em.vBase), 0, 1) * (v > em.vMax ? 0 : 1) * (this.gear < 0 ? -1 : 1) * (this.gear === 0 ? 0 : 1);
      const [a, b] = em.axle === 'front' ? [0, 1] : [2, 3];
      this.wheels[a].drive += Te / 2; this.wheels[b].drive += Te / 2;
      this.emotorLoad = Te / em.torque;
    }
    // engine inertia reflected to each driven wheel while the clutch is closed
    const Ieng = locked ? ((E.inertia ?? 0.2) * ratio * ratio) / driven.length : 0;

    // brakes
    const B = P.brake ?? { torque: 3600, bias: 0.62 };
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      let bt = brake * B.torque * (w.front ? B.bias : 1 - B.bias);
      if (!w.front && inp.handbrake > 0) bt = Math.max(bt, inp.handbrake * B.torque * 0.8);
      if (A.abs && brake > 0.1 && w.slipRatio < -0.14 && !(inp.handbrake > 0 && !w.front)) bt *= 0.35;
      w.brakeT = bt;
    }

    // ---- tyres
    const steer = this.steerAngle;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const st = w.front ? steer : 0;
      w.steer = st;
      // wheel heading on the ground plane
      const cs = Math.cos(st), sn = Math.sin(st);
      const fwd = _v.copy(az).multiplyScalar(cs).addScaledVector(ax, sn);
      const n = w.contact ? w.n : ay;
      fwd.addScaledVector(n, -fwd.dot(n)).normalize();
      const side = _s.crossVectors(n, fwd).normalize(); // points to the car's left
      // contact point velocity
      _r.copy(w.contact ? w.cp : w.center).sub(this.pos);
      const vc = _w.crossVectors(this.angVel, _r).add(this.vel);
      const vx = vc.dot(fwd), vy = vc.dot(side);
      const I = w.I + (w.drive !== 0 || locked ? (driven.includes(i) ? Ieng : 0) : 0);
      if (!w.contact || w.Fz <= 0) {
        // free wheel: drive, brake and a little bearing drag
        let om = w.omega + ((w.drive - Math.sign(w.omega) * w.brakeT) / I) * dt;
        if (Math.sign(om) !== Math.sign(w.omega) && w.brakeT > 0) om = 0;
        w.omega = om * (1 - 0.3 * dt);
        w.Fx = w.Fy = 0; w.slipRatio = 0; w.slipAngle = 0; w.slide = 0;
        continue;
      }
      const surfGrip = w.grip;
      const mu = (P.grip ?? 1.1) * surfGrip * (1 - 0.1 * clamp(w.Fz / w.load0 - 1, -0.6, 1.5));
      const Fmax = mu * w.Fz;
      const kPeak = P.slipPeak ?? 0.1, aPeak = P.anglePeak ?? 0.14;
      const V = Math.max(Math.abs(vx), 2.5);
      // lateral slip, then the wheel speed from an implicit step against the secant stiffness
      const alpha = Math.atan2(vy, V);
      const sy = Math.tan(alpha) / Math.tan(aPeak);
      const kPrev = w.slipRatio;
      const sPrev = Math.hypot(kPrev / kPeak, sy);
      const secant = sPrev > 1e-3 ? (Fmax * tyreCurve(sPrev, P.slide ?? 0.78)) / sPrev : Fmax;
      const Cx = secant / kPeak; // N per unit slip ratio
      let brakeSign = Math.sign(w.omega) || Math.sign(vx) || 1;
      const T = w.drive;
      const a1 = (dt / I) * (Cx * w.r * w.r) / V;
      let om = (w.omega + (dt / I) * (T + (Cx * w.r * vx) / V)) / (1 + a1);
      // brake torque opposes rotation; it can stop the wheel but not reverse it
      const dB = (w.brakeT / I) * dt;
      if (Math.abs(om) <= dB) om = 0; else om -= Math.sign(om) * dB;
      if (w.brakeT > 0 && Math.abs(vx) < 0.3 && Math.abs(T) < w.brakeT) om = 0;
      w.omega = om;
      const kappa = (om * w.r - vx) / V;
      const sx = kappa / kPeak;
      const s = Math.hypot(sx, sy);
      const F = Fmax * tyreCurve(s, P.slide ?? 0.78);
      let Fx = s > 1e-6 ? (F * sx) / s : 0;
      let Fy = s > 1e-6 ? (-F * sy) / s : 0;
      // rolling resistance and surface drag (grass, gravel)
      Fx -= Math.sign(vx) * w.Fz * ((P.roll ?? 0.012) + (w.surface >= 2 ? 0.03 : 0));
      // low-speed damping so a parked car on a slope stays put
      if (Math.abs(vx) < 1 && Math.abs(T) < 1 && brake < 0.05) Fx -= vx * this.mass * 0.25;
      w.Fx = Fx; w.Fy = Fy;
      w.slipRatio = kappa; w.slipAngle = alpha; w.slide = Math.max(0, s - 1);
      const Ft = _w.copy(fwd).multiplyScalar(Fx).addScaledVector(side, Fy);
      force.add(Ft);
      _r.copy(w.cp).sub(this.pos);
      torque.add(_v.crossVectors(_r, Ft));
    }

    // ---- aero
    const A2 = P.aero ?? { cd: 0.34, area: 2.0, clF: 0.1, clR: 0.15 };
    const v2 = this.vel.lengthSq();
    if (v2 > 0.01) {
      const drag = 0.5 * RHO * A2.cd * A2.area * v2;
      force.addScaledVector(this.vel, -drag / Math.sqrt(v2));
      const vz = Math.max(0, vFwd);
      for (const [cl, zz] of [[A2.clF, this.spec.dims.wb / 2 - this.cg.z], [A2.clR, -this.spec.dims.wb / 2 - this.cg.z]]) {
        const Fd = 0.5 * RHO * cl * vz * vz;
        _w.copy(ay).multiplyScalar(-Fd);
        force.add(_w);
        _r.copy(az).multiplyScalar(zz);
        torque.add(_v.crossVectors(_r, _w));
      }
    }

    // ---- body contacts with the ground (after jumps and rolls)
    this.bodyContacts(force, torque, dt);

    // ---- integrate
    this.gForce.copy(force).divideScalar(this.mass);
    this.vel.addScaledVector(force, dt / this.mass);
    // angular: I^-1 in world space = R I^-1 R^T
    const lt = _v.copy(torque).applyQuaternion(_q.copy(this.quat).invert());
    lt.multiply(this.Iinv);
    lt.applyQuaternion(this.quat);
    this.angVel.addScaledVector(lt, dt);
    this.angVel.multiplyScalar(1 - 0.05 * dt);
    this.pos.addScaledVector(this.vel, dt);
    const wq = _q.set(this.angVel.x * dt * 0.5, this.angVel.y * dt * 0.5, this.angVel.z * dt * 0.5, 0).multiply(this.quat);
    this.quat.x += wq.x; this.quat.y += wq.y; this.quat.z += wq.z; this.quat.w += wq.w;
    this.quat.normalize();
  }

  // corners of the body that can touch the ground when the car lands hard or rolls
  bodyContacts(force, torque, dt) {
    const d = this.spec.dims;
    if (!this._pts) {
      const hw = d.wid * 0.46, hl = d.len * 0.48, top = d.hgt * 0.95, bot = 0.18;
      this._pts = [];
      for (const x of [-hw, hw]) for (const z of [-hl, -hl * 0.3, hl * 0.3, hl]) for (const y of [bot, top]) this._pts.push(new THREE.Vector3(x, y, z).sub(this.cg));
    }
    for (const p of this._pts) {
      const wp = _b1.copy(p).applyQuaternion(this.quat).add(this.pos);
      const g = this.world.ground(wp.x, wp.z, wp.y + 0.5);
      const pen = g.h - wp.y;
      if (pen <= 0) continue;
      const n = _b2.set(g.nx, g.ny, g.nz);
      const arm = _b3.copy(wp).sub(this.pos);
      const vp = _b4.crossVectors(this.angVel, arm).add(this.vel);
      const vn = vp.dot(n);
      // spring-damper normal force plus friction
      const Fn = Math.max(0, pen * this.mass * 400 - vn * this.mass * 25);
      const F = _b5.copy(n).multiplyScalar(Fn);
      const vt = vp.addScaledVector(n, -vn);
      const vtl = vt.length();
      if (vtl > 0.01) F.addScaledVector(vt, (-Math.min(Fn * 0.6, vtl * this.mass * 10)) / vtl);
      force.add(F);
      torque.add(_b6.crossVectors(arm, F));
      if (-vn > 3) this.lastImpact = Math.max(this.lastImpact, -vn);
    }
  }

  // apply an impulse (world) at a world point, for collisions
  impulse(j, at) {
    this.vel.addScaledVector(j, 1 / this.mass);
    _r.copy(at).sub(this.pos);
    const tq = _v.crossVectors(_r, j).applyQuaternion(_q.copy(this.quat).invert()).multiply(this.Iinv).applyQuaternion(this.quat);
    this.angVel.add(tq);
  }

  // inverse effective mass along n at a world point
  invMassAt(at, n) {
    _r.copy(at).sub(this.pos);
    const rn = _v.crossVectors(_r, n);
    const l = rn.clone().applyQuaternion(_q.copy(this.quat).invert()).multiply(this.Iinv).applyQuaternion(this.quat);
    return 1 / this.mass + l.cross(_r).dot(n);
  }

  pointVelocity(at, out) {
    _r.copy(at).sub(this.pos);
    return out.crossVectors(this.angVel, _r).add(this.vel);
  }
}
