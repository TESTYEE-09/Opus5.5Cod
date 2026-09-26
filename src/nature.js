// Trees, rocks, deadwood and ground cover over the rolling ground. Trees and rocks are the
// scanned models from assets.js (drawn instanced per chunk); grass, weeds and ferns are
// alpha cards from one atlas (public/tex/foliage.png, baked from Poly Haven scans) that sway
// in the wind. Everything is placed from the map seed, so every client sees the same land.
import * as THREE from 'three';
import { playH, vnoise } from './terrain.js';
import { models } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// per map: counts of each thing; `forest` clusters trees where the noise is high
const LANDS = {
  desert: { trees: [['olive1', 1], ['olive2', 1]], treeN: 90, forest: 0.55, rocks: 160, dead: 30, grass: 6000, weeds: 1200, ferns: 0, tint: [1.25, 1.05, 0.62] },
  snow: { trees: [['conifer', 1]], treeN: 1400, forest: 0.42, rocks: 220, dead: 60, grass: 0, weeds: 500, ferns: 0, tint: [0.75, 0.72, 0.62] },
  port: { trees: [['olive1', 1], ['olive2', 1]], treeN: 40, forest: 0.6, rocks: 50, dead: 10, grass: 3500, weeds: 700, ferns: 300, tint: [1.0, 1.05, 0.8] },
};

const CARD = {
  grass1: { cell: 0, w: 1.3, h: 0.6, cross: 3, aspect: 2.16 },
  grass2: { cell: 1, w: 1.2, h: 0.62, cross: 3, aspect: 1.96 },
  weed: { cell: 2, w: 0.9, h: 1.15, cross: 2, aspect: 0.78 },
  fern: { cell: 3, w: 1.1, h: 1.0, flat: true, aspect: 1.1 },
};

export function scatterNature(def, { addBox, overlaps, roads, mulberry, SIZE }) {
  const out = { models: [], cards: [] };
  const L = LANDS[def.land];
  if (!L) return out;
  const R = mulberry((def.seed || 7) * 131 + 17), s = (def.seed || 7) + 50;
  const onRoad = (x, z, m) => roads.some(r => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);
  const pick = (list) => { const t = list.reduce((a, [, w]) => a + w, 0); let r = R() * t; for (const [k, w] of list) if ((r -= w) < 0) return k; return list[0][0]; };
  const variant = (type) => { const n = models[type]?.n || 1; return n > 1 ? `${type}:${Math.floor(R() * n)}` : type; };
  const free = (x, z, r) => x > 8 && z > 8 && x < SIZE - 8 && z < SIZE - 8 && !overlaps(x, z, r, 0, 30) && !onRoad(x, z, r + 1);

  // trees: clustered into woods by a low-frequency noise, a few loners everywhere
  for (let n = 0, tries = 0; n < L.treeN && tries < L.treeN * 40; tries++) {
    const x = R() * SIZE, z = R() * SIZE;
    const dens = vnoise(x / 70, z / 70, s);
    if (dens < L.forest && R() > 0.04) continue;
    if (!free(x, z, 3)) continue;
    const kind = pick(L.trees);
    if (!models[kind]) break;
    const type = variant(kind), y = playH(x, z) - 0.15, sc = 0.8 + R() * 0.45;
    out.models.push({ type, x, y, z, rot: R() * 6.28, s: sc, tree: true });
    addBox(x - 0.28, y, z - 0.28, x + 0.28, y + 6, z + 0.28, 'invis');
    n++;
  }
  // rocks: boulders and mossy stones, larger ones block
  const rockTypes = [['boulderA', 2], ['boulderB', 2], ['mossrock', def.land === 'snow' ? 3 : 1]];
  for (let n = 0, tries = 0; n < L.rocks && tries < L.rocks * 30; tries++) {
    const x = R() * SIZE, z = R() * SIZE;
    if (!free(x, z, 2)) continue;
    const kind = pick(rockTypes);
    if (!models[kind]) continue;
    const type = variant(kind), sc = 0.5 + R() ** 2 * 1.8, md = models[type], y = playH(x, z) - 0.25 * sc;
    out.models.push({ type, x, y, z, rot: R() * 6.28, s: sc });
    const hx = md.size.x * sc * 0.35, hz = md.size.z * sc * 0.35;
    if (md.size.y * sc > 0.7) addBox(x - hx, y, z - hz, x + hx, y + md.size.y * sc * 0.8, z + hz, 'invis');
    n++;
  }
  // deadwood: fallen trunks, stumps, brush
  for (let n = 0, tries = 0; n < L.dead && tries < L.dead * 30; tries++) {
    const x = R() * SIZE, z = R() * SIZE;
    if (!free(x, z, 2)) continue;
    const kind = pick([['deadtrunk', 2], ['stump', 2], ['branches', 3]]);
    if (!models[kind]) continue;
    out.models.push({ type: kind, x, y: playH(x, z) - 0.05, z, rot: R() * 6.28, s: 0.9 + R() * 0.4 });
    n++;
  }
  // ground cover in patches, thinning to nothing on the levelled ground by buildings
  const cover = [['grass1', L.grass / 2], ['grass2', L.grass / 2], ['weed', L.weeds], ['fern', L.ferns]];
  for (const [kind, count] of cover) {
    for (let n = 0, tries = 0; n < count && tries < count * 12; tries++) {
      const x = R() * SIZE, z = R() * SIZE;
      if (vnoise(x / 25, z / 25, s + 9) < 0.42) continue;
      if (x < 4 || z < 4 || x > SIZE - 4 || z > SIZE - 4 || onRoad(x, z, 0.5) || overlaps(x, z, 0.4, 0, 3)) continue;
      out.cards.push({ kind, x, y: playH(x, z) - 0.03, z, rot: R() * 6.28, s: 0.7 + R() * 0.6 });
      n++;
    }
  }
  out.tint = L.tint;
  lastTint.fromArray(L.tint);
  return out;
}

