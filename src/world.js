// The map: a 0.5 m collision grid where every cell holds solid vertical spans.
// Bodies, bullets, grenades and bot navigation all read the same grid. Maps are
// described in maps.js and loaded at runtime with loadMap().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface, R, macroNoise, mulberry } from './textures.js';
import { Kit, kitMaterials, buildProp } from './props.js';

export const SIZE = 80;
export const CELL = 0.5;
export const N = SIZE / CELL;
export const GRAVITY = 18;
export const STEP = 0.45;

const cells = new Array(N * N).fill(null);
const boxes = [];
const OOB = [[-1e9, 1e9]];

export const spawns = [[], []];
export const interest = [];

function addBox(x0, y0, z0, x1, y1, z1, mat, collide = true) {
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (z0 > z1) [z0, z1] = [z1, z0];
  boxes.push({ x0, y0, z0, x1, y1, z1, mat, collide });
  if (!collide) return;
  const i0 = Math.max(0, Math.round(x0 / CELL)), i1 = Math.min(N, Math.round(x1 / CELL));
  const k0 = Math.max(0, Math.round(z0 / CELL)), k1 = Math.min(N, Math.round(z1 / CELL));
  for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) (cells[k * N + i] ||= []).push([y0, y1]);
}

function mergeSpans() {
  for (let c = 0; c < cells.length; c++) {
    const sp = cells[c];
    if (!sp || sp.length < 2) continue;
    sp.sort((a, b) => a[0] - b[0]);
    const out = [sp[0].slice()];
    for (let j = 1; j < sp.length; j++) {
      const last = out[out.length - 1];
      if (sp[j][0] <= last[1] + 1e-4) last[1] = Math.max(last[1], sp[j][1]);
      else out.push(sp[j].slice());
    }
    cells[c] = out;
  }
}

export function cellSpans(i, k) {
  if (i < 0 || k < 0 || i >= N || k >= N) return OOB;
  return cells[k * N + i];
}

function blocks(sp, lo, hi) {
  if (!sp) return false;
  for (const s of sp) if (s[0] < hi && s[1] > lo) return true;
  return false;
}

export function overlaps(x, z, r, lo, hi) {
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) if (blocks(cellSpans(i, k), lo, hi)) return true;
  return false;
}

export function pointSolid(x, y, z) {
  if (y < 0) return true;
  const sp = cellSpans(Math.floor(x / CELL), Math.floor(z / CELL));
  if (!sp) return false;
  for (const s of sp) if (y >= s[0] && y <= s[1]) return true;
  return false;
}

// Highest surface at or below maxY under a circle of radius r.
export function groundAt(x, z, r, maxY) {
  let g = 0;
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const sp = cellSpans(i, k);
    if (!sp || sp === OOB) continue;
    for (const s of sp) if (s[1] <= maxY && s[1] > g) g = s[1];
  }
  return g;
}

function ceilingAt(x, z, r, minY) {
  let c = Infinity;
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const sp = cellSpans(i, k);
    if (!sp || sp === OOB) continue;
    for (const s of sp) if (s[0] >= minY && s[0] < c) c = s[0];
  }
  return c;
}

function sweep(b, axis, target, lo, hi) {
  const p = b.pos, r = b.r;
  const cur = axis === 0 ? p.x : p.z;
  const dir = Math.sign(target - cur);
  const ox = axis === 0 ? target : p.x, oz = axis === 0 ? p.z : target;
  const i0 = Math.floor((ox - r) / CELL), i1 = Math.floor((ox + r) / CELL);
  const k0 = Math.floor((oz - r) / CELL), k1 = Math.floor((oz + r) / CELL);
  let v = target, hit = false;
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    if (!blocks(cellSpans(i, k), lo, hi)) continue;
    const c0 = (axis === 0 ? i : k) * CELL, c1 = c0 + CELL;
    if (dir > 0 && c0 >= cur + r - 1e-3) { v = Math.min(v, c0 - r - 1e-4); hit = true; }
    else if (dir < 0 && c1 <= cur - r + 1e-3) { v = Math.max(v, c1 + r + 1e-4); hit = true; }
  }
  if (axis === 0) p.x = v; else p.z = v;
  return hit;
}

