// What you look at while you are dead: the corpse drop, then your killer's fight
// (the killcam), and a free camera you can cycle through your surviving team.
// Nothing is recorded - the host already streams every soldier's transform, so the
// camera just follows a live soldier.
import * as THREE from 'three';
import { raycastWorld, pointSolid } from './world.js';

const DROP = 0.9;      // seconds of the falling-over shot before the camera cuts away
const BLEND = 0.35;    // seconds to ease into a new subject
const DIST = 3.2, HIGH = 0.5, SIDE = 0.55;

const _e = new THREE.Vector3(), _c = new THREE.Vector3(), _want = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _back = new THREE.Vector3(), _look = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Spectator {
  constructor() { this.reset(); }

  reset() {
    this.t = 0;
    this.subject = null;
    this.killer = null;
    this.manual = false;
    this.pos = new THREE.Vector3();
    this.have = false;
    this.yaw = 0;
    this.pitch = 0;
  }

  // Called the moment the local player dies (or at the match's final kill).
  begin(deathPos, yaw, killer) {
    this.reset();
    this.killer = killer || null;
    this.subject = killer && killer.alive ? killer : null;
    this.deathPos = deathPos.clone();
    this.yaw = yaw;
  }

  get watching() { return this.subject; }
  get phase() { return this.t < DROP ? 'drop' : this.subject ? (this.subject === this.killer ? 'killcam' : 'spectate') : 'drop'; }

  // Everyone the local player may watch: whoever is left on their side.
  candidates(game) {
    const pl = game.player;
    return game.soldiers.filter(s => s !== pl && s.alive && s.team === pl.team);
  }

  cycle(game, dir = 1) {
    const list = this.candidates(game);
    if (!list.length) return;
    const i = list.indexOf(this.subject);
    this.subject = list[(((i < 0 ? 0 : i + dir) % list.length) + list.length) % list.length];
    this.manual = true;
    this.have = false;
  }

  // Keeps a valid subject: the killer while they live, otherwise anyone left.
  retarget(game) {
    if (this.subject && this.subject.alive) return;
    if (!this.manual && this.killer && this.killer.alive) { this.subject = this.killer; return; }
    const list = this.candidates(game);
    this.subject = list[0] || null;
    this.have = false;
  }

  update(dt, game, cam) {
    this.t += dt;
    if (this.t >= DROP) this.retarget(game);

    if (this.t < DROP || !this.subject) {
      // the drop: sink to the ground and turn toward whoever did it
      const k = Math.min(1, this.t / 0.6);
      cam.position.set(this.deathPos.x, this.deathPos.y + 1.6 - 1.2 * k, this.deathPos.z);
      const look = this.killer && this.killer.alive ? this.killer : null;
      if (look) {
        _e.subVectors(look.aimPoint(_c, false), cam.position);
        this.yaw = wrap(this.yaw + wrap(Math.atan2(-_e.x, -_e.z) - this.yaw) * Math.min(1, dt * 3));
        cam.rotation.set(Math.atan2(_e.y, Math.hypot(_e.x, _e.z)) * 0.8, this.yaw, 0.35 * k);
      } else cam.rotation.set(-0.3 * k, this.yaw, 0.35 * k);
      this.have = false;
      return;
    }

    // over the subject's shoulder, pulled in so the camera never sits inside a wall
    const s = this.subject;
    s.aimPoint(_e, true);
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw), pitch = s.pitch || 0;
    const fx = -sy * Math.cos(pitch), fz = -cy * Math.cos(pitch), fy = Math.sin(pitch);
    _want.set(_e.x - fx * DIST + cy * SIDE, _e.y - fy * DIST + HIGH, _e.z - fz * DIST - sy * SIDE);
    _back.subVectors(_want, _e);
    const len = _back.length();
    if (len > 0.01) {
      const hit = raycastWorld(_e, _back.divideScalar(len), len);
      if (hit) _want.copy(_e).addScaledVector(_back, Math.max(0.6, hit.t - 0.25));
    }
    if (!this.have) { this.pos.copy(_want); this.have = true; }
    else this.pos.lerp(_want, 1 - Math.exp(-dt / BLEND * 3));

    // the ray misses corners, and easing between two clear points can cut through one,
    // so walk the smoothed position back toward the subject until it is in open air
    for (let i = 0; i < 14 && pointSolid(this.pos.x, this.pos.y, this.pos.z); i++) this.pos.lerp(_e, 0.2);
    cam.position.copy(this.pos);
    _look.copy(_e).addScaledVector(_fwd.set(fx, fy, fz).normalize(), 12);
    _e.subVectors(_look, cam.position);
    cam.rotation.set(Math.atan2(_e.y, Math.hypot(_e.x, _e.z)), Math.atan2(-_e.x, -_e.z), 0);
    this.yaw = cam.rotation.y;
  }
}
