import * as THREE from 'three';
import { lineOfSight, SIZE } from './world.js';

const mat = (c, r = 0.6, m = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function add(g, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

export function buildChopper(team) {
  const body = mat(team ? 0x2b2d2a : 0x4a5238);
  const dark = mat(0x151617, 0.4, 0.6);
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.9 });
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(1.7, 1.6, 4.2), body, 0, 0, 0);
  add(g, new THREE.BoxGeometry(1.3, 1.0, 1.4), glass, 0, 0.1, -2.5);
  add(g, new THREE.BoxGeometry(0.5, 0.5, 5), body, 0, 0.3, 4.4);
  add(g, new THREE.BoxGeometry(0.15, 1.4, 0.9), body, 0, 0.9, 6.7);
  add(g, new THREE.BoxGeometry(2.6, 0.12, 0.6), body, 0, 0.3, 6.4);
  add(g, new THREE.BoxGeometry(3.2, 0.25, 0.7), dark, 0, -0.3, -0.2);
  add(g, new THREE.BoxGeometry(0.12, 0.12, 3.6), dark, 0.9, -1.1, 0);
  add(g, new THREE.BoxGeometry(0.12, 0.12, 3.6), dark, -0.9, -1.1, 0);
  add(g, new THREE.BoxGeometry(0.3, 0.3, 1.2), dark, 0, -0.95, -2.6);
  const rotor = new THREE.Group(); rotor.position.y = 1.05; g.add(rotor);
  add(rotor, new THREE.BoxGeometry(12, 0.05, 0.35), dark, 0, 0, 0);
  add(rotor, new THREE.BoxGeometry(0.35, 0.05, 12), dark, 0, 0, 0);
  add(rotor, new THREE.CylinderGeometry(0.25, 0.25, 0.4, 8), dark, 0, -0.2, 0);
  const tail = new THREE.Group(); tail.position.set(0.15, 0.9, 6.9); g.add(tail);
  add(tail, new THREE.BoxGeometry(0.05, 2.2, 0.2), dark, 0, 0, 0);
  return { g, rotor, tail };
}

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();

export function chopperHit(pos, o, d, maxT) {
  _v.subVectors(o, pos);
  const b = _v.dot(d), c = _v.lengthSq() - 2.3 * 2.3;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < maxT ? { t, zone: 'body' } : null;
}

export class Chopper {
  constructor(game, owner, id) {
    this.game = game;
    this.id = id;
    this.owner = owner;
    this.team = owner.team;
    this.name = 'Attack Chopper';
    this.isVehicle = true;
    this.alive = true;
    this.health = 1400;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.m = buildChopper(this.team);
    game.scene.add(this.m.g);
    this.t = 0; this.life = 45;
    this.angle = this.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    this.start = new THREE.Vector3(SIZE / 2, 35, this.team === 0 ? -60 : SIZE + 60);
    this.pos.copy(this.start);
    this.fireT = 0; this.burst = 0; this.scanT = 0; this.target = null;
    this.heading = this.team === 0 ? Math.PI : 0;
    this.sound = game.audio.rotor();
  }

  aimPoint(out) { return out.copy(this.pos); }

  hit(o, d, maxT) { return chopperHit(this.pos, o, d, maxT); }