// ---------- foliage cards ----------
const wind = { value: 0 };
export const tickFoliage = (t) => { wind.value = t; };
const lastTint = new THREE.Color(1, 1, 1);
let atlas = null, cardMat = null;
const geos = {};

// sway: vertices move with their height above the base, phased by world position
export function addWind(mat, strength, from = 0) {
  if (mat.userData.wind) return mat; // materials are shared between model variants
  mat.userData.wind = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uWind = wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wp = instanceMatrix[3].xyz;
          #else
            vec3 wp = vec3(0.0);
          #endif
          float k = max(0.0, transformed.y - ${from.toFixed(2)});
          float ph = dot(wp.xz, vec2(0.13, 0.17));
          transformed.x += sin(uWind * 1.7 + ph) * k * k * ${strength.toFixed(4)};
          transformed.z += cos(uWind * 1.3 + ph * 1.3) * k * k * ${(strength * 0.7).toFixed(4)};
        }`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}wind${strength}`;
  return mat;
}

function cardGeo(kind) {
  if (geos[kind]) return geos[kind];
  const c = CARD[kind], u0 = (c.cell % 2) * 0.5, v0 = 1 - (Math.floor(c.cell / 2) + 1) * 0.5;
  // the picture sits bottom-centre in its 512 px cell
  const fw = Math.min(1, c.aspect), fh = Math.min(1, 1 / c.aspect);
  const uA = u0 + (0.5 - fw * 0.5) * 0.5, uB = u0 + (0.5 + fw * 0.5) * 0.5, vA = v0, vB = v0 + fh * 0.5;
  const pos = [], uv = [], nor = [];
  const quad = (pts) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...pts[i]); nor.push(0, 1, 0); } for (const i of [0, 1, 2, 0, 2, 3]) uv.push(...[[uA, vA], [uB, vA], [uB, vB], [uA, vB]][i]); };
  if (c.flat) {
    const h = c.w / 2, y = 0.12;
    quad([[-h, y, h], [h, y, h], [h, y + 0.1, -h], [-h, y + 0.1, -h]]);
  } else {
    for (let i = 0; i < c.cross; i++) {
      const a = i / c.cross * Math.PI, cx = Math.cos(a) * c.w / 2, cz = Math.sin(a) * c.w / 2;
      quad([[-cx, 0, -cz], [cx, 0, cz], [cx, c.h, cz], [-cx, c.h, -cz]]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return (geos[kind] = g);
}

function material() {
  if (!atlas) {
    atlas = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}tex/foliage.png`);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
  }
  if (!cardMat) cardMat = addWind(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }), 0.09);
  // scans are rendered darker than game lighting; each land tints its grass
  cardMat.color.copy(lastTint).multiplyScalar(2.3);
  // light passing through the blades: the shaded side never goes black
  cardMat.emissive.copy(lastTint).multiplyScalar(0.12);
  return cardMat;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function buildFoliage(list) {
  const g = new THREE.Group(), by = {};
  for (const c of list) (by[c.kind] ||= []).push(c);
  for (const [kind, cs] of Object.entries(by)) {
    const im = new THREE.InstancedMesh(cardGeo(kind), material(), cs.length);
    cs.forEach((c, i) => im.setMatrixAt(i, _m.compose(_v.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(0, c.rot, 0)), _s.set(c.s, c.s, c.s))));
    im.computeBoundingSphere();
    im.receiveShadow = true;
    g.add(im);
  }
  return g;
}

// ---------- date palms, generated ----------
// No scan exists, so they are built the way game palms are: a curved trunk with a ringed
// bark texture and fronds as bent, V-folded alpha cards with painted leaflets.
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
function rnd(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function frondTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    const R = rnd(71);
    g.clearRect(0, 0, w, h);
    // leaflets both sides of the rachis, longest in the middle, a few dry ones
    for (let i = 0; i < 70; i++) {
      const t = i / 70, y = h * (0.04 + t * 0.94), len = w * 0.46 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (0.8 + R() * 0.3);
      for (const s of [-1, 1]) {
        const dry = R() < 0.08;
        g.strokeStyle = dry ? `rgb(${150 + R() * 30},${130 + R() * 20},${70})` : `rgb(${50 + R() * 30},${85 + R() * 40},${30 + R() * 20})`;
        g.lineWidth = 3 + R() * 2;
        g.beginPath(); g.moveTo(w / 2, y);
        g.quadraticCurveTo(w / 2 + s * len * 0.5, y - 10, w / 2 + s * len, y - 22 - R() * 10);
        g.stroke();
      }
    }
    g.strokeStyle = '#7a6a3a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  });
}
function barkTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    const R = rnd(5);
    g.fillStyle = '#6a5840'; g.fillRect(0, 0, w, h);
    // diamond leaf-base pattern of a date palm trunk
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
      g.fillStyle = `rgb(${95 + R() * 30},${78 + R() * 20},${52 + R() * 15})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 8); g.lineTo(x, y + 16); g.lineTo(x - 8, y + 8); g.fill();
      g.strokeStyle = 'rgba(30,22,14,0.6)'; g.lineWidth = 1.5; g.stroke();
    }
  });
}

