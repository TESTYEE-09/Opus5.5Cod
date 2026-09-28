// Chase, bumper, hood, cockpit and far chase cameras. The chase camera trails the car on a
// damped spring, looks a little ahead into turns, widens its field of view with speed, shakes
// gently at high speed and on landings, and never dips under the ground.
import * as THREE from 'three';

const V = () => new THREE.Vector3();
export const VIEWS = ['chase', 'far', 'hood', 'bumper', 'cockpit'];

export class CarCamera {
  constructor(camera, world) {
    this.cam = camera; this.world = world;
    this.view = 'chase';
    this.pos = V(); this.look = V(); this.vel = V();
    this.yaw = 0; this.pitch = 0.12; this.orbit = 0; this.orbitTimer = 0;
    this.fov = 60; this.shake = 0; this.inited = false;
    this._a = V(); this._b = V(); this._c = V(); this._d = V(); this._q = new THREE.Quaternion();
  }

  next() { this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length]; this.inited = false; }

  update(dt, car, look = { x: 0, y: 0 }) {
    const veh = car.veh, d = car.dims;
    const q = veh.quat;
    const fwd = this._a.set(0, 0, 1).applyQuaternion(q);
    const up = this._b.set(0, 1, 0).applyQuaternion(q);
    const speed = veh.speed;
    const origin = veh.modelPosition(this._c);
    // look-behind / free look from the right stick or mouse
    this.orbit += (look.x - this.orbit) * Math.min(1, dt * 8);
    let fov = 58 + Math.min(18, speed * 0.2);
    if (this.view === 'chase' || this.view === 'far') {
      const far = this.view === 'far';
      const dist = (far ? 8.2 : 5.9) + d.len * 0.35 + Math.min(1.6, speed * 0.012);
      const height = (far ? 2.9 : 1.75) + d.hgt * 0.35;
      // heading follows the velocity when sliding so drifts stay framed
      const vflat = this._d.set(veh.vel.x, 0, veh.vel.z);
      let heading = Math.atan2(fwd.x, fwd.z);
      if (vflat.length() > 6 && veh.fwdSpeed > 0) {
        const vh = Math.atan2(vflat.x, vflat.z);
        let dh = vh - heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        heading += dh * 0.55;
      }
      if (veh.fwdSpeed < -2) heading += 0; // reversing: keep behind
      heading += this.orbit * Math.PI;
      let dy = heading - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * (this.inited ? 3.2 : 1000));
      const tx = origin.x - Math.sin(this.yaw) * dist, tz = origin.z - Math.cos(this.yaw) * dist;
      let ty = origin.y + height;
      const g = this.world.ground(tx, tz, ty + 5);
      ty = Math.max(ty, g.h + 0.9);
      const target = this._a.set(tx, ty, tz);
      if (!this.inited) { this.pos.copy(target); this.inited = true; }
      // spring: stiff sideways, softer along the direction of travel so speed shows
      this.pos.lerp(target, Math.min(1, dt * 7.5));
      this.pos.y += (ty - this.pos.y) * Math.min(1, dt * 6);
      const la = this._b.set(origin.x + Math.sin(this.yaw) * 3, origin.y + d.hgt * 0.62, origin.z + Math.cos(this.yaw) * 3);
      this.look.lerp(la, this.inited ? Math.min(1, dt * 12) : 1);
      this.cam.position.copy(this.pos);
      this.cam.up.set(0, 1, 0);
      this.cam.lookAt(this.look);
    } else {
      // attached views
      const off = this.view === 'hood' ? [0, d.hgt * 0.78 + 0.1, d.len * 0.08] : this.view === 'bumper' ? [0, 0.55, d.len * 0.5 + 0.1] : [(car.entry.def.interior?.rhd ? -1 : 1) * 0.36, d.hgt * 0.78, -0.2];
      const p = this._a.set(off[0], off[1], off[2]).applyQuaternion(q).add(origin);
      this.cam.position.copy(p);
      const la = this._b.set(Math.sin(this.orbit * Math.PI) * 10, off[1] - 0.2, Math.cos(this.orbit * Math.PI) * 10 + off[2]).applyQuaternion(q).add(origin);
      this.cam.up.copy(up);
      this.cam.lookAt(la);
      if (this.view === 'cockpit') fov = 70;
    }
    // shake with speed and bumps
    this.shake = Math.max(this.shake * Math.exp(-dt * 5), Math.min(1, veh.lastImpact * 0.08) * (this.shakeScale ?? 1));
    veh.lastImpact *= Math.exp(-dt * 10);
    const sh = (Math.max(0, speed - 45) * 0.0012 + this.shake * 0.05) * (this.shakeScale ?? 1);
    if (sh > 0) {
      const t = performance.now() / 1000;
      this.cam.rotateX(Math.sin(t * 37) * sh * 0.3); this.cam.rotateY(Math.sin(t * 29 + 1) * sh * 0.3);
    }
    fov += this.fovOffset ?? 0;
    this.fov += (fov - this.fov) * Math.min(1, dt * 2.5);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