// Moves a body {pos (feet), vel, r, h, onGround} through the grid. Returns landing speed.
export function moveBody(b, dt) {
  const p = b.pos, v = b.vel;
  const lo = p.y + STEP, hi = p.y + b.h;
  b.hitWall = false;
  if (v.x) b.hitWall = sweep(b, 0, p.x + v.x * dt, lo, hi) || b.hitWall;
  if (v.z) b.hitWall = sweep(b, 2, p.z + v.z * dt, lo, hi) || b.hitWall;

  v.y -= GRAVITY * dt;
  let ny = p.y + v.y * dt;
  const ground = groundAt(p.x, p.z, b.r * 0.9, p.y + STEP);
  if (v.y > 0) {
    const ceil = ceilingAt(p.x, p.z, b.r * 0.9, p.y + b.h - 0.02);
    if (ny + b.h > ceil) { ny = ceil - b.h; v.y = 0; }
  }
  let landed = 0;
  if (ny <= ground) {
    if (!b.onGround) landed = -v.y;
    ny = ground; v.y = 0; b.onGround = true;
  } else if (b.onGround && v.y <= 0 && ny - ground < 0.5) {
    ny = ground; v.y = 0;
  } else b.onGround = false;
  p.y = ny;
  return landed;
}

const _n = new THREE.Vector3();
// Ray against the grid and the ground plane. d must be normalised.
export function raycastWorld(o, d, maxT) {
  let ix = Math.floor(o.x / CELL), iz = Math.floor(o.z / CELL);
  const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = d.x !== 0 ? Math.abs(CELL / d.x) : Infinity;
  const tdz = d.z !== 0 ? Math.abs(CELL / d.z) : Infinity;
  let tmx = d.x !== 0 ? ((d.x > 0 ? (ix + 1) * CELL - o.x : o.x - ix * CELL) / Math.abs(d.x)) : Infinity;
  let tmz = d.z !== 0 ? ((d.z > 0 ? (iz + 1) * CELL - o.z : o.z - iz * CELL) / Math.abs(d.z)) : Infinity;
  const groundT = d.y < 0 ? -o.y / d.y : Infinity;
  const limit = Math.min(maxT, groundT);
  let tEnter = 0, axis = -1;
  while (tEnter <= limit) {
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return null;
    const tExit = Math.min(tmx, tmz, limit);
    const sp = cells[iz * N + ix];
    if (sp) {
      let best = Infinity, top = false;
      for (const s of sp) {
        let a, b;
        if (Math.abs(d.y) < 1e-9) {
          if (o.y < s[0] || o.y > s[1]) continue;
          a = -Infinity; b = Infinity;
        } else {
          a = (s[0] - o.y) / d.y; b = (s[1] - o.y) / d.y;
          if (a > b) [a, b] = [b, a];
        }
        const st = Math.max(a, tEnter), en = Math.min(b, tExit);
        if (st <= en && st < best) { best = st; top = a > tEnter; }
      }
      if (best <= limit) {
        if (top) _n.set(0, d.y > 0 ? -1 : 1, 0);
        else if (axis === 0) _n.set(-sx, 0, 0);
        else if (axis === 2) _n.set(0, 0, -sz);
        else _n.copy(d).negate();
        return { t: best, normal: _n.clone() };
      }
    }
    if (d.y > 0 && o.y + d.y * tExit > 40) return null;
    if (tmx < tmz) { ix += sx; tEnter = tmx; tmx += tdx; axis = 0; }
    else { iz += sz; tEnter = tmz; tmz += tdz; axis = 2; }
  }
  if (groundT <= maxT) return { t: groundT, normal: new THREE.Vector3(0, 1, 0) };
  return null;
}

const _d = new THREE.Vector3();
export function lineOfSight(a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  if (len < 1e-4) return true;
  _d.divideScalar(len);
  return raycastWorld(a, _d, len - 0.05) === null;
}

