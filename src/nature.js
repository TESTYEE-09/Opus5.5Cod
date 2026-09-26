// Trees, rocks, deadwood and ground cover over the rolling ground. Trees and rocks are the
// scanned models from assets.js (drawn instanced per chunk); grass, weeds and ferns are
// alpha cards from one atlas (public/tex/foliage.png, baked from Poly Haven scans) that sway
// in the wind. Everything is placed from the map seed, so every client sees the same land.
import * as THREE from 'three';
import { playH, vnoise } from './terrain.js';
import { models } from './assets.js';

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
  cardMat.color.copy(lastTint).multiplyScalar(1.5);
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
