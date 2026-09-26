// Detailed static props (vehicles, trees, lamps, cranes...). Every part is baked into a
// handful of merged meshes with vertex colours, so a whole map of props costs a few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry } from './textures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

const G = {};
const cached = (key, make) => (G[key] ||= make());
export const box = (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const rbox = (w, h, d, r = 0.06) => cached(`r${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)));
export const cyl = (rt, rb, h, seg = 12, open = false, t0 = 0, tl = Math.PI * 2) => cached(`c${rt},${rb},${h},${seg},${open},${t0},${tl}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, t0, tl));
export const cone = (r, h, seg = 8) => cached(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
export const ico = (r, d = 0) => cached(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));
export const sph = (r, ws = 10, hs = 8) => cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const torus = (r, t, arc = Math.PI * 2) => cached(`t${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 6, 14, arc));
export const halfDisc = (r) => cached(`h${r}`, () => new THREE.CircleGeometry(r, 20, 0, Math.PI));

export class Kit {
  constructor() { this.buckets = {}; this.stack = [new THREE.Matrix4()]; this.lights = []; }
  get top() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(s, s, s));
    this.stack.push(this.top.clone().multiply(_m));
    return this;
  }
  pop() { this.stack.pop(); return this; }
  // color: hex, or [hex, intensity] for glowing parts
  part(geo, kind, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    g.applyMatrix4(_m.premultiply(this.top));
    const [hex, k] = Array.isArray(color) ? color : [color, 1];
    _c.set(hex).multiplyScalar(k);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (this.buckets[kind] ||= []).push(g);
  }
  // world position of a local point under the current transform
  at(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.top); }
  build(materials) {
    const out = [];
    for (const [kind, geos] of Object.entries(this.buckets)) {
      if (!geos.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geos), materials[kind]);
      mesh.castShadow = kind !== 'glow' && kind !== 'far';
      mesh.receiveShadow = kind !== 'glow';
      out.push(mesh);
      for (const g of geos) g.dispose();
    }
    return out;
  }
}

export function kitMaterials(enhance) {
  const std = (o) => enhance(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }), { macro: 0.12 });
  return {
    paint: std({ roughness: 0.55, metalness: 0.1 }),
    metal: std({ roughness: 0.38, metalness: 0.75 }),
    rough: std({ roughness: 0.95, metalness: 0 }),
    facet: std({ roughness: 0.9, metalness: 0, flatShading: true }),
    fabric: std({ roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.6 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    far: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  };
}

// ---------- prop recipes (local space: y up, -z is "front") ----------
const CAR_COLORS = [0x8c2a22, 0x2a4c6e, 0xb8b2a4, 0x3b4a33, 0xc49a3a, 0x505358, 0x1f2326, 0x7a6a55];

export const PROPS = {
  car(k, o, R) {
    const L = o.len || 4.5, W = o.wid || 2, burnt = o.burnt;
    const paint = burnt ? 0x2d2723 : o.color ?? CAR_COLORS[Math.floor(R() * CAR_COLORS.length)];
    const pk = burnt ? 'rough' : 'paint';
    k.part(rbox(W, 0.7, L, 0.14), pk, paint, 0, 0.66, 0);
    k.part(rbox(W * 0.86, 0.62, L * 0.5, 0.16), pk, paint, 0, 1.3, L * 0.04);
    if (burnt) k.part(box(W * 0.88, 0.4, L * 0.44), 'rough', 0x0c0b0a, 0, 1.32, L * 0.04);
    else {
      k.part(box(W * 0.875, 0.4, L * 0.44), 'glass', 0x16202a, 0, 1.33, L * 0.04);
      k.part(box(W * 0.8, 0.4, L * 0.515), 'glass', 0x16202a, 0, 1.33, L * 0.04);
      for (const s of [-1, 1]) {
        k.part(box(0.24, 0.1, 0.05), 'glow', [0xfff1d0, 1.2], s * W * 0.32, 0.74, -L / 2 - 0.01);
        k.part(box(0.26, 0.1, 0.05), 'glow', [0xff2a1a, 1.4], s * W * 0.34, 0.8, L / 2 + 0.01);
        k.part(box(0.05, 0.08, 0.22), 'metal', 0x202224, s * (W * 0.44 + 0.04), 1.1, -L * 0.18);
      }
      k.part(box(W * 0.5, 0.12, 0.04), 'metal', 0x303234, 0, 0.62, -L / 2 - 0.02);
    }
    for (const z of [-1, 1]) k.part(box(W * 1.02, 0.18, 0.2), 'metal', burnt ? 0x221f1c : 0x2a2b2d, 0, 0.42, z * (L / 2 - 0.02));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.13), z = sz * L * 0.31;
      k.part(cyl(0.36, 0.36, 0.26, 16), 'rough', 0x141414, x, 0.36, z, 0, 0, Math.PI / 2);
      k.part(cyl(0.2, 0.2, 0.28, 12), 'metal', burnt ? 0x3a2a22 : 0x8a8c8e, x, 0.36, z, 0, 0, Math.PI / 2);
    }
  },
  bus(k, o) {
    const L = o.len || 9, W = o.wid || 3, body = o.burnt ? 0x6b5230 : 0xc9a13a;
    k.part(rbox(W, 2.2, L, 0.2), o.burnt ? 'rough' : 'paint', body, 0, 1.55, 0);
    k.part(box(W + 0.02, 0.85, L * 0.86), o.burnt ? 'rough' : 'glass', o.burnt ? 0x100e0c : 0x18212a, 0, 2.05, 0.2);
    k.part(box(W * 0.9, 0.9, 0.05), 'glass', 0x18212a, 0, 2.0, -L / 2 - 0.01);
    k.part(box(W + 0.03, 0.18, L * 0.98), 'paint', 0x2a2926, 0, 1.2, 0);
    k.part(box(W * 0.96, 0.25, L * 0.96), 'paint', o.burnt ? 0x3a2e22 : 0xd8d2c0, 0, 2.72, 0);
    for (const sx of [-1, 1]) for (const z of [-L * 0.33, L * 0.3]) {
      k.part(cyl(0.5, 0.5, 0.35, 16), 'rough', 0x121212, sx * (W / 2 - 0.15), 0.5, z, 0, 0, Math.PI / 2);
      k.part(cyl(0.26, 0.26, 0.37, 10), 'metal', 0x6a6c6e, sx * (W / 2 - 0.15), 0.5, z, 0, 0, Math.PI / 2);
    }
  },
  truck(k, o) {
    const olive = 0x4a5234;
    k.part(rbox(2.3, 1.6, 2.2, 0.12), 'paint', olive, 0, 1.55, -2.1);
    k.part(box(2.1, 0.6, 0.06), 'glass', 0x18212a, 0, 1.95, -3.21);
    k.part(box(2.2, 0.25, 6), 'metal', 0x222320, 0, 0.8, 0);
    k.part(box(2.4, 0.6, 3.8), 'paint', olive, 0, 1.25, 1);
    k.part(cyl(1.2, 1.2, 3.8, 14, false, 0, Math.PI), 'fabric', 0x5b5a42, 0, 1.6, 1, Math.PI / 2, 0, Math.PI / 2, 1, 1, 0.9);
    k.part(box(2.4, 1.1, 3.8), 'fabric', 0x5b5a42, 0, 2.05, 1);
    for (const sx of [-1, 1]) for (const z of [-2.1, 0.4, 1.8]) {
      k.part(cyl(0.5, 0.5, 0.4, 16), 'rough', 0x141414, sx * 1.05, 0.5, z, 0, 0, Math.PI / 2);
      k.part(cyl(0.25, 0.25, 0.42, 10), 'metal', 0x3a3d30, sx * 1.05, 0.5, z, 0, 0, Math.PI / 2);
    }
    for (const s of [-1, 1]) k.part(box(0.22, 0.14, 0.05), 'glow', [0xfff1d0, 0.8], s * 0.8, 1.05, -3.22);
  },
  forklift(k) {
    k.part(rbox(1.3, 1.1, 2.2, 0.1), 'paint', 0xd8a020, 0, 0.85, 0.2);
    k.part(box(1.2, 0.8, 0.6), 'paint', 0x2a2a2a, 0, 1.2, 1.05);
    for (const x of [-0.6, 0.6]) {
      k.part(box(0.06, 1.2, 0.06), 'metal', 0x222222, x, 2.0, -0.3);
      k.part(box(0.06, 1.2, 0.06), 'metal', 0x222222, x, 2.0, 0.9);
      k.part(box(0.12, 2.6, 0.12), 'metal', 0x303030, x * 0.8, 1.4, -0.95);
      k.part(box(0.12, 0.06, 1.1), 'metal', 0x303030, x * 0.5, 0.12, -1.5);
    }
    k.part(box(1.3, 0.06, 1.3), 'metal', 0x222222, 0, 2.6, 0.3);
    for (const sx of [-1, 1]) for (const z of [-0.5, 0.9]) k.part(cyl(0.3, 0.3, 0.25, 12), 'rough', 0x151515, sx * 0.62, 0.3, z, 0, 0, Math.PI / 2);
  },
  palm(k, o, R) {
    const h = o.h || 6 + R() * 2.5;
    let x = 0, y = 0, a = R() * 6.28, lean = 0.12 + R() * 0.1;
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const l = h / segs, t = i / segs;
      const nx = x + Math.cos(a) * l * lean * (0.4 + t), ny = y + l;
      k.part(cyl(0.16 - t * 0.05, 0.19 - t * 0.05, l * 1.05, 7), 'rough', i % 2 ? 0x6b5a44 : 0x5e4f3c, (x + nx) / 2, (y + ny) / 2, 0, 0, 0, -Math.cos(a) * lean * 0.9);
      x = nx; y = ny;
    }
    k.push(x, y, 0);
    for (let f = 0; f < 9; f++) {
      const yaw = f / 9 * 6.28 + R() * 0.3, droop = 0.2 + R() * 0.3;
      const green = R() < 0.25 ? 0x8a8a4a : 0x4f6b2c;
      k.push(0, 0, 0, yaw);
      for (let s = 0; s < 4; s++) {
        const pitch = droop + s * 0.28;
        k.part(box(0.55 - s * 0.1, 0.03, 0.9), 'fabric', green, 0, -Math.sin(pitch) * 0.45 - s * s * 0.1, -0.4 - s * 0.8, -pitch, 0, 0);
      }
      k.pop();
    }
    for (let c = 0; c < 3; c++) k.part(sph(0.12, 6, 5), 'rough', 0x4a3a20, Math.cos(c * 2) * 0.2, -0.15, Math.sin(c * 2) * 0.2);
    k.pop();
  },
  olive(k, o, R) {
    const s = o.s || 0.9 + R() * 0.5;
    k.push(0, 0, 0, R() * 6, 0, 0, s);
    k.part(cyl(0.14, 0.24, 2.2, 7), 'rough', 0x5a4a3a, 0, 1.1, 0, 0, 0, 0.1);
    k.part(cyl(0.08, 0.13, 1.6, 6), 'rough', 0x5a4a3a, 0.35, 2.3, 0, 0, 0, -0.5);
    k.part(cyl(0.08, 0.12, 1.5, 6), 'rough', 0x5a4a3a, -0.25, 2.3, 0.2, 0.3, 0, 0.45);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * 6.28, r = i ? 1 + R() * 0.3 : 0;
      k.part(ico(0.9 + R() * 0.4, 1), 'facet', i % 2 ? 0x5a6a34 : 0x4a5a2c, Math.cos(a) * r, 3 + R() * 0.8 + (i ? 0 : 0.5), Math.sin(a) * r, 0, 0, 0, 1, 0.75, 1);
    }
    k.pop();
  },
  pine(k, o, R) {
    const h = o.h || 7 + R() * 5, snow = o.snow;
    k.push(0, 0, 0, R() * 6);
    k.part(cyl(0.14, 0.26, h * 0.4, 7), 'rough', 0x3e2e22, 0, h * 0.2, 0);
    const levels = 5;
    for (let i = 0; i < levels; i++) {
      const t = i / levels, r = (1 - t * 0.8) * h * 0.24, ch = h * 0.3;
      const y = h * 0.22 + t * h * 0.66;
      k.part(cone(r, ch, 8), 'facet', i % 2 ? 0x2c4630 : 0x27402c, 0, y + ch / 2, 0, 0, i * 0.4, 0);
      if (snow) k.part(cone(r * 0.82, ch * 0.5, 8), 'facet', 0xe8eef5, 0, y + ch * 0.62, 0, 0, i * 0.4 + 0.2, 0);
    }
    k.pop();
  },
  lamp(k, o) {
    const h = o.h || 6, glow = o.glow || [0xffe2b0, 3];
    k.part(cyl(0.08, 0.12, h, 8), 'metal', 0x2e3033, 0, h / 2, 0);
    k.part(cyl(0.2, 0.25, 0.4, 8), 'metal', 0x2e3033, 0, 0.2, 0);
    k.part(box(0.08, 0.08, 1.6), 'metal', 0x2e3033, 0, h - 0.05, -0.75);
    k.part(rbox(0.36, 0.16, 0.7, 0.05), 'metal', 0x3a3c3f, 0, h - 0.1, -1.5);
    k.part(box(0.26, 0.03, 0.56), 'glow', glow, 0, h - 0.19, -1.5);
  },
  flood(k, o) {
    const h = o.h || 7;
    k.part(cyl(0.1, 0.14, h, 8), 'metal', 0x3a3c3a, 0, h / 2, 0);
    for (const x of [-0.5, 0.5]) {
      k.part(rbox(0.5, 0.4, 0.3, 0.05), 'metal', 0x2a2c2a, x, h, -0.15, -0.35, 0, 0);
      k.part(box(0.4, 0.3, 0.03), 'glow', [0xf0f4ff, 3], x, h - 0.05, -0.32, -0.35, 0, 0);
    }
    k.part(box(1.4, 0.08, 0.08), 'metal', 0x2a2c2a, 0, h - 0.25, 0);
  },
  // a national flag on a mast: 'us' or 'ru'
  flag(k, o) {
    const h = o.h || 9, W = 2.4, H = 1.3, x0 = 0.1;
    k.part(cyl(0.06, 0.08, h, 8), 'metal', 0xb8bcbe, 0, h / 2, 0);
    k.part(sph(0.1, 8, 6), 'metal', 0xc8a040, 0, h + 0.05, 0);
    const y0 = h - 0.2 - H;
    if (o.nation === 'ru') {
      [0xf2f2f0, 0x1c3f9a, 0xd0281e].forEach((c, i) => k.part(box(W, H / 3, 0.03), 'fabric', c, x0 + W / 2, y0 + H - (i + 0.5) * H / 3, 0));
    } else {
      for (let i = 0; i < 7; i++) k.part(box(W, H / 7, 0.03), 'fabric', i % 2 ? 0xf2f2f0 : 0xb8222a, x0 + W / 2, y0 + H - (i + 0.5) * H / 7, 0);
      k.part(box(W * 0.42, H * 4 / 7, 0.035), 'fabric', 0x23305e, x0 + W * 0.21, y0 + H - H * 2 / 7, 0);
    }
  },
  pole(k, o) {
    const h = o.h || 8;
    k.part(cyl(0.12, 0.16, h, 8), 'rough', 0x5a4632, 0, h / 2, 0);
    k.part(box(2.2, 0.12, 0.12), 'rough', 0x4a3a2a, 0, h - 0.4, 0);
    for (const x of [-0.9, 0, 0.9]) k.part(cyl(0.05, 0.06, 0.18, 6), 'paint', 0xcfd6d0, x, h - 0.25, 0);
    k.part(cyl(0.3, 0.3, 0.8, 10), 'paint', 0x6e7274, 0.3, h - 1.4, 0.15);
  },
  // o.x2/o.z2 are the far end relative to the start; hung from h
  wire(k, o) {
    const dx = o.dx, dz = o.dz, len = Math.hypot(dx, dz), h = o.h || 7.75;
    const px = -dz / len, pz = dx / len;
    for (const off of [-0.9, 0, 0.9]) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        pts.push(new THREE.Vector3(dx * t + px * off, h - Math.sin(Math.PI * t) * len * 0.03, dz * t + pz * off));
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a);
        const l = d.length();
        const yaw = Math.atan2(d.x, d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        k.part(box(0.025, 0.025, l), 'rough', 0x151515, mid.x, mid.y, mid.z, -pitch, yaw, 0);
      }
    }
  },
  barrel(k, o, R) {
    const cols = o.colors || [0x2b4a7a, 0x7a2b22, 0x5a5a3a, 0x6b4a2a];
    const col = cols[Math.floor(R() * cols.length)];
    k.part(cyl(0.3, 0.3, 0.9, 14), 'paint', col, 0, 0.45, 0);
    for (const y of [0.3, 0.6]) k.part(cyl(0.312, 0.312, 0.04, 14), 'metal', 0x3a3a3a, 0, y, 0);
    k.part(cyl(0.27, 0.27, 0.02, 14), 'metal', 0x2a2a2a, 0, 0.905, 0);
    k.part(cyl(0.04, 0.04, 0.03, 6), 'metal', 0x444444, 0.15, 0.92, 0);
  },
  tires(k, o, R) {
    const n = o.n || 3;
    for (let i = 0; i < n; i++) k.part(torus(0.34, 0.14), 'rough', 0x161616, R() * 0.1, 0.14 + i * 0.27, R() * 0.1, Math.PI / 2, 0, 0);
  },
  ac(k) {
    k.part(rbox(0.9, 0.6, 0.4, 0.04), 'paint', 0xb9b6ae, 0, 0, 0);
    k.part(cyl(0.22, 0.22, 0.02, 14), 'metal', 0x2a2a2a, 0.15, 0, -0.21, Math.PI / 2, 0, 0);
    k.part(box(0.9, 0.04, 0.5), 'paint', 0x9a978f, 0, -0.33, 0.05);
  },
  awning(k, o) {
    const w = o.w || 2.4, d = o.d || 1.2, cols = o.colors || [0xb03a2e, 0xe6ddc8];
    const n = 8;
    for (let i = 0; i < n; i++) k.part(box(w / n, 0.03, d), 'fabric', cols[i % 2], -w / 2 + (i + 0.5) * w / n, 0, -d / 2, 0.35, 0, 0);
    for (const x of [-w / 2, w / 2]) k.part(box(0.03, 0.03, d * 1.05), 'metal', 0x2a2a2a, x, -0.05, -d / 2, 0.35, 0, 0);
  },
  dish(k) {
    k.part(cyl(0.04, 0.04, 0.6, 6), 'metal', 0x555555, 0, 0.3, 0);
    k.part(sph(0.45, 14, 6), 'paint', 0xdedbd4, 0, 0.7, 0, -1.9, 0, 0, 1, 0.25, 1);
  },
  rubble(k, o, R) {
    const cols = o.colors || [0x8a8274, 0x9e9483, 0x6e675c, 0xa05a3c];
    for (let i = 0; i < (o.n || 14); i++) {
      const r = 0.12 + R() * 0.35, a = R() * 6.28, d = R() * (o.r || 1.4);
      k.part(ico(r, 0), 'facet', cols[Math.floor(R() * cols.length)], Math.cos(a) * d, r * 0.4, Math.sin(a) * d, R() * 3, R() * 3, 0, 1, 0.6, 1);
    }
  },
  rock(k, o, R) {
    const r = o.r || 1.5;
    k.part(ico(r, 1), 'facet', o.color || 0x6e6a64, 0, r * 0.45, 0, R(), R() * 6, 0, 1.1, 0.7, 0.95);
    k.part(ico(r * 0.6, 0), 'facet', o.color || 0x7a756e, r * 0.7, r * 0.25, r * 0.3, R(), R() * 6, 0, 1, 0.7, 1);
    if (o.snow) k.part(ico(r * 0.92, 1), 'facet', 0xe9eef4, 0, r * 0.62, 0, R(), R() * 6, 0, 1.05, 0.35, 0.9);
  },
  bollard(k) {
    k.part(cyl(0.18, 0.22, 0.6, 10), 'metal', 0x2a2b2c, 0, 0.3, 0);
    k.part(cyl(0.3, 0.2, 0.15, 10), 'metal', 0x2a2b2c, 0, 0.62, 0);
  },
  jersey(k, o) {
    const l = o.len || 3;
    k.part(box(0.62, 0.3, l), 'rough', 0xa8a39a, 0, 0.15, 0);
    k.part(box(0.4, 0.3, l), 'rough', 0xaba69d, 0, 0.45, 0);
    k.part(box(0.24, 0.3, l), 'rough', 0xb0aba2, 0, 0.75, 0);
    for (let z = -l / 2 + 0.4; z < l / 2; z += 1) k.part(box(0.63, 0.12, 0.3), 'paint', 0xd0a030, 0, 0.6, z);
  },
  reel(k) {
    for (const x of [-0.45, 0.45]) k.part(cyl(0.8, 0.8, 0.08, 16), 'rough', 0x7a5a3a, x, 0.8, 0, 0, 0, Math.PI / 2);
    k.part(cyl(0.4, 0.4, 0.84, 12), 'rough', 0x151515, 0, 0.8, 0, 0, 0, Math.PI / 2);
  },
  tank(k, o) {
    const r = o.r || 1.8, h = o.h || 5;
    k.part(cyl(r, r, h, 24), 'paint', o.color || 0xd8d6d0, 0, h / 2, 0);
    k.part(sph(r, 24, 8), 'paint', o.color || 0xd8d6d0, 0, h, 0, 0, 0, 0, 1, 0.25, 1);
    for (const y of [0.2, h * 0.5, h - 0.2]) k.part(cyl(r + 0.03, r + 0.03, 0.1, 24), 'metal', 0x6a6a6a, 0, y, 0);
    k.part(box(0.05, h + 0.6, 0.05), 'metal', 0x444444, r + 0.12, h / 2 + 0.3, -0.2);
    k.part(box(0.05, h + 0.6, 0.05), 'metal', 0x444444, r + 0.12, h / 2 + 0.3, 0.2);
    for (let y = 0.3; y < h; y += 0.4) k.part(box(0.05, 0.04, 0.4), 'metal', 0x444444, r + 0.12, y, 0);
    k.part(box(1.6, 0.25, 0.04), 'paint', 0xb8322a, 0, h * 0.72, -r - 0.01);
  },
  quonset(k, o) {
    const w = o.w, l = o.l, r = w / 2, col = o.color || 0x6a6e62;
    k.part(cyl(r, r, l, 20, true, -Math.PI / 2, Math.PI), 'metal', col, 0, 0, 0, -Math.PI / 2, 0, 0, 1, 1, 0.7);
    for (let z = -l / 2; z <= l / 2 + 0.01; z += l / 8) k.part(torus(r + 0.02, 0.03, Math.PI), 'metal', 0x4a4e44, 0, 0, z, 0, 0, 0, 1, 0.7, 1);
    for (const z of [-l / 2, l / 2]) k.part(halfDisc(r), 'paint', 0x55594e, 0, 0, z, 0, z > 0 ? 0 : Math.PI, 0, 1, 0.7, 1);
    if (o.snow) k.part(cyl(r + 0.03, r + 0.03, l, 20, true, -Math.PI / 4, Math.PI / 2), 'rough', 0xe9eef4, 0, 0, 0, -Math.PI / 2, 0, 0, 1, 1, 0.72);
  },
  towerRoof(k, o) {
    const w = o.w || 4.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.part(box(0.12, 2.2, 0.12), 'rough', 0x4a3a2a, sx * (w / 2 - 0.1), 1.1, sz * (w / 2 - 0.1));
    k.part(cone(w * 0.78, 1.1, 4), 'metal', 0x4c5048, 0, 2.7, 0, 0, Math.PI / 4, 0);
    if (o.snow) k.part(cone(w * 0.72, 0.9, 4), 'rough', 0xe9eef4, 0, 2.86, 0, 0, Math.PI / 4, 0);
  },
  antenna(k, o) {
    const h = o.h || 14;
    for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [0, 0.25]]) k.part(cyl(0.03, 0.05, h, 5), 'metal', 0x9a9c9e, x * (1 - 0.3), h / 2, z * (1 - 0.3));
    for (let y = 0.8; y < h; y += 0.9) k.part(torus(0.24, 0.015), 'metal', 0x9a9c9e, 0, y, 0, Math.PI / 2, 0, 0);
    k.part(sph(0.08, 6, 4), 'glow', [0xff2010, 4], 0, h + 0.1, 0);
    k.part(sph(0.5, 12, 5), 'paint', 0xdedbd4, 0.3, h * 0.7, 0, 0, 0, 1.4, 1, 0.25, 1);
    k.part(rbox(1.2, 1, 0.8, 0.05), 'paint', 0x4a5234, 0, 0.5, 1.2);
  },
  // Rail-mounted gantry crane spanning the harbour centre; legs sit at (±6, ±5) around the origin.
  crane(k) {
    const Y = 0x3f6f96, D = 0x2a2a2a, W = 0xd8d6d0;
    for (const sx of [-6, 6]) for (const sz of [-5, 5]) {
      k.part(box(1, 14, 1), 'paint', Y, sx, 7, sz);
      k.part(box(1.6, 0.6, 1.6), 'metal', D, sx, 0.3, sz);
      k.part(box(0.3, 0.15, 1.8), 'glow', [0xffc040, 1.2], sx, 0.62, sz);
    }
    // X-braced side frames between each pair of legs
    const len = Math.hypot(10, 3), ang = Math.atan2(3, 10);
    for (const sx of [-6, 6]) for (let y0 = 2.5; y0 < 12; y0 += 3) {
      k.part(box(0.28, 0.28, 10), 'paint', Y, sx, y0, 0);
      for (const s of [-1, 1]) k.part(box(0.18, 0.18, len), 'paint', Y, sx, y0 + 1.5, 0, s * ang, 0, 0);
    }
    for (const sz of [-5, 5]) k.part(box(22, 1.4, 1.2), 'paint', Y, 3, 14.5, sz);
    for (const sx of [-6, 6]) k.part(box(1.2, 1.4, 11), 'paint', Y, sx, 14.5, 0);
    k.part(box(22, 0.3, 0.3), 'paint', Y, 3, 15.6, 0);
    k.part(rbox(3, 2.2, 3, 0.1), 'paint', W, 2, 13, 0);
    k.part(box(2.6, 1, 0.05), 'glass', 0x18212a, 2, 13, -1.52);
    k.part(box(2.6, 0.6, 2.6), 'metal', 0x303030, 2, 15.4, 0);
    for (let i = 0; i < 4; i++) k.part(cyl(0.03, 0.03, 6, 4), 'metal', D, 1.5 + (i % 2), 9.5, (i < 2 ? -0.5 : 0.5));
    k.part(box(2.6, 0.4, 6.4), 'paint', 0xd8a020, 2, 6.3, 0);
    k.part(box(0.4, 0.3, 0.4), 'glow', [0xff3010, 5], 14, 15.4, 0);
    k.part(box(0.4, 0.3, 0.4), 'glow', [0xff3010, 5], -8, 15.4, 0);
  },
  ship(k, o, R) {
    const L = 70, W = 14;
    k.part(box(W, 8, L), 'far', 0x1d2a33, 0, 1, 0);
    k.part(box(W * 0.98, 1.2, L * 0.98), 'far', 0x7a2a22, 0, -2.2, 0);
    k.part(box(W + 0.1, 0.3, L + 0.1), 'far', 0xd8d4c8, 0, 5, 0);
    k.part(box(W * 0.9, 9, 9), 'far', 0xe6e2d6, 0, 9.5, L / 2 - 8);
    k.part(box(W * 0.94, 1.2, 10), 'far', 0xc8c4b8, 0, 14.4, L / 2 - 8);
    k.part(cyl(1.2, 1.2, 5, 10), 'far', 0x2a2a2a, 0, 16, L / 2 - 5);
    for (let r = 0; r < 4; r++) k.part(box(W * 0.9, 0.3, 1.5), 'glow', [0xfff0c0, 1.5], 0, 7.8 + r * 2, L / 2 - 12.6);
    const cols = [0x7b3325, 0x2d5870, 0x3b6a3a, 0xb08a2a, 0x6a6e70, 0x8a4a2a];
    for (let z = -L / 2 + 5; z < L / 2 - 16; z += 6.4) for (let x = -W / 2 + 1.5; x < W / 2 - 1; x += 2.5) {
      const n = 1 + Math.floor(R() * 4);
      for (let y = 0; y < n; y++) k.part(box(2.4, 2.5, 6.1), 'far', cols[Math.floor(R() * cols.length)], x + 0.6, 6.4 + y * 2.55, z);
    }
  },
  mountain(k, o, R) {
    const r = o.r, h = o.h;
    k.part(cone(r, h, 7), 'far', o.color || 0x5a6068, 0, h / 2 - 2, 0, 0, R() * 6, 0, 1, 1, 0.8 + R() * 0.4);
    k.part(cone(r * 0.42, h * 0.42, 7), 'far', 0xe8eef6, 0, h * 0.79 - 2, 0, 0, R() * 6, 0, 1, 1, 0.9);
  },
  farTree(k, o, R) {
    const h = o.h || 9 + R() * 6;
    k.part(cone(h * 0.22, h * 0.8, 6), 'far', o.snow ? 0x3a4a44 : 0x2c402e, 0, h * 0.5, 0);
    if (o.snow) k.part(cone(h * 0.15, h * 0.35, 6), 'far', 0xdfe6ee, 0, h * 0.72, 0);
  },
  pallets(k, o, R) {
    for (let i = 0; i < (o.n || 4); i++) {
      k.part(box(1.2, 0.12, 1.0), 'rough', 0x8a6a42, 0, 0.06 + i * 0.16, 0, 0, R() * 0.1, 0);
      for (const x of [-0.5, 0, 0.5]) k.part(box(0.1, 0.06, 1), 'rough', 0x6a5032, x, 0.14 + i * 0.16, 0);
    }
  },
  sandbagsRoof(k, o) {
    for (let x = -o.w / 2 + 0.3; x < o.w / 2; x += 0.62) k.part(rbox(0.6, 0.2, 0.36, 0.08), 'rough', 0x7d6f50, x, 0.1, 0);
    for (let x = -o.w / 2 + 0.6; x < o.w / 2 - 0.3; x += 0.62) k.part(rbox(0.6, 0.2, 0.36, 0.08), 'rough', 0x857756, x, 0.3, 0);
  },
};

const shade = (c, k) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);
// a thin bar from a to b ([x, y, z] in the prop's local space)
function seg(k, a, b, r, kind, col) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);
  k.part(box(r, r, l), kind, col, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, -Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
}

Object.assign(PROPS, {
  // frame, corner castings and door hardware for a shipping container (length along local z)
  cframe(k, o) {
    const L = o.len || 6.1, W = o.wid || 2.44, H = 2.6;
    const cols = o.cols || [o.col ?? 0x2d5870];
    for (let lv = 0; lv < cols.length; lv++) {
      const col = cols[lv] ?? 0x2d5870, dark = shade(col, 0.6), y0 = lv * H;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        k.part(box(0.17, H - 0.04, 0.17), 'paint', dark, sx * (W / 2 - 0.07), y0 + H / 2, sz * (L / 2 - 0.07));
        for (const yy of [0.08, H - 0.08]) k.part(box(0.22, 0.15, 0.22), 'metal', 0x2a2a28, sx * (W / 2 - 0.08), y0 + yy, sz * (L / 2 - 0.08));
      }
      for (const sx of [-1, 1]) for (const yy of [0.09, H - 0.09]) k.part(box(0.1, 0.16, L - 0.34), 'paint', dark, sx * (W / 2 - 0.01), y0 + yy, 0);
      for (const sz of [-1, 1]) for (const yy of [0.09, H - 0.09]) k.part(box(W - 0.34, 0.16, 0.1), 'paint', dark, 0, y0 + yy, sz * (L / 2 - 0.01));
      if (!o.open) for (const x of [-0.85, -0.45, 0.45, 0.85]) {
        k.part(cyl(0.028, 0.028, H - 0.35, 6), 'metal', shade(col, 0.85), x, y0 + H / 2, L / 2 + 0.04);
        for (const yy of [0.3, H - 0.3]) k.part(box(0.09, 0.06, 0.07), 'metal', 0x3a3a38, x, y0 + yy, L / 2 + 0.06);
        k.part(box(0.045, 0.34, 0.05), 'metal', shade(col, 0.7), x + 0.09, y0 + 1.2, L / 2 + 0.09);
      }
      if (o.open) continue;
      k.part(box(0.05, H - 0.3, 0.05), 'paint', dark, 0, y0 + H / 2, L / 2 + 0.03);
      for (const sx of [-1, 1]) for (const yy of [0.5, 1.3, 2.1]) k.part(box(0.06, 0.13, 0.1), 'metal', 0x333331, sx * (W / 2 - 0.1), y0 + yy, L / 2 + 0.04);
    }
  },
  // stacked white rugged equipment cases
  cases(k, o, R) {
    const w = o.w || 1.2, d = o.d || 0.8;
    let y = 0;
    for (let i = 0; i < (o.n || 3); i++) {
      const h = 0.55 + R() * 0.25, c = [0xd4d7d4, 0xc2c6c4, 0xb4b9b8][i % 3];
      k.part(rbox(w, h, d, 0.05), 'metal', c, 0, y + h / 2, 0, 0, (R() - 0.5) * 0.06, 0);
      k.part(box(w + 0.02, 0.05, d + 0.02), 'metal', 0x80847f, 0, y + h - 0.12, 0);
      for (const sx of [-1, 1]) k.part(box(0.2, 0.06, 0.05), 'metal', 0x444846, sx * w * 0.3, y + h * 0.55, d / 2 + 0.02);
      k.part(box(0.3, 0.04, 0.04), 'metal', 0x303432, 0, y + h * 0.78, d / 2 + 0.03);
      if (R() < 0.6) k.part(box(0.28, 0.18, 0.01), 'paint', [0x2a2a2a, 0xb03a2e, 0xe0c040][Math.floor(R() * 3)], -w * 0.18, y + h * 0.45, d / 2 + 0.012);
      y += h;
    }
  },
  // blue plastic crates on a pallet
  bluecrates(k, o, R) {
    k.part(box(1.2, 0.14, 1.0), 'rough', 0x7a6242, 0, 0.07, 0);
    for (let i = 0; i < (o.n || 4); i++) {
      const x = (i % 2 - 0.5) * 0.6, y = 0.14 + Math.floor(i / 2) * 0.46 + 0.23;
      k.part(rbox(0.58, 0.44, 0.95, 0.04), 'paint', [0x1f5f9a, 0x2a6aa8, 0xd0d4d4][Math.floor(R() * 3)], x, y, 0);
      k.part(box(0.3, 0.2, 0.01), 'paint', 0xe8e8e0, x, y, 0.48);
    }
  },
  // deck crane: pedestal, cab and a lattice boom raised by `pitch`, with its cables and hook
  shipcrane(k, o) {
    const Y = o.color || 0xc49a22, p = o.pitch ?? 0.55, L = o.len || 26;
    k.part(cyl(1.3, 1.7, 10, 14), 'paint', Y, 0, 5, 0);
    k.part(cyl(1.9, 1.9, 0.5, 16), 'metal', 0x3a3c3e, 0, 10.2, 0);
    k.part(rbox(4, 3, 4.4, 0.2), 'paint', 0xd8d4c8, 0, 11.9, 0.4);
    k.part(box(3.6, 1.1, 0.05), 'glass', 0x18212a, 0, 12.3, -1.83);
    k.part(box(0.35, 0.25, 0.35), 'glow', [0xff3010, 4], 0, 13.55, 0.4);
    k.push(0, 11, -1.4, 0, p);
    k.part(box(1.3, 1.3, L), 'paint', Y, 0, 0, -L / 2);
    for (let z = -2; z > -L; z -= 2.6) for (const sx of [-1, 1]) k.part(box(0.1, 0.1, 1.9), 'paint', shade(Y, 0.7), sx * 0.66, 0.4, z, 0, 0.6 * sx, 0);
    k.pop();
    const tip = [0, 11 + Math.sin(p) * L, -1.4 - Math.cos(p) * L];
    for (const x of [-0.4, 0.4]) seg(k, [x, 13.4, 1.8], [x, tip[1], tip[2]], 0.05, 'metal', 0x151515);
    seg(k, [0, tip[1], tip[2]], [0, 7, tip[2]], 0.05, 'metal', 0x151515);
    k.part(rbox(0.7, 0.9, 0.5, 0.08), 'paint', 0xd8a020, 0, 6.6, tip[2]);
    k.part(torus(0.28, 0.07, Math.PI * 1.4), 'metal', 0x2a2a2a, 0, 5.9, tip[2], 0, Math.PI / 2, 0);
  },
  // light mast with a bank of floodlights aimed along local -z
  mast(k, o) {
    const h = o.h || 14;
    k.part(cyl(0.14, 0.22, h, 8), 'paint', 0xb8b4a8, 0, h / 2, 0);
    k.part(box(1.8, 0.12, 0.14), 'metal', 0x333533, 0, h - 0.25, 0);
    for (const x of [-0.6, 0, 0.6]) {
      k.part(rbox(0.46, 0.36, 0.3, 0.04), 'metal', 0x2a2c2a, x, h, -0.12, -0.55, 0, 0);
      k.part(box(0.37, 0.27, 0.03), 'glow', [0xeef3ff, 6], x, h - 0.09, -0.27, -0.55, 0, 0);
    }
  },
  railing(k, o) {
    const L = o.len || 10, c = o.color || 0xd2c9a8;
    for (let x = -L / 2; x <= L / 2 + 0.01; x += 1.5) k.part(cyl(0.03, 0.03, 1.1, 6), 'paint', c, x, 0.55, 0);
    for (const y of [0.55, 1.1]) k.part(cyl(0.025, 0.025, L, 6), 'paint', c, 0, y, 0, 0, 0, Math.PI / 2);
  },
  // a field desk with a laptop (the Undercover intel)
  laptop(k, o) {
    k.part(box(1.4, 0.05, 0.7), 'rough', 0x5a4a38, 0, 0.76, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.part(box(0.05, 0.74, 0.05), 'metal', 0x2a2a2a, sx * 0.62, 0.37, sz * 0.3);
    k.part(box(0.38, 0.022, 0.26), 'metal', 0x1c1c1c, 0, 0.8, 0.05);
    k.part(box(0.38, 0.25, 0.015), 'metal', 0x1c1c1c, 0, 0.93, -0.1, -0.25, 0, 0);
    k.part(box(0.33, 0.2, 0.01), 'glow', [0x4a9cff, 2.5], 0, 0.93, -0.092, -0.25, 0, 0);
    k.part(box(0.22, 0.01, 0.3), 'paint', 0xe8e4d8, 0.45, 0.79, 0.1, 0, 0.3, 0);
    k.part(rbox(0.16, 0.28, 0.08, 0.02), 'metal', 0x3a4030, -0.5, 0.92, 0);
    k.part(box(0.01, 0.35, 0.01), 'metal', 0x111111, -0.45, 1.2, 0);
  },
  // a mobile SAM launcher: 6x6 chassis, cab, and four missiles on a raised rail
  sam(k, o) {
    const G = o.color || 0x4a5234, D = 0x2a2e22, burnt = o.burnt;
    const P = (c) => burnt ? 0x1c1a18 : c;
    k.part(rbox(2.9, 1.1, 8.4, 0.1), 'paint', P(G), 0, 1.35, 0);
    for (const z of [-3, -1.4, 2.6]) for (const sx of [-1, 1]) k.part(cyl(0.58, 0.58, 0.45, 14), 'rough', 0x161616, sx * 1.3, 0.58, z, 0, 0, Math.PI / 2);
    k.part(rbox(2.8, 1.5, 2, 0.15), 'paint', P(G), 0, 2.6, -3.4);
    if (!burnt) k.part(box(2.5, 0.6, 0.05), 'glass', 0x18212a, 0, 2.95, -4.42);
    k.part(cyl(1.1, 1.25, 0.5, 12), 'metal', P(D), 0, 2.15, 1.2);
    if (burnt) return;
    k.push(0, 2.6, 1.2, 0, 0.62);
    k.part(box(2.4, 0.2, 5.8), 'metal', D, 0, 0, 0);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) {
      k.part(cyl(0.2, 0.2, 5.2, 10), 'paint', 0xd8d8d0, x, 0.36, 0.2, Math.PI / 2, 0, 0);
      k.part(cone(0.2, 0.7, 10), 'paint', 0xd8d8d0, x, 0.36, -2.75, -Math.PI / 2, 0, 0);
      for (const r of [0, Math.PI / 2]) k.part(box(0.02, 0.6, 0.5), 'paint', 0xc8c8c0, x, 0.36, 2.4, 0, 0, r);
    }
    k.pop();
    k.part(box(1.4, 1.1, 0.2), 'metal', 0x303830, 0, 3.6, -2.2);
  },
  helipad(k) {
    k.part(cyl(7, 7, 0.06, 40), 'rough', 0x575755, 0, 0.03, 0);
    k.part(cyl(6.4, 6.4, 0.065, 40), 'paint', 0xd8c040, 0, 0.034, 0);
    k.part(cyl(6.0, 6.0, 0.07, 40), 'rough', 0x575755, 0, 0.036, 0);
    for (const x of [-1.5, 1.5]) k.part(box(0.6, 0.02, 5), 'paint', 0xe8e8e0, x, 0.08, 0);
    k.part(box(3, 0.02, 0.6), 'paint', 0xe8e8e0, 0, 0.08, 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.part(box(0.3, 0.2, 0.3), 'glow', [0x80ff60, 2], Math.cos(a) * 7.2, 0.1, Math.sin(a) * 7.2); }
  },
  // Ground War capture point: a pole with a beacon
  cappole(k) {
    k.part(cyl(0.07, 0.1, 6, 8), 'metal', 0xb8bcbe, 0, 3, 0);
    k.part(cyl(0.5, 0.6, 0.25, 12), 'metal', 0x3a3c3e, 0, 0.12, 0);
    k.part(box(1.6, 1.0, 0.03), 'fabric', 0xe0e0d8, 0.85, 5.3, 0);
    k.part(sph(0.12, 8, 6), 'glow', [0xffffff, 3], 0, 6.05, 0);
  },
});

export function buildProp(kit, type, o, seed) {
  const fn = PROPS[type];
  if (!fn) return;
  const R = mulberry(seed);
  kit.push(o.x, o.y || 0, o.z, o.rot || 0);
  fn(kit, o, R);
  kit.pop();
}

// Props that have a scanned model (assets.js) are placed as model instances instead of being
// built from primitives. Returns world placements for instanceProps(), or null to fall back.
const SCANNED = {
  barrel: (o, R, md) => md.barrel ? [{ type: 'barrel' }] : null,
  tires: (o, R, md) => !md.tires ? null : Array.from({ length: o.n || 3 }, (_, i) => ({ type: 'tires', x: R() * 0.08, z: R() * 0.08, y: i * md.tires.size.y, rot: R() * 6 })),
  jersey: (o, R, md) => {
    if (!md.jersey) return null;
    const l = o.len || 3, n = Math.max(1, Math.round(l / md.jersey.size.x)), piece = l / n;
    return Array.from({ length: n }, (_, i) => ({ type: 'jersey', z: -l / 2 + piece * (i + 0.5), rot: Math.PI / 2, sx: piece / md.jersey.size.x }));
  },
  rock: (o, R, md) => !md.rock ? null : [{ type: 'rock', rot: R() * 6, s: (o.r || 1.5) * 1.9 / md.rock.size.z }],
  // the procedural pines and olives become scanned conifers and olive trees
  pine: (o, R, md) => md.conifer ? [{ type: `conifer:${Math.floor(R() * md.conifer.n)}`, rot: R() * 6.28, s: (o.h || 7 + R() * 5) / md.conifer.size.y * 1.3 }] : null,
  olive: (o, R, md) => md.olive1 ? [{ type: R() < 0.5 ? 'olive1' : 'olive2', rot: R() * 6.28, s: (o.s || 0.9 + R() * 0.5) * 0.9 }] : null,
  // the far woods use the lightest conifer
  farTree: (o, R, md) => o.snow && md.conifer ? [{ type: 'conifer:0', rot: R() * 6.28, s: 0.9 + R() * 0.7 }]
    : md.olive1 ? [{ type: R() < 0.5 ? 'olive1' : 'olive2', rot: R() * 6.28, s: 1.2 + R() * 0.5 }] : null,
  pallets: (o, R, md) => !md.pallets ? null : Array.from({ length: Math.max(1, Math.ceil((o.n || 4) / 2)) }, (_, i) => ({ type: 'pallets', y: i * md.pallets.size.y, rot: Math.PI / 2 + (R() - 0.5) * 0.15 })),
};

export function scannedProp(p, seed, md) {
  const fn = SCANNED[p.type];
  if (!fn) return null;
  const parts = fn(p, mulberry(seed), md);
  if (!parts) return null;
  const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
  return parts.map(q => {
    const lx = q.x || 0, lz = q.z || 0;
    return { ...q, x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c, y: (p.y || 0) + (q.y || 0), rot: (p.rot || 0) + (q.rot || 0) };
  });
}