// ---------- navigation (1 m cells, ground level only) ----------
export const NAV = SIZE;
const walk = new Uint8Array(NAV * NAV);

function computeNav() {
  for (let k = 0; k < NAV; k++) for (let i = 0; i < NAV; i++) {
    let free = true;
    for (let dk = 0; dk < 2 && free; dk++) for (let di = 0; di < 2 && free; di++) {
      if (blocks(cellSpans(i * 2 + di, k * 2 + dk), 0.05, 1.9)) free = false;
    }
    walk[k * NAV + i] = free ? 1 : 0;
  }
}

export const walkable = (i, k) => i >= 0 && k >= 0 && i < NAV && k < NAV && walk[k * NAV + i] === 1;

function nearestWalk(i, k) {
  if (walkable(i, k)) return k * NAV + i;
  for (let r = 1; r < 6; r++) for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
    if (walkable(i + di, k + dk)) return (k + dk) * NAV + i + di;
  }
  return -1;
}

export function lineWalkable(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  const steps = Math.ceil(len / 0.3);
  for (let s = 0; s <= steps; s++) {
    const x = ax + dx * s / steps, z = az + dz * s / steps;
    if (!walkable(Math.floor(x), Math.floor(z))) return false;
    if (overlaps(x, z, 0.36, 0.05, 1.9)) return false;
  }
  return true;
}

const gScore = new Float32Array(NAV * NAV), parent = new Int32Array(NAV * NAV);
const stamp = new Uint32Array(NAV * NAV), closed = new Uint32Array(NAV * NAV);
let curStamp = 0;
const heapI = [], heapF = [];
function hpush(i, f) {
  heapI.push(i); heapF.push(f);
  let c = heapI.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (heapF[p] <= heapF[c]) break;
    [heapI[p], heapI[c]] = [heapI[c], heapI[p]]; [heapF[p], heapF[c]] = [heapF[c], heapF[p]];
    c = p;
  }
}
function hpop() {
  const top = heapI[0];
  const li = heapI.pop(), lf = heapF.pop();
  if (heapI.length) {
    heapI[0] = li; heapF[0] = lf;
    let c = 0;
    for (;;) {
      const l = c * 2 + 1, r = l + 1;
      let m = c;
      if (l < heapI.length && heapF[l] < heapF[m]) m = l;
      if (r < heapI.length && heapF[r] < heapF[m]) m = r;
      if (m === c) break;
      [heapI[m], heapI[c]] = [heapI[c], heapI[m]]; [heapF[m], heapF[c]] = [heapF[c], heapF[m]];
      c = m;
    }
  }
  return top;
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export function findPath(sx, sz, tx, tz) {
  const s = nearestWalk(Math.floor(sx), Math.floor(sz));
  const t = nearestWalk(Math.floor(tx), Math.floor(tz));
  if (s < 0 || t < 0) return null;
  curStamp++;
  heapI.length = 0; heapF.length = 0;
  const ti = t % NAV, tk = (t / NAV) | 0;
  const h = (i, k) => { const dx = Math.abs(i - ti), dk = Math.abs(k - tk); return Math.max(dx, dk) + 0.414 * Math.min(dx, dk); };
  gScore[s] = 0; stamp[s] = curStamp; parent[s] = -1;
  hpush(s, h(s % NAV, (s / NAV) | 0));
  let found = false, iter = 0;
  while (heapI.length && iter++ < 7000) {
    const c = hpop();
    if (closed[c] === curStamp) continue;
    closed[c] = curStamp;
    if (c === t) { found = true; break; }
    const ci = c % NAV, ck = (c / NAV) | 0;
    for (const [di, dk, cost] of DIRS) {
      const ni = ci + di, nk = ck + dk;
      if (!walkable(ni, nk)) continue;
      if (di && dk && (!walkable(ci + di, ck) || !walkable(ci, ck + dk))) continue;
      const n = nk * NAV + ni;
      if (closed[n] === curStamp) continue;
      const g = gScore[c] + cost;
      if (stamp[n] !== curStamp || g < gScore[n]) {
        stamp[n] = curStamp; gScore[n] = g; parent[n] = c;
        hpush(n, g + h(ni, nk));
      }
    }
  }
  if (!found) return null;
  const raw = [];
  for (let c = t; c !== -1; c = parent[c]) raw.push({ x: (c % NAV) + 0.5, z: ((c / NAV) | 0) + 0.5 });
  raw.reverse();
  if (walkable(Math.floor(tx), Math.floor(tz))) raw[raw.length - 1] = { x: tx, z: tz };
  // string-pull
  const out = [];
  let ax = sx, az = sz, i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i && !lineWalkable(ax, az, raw[j].x, raw[j].z)) j--;
    out.push(raw[j]);
    ax = raw[j].x; az = raw[j].z;
    i = j + 1;
  }
  return out;
}

