import * as THREE from 'three';

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