// one frond: a strip bent down along its length, folded into a shallow V
function frondGeo(len, width, droop, R) {
  const segs = 8, pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = droop * t * t;
    const z = -Math.sin(Math.PI / 2 - a) * 0 - t * len * Math.cos(a * 0.6), y = -t * t * len * Math.sin(droop * 0.7);
    const w = width * Math.sin(Math.PI * (0.1 + t * 0.9));
    for (const [s, u] of [[-1, 0], [0, 0.5], [1, 1]]) { pos.push(s * w / 2, y + (s ? -w * 0.18 : 0), z); uv.push(u, 1 - t); }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < 2; k++) {
    const a = i * 3 + k, b = a + 1, c = a + 3, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

export function buildPalms(models) {
  const frondMat = addWind(new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 0.0035, 4);
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
  barkMat.map.wrapS = barkMat.map.wrapT = THREE.RepeatWrapping;
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x5a3f1e, roughness: 0.7 });
  [7, 9.5, 12].forEach((h, vi) => {
    const R = rnd(33 + vi * 17), lean = 0.08 + R() * 0.12, dir = R() * 6.28;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.cos(dir) * lean * h * t * t, h * t, Math.sin(dir) * lean * h * t * t)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const trunk = new THREE.TubeGeometry(curve, 24, 0.2, 10, false);
    // taper toward the crown, and bark repeats up the trunk
    const p = trunk.attributes.position, uvs = trunk.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / h, c = curve.getPoint(Math.min(1, Math.max(0, t)));
      const k = 1.25 - 0.45 * t;
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, p.getY(i), c.z + (p.getZ(i) - c.z) * k);
      uvs.setXY(i, uvs.getX(i) * 2, uvs.getY(i) * h / 1.2);
    }
    trunk.computeVertexNormals();
    const top = curve.getPoint(1);
    const fronds = [];
    for (let f = 0; f < 16; f++) {
      const up = f < 5, g = frondGeo(up ? 2.6 + R() : 3.4 + R() * 1.2, 0.9 + R() * 0.3, up ? 0.4 : 1.2 + R() * 0.6, R);
      g.rotateX(up ? -0.9 - R() * 0.3 : -0.25 + R() * 0.2);
      g.rotateY(f / 16 * 6.28 * 3 + R() * 0.4);
      g.translate(top.x, top.y, top.z);
      fronds.push(g);
    }
    const nuts = [];
    for (let i = 0; i < 6; i++) { const s = new THREE.SphereGeometry(0.1, 8, 6); s.translate(top.x + Math.cos(i) * 0.25, top.y - 0.35 - (i % 2) * 0.1, top.z + Math.sin(i) * 0.25); nuts.push(s); }
    const merged = mergeGeometries(fronds.map(g => { for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); return g; }));
    const nutG = mergeGeometries(nuts.map(g => g.toNonIndexed()));
    const parts = [{ geometry: trunk, material: barkMat }, { geometry: merged, material: frondMat }, { geometry: nutG, material: nutMat }];
    for (const q of parts) q.geometry.computeBoundingSphere();
    const md = { parts, size: new THREE.Vector3(8, h + 1, 8), n: 3 };
    if (vi === 0) models.palm = md;
    models[`palm:${vi}`] = md;
  });
}