export function randomWalkable(zMin = 1, zMax = SIZE - 1) {
  for (let n = 0; n < 200; n++) {
    const i = 2 + Math.floor(Math.random() * (NAV - 4));
    const k = Math.max(1, Math.floor(zMin + Math.random() * (zMax - zMin)));
    if (walkable(i, k)) return { x: i + 0.5, z: k + 0.5 };
  }
  return { x: 40, z: 40 };
}

// ---------- materials ----------
// World-space variation (breaks up texture tiling) and a darkening band near the ground,
// injected into the standard material so every surface keeps full PBR lighting.
export function enhance(mat, { macro = 0.2, groundAO = 0 } = {}) {
  const tex = macroNoise();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uMacro;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mN = texture2D(uMacro, vWPos.xz * 0.012 + vec2(vWPos.y * 0.017)).r * 0.6 + texture2D(uMacro, vWPos.zy * 0.047 + vec2(vWPos.x * 0.013)).r * 0.4;
        diffuseColor.rgb *= clamp(1.0 + (mN - 0.5) * ${(macro * 4).toFixed(3)}, 0.0, 2.0);
        ${groundAO ? `diffuseColor.rgb *= mix(${(1 - groundAO).toFixed(3)}, 1.0, smoothstep(0.0, 1.4, vWPos.y));` : ''}`);
  };
  mat.customProgramCacheKey = () => `enh${macro}_${groundAO}`;
  return mat;
}

const MAT_DEFS = {
  plaster: { recipe: 'plaster', ts: 3, normal: 1.2 },
  plaster2: { recipe: 'plaster', args: [0xb8b0a2, 0x958c7c], ts: 3, normal: 1.2 },
  concrete: { recipe: 'concrete', ts: 3, normal: 1.5 },
  brick: { recipe: 'brick', ts: 2.2, normal: 2.5 },
  wall: { recipe: 'blocks', ts: 4, normal: 2 },
  crate: { recipe: 'wood', ts: 1.5, normal: 1.5, rough: 0.85 },
  containerR: { recipe: 'corrugated', args: [0x7b3325], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35 },
  containerB: { recipe: 'corrugated', args: [0x2d5870], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35 },
  containerG: { recipe: 'corrugated', args: [0x3b6a3a], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35 },
  containerY: { recipe: 'corrugated', args: [0xb08a2a], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35 },
  containerW: { recipe: 'corrugated', args: [0x9a9ea0, 0.3], ts: 2.6, normal: 3, rough: 0.5, metal: 0.4 },
  corrugated: { recipe: 'corrugated', args: [0x7e8488, 0.35, 0.05], ts: 3, normal: 3, rough: 0.5, metal: 0.45 },
  sandbag: { recipe: 'sandbag', ts: 1.2, normal: 3 },
  hesco: { recipe: 'hesco', ts: 1.4, normal: 2.5 },
  roof: { recipe: 'roof', ts: 3, normal: 2 },
  backdrop: { recipe: 'facade', ts: 6, normal: 1.5 },
  trim: { recipe: 'concrete', args: [0xcfc8b8, 0xb3ab99], ts: 2, normal: 1 },
  floor: { recipe: 'tile', ts: 2.5, normal: 1, rough: 0.7 },
  planks: { recipe: 'planks', args: [0x6e5a44, true], ts: 2.5, normal: 2 },
  deck: { recipe: 'planks', args: [0x7a6a52, false], ts: 2, normal: 2 },
  metal: { recipe: 'diamond', ts: 1.5, normal: 2, rough: 0.45, metal: 0.6 },
  snowcap: { recipe: 'snow', ts: 3, normal: 0.6, rough: 0.75 },
};

function makeMaterial(name, over = {}) {
  const d = { ...MAT_DEFS[name], ...over };
  const args = d.args || [];
  const tex = surface(`${d.recipe}:${JSON.stringify(args)}`, R[d.recipe](...args), { seed: d.seed || (name.length * 131 + 7), normal: d.normal ?? 1.5 });
  const m = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughness: d.rough ?? 0.9, metalness: d.metal ?? 0,
  });
  m.userData.ts = d.ts;
  const low = name === 'backdrop' || name === 'snowcap' || name === 'roof';
  return enhance(m, { macro: 0.18, groundAO: low ? 0 : 0.28 });
}

function boxGeo(b, ts) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h, b.z0, b.y0], [d, h, b.z0, b.y0], [w, d, b.x0, b.z0], [w, d, b.x0, b.z0], [w, h, b.x0, b.y0], [w, h, b.x0, b.y0]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v, [du, dv, ou, ov] = dims[f];
    uv.setXY(i, (uv.getX(i) * du + ou) / ts, (uv.getY(i) * dv + ov) / ts);
  }
  g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
}

// Soft dark strips on the ground around every footprint: cheap contact shadow / ambient occlusion.
function contactShadows(list) {
  const pos = [], al = [];
  const Y = 0.02;
  const quad = (a, b, c, d, aa, ab, ac, ad) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    al.push(aa, ab, ac, aa, ac, ad);
  };
  for (const b of list) {
    const h = b.y1 - b.y0, m = h > 1.5 ? 0.85 : 0.45, A = h > 1.5 ? 0.5 : 0.38;
    const { x0, z0, x1, z1 } = b;
    const P = (x, z) => [x, Y, z];
    quad(P(x0, z0), P(x1, z0), P(x1, z0 - m), P(x0, z0 - m), A, A, 0, 0);
    quad(P(x1, z1), P(x0, z1), P(x0, z1 + m), P(x1, z1 + m), A, A, 0, 0);
    quad(P(x0, z1), P(x0, z0), P(x0 - m, z0), P(x0 - m, z1), A, A, 0, 0);
    quad(P(x1, z0), P(x1, z1), P(x1 + m, z1), P(x1 + m, z0), A, A, 0, 0);
    for (const [cx, cz, sx, sz] of [[x0, z0, -1, -1], [x1, z0, 1, -1], [x1, z1, 1, 1], [x0, z1, -1, 1]]) {
      quad(P(cx, cz), P(cx + sx * m, cz), P(cx + sx * m, cz + sz * m), P(cx, cz + sz * m), A, 0, 0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('alpha', new THREE.Float32BufferAttribute(al, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, vA * vA * 1.4); }',
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 1;
  return mesh;
}

const poolTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

let minimapCanvas = null;
export function minimapImage() { return minimapCanvas; }

function buildMinimap(def) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const mm = def.minimap || {};
  const roadCells = (i, k) => (def.roads || []).some(r => i * CELL >= r.x0 && i * CELL < r.x1 && k * CELL >= r.z0 && k * CELL < r.z1);
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
    const sp = cells[k * N + i];
    let col = roadCells(i, k) ? (mm.road || [70, 70, 68]) : (mm.ground || [96, 86, 70]);
    if (sp) {
      const low = sp.find(s => s[0] < 1.9 && s[1] > 0.05);
      if (low) col = low[1] > 2 ? (mm.high || [214, 204, 180]) : (mm.low || [160, 146, 118]);
      else col = mm.over || [70, 62, 52];
    }
    const o = (k * N + i) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  minimapCanvas = c;
}

// Which surface a bullet hit, for impact particles.
export function materialAt(p, n) {
  const x = p.x - n.x * 0.05, y = p.y - n.y * 0.05, z = p.z - n.z * 0.05;
  for (const b of boxes) if (b.collide !== false && x >= b.x0 - 0.01 && x <= b.x1 + 0.01 && y >= b.y0 - 0.01 && y <= b.y1 + 0.01 && z >= b.z0 - 0.01 && z <= b.z1 + 0.01) return b.mat;
  return y < 0.05 ? 'ground' : null;
}

// ---------- map loading ----------
export const props = [];
let group = null, waterMat = null, materials = [];
export let mapDef = null;

function makeApi() {
  return {
    box: (x0, y0, z0, x1, y1, z1, mat, collide = true) => addBox(x0, y0, z0, x1, y1, z1, mat, collide),
    prop: (type, x, z, o = {}) => props.push({ type, x, z, ...o }),
    spawn: (team, x, z, yaw) => spawns[team].push({ x, z, yaw }),
    interest: (x, z) => interest.push({ x, z }),
  };
}

export function mirrorApi(api) {
  return {
    box: (x0, y0, z0, x1, y1, z1, m, c) => api.box(SIZE - x0, y0, SIZE - z0, SIZE - x1, y1, SIZE - z1, m, c),
    prop: (type, x, z, o = {}) => api.prop(type, SIZE - x, SIZE - z, { ...o, rot: (o.rot || 0) + Math.PI }),
    spawn: (team, x, z, yaw) => api.spawn(1 - team, SIZE - x, SIZE - z, yaw + Math.PI),
    interest: (x, z) => api.interest(SIZE - x, SIZE - z),
  };
}

export function loadMap(scene, def) {
  if (group) {
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of materials) m.dispose();
  }
  cells.fill(null); boxes.length = 0; props.length = 0;
  spawns[0].length = 0; spawns[1].length = 0; interest.length = 0;
  mapDef = def;

  const api = makeApi();
  def.layout(api, mirrorApi(api));
  const per = def.perimeter || {};
  const pm = per.mat || 'wall', ph = per.h || 6;
  addBox(0, 0, 0, 80, ph, 1, pm); addBox(0, 0, 79, 80, ph, 80, pm);
  if (per.quay) {
    addBox(0, 0, 1, 1, 1.1, 79, 'concrete'); addBox(79, 0, 1, 80, 1.1, 79, 'concrete');
    addBox(0, 1.1, 1, 1, 6, 79, 'invis'); addBox(79, 1.1, 1, 80, 6, 79, 'invis');
  } else { addBox(0, 0, 1, 1, ph, 79, pm); addBox(79, 0, 1, 80, ph, 79, pm); }
  if (ph < 6) { addBox(0, ph, 0, 80, 6, 1, 'invis'); addBox(0, ph, 79, 80, 6, 80, 'invis'); if (!per.quay) { addBox(0, ph, 1, 1, 6, 79, 'invis'); addBox(79, ph, 1, 80, 6, 79, 'invis'); } }
  if (def.backdrop) def.backdrop(api, mulberry(def.seed || 7));

  // snow settles on every exposed top
  if (def.snowCaps) {
    for (const b of boxes.slice()) {
      if (b.mat === 'invis' || b.mat === 'backdrop' || b.y1 < 0.3) continue;
      boxes.push({ x0: b.x0 - 0.02, y0: b.y1, z0: b.z0 - 0.02, x1: b.x1 + 0.02, y1: b.y1 + 0.07, z1: b.z1 + 0.02, mat: 'snowcap' });
    }
  }
  mergeSpans();
  computeNav();
  buildMinimap(def);

  group = new THREE.Group();
  materials = [];
  const mats = {};
  const matFor = (name) => {
    if (!mats[name]) { mats[name] = makeMaterial(name, def.mats?.[name]); materials.push(mats[name]); }
    return mats[name];
  };
  const byMat = {};
  for (const b of boxes) {
    if (b.mat === 'invis') continue;
    (byMat[b.mat] ||= []).push(boxGeo(b, matFor(b.mat).userData.ts));
  }
  for (const [m, geos] of Object.entries(byMat)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats[m]);
    mesh.castShadow = m !== 'backdrop';
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }
  group.add(contactShadows(boxes.filter(b => b.y0 <= 0.01 && b.collide !== false && b.mat !== 'backdrop' && b.x1 - b.x0 < 60 && b.z1 - b.z0 < 60)));

  // props
  const kit = new Kit();
  const kmats = kitMaterials(enhance);
  materials.push(...Object.values(kmats));
  props.forEach((p, i) => buildProp(kit, p.type, p, (def.seed || 7) * 1000 + i));
  for (const m of kit.build(kmats)) group.add(m);

  // ground
  const gd = def.ground || { recipe: 'dirt', ts: 8 };
  const gt = surface(`${gd.recipe}:${JSON.stringify(gd.args || [])}`, R[gd.recipe](...(gd.args || [])), { size: 1024, seed: 5, normal: gd.normal ?? 1.5 });
  const gw = gd.w || 260, gl = gd.l || 260;
  const groundGeo = new THREE.PlaneGeometry(gw, gl);
  groundGeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? gl : gw) / gd.ts; });
  const groundMat = enhance(new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normalMap, roughness: gd.rough ?? 0.97 }), { macro: 0.3 });
  materials.push(groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(SIZE / 2, 0, SIZE / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // roads: u across, v along the road
  let ry = 0.008;
  for (const r of def.roads || []) {
    const along = r.z1 - r.z0 >= r.x1 - r.x0;
    const w = along ? r.x1 - r.x0 : r.z1 - r.z0, l = along ? r.z1 - r.z0 : r.x1 - r.x0;
    const recipe = r.kind || 'road';
    const t = surface(`${recipe}:[]`, R[recipe](), { seed: 9, normal: 1.2 });
    const g = new THREE.PlaneGeometry(w, l);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * l / w);
    const m = enhance(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { macro: 0.25 });
    materials.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.set(-Math.PI / 2, 0, along ? 0 : Math.PI / 2);
    mesh.position.set((r.x0 + r.x1) / 2, ry, (r.z0 + r.z1) / 2);
    ry += 0.002;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const r of def.patches || []) {
    const t = surface('asphalt:[]', R.asphalt(), { seed: 9, normal: 1.2 });
    const m = enhance(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { macro: 0.25 });
    materials.push(m);
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
    g.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? r.z1 - r.z0 : r.x1 - r.x0) / 8; });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((r.x0 + r.x1) / 2, ry + 0.002, (r.z0 + r.z1) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // lamp light pools on the ground (only drawn when the map is dark enough to need them)
  if (def.look?.pools) {
    const pm2 = new THREE.MeshBasicMaterial({ map: poolTex(), color: def.look.poolColor || 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, opacity: def.look.pools });
    materials.push(pm2);
    for (const p of props) {
      if (p.type !== 'lamp' && p.type !== 'flood') continue;
      const off = p.type === 'lamp' ? 1.5 : 3;
      const x = p.x - Math.sin(p.rot || 0) * off, z = p.z - Math.cos(p.rot || 0) * off;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), pm2);
      q.rotation.x = -Math.PI / 2; q.position.set(x, 0.03, z);
      group.add(q);
    }
  }

  // water
  waterMat = null;
  if (def.water) {
    const wt = surface('waves:[]', R.waves(), { size: 512, seed: 3, normal: 3 });
    wt.normalMap.repeat.set(40, 40);
    waterMat = new THREE.MeshStandardMaterial({ color: def.water.color || 0x1a3a44, roughness: 0.08, metalness: 0.1, normalMap: wt.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.3 });
    materials.push(waterMat);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), waterMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(SIZE / 2, def.water.y ?? -1.2, SIZE / 2);
    w.receiveShadow = true;
    group.add(w);
  }
  scene.add(group);
  return def;
}

export function updateWorld(dt) {
  if (waterMat) {
    const o = waterMat.normalMap.offset;
    o.x = (o.x + dt * 0.004) % 1; o.y = (o.y + dt * 0.0025) % 1;
  }
}
