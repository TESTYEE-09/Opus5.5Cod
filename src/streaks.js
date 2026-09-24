import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const mat = (c, r = 0.6, m = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function add(g, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

// Team 0 flies the AH-64 Apache, team 1 the Mi-24 Hind. Returns the body group, the main
// rotor (spins about y) and the tail rotor (spins about x).
const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
const cylZ = (r1, r2, l, s = 14) => new THREE.CylinderGeometry(r1, r2, l, s).rotateX(-Math.PI / 2);
const cylX = (r, l, s = 12) => new THREE.CylinderGeometry(r, r, l, s).rotateZ(Math.PI / 2);

function rotorDisc(g, r, y, dark) {
  const blur = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
  blur.position.y = y;
  g.add(blur);
  add(g, new THREE.CylinderGeometry(0.28, 0.32, 0.35, 12), dark, 0, y - 0.05, 0);
}

function wheel(g, m, x, y, z, r = 0.24) {
  add(g, cylX(r, 0.18), m, x, y, z);
  add(g, new THREE.BoxGeometry(0.07, Math.max(0.1, -y - 0.35), 0.07), m, x, (y - 0.35) / 2, z);
}

function buildApache() {
  const body = mat(0x3f4536, 0.7, 0.25), body2 = mat(0x353a2e, 0.7, 0.25);
  const dark = mat(0x161718, 0.45, 0.6), metal = mat(0x2a2c2e, 0.35, 0.8);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a36, roughness: 0.05, metalness: 0.9 });
  const g = new THREE.Group();
  add(g, rbox(1.15, 1.35, 4.6, 0.3), body, 0, -0.05, 0.1);
  add(g, rbox(0.95, 0.95, 1.6, 0.25), body, 0, -0.2, -2.8);
  add(g, rbox(0.8, 0.62, 1.15, 0.2), glass, 0, 0.42, -2.45);
  add(g, rbox(0.86, 0.72, 1.15, 0.2), glass, 0, 0.72, -1.35);
  add(g, new THREE.SphereGeometry(0.34, 14, 10), dark, 0, -0.42, -3.75);
  add(g, rbox(0.34, 0.26, 0.34, 0.06), dark, 0, -0.86, -2.15);
  add(g, cylZ(0.05, 0.05, 1.5, 8), metal, 0, -0.92, -2.9);
  for (const s of [-1, 1]) {
    add(g, rbox(0.62, 0.62, 2.3, 0.22), body2, 0.82 * s, 0.55, 0.35);
    add(g, cylZ(0.25, 0.25, 0.05, 14), dark, 0.82 * s, 0.55, -0.82);
    add(g, cylZ(0.2, 0.26, 0.5, 12), dark, 0.9 * s, 0.6, 1.6);
    add(g, rbox(1.7, 0.1, 0.85, 0.04), body, 1.2 * s, 0.02, -0.15);
    // Hellfires outboard, a rocket pod inboard
    add(g, new THREE.BoxGeometry(0.08, 0.3, 0.3), dark, 1.75 * s, -0.15, -0.15);
    for (const [dx, dy] of [[-0.15, -0.4], [0.15, -0.4], [-0.15, -0.68], [0.15, -0.68]]) add(g, cylZ(0.08, 0.08, 1.5, 8), metal, 1.75 * s + dx, dy, -0.2);
    add(g, new THREE.BoxGeometry(0.08, 0.25, 0.3), dark, 1.05 * s, -0.12, -0.15);
    add(g, cylZ(0.24, 0.24, 1.5, 12), body2, 1.05 * s, -0.5, -0.25);
    add(g, cylZ(0.2, 0.2, 0.04, 12), dark, 1.05 * s, -0.5, -1.0);
    wheel(g, dark, 1.0 * s, -1.25, -1.35, 0.3);
  }
  add(g, cylZ(0.4, 0.22, 5.6, 12), body, 0, 0.2, 5.0);
  add(g, rbox(0.14, 1.9, 1.05, 0.05), body, 0, 1.05, 7.55).rotation.x = 0.28;
  add(g, rbox(2.3, 0.08, 0.6, 0.03), body, 0, 0.05, 7.7);
  wheel(g, dark, 0, -0.55, 7.2, 0.16);
  add(g, new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8), metal, 0, 1.0, 0);
  const dome = add(g, new THREE.SphereGeometry(0.42, 16, 10), body2, 0, 1.72, 0);
  dome.scale.set(1, 0.55, 1);
  const rotor = new THREE.Group(); rotor.position.y = 1.35; g.add(rotor);
  for (let i = 0; i < 4; i++) {
    const b = add(rotor, new THREE.BoxGeometry(7.2, 0.04, 0.42), dark, 0, 0, 0);
    b.geometry.translate(3.6, 0, 0); b.rotation.y = i * Math.PI / 2;
  }
  rotorDisc(g, 7.2, 1.33, dark);
  const tail = new THREE.Group(); tail.position.set(0.22, 1.45, 7.75); g.add(tail);
  for (const a of [0, Math.PI / 2, 0.95, 0.95 + Math.PI / 2]) add(tail, new THREE.BoxGeometry(0.04, 2.3, 0.17), dark, 0, 0, 0).rotation.x = a;
  return { g, rotor, tail };
}

