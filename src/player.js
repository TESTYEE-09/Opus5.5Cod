import * as THREE from 'three';
import { moveBody, overlaps, STEP } from './world.js';

const DEG = Math.PI / 180;
const STAND_H = 1.75, CROUCH_H = 1.15, STAND_EYE = 1.62, CROUCH_EYE = 1.02;

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
    this.damagers = new Map();
    this.resetStats();
  }

  resetStats() {
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0;
    this.streak = 0; this.bestStreak = 0; this.rewards = [];
    this.firedT = -99;
  }

  spawn(p, yaw, cls) {
    this.pos.set(p.x, 0, p.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = 100; this.alive = true;
    this.lastHurt = -99;
    this.crouched = false; this.crouchAmt = 0;
    this.slideT = 0; this.sprinting = false; this.sprintOut = 0;
    this.recoilDebt = 0; this.lastShot = -99; this.punch = 0;
    this.bobPhase = 0; this.stepDist = 0; this.landDip = 0; this.hSpeed = 0;
    this.scopeSwayX = this.scopeSwayY = 0;
    this.protect = 1.5;
    this.streak = 0;
    this.damagers.clear();
    this.body.onGround = true;
    this.body.h = STAND_H;
    this.game.arsenal.equip(cls);
  }

  get eyeHeight() { return STAND_EYE + (CROUCH_EYE - STAND_EYE) * this.crouchAmt; }

  aimPoint(out, head) {
    return out.set(this.pos.x, this.pos.y + (head ? this.eyeHeight : 1.25 - 0.4 * this.crouchAmt), this.pos.z);
  }

  addRecoil(v, h) {
    this.pitch = Math.min(1.5, this.pitch + v * DEG);
    this.yaw += h * DEG;
    this.recoilDebt += v * DEG;
    this.punch += v * DEG * 0.4;
    this.lastShot = this.game.time;
  }

  breakSprint() { this.sprinting = false; this.sprintOut = 0.12; }

  canStand() { return !overlaps(this.pos.x, this.pos.z, this.body.r, this.pos.y + STEP, this.pos.y + STAND_H); }

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

    // crouch / slide
    if (this.sprintOut > 0) this.sprintOut -= dt;
    if (inp.crouchPressed) {
      if (this.sprinting && this.body.onGround && this.hSpeed > 5) {
        this.slideT = 0.8; this.crouched = true;
        const f = 9.5;
        this.vel.x = -Math.sin(this.yaw) * f; this.vel.z = -Math.cos(this.yaw) * f;
        g.audio.slide();
      } else if (this.crouched) { if (this.canStand()) this.crouched = false; }
      else this.crouched = true;
    }
    if (inp.jumpPressed) {
      if (this.slideT > 0 && this.canStand()) { this.slideT = 0; this.crouched = false; this.vel.y = 5.2; this.body.onGround = false; }
      else if (this.crouched) { if (this.canStand()) this.crouched = false; }
      else if (this.body.onGround) { this.vel.y = 5.6; this.body.onGround = false; }
    }
    this.crouchAmt += ((this.crouched ? 1 : 0) - this.crouchAmt) * Math.min(1, dt * 12);
    this.body.h = STAND_H + (CROUCH_H - STAND_H) * this.crouchAmt;

    // move
    const f = inp.forward - inp.back, s = inp.right - inp.left;
    const sy = Math.sin(this.yaw), cyw = Math.cos(this.yaw);
    let wx = -sy * f + cyw * s, wz = -cyw * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const def = ars.w.def;
    this.sprinting = inp.sprint && f > 0 && !this.crouched && ars.ads < 0.3 && !ars.cook && this.sprintOut <= 0 && !(ars.w.def.scope && ars.ads > 0);
    let speed = this.sprinting ? 7.2 : this.crouched ? 2.6 : 4.8;
    speed *= def.speed * (1 - 0.45 * ars.adsEase());

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
      if (this.stepDist > stride) { this.stepDist = 0; g.audio.step(null, this.crouched ? 0.08 : 0.18); }
    }

    // health regen
    if (g.time - this.lastHurt > 4 && this.health < 100) this.health = Math.min(100, this.health + 40 * dt);
  }

  updateCamera(cam, shake) {
    const tilt = this.slideT > 0 ? 0.06 : 0;
    cam.position.set(this.pos.x, this.pos.y + this.eyeHeight - this.landDip * 0.5, this.pos.z);
    cam.rotation.set(
      this.pitch + this.punch + this.scopeSwayY + (Math.random() - 0.5) * shake,
      this.yaw + this.scopeSwayX + (Math.random() - 0.5) * shake,
      tilt + (Math.random() - 0.5) * shake * 0.5,
    );
  }
}
