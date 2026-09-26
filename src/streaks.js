import * as THREE from 'three';
import { buildApacheModel, buildHindModel, buildAircraft } from './aircraft.js';

// Team 0 flies the AH-64 Apache, team 1 the Mi-24 Hind (models in aircraft.js). Returns the
// body group, the main rotor (spins about y) and the tail rotor (spins about x).

export function buildChopper(team) {
  return team ? buildHindModel() : buildApacheModel();
}

const _v = new THREE.Vector3();

export function chopperHit(pos, o, d, maxT) {
  _v.subVectors(o, pos);
  const b = _v.dot(d), c = _v.lengthSq() - 2.3 * 2.3;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < maxT ? { t, zone: 'body' } : null;
}

// The airstrike killstreak's flyover.
export class Jet {
  constructor(scene) {
    // the airstrike is flown by a real F-16 model now
    const g = buildAircraft('f16', true).g;
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