function buildHind() {
  const body = mat(0x5a6342, 0.7, 0.2), tan = mat(0x8a7a55, 0.75, 0.2), belly = mat(0x8e9ca4, 0.6, 0.2);
  const dark = mat(0x161718, 0.45, 0.6), metal = mat(0x2a2c2e, 0.35, 0.8);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a36, roughness: 0.05, metalness: 0.9 });
  const g = new THREE.Group();
  add(g, rbox(1.75, 1.75, 5.6, 0.35), body, 0, -0.1, 0.4);
  add(g, rbox(1.6, 0.35, 5.2, 0.15), belly, 0, -0.95, 0.4);
  add(g, rbox(1.25, 1.1, 1.8, 0.3), body, 0, -0.35, -3.2);
  const c1 = add(g, new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, -0.05, -3.55);
  c1.scale.set(1, 1, 1.4);
  const c2 = add(g, new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.55, -2.35);
  c2.scale.set(1, 1, 1.4);
  add(g, new THREE.SphereGeometry(0.3, 12, 8), dark, 0, -1.0, -3.85);
  for (const [x, y] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) add(g, cylZ(0.03, 0.03, 1.0, 6), metal, x, -1.05 + y, -4.4);
  add(g, rbox(1.35, 0.75, 3.4, 0.25), body, 0, 1.05, 0.1);
  add(g, rbox(0.9, 0.2, 1.6, 0.08), tan, 0.2, 1.46, 0.6);
  add(g, rbox(0.8, 0.9, 1.2, 0.1), tan, -0.5, 0.2, 1.6);
  for (const s of [-1, 1]) {
    add(g, cylZ(0.26, 0.26, 0.5, 12), dark, 0.45 * s, 1.1, -1.75);
    add(g, cylX(0.2, 0.45, 10), dark, 0.9 * s, 1.1, 1.3);
    const w = add(g, rbox(2.4, 0.12, 1.2, 0.05), body, 2.0 * s, -0.25, 0.7);
    w.rotation.z = -0.2 * s;
    for (const x of [1.5, 2.5]) {
      add(g, new THREE.BoxGeometry(0.08, 0.3, 0.3), dark, x * s, -0.45 - (x - 0.8) * 0.2, 0.7);
      add(g, cylZ(0.26, 0.26, 1.6, 12), body, x * s, -0.75 - (x - 0.8) * 0.2, 0.6);
      add(g, cylZ(0.22, 0.22, 0.04, 12), dark, x * s, -0.75 - (x - 0.8) * 0.2, -0.22);
    }
    add(g, cylZ(0.07, 0.07, 1.4, 8), metal, 3.25 * s, -0.55, 0.6);
    wheel(g, dark, 1.0 * s, -1.4, 1.2, 0.3);
  }
  wheel(g, dark, 0, -1.2, -2.6, 0.22);
  add(g, cylZ(0.5, 0.25, 6.6, 12), body, 0, 0.35, 6.0);
  add(g, rbox(0.16, 1.8, 1.15, 0.05), body, 0, 1.15, 9.05).rotation.x = 0.3;
  add(g, rbox(2.2, 0.08, 0.6, 0.03), body, 0, 0.35, 8.1);
  add(g, new THREE.CylinderGeometry(0.12, 0.14, 0.4, 8), metal, 0, 1.6, 0);
  const rotor = new THREE.Group(); rotor.position.y = 1.78; g.add(rotor);
  for (let i = 0; i < 5; i++) {
    const b = add(rotor, new THREE.BoxGeometry(8.6, 0.05, 0.5), dark, 0, 0, 0);
    b.geometry.translate(4.3, 0, 0); b.rotation.y = i * Math.PI * 2 / 5;
  }
  rotorDisc(g, 8.6, 1.76, dark);
  const tail = new THREE.Group(); tail.position.set(-0.3, 1.45, 9.1); g.add(tail);
  for (let i = 0; i < 3; i++) add(tail, new THREE.BoxGeometry(0.04, 3.2, 0.2), dark, 0, 0, 0).rotation.x = i * Math.PI / 3;
  return { g, rotor, tail };
}

export function buildChopper(team) {
  return team ? buildHind() : buildApache();
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
