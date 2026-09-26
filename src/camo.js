// Weapon camos, unlocked by career rank. A camo repaints the polymer and furniture parts
// every gun shares (the metal stays metal), so one pick covers the whole arsenal.
import * as THREE from 'three';
import { fbm } from './textures.js';

export const CAMOS = [
  { id: 'none', name: 'Factory', rank: 1 },
  { id: 'woodland', name: 'Woodland', rank: 3, cols: [0x3b4a2c, 0x5a5a3a, 0x2a2a22, 0x7a6a48] },
  { id: 'desert', name: 'Desert', rank: 6, cols: [0xb8a27a, 0x9a8260, 0xcfbc94, 0x7a6848] },
  { id: 'urban', name: 'Urban', rank: 10, cols: [0x6a6c70, 0x3a3c40, 0x9a9ca0, 0x202226] },
  { id: 'arctic', name: 'Arctic', rank: 14, cols: [0xe4e8ec, 0xb8c0c8, 0x8a929a, 0xf4f6f8] },
  { id: 'tiger', name: 'Tiger', rank: 18, cols: [0x4a5a30, 0x1c2014, 0x6a7a44, 0x1c2014], stripes: true },
  { id: 'crimson', name: 'Crimson', rank: 24, cols: [0x6a1a18, 0x2a0a0a, 0x9a2a22, 0x3a1010] },
  { id: 'gold', name: 'Gold', rank: 32, metal: 0xd4a640 },
  { id: 'diamond', name: 'Diamond', rank: 42, metal: 0xdff4ff, sparkle: true },
  { id: 'obsidian', name: 'Dark Matter', rank: 55, metal: 0x1a1024, sparkle: true, glow: 0x7a2aff },
];

const cache = {};
function texture(c) {
  if (cache[c.id]) return cache[c.id];
  const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const g = cv.getContext('2d'), img = g.createImageData(s, s);
  const a = fbm(s, 3, 4, 17), b = fbm(s, 5, 3, 29), col = c.cols.map(h => new THREE.Color(h));
  for (let i = 0; i < s * s; i++) {
    const x = i % s;
    let v = c.stripes ? Math.sin(x / s * Math.PI * 10 + a[i] * 7) * 0.5 + 0.5 : a[i];
    const k = v < 0.4 ? 0 : v < 0.52 ? 1 : b[i] > 0.55 ? 2 : 3;
    const cc = c.sparkle ? col[0] : col[k];
    img.data[i * 4] = cc.r * 255; img.data[i * 4 + 1] = cc.g * 255; img.data[i * 4 + 2] = cc.b * 255; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return (cache[c.id] = t);
}

const orig = new Map();
// mats: the shared furniture materials to repaint
export function applyCamo(id, mats) {
  const c = CAMOS.find(x => x.id === id) || CAMOS[0];
  for (const m of mats) {
    if (!orig.has(m)) orig.set(m, { color: m.color.clone(), map: m.map, rough: m.roughness, metal: m.metalness, em: m.emissive.clone() });
    const o = orig.get(m);
    m.color.copy(o.color); m.map = o.map; m.roughness = o.rough; m.metalness = o.metal; m.emissive.copy(o.em);
    if (c.cols) { m.map = texture(c); m.color.set(0xffffff); }
    if (c.metal) { m.color.set(c.metal); m.metalness = 1; m.roughness = c.sparkle ? 0.12 : 0.22; }
    if (c.glow) { m.emissive.set(c.glow); m.emissiveIntensity = 0.25; }
    m.needsUpdate = true;
  }
}
