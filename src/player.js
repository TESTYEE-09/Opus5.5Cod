import { setSleeves } from './weapons.js';
import * as THREE from 'three';
import { moveBody, overlaps, raycastWorld, groundAt, baseFloor, STEP } from './world.js';

const DEG = Math.PI / 180;
const STAND_H = 1.75, CROUCH_H = 1.15, PRONE_H = 0.7, STAND_EYE = 1.62, CROUCH_EYE = 1.02, PRONE_EYE = 0.4;
const _e = new THREE.Vector3(), _r = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.isPlayer = true;
    this.team = 0;
    this.name = 'You';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.body = { pos: this.pos, vel: this.vel, r: 0.35, h: STAND_H, onGround: false };
    this.yaw = 0; this.pitch = 0;
    this.alive = false;
    this.vehicle = null; this.inVehicle = false;
    this.lean = 0; this.leanOff = 0; this.prone = false; this.proneAmt = 0;
    this.vcool = { drone: 0, recon: 0, tank: 0, jet: 0, heli: 0 };
    this.damagers = new Map();
    this.resetStats();
  }

  resetStats() {
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0;
    this.streak = 0; this.bestStreak = 0; this.rewards = [];
    this.firedT = -99;
  }

  spawn(p, yaw, cls) {
    this.pos.set(p.x, baseFloor(p.x, p.z), p.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = 100; this.alive = true;
    this.lastHurt = -99;
    this.crouched = false; this.crouchAmt = 0;
    this.prone = false; this.proneAmt = 0; this.lean = 0; this.leanOff = 0;
    this.vehicle = null; this.inVehicle = false;
    this.slideT = 0; this.sprinting = false; this.sprintOut = 0;
    this.mantle = null; this.tacT = 0; this.tacCd = 0; this.lastShift = -9;
    this.recoilDebt = 0; this.lastShot = -99; this.punch = 0;
    this.bobPhase = 0; this.stepDist = 0; this.landDip = 0; this.hSpeed = 0;
    this.scopeSwayX = this.scopeSwayY = 0;
    this.protect = 1.5; this.spawnT = this.game.time;
    this.streak = 0;
    this.damagers.clear();
    this.body.onGround = true;
    this.body.h = STAND_H;
    setSleeves(this.game.mode?.lookFor?.(this) ?? this.team);
    this.game.arsenal.equip(cls);
  }

  get eyeHeight() {
    const e = STAND_EYE + (CROUCH_EYE - STAND_EYE) * this.crouchAmt;
    return e + (PRONE_EYE - e) * this.proneAmt;
  }

  aimPoint(out, head) {
    if (this.proneAmt > 0.5) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      return head ? out.set(this.pos.x + fx * 0.75, this.pos.y + 0.32, this.pos.z + fz * 0.75) : out.set(this.pos.x, this.pos.y + 0.25, this.pos.z);
    }
    const lo = this.leanOff * (head ? 1 : 0.55);
    return out.set(this.pos.x + Math.cos(this.yaw) * lo, this.pos.y + (head ? this.eyeHeight : 1.25 - 0.4 * this.crouchAmt), this.pos.z - Math.sin(this.yaw) * lo);
  }

  // riding or flying a vehicle: only health and spawn protection tick
  idle(dt) {
    const g = this.game;
    if (this.protect > 0) this.protect -= dt;
    this.vel.set(0, 0, 0);
    this.sprinting = false; this.lean = 0; this.leanOff = 0;
    if (g.time - this.lastHurt > 4 && this.health < 100) this.health = Math.min(100, this.health + 40 * dt);
  }

  addRecoil(v, h) {
    this.pitch = Math.min(1.5, this.pitch + v * DEG);
    this.yaw += h * DEG;
    this.recoilDebt += v * DEG;
    this.punch += v * DEG * 0.4;
    this.lastShot = this.game.time;
  }

  breakSprint() { this.sprinting = false; this.sprintOut = 0.12; }

  canStand(h = STAND_H) { return !overlaps(this.pos.x, this.pos.z, this.body.r, this.pos.y + STEP, this.pos.y + h); }

  // A ledge 0.7-2.05 m up, straight ahead, with room to stand on top: climb onto it.
  tryMantle() {
    const p = this.pos, fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const top = groundAt(p.x + fx * 0.75, p.z + fz * 0.75, 0.25, p.y + 2.1);
    const rise = top - p.y;
    if (rise < 0.7 || rise > 2.05) return false;
    if (overlaps(p.x, p.z, 0.3, p.y + STAND_H - 0.05, top + STAND_H)) return false;
    for (const d of [0.95, 0.75, 1.2]) {
      const x = p.x + fx * d, z = p.z + fz * d;
      if (Math.abs(groundAt(x, z, 0.3, top + 0.1) - top) > 0.05) continue;
      if (overlaps(x, z, 0.35, top + 0.05, top + CROUCH_H)) continue;
      const low = overlaps(x, z, 0.35, top + 0.05, top + STAND_H);
      this.mantle = { t: 0, dur: 0.3 + rise * 0.12, x0: p.x, y0: p.y, z0: p.z, x1: x, y1: top, z1: z };
      if (low) this.crouched = true;
      this.vel.set(0, 0, 0);
      this.sprinting = false; this.slideT = 0;
      this.game.audio.land();
      return true;
    }
    return false;
  }

  update(dt, inp) {
    const g = this.game, ars = g.arsenal;
    if (this.protect > 0) this.protect -= dt;

    // look
    const fovScale = g.camera.fov / g.settings.fov;
    const sens = g.settings.sens * 0.0022 * (ars.ads > 0.5 ? fovScale * 1.05 : 1);
    this.yaw -= inp.dx * sens;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - inp.dy * sens));

    // recoil recovery: pull back ~60% of climb once the trigger is released
    if (g.time - this.lastShot > 0.1 && this.recoilDebt > 0) {
      const r = this.recoilDebt * Math.min(1, dt * 7);
      this.pitch -= r * 0.6; this.recoilDebt -= r;
    }
    this.punch *= Math.exp(-dt * 12);

    // climbing a ledge: the move plays out on its own
    if (this.mantle) {
      const m = this.mantle;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur), up = Math.min(1, k / 0.6), fw = Math.max(0, (k - 0.35) / 0.65);
      const e = (t) => t * t * (3 - 2 * t);
      this.pos.set(m.x0 + (m.x1 - m.x0) * e(fw), m.y0 + (m.y1 - m.y0) * e(up), m.z0 + (m.z1 - m.z0) * e(fw));
      this.vel.set(0, 0, 0);
      this.landDip = Math.sin(k * Math.PI) * 0.08;
      if (k >= 1) { this.mantle = null; this.body.onGround = true; }
      this.hSpeed = 0;
      return;
    }

    // tactical sprint: double-tap Shift for a few seconds of a faster run
    if (inp.sprintPressed) {
      if (this.game.time - this.lastShift < 0.32 && this.tacCd <= 0) { this.tacT = 3.2; this.tacCd = 8; }
      this.lastShift = this.game.time;
    }
    if (this.tacCd > 0 && this.tacT <= 0) this.tacCd -= dt;

    // prone: Ctrl or Z. Crouch or jump gets back up
    if (this.sprintOut > 0) this.sprintOut -= dt;
    if (inp.pronePressed) {
      if (this.prone) { if (this.canStand(CROUCH_H)) { this.prone = false; this.crouched = true; } }
      else if (this.body.onGround) {
        if (this.sprinting && this.hSpeed > 5) { this.vel.x *= 1.25; this.vel.z *= 1.25; this.vel.y = 2.5; this.body.onGround = false; g.audio.land(); }
        this.prone = true; this.slideT = 0; this.crouched = false;
      }
      inp.crouchPressed = false;
    }
    if (this.prone && (inp.crouchPressed || inp.jumpPressed)) {
      const h = inp.jumpPressed ? STAND_H : CROUCH_H;
      if (this.canStand(h)) { this.prone = false; this.crouched = !inp.jumpPressed; }
      inp.crouchPressed = inp.jumpPressed = false;
    }
    this.proneAmt += ((this.prone ? 1 : 0) - this.proneAmt) * Math.min(1, dt * 6);
    // crouch / slide
    if (inp.crouchPressed) {
      if (this.sprinting && this.body.onGround && this.hSpeed > 5) {
        this.slideT = 0.8; this.crouched = true;
        const f = 9.5;
        this.vel.x = -Math.sin(this.yaw) * f; this.vel.z = -Math.cos(this.yaw) * f;
        g.audio.slide();
      } else if (this.crouched) { if (this.canStand()) this.crouched = false; }
      else this.crouched = true;
    }
    const fwdIn = inp.forward - inp.back;
    if (fwdIn > 0 && !this.prone && ((inp.jumpPressed && this.body.onGround) || (!this.body.onGround && this.body.hitWall && inp.jump)) && this.tryMantle()) return;
    if (inp.jumpPressed) {
      if (this.slideT > 0 && this.canStand()) { this.slideT = 0; this.crouched = false; this.vel.y = 5.2; this.body.onGround = false; }
      else if (this.crouched) { if (this.canStand()) this.crouched = false; }
      else if (this.body.onGround) { this.vel.y = 5.6; this.body.onGround = false; }
    }
    this.crouchAmt += ((this.crouched ? 1 : 0) - this.crouchAmt) * Math.min(1, dt * 12);
    const hc = STAND_H + (CROUCH_H - STAND_H) * this.crouchAmt;
    this.body.h = hc + (PRONE_H - hc) * this.proneAmt;

    // move
    const f = inp.forward - inp.back, s = inp.right - inp.left;
    const sy = Math.sin(this.yaw), cyw = Math.cos(this.yaw);
    let wx = -sy * f + cyw * s, wz = -cyw * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const def = ars.w.def;
    this.sprinting = inp.sprint && f > 0 && !this.crouched && !this.prone && ars.ads < 0.3 && !ars.cook && this.sprintOut <= 0 && !(ars.w.def.scope && ars.ads > 0);
    if (!this.sprinting) this.tacT = 0;
    else if (this.tacT > 0) this.tacT -= dt;
    let speed = this.sprinting ? (this.tacT > 0 ? 8.7 : 7.2) : this.prone ? 1.15 : this.crouched ? 2.6 : 4.8;
    speed *= def.speed * (1 - 0.45 * ars.adsEase());

    // lean around corners with Q / E; the head stops short of walls
    const leanWant = this.sprinting || this.proneAmt > 0.3 ? 0 : (inp.leanR ? 1 : 0) - (inp.leanL ? 1 : 0);
    this.lean += (leanWant - this.lean) * Math.min(1, dt * 9);
    let off = this.lean * 0.5;
    if (Math.abs(off) > 0.01) {
      const sgn = Math.sign(off);
      _e.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
      _r.set(Math.cos(this.yaw) * sgn, 0, -Math.sin(this.yaw) * sgn);
      const h = raycastWorld(_e, _r, Math.abs(off) + 0.25);
      if (h) off = sgn * Math.max(0, h.t - 0.25);
      speed *= 1 - 0.3 * Math.abs(this.lean);
    }
    this.leanOff = off;

    if (this.slideT > 0) {
      this.slideT -= dt;
      const k = Math.max(0, 1 - dt * 1.4);
      this.vel.x *= k; this.vel.z *= k;
      if (this.slideT <= 0 && inp.sprint && this.canStand()) this.crouched = false;
    } else {
      const k = 1 - Math.exp(-(this.body.onGround ? 12 : 2) * dt);
      this.vel.x += (wx * speed - this.vel.x) * k;
      this.vel.z += (wz * speed - this.vel.z) * k;
    }

    const landed = moveBody(this.body, dt);
    if (landed > 4) {
      this.landDip = Math.min(0.14, landed * 0.014);
      g.audio.land();
    }
    this.landDip *= Math.exp(-dt * 8);

    this.hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.body.onGround && this.hSpeed > 1 && this.slideT <= 0) {
      this.stepDist += this.hSpeed * dt;
      this.bobPhase += this.hSpeed * dt * (this.sprinting ? 2.4 : 2.8);
      const stride = this.sprinting ? 2.6 : 2.1;
      if (this.stepDist > stride) { this.stepDist = 0; g.audio.step(null, this.prone ? 0.05 : this.crouched ? 0.08 : 0.18); }
    }

    // health regen
    if (g.time - this.lastHurt > 4 && this.health < 100) this.health = Math.min(100, this.health + 40 * dt);
  }

  updateCamera(cam, shake) {
    const tilt = (this.slideT > 0 ? 0.06 : 0) - this.lean * 0.2;
    const lo = this.leanOff;
    cam.position.set(this.pos.x + Math.cos(this.yaw) * lo, this.pos.y + this.eyeHeight - this.landDip * 0.5 - Math.abs(lo) * 0.08, this.pos.z - Math.sin(this.yaw) * lo);
    cam.rotation.set(
      this.pitch + this.punch + this.scopeSwayY + (Math.random() - 0.5) * shake,
      this.yaw + this.scopeSwayX + (Math.random() - 0.5) * shake,
      tilt + (Math.random() - 0.5) * shake * 0.5,
    );
  }
}