  applyDamage(amount, attacker) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) this.destroy(attacker);
  }

  destroy(attacker) {
    this.alive = false;
    const g = this.game;
    g.explodeFx(this.pos, 1.6);
    g.scene.remove(this.m.g);
    this.sound.stop();
    if (attacker && !attacker.isVehicle) {
      attacker.score += 150;
      g.popupFor(attacker, [['Chopper destroyed', 150]]);
    }
    g.announce(this.team, 'Attack Chopper destroyed', 'Enemy Attack Chopper destroyed');
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.angle += dt * 0.28;
    const r = 24;
    _t.set(SIZE / 2 + Math.cos(this.angle) * r, 24 + Math.sin(this.t * 0.5) * 1.5, SIZE / 2 + Math.sin(this.angle) * r);
    if (this.t > this.life) _t.set(this.pos.x + (this.pos.x - SIZE / 2) * 3, 60, this.pos.z + (this.pos.z - SIZE / 2) * 3);
    const k = Math.min(1, dt * (this.t < 5 ? 0.9 : 1.6));
    this.vel.subVectors(_t, this.pos).multiplyScalar(k / Math.max(dt, 1e-4));
    this.pos.lerp(_t, k);

    // turn toward the target when shooting, otherwise along the flight path
    let want;
    if (this.target && this.target.alive) want = Math.atan2(-(this.target.pos.x - this.pos.x), -(this.target.pos.z - this.pos.z));
    else want = Math.atan2(-this.vel.x, -this.vel.z);
    let d = want - this.heading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    this.heading += d * Math.min(1, dt * 2);
    const m = this.m;
    m.g.position.copy(this.pos);
    m.g.rotation.set(-0.08, this.heading, Math.max(-0.3, Math.min(0.3, -d * 0.4)), 'YXZ');
    m.rotor.rotation.y += dt * 28;
    m.tail.rotation.x += dt * 35;
    this.sound.set(this.pos);

    if (this.t > this.life + 6) {
      this.alive = false;
      g.scene.remove(m.g);
      this.sound.stop();
      return;
    }
    if (this.t < 5 || this.t > this.life) return;

    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      this.target = null;
      let best = 75;
      const gun = _v.set(this.pos.x, this.pos.y - 1.2, this.pos.z);
      for (const s of g.soldiers) {
        if (!s.alive || s.team === this.team) continue;
        const p = s.aimPoint(_t, false);
        const dist = p.distanceTo(gun);
        if (dist < best && lineOfSight(gun, p)) { best = dist; this.target = s; }
      }
    }
    if (this.target && this.target.alive) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        if (this.burst <= 0) { this.burst = 10; this.fireT = 0.9; }
        else {
          this.burst--;
          this.fireT = 0.085;
          const o = new THREE.Vector3(this.pos.x, this.pos.y - 1.3, this.pos.z);
          const p = this.target.aimPoint(_t, false);
          _d.set(p.x + (Math.random() - 0.5) * 2.2, p.y + (Math.random() - 0.5) * 1.5, p.z + (Math.random() - 0.5) * 2.2).sub(o).normalize();
          g.vehicleShot(this, o, _d.clone());
        }
      }
    }
  }

  remove() {
    if (this.alive) { this.game.scene.remove(this.m.g); this.sound.stop(); this.alive = false; }
  }
}

export class Jet {
  constructor(scene) {
    const g = new THREE.Group();
    const m = mat(0x6d737a, 0.5, 0.5);
    add(g, new THREE.BoxGeometry(1.3, 1.2, 10), m, 0, 0, 0);
    add(g, new THREE.ConeGeometry(0.65, 2.5, 8).rotateX(-Math.PI / 2), m, 0, 0, -6.2);
    add(g, new THREE.BoxGeometry(10, 0.18, 3), m, 0, -0.1, 0.8);
    add(g, new THREE.BoxGeometry(4, 0.12, 1.5), m, 0, 0.1, 4.4);
    add(g, new THREE.BoxGeometry(0.15, 2.2, 1.8), m, 0, 1.1, 4.3);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa050 }));
    glow.position.z = 5.1; g.add(glow);
    g.visible = false;
    scene.add(g);
    this.g = g;
    this.t = 1;
  }

  fly(point, dx, dz) {
    this.from = new THREE.Vector3(point.x - dx * 180, 42, point.z - dz * 180);
    this.to = new THREE.Vector3(point.x + dx * 180, 48, point.z + dz * 180);
    this.t = 0;
    this.g.visible = true;
    this.g.rotation.set(0, Math.atan2(-dx, -dz), 0);
  }

  update(dt) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / 2.6);
    this.g.position.lerpVectors(this.from, this.to, this.t);
    if (this.t >= 1) this.g.visible = false;
  }
}
