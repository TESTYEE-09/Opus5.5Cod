// The map: a 0.5 m collision grid where every cell holds solid vertical spans.
// Bodies, bullets, grenades and bot navigation all read the same grid. Maps are
// described in maps.js and loaded at runtime with loadMap().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface, R, macroNoise, mulberry, logoAtlas } from './textures.js';
import { PlanarReflection } from './reflect.js';
import { Kit, kitMaterials, buildProp } from './props.js';

// The map size changes per map (Shipment is tiny, the Ground War maps are huge), so SIZE, N
// and NAV are live bindings that loadMap() resets.
export let SIZE = 160;
export const CELL = 0.5;
export let N = SIZE / CELL;
export const GRAVITY = 18;
export const STEP = 0.45;

let cells = new Array(N * N).fill(null);
const boxes = [];
const OOB = [[-1e9, 1e9]];

export const spawns = [[], []];
export const interest = [];
// capture points for Ground War, and named places for the Undercover missions
export const flags = [];
export const sites = [];
// flat text decals (container logos, signs) drawn from one atlas
const decals = [];

// ---------- destructibles ----------
// Crates, barrels, fences, sandbags, cars and building wall panels. Their spans sit in the
// collision grid like any other box, tagged with the object's id; breaking one rebuilds only
// the cells it covered, the nav cells around it and the render chunk it was drawn in.
export const DKIND = {
  wall: { name: 'Wall', hp: 230, blast: true, crush: true, debris: 'stone' },
  crate: { name: 'Crate', hp: 70, crush: true, debris: 'wood' },
  fence: { name: 'Fence', hp: 45, crush: true, debris: 'wood' },
  barrel: { name: 'Barrel', hp: 22, crush: true, debris: 'metal', boom: [6, 170] },
  drum: { name: 'Drum', hp: 40, crush: true, debris: 'metal' },
  sandbag: { name: 'Sandbags', hp: 320, blast: true, crush: true, debris: 'sand' },
  car: { name: 'Car', hp: 150, wreck: true, debris: 'metal', boom: [4.5, 110] },
  sam: { name: 'SAM launcher', hp: 600, blast: true, wreck: true, debris: 'metal', boom: [9, 220] },
};
export const objects = [];
const rawCells = new Map();
const AUTO_OBJ = { crate: 'crate', sandbag: 'sandbag' };

function newObject(kind) {
  const o = { id: objects.length, kind, spec: DKIND[kind], alive: true, gone: false, boxes: [], props: [], cells: new Set(),
    hp: DKIND[kind].hp, x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity, chunk: null };
  objects.push(o);
  return o.id;
}

function addBox(x0, y0, z0, x1, y1, z1, mat, collide = true, obj = -1) {
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (z0 > z1) [z0, z1] = [z1, z0];
  if (obj < 0 && collide && AUTO_OBJ[mat]) obj = newObject(AUTO_OBJ[mat]);
  const b = { x0, y0, z0, x1, y1, z1, mat, collide, obj };
  boxes.push(b);
  const o = obj >= 0 ? objects[obj] : null;
  if (o) {
    o.boxes.push(b);
    if (collide) {
      o.x0 = Math.min(o.x0, x0); o.y0 = Math.min(o.y0, y0); o.z0 = Math.min(o.z0, z0);
      o.x1 = Math.max(o.x1, x1); o.y1 = Math.max(o.y1, y1); o.z1 = Math.max(o.z1, z1);
    }
  }
  if (!collide) return obj;
  const i0 = Math.max(0, Math.round(x0 / CELL)), i1 = Math.min(N, Math.round(x1 / CELL));
  const k0 = Math.max(0, Math.round(z0 / CELL)), k1 = Math.min(N, Math.round(z1 / CELL));
  for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) {
    (cells[k * N + i] ||= []).push([y0, y1, obj]);
    if (o) o.cells.add(k * N + i);
  }
  return obj;
}

function mergeList(sp) {
  if (!sp || !sp.length) return null;
  sp = sp.slice().sort((a, b) => a[0] - b[0]);
  const out = [sp[0].slice()];
  for (let j = 1; j < sp.length; j++) {
    const last = out[out.length - 1];
    if (sp[j][0] <= last[1] + 1e-4) last[1] = Math.max(last[1], sp[j][1]);
    else out.push(sp[j].slice());
  }
  return out;
}

function mergeSpans() {
  rawCells.clear();
  for (let c = 0; c < cells.length; c++) {
    const sp = cells[c];
    if (!sp) continue;
    if (sp.some(s => s[2] >= 0)) rawCells.set(c, sp.map(s => s.slice()));
    if (sp.length > 1) cells[c] = mergeList(sp);
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
const _o2 = new THREE.Vector3();
export function raycastWorld(o, d, maxT) {
  // start outside the grid (aircraft): jump to where the ray enters it
  if (o.x < 0 || o.z < 0 || o.x >= SIZE || o.z >= SIZE) {
    const groundT = d.y < 0 ? -o.y / d.y : Infinity;
    let t0 = 0, t1 = maxT;
    for (const [p, v] of [[o.x, d.x], [o.z, d.z]]) {
      if (Math.abs(v) < 1e-9) { if (p < 0 || p >= SIZE) { t0 = Infinity; break; } continue; }
      let a = (0 - p) / v, b = (SIZE - 1e-3 - p) / v;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 === Infinity || t0 > t1 || groundT < t0) return groundT <= maxT ? { t: groundT, normal: new THREE.Vector3(0, 1, 0) } : null;
    const e = t0 + 1e-3;
    const h = raycastWorld(_o2.copy(o).addScaledVector(d, e), d, maxT - e);
    if (h) h.t += e;
    return h;
  }
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
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) break;
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
    if (d.y > 0 && o.y + d.y * tExit > 45) return null;
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
// Height of the land outside the play area (the play area itself is flat at 0).
let hillAmp = 0;
export function terrainY(x, z) {
  if (!hillAmp) return 0;
  const d = Math.hypot(x - SIZE / 2, z - SIZE / 2);
  let k = (d - Math.max(SIZE / 2 + 110, SIZE * 0.72)) / 260;
  if (k <= 0) return 0;
  k = k >= 1 ? 1 : k * k * (3 - 2 * k);
  const n = Math.sin(x * 0.011 + 0.7) * Math.cos(z * 0.013) + 0.5 * Math.sin(x * 0.027 + z * 0.019 + 1.3) + 0.25 * Math.sin(z * 0.051 - x * 0.043);
  return k * hillAmp * Math.max(0.08, 0.6 + 0.4 * n);
}

// Floor under any point: the collision grid inside the map, the hills outside it.
export function floorAt(x, z, r, maxY) {
  if (x > 0 && z > 0 && x < SIZE && z < SIZE) return groundAt(x, z, r, maxY);
  return terrainY(x, z);
}

export let NAV = SIZE;
let walk = new Uint8Array(NAV * NAV);

function navFree(i, k) {
  for (let dk = 0; dk < 2; dk++) for (let di = 0; di < 2; di++) {
    if (blocks(cellSpans(i * 2 + di, k * 2 + dk), 0.05, 1.9)) return 0;
  }
  return 1;
}

function computeNav() {
  for (let k = 0; k < NAV; k++) for (let i = 0; i < NAV; i++) walk[k * NAV + i] = navFree(i, k);
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

let gScore = new Float32Array(NAV * NAV), parent = new Int32Array(NAV * NAV);
let stamp = new Uint32Array(NAV * NAV), closed = new Uint32Array(NAV * NAV);
let curStamp = 0;

function setMapSize(size) {
  if (size === SIZE && cells.length === N * N) return;
  SIZE = size; N = size / CELL; NAV = size;
  cells = new Array(N * N).fill(null);
  const n = NAV * NAV;
  walk = new Uint8Array(n); gScore = new Float32Array(n); parent = new Int32Array(n);
  stamp = new Uint32Array(n); closed = new Uint32Array(n); curStamp = 0;
}
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
  while (heapI.length && iter++ < 60000) {
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
  return { x: SIZE / 2, z: SIZE / 2 };
}

// ---------- materials ----------
// World-space variation (breaks up texture tiling) and a darkening band near the ground,
// injected into the standard material so every surface keeps full PBR lighting.
export function enhance(mat, { macro = 0.2, groundAO = 0, wet = null } = {}) {
  const tex = macroNoise();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: tex };
    if (wet) Object.assign(sh.uniforms, wet.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;${wet ? '\nvarying vec4 vReflPos;\nuniform mat4 uReflMat;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
        ${wet ? 'vReflPos = uReflMat * vec4(vWPos, 1.0);' : ''}`);
    let fs = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uMacro;${wet ? '\nvarying vec4 vReflPos;\nuniform sampler2D tRefl;\nuniform vec4 uWet;\nuniform float uTime;' : ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mN = texture2D(uMacro, vWPos.xz * 0.012 + vec2(vWPos.y * 0.017)).r * 0.6 + texture2D(uMacro, vWPos.zy * 0.047 + vec2(vWPos.x * 0.013)).r * 0.4;
        diffuseColor.rgb *= clamp(1.0 + (mN - 0.5) * ${(macro * 4).toFixed(3)}, 0.0, 2.0);
        ${groundAO ? `diffuseColor.rgb *= mix(${(1 - groundAO).toFixed(3)}, 1.0, smoothstep(0.0, 1.4, vWPos.y));` : ''}
        ${wet ? `float wetM = clamp(uWet.x + (texture2D(uMacro, vWPos.xz * 0.031).r - 0.5) * uWet.y * 3.0, 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - 0.4 * wetM;` : ''}`);
    if (wet) {
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.06, wetM);`)
        .replace('#include <opaque_fragment>', `{
          // rain-wet ground: a planar reflection, rippled by the rain, fading with the puddles
          vec2 rip = vec2(texture2D(uMacro, vWPos.xz * 0.23 + vec2(uTime * 0.07, uTime * 0.043)).r, texture2D(uMacro, vWPos.zx * 0.19 - vec2(uTime * 0.05, uTime * 0.061)).r) - 0.5;
          vec4 rp = vReflPos; rp.xy += rip * 0.045 * uWet.z * rp.w;
          vec3 refl = texture2DProj(tRefl, rp).rgb;
          float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
          outgoingLight += refl * wetM * mix(0.3, 1.0, fres) * uWet.w;
        }
        #include <opaque_fragment>`);
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `enh${macro}_${groundAO}_${wet ? 'w' : ''}`;
  return mat;
}

const MAT_DEFS = {
  plaster: { recipe: 'plaster', ts: 3, normal: 1.2 },
  plaster2: { recipe: 'plaster', args: [0xb8b0a2, 0x958c7c], ts: 3, normal: 1.2 },
  concrete: { recipe: 'concrete', ts: 3, normal: 1.5 },
  brick: { recipe: 'brick', ts: 2.2, normal: 2.5 },
  wall: { recipe: 'blocks', ts: 4, normal: 2 },
  crate: { recipe: 'wood', ts: 1.5, normal: 1.5, rough: 0.85 },
  containerR: { recipe: 'corrugated', args: [0x7b3325], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35, tint: 0x7b3325 },
  containerB: { recipe: 'corrugated', args: [0x2d5870], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35, tint: 0x2d5870 },
  containerG: { recipe: 'corrugated', args: [0x3b6a3a], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35, tint: 0x3b6a3a },
  containerY: { recipe: 'corrugated', args: [0xb08a2a], ts: 2.6, normal: 3, rough: 0.55, metal: 0.35, tint: 0xb08a2a },
  containerW: { recipe: 'corrugated', args: [0x9a9ea0, 0.3], ts: 2.6, normal: 3, rough: 0.5, metal: 0.4, tint: 0x9a9ea0 },
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
  containerO: { recipe: 'corrugated', args: [0xa8541e, 0.35], ts: 2.6, normal: 3, rough: 0.5, metal: 0.35, tint: 0xa8541e },
  containerT: { recipe: 'corrugated', args: [0x2f6a6a, 0.3], ts: 2.6, normal: 3, rough: 0.5, metal: 0.35, tint: 0x2f6a6a },
  containerN: { recipe: 'corrugated', args: [0x243452, 0.3, 0.05], ts: 2.6, normal: 3, rough: 0.5, metal: 0.4, tint: 0x243452 },
  hull: { recipe: 'metal', args: [0x2a2e33], ts: 4, normal: 1, rough: 0.5, metal: 0.5 },
  hullRed: { recipe: 'metal', args: [0x6a2a22], ts: 4, normal: 1, rough: 0.55, metal: 0.4 },
  steel: { recipe: 'diamond', ts: 1.2, normal: 2, rough: 0.4, metal: 0.7 },
  superstructure: { recipe: 'facade', args: [0xd8d6cc, 0x2a3036], ts: 5, normal: 1, rough: 0.6 },
  // every container colour shares this one texture, tinted per box with vertex colours
  container: { recipe: 'corrugated', args: [0xc4c4c4, 0.3, 0.06], ts: 2.6, normal: 3, rough: 0.52, metal: 0.35, vcol: true },
  whitecase: { recipe: 'metal', args: [0xc9ccca], ts: 1.2, normal: 1.2, rough: 0.35, metal: 0.55 },
  bluecrate: { recipe: 'metal', args: [0x1f5f9a], ts: 1, normal: 0.8, rough: 0.5, metal: 0.05 },
};

function makeMaterial(name, over = {}) {
  const d = { ...MAT_DEFS[name], ...over };
  const args = d.args || [];
  const tex = surface(`${d.recipe}:${JSON.stringify(args)}`, R[d.recipe](...args), { seed: d.seed || (name.length * 131 + 7), normal: d.normal ?? 1.5 });
  const m = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughness: d.rough ?? 0.9, metalness: d.metal ?? 0, vertexColors: !!d.vcol,
  });
  m.userData.ts = d.ts;
  const low = name === 'backdrop' || name === 'snowcap' || name === 'roof';
  return enhance(m, { macro: 0.18, groundAO: low ? 0 : 0.28 });
}

const _tc = new THREE.Color();
// which material a box is drawn with (tinted materials share one), and its tint if any
const drawMat = (m) => MAT_DEFS[m]?.tint !== undefined ? 'container' : m;
function boxGeo(b, ts) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const tint = MAT_DEFS[b.mat]?.tint;
  if (tint !== undefined) {
    _tc.set(tint).multiplyScalar(1.6);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _tc.r; col[i * 3 + 1] = _tc.g; col[i * 3 + 2] = _tc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
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
let shadowMat = null;
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
  shadowMat ||= new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, vA * vA * 1.4); }',
  });
  const mesh = new THREE.Mesh(g, shadowMat);
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

// ---------- minimap ----------
// One pixel per collision cell. Broken objects repaint only the patch they covered.
let minimapCanvas = null, mmCtx = null;
export function minimapImage() { return minimapCanvas; }

function paintMinimap(def, i0 = 0, k0 = 0, i1 = N, k1 = N) {
  i0 = Math.max(0, i0); k0 = Math.max(0, k0); i1 = Math.min(N, i1); k1 = Math.min(N, k1);
  const w = i1 - i0, h = k1 - k0;
  if (w <= 0 || h <= 0) return;
  const mm = def.minimap || {};
  const G = mm.ground || [96, 86, 70], RD = mm.road || [70, 70, 68], HI = mm.high || [214, 204, 180], LO = mm.low || [160, 146, 118], OV = mm.over || [70, 62, 52];
  const roads = (def.roads || []).map(r => [r.x0 / CELL, r.z0 / CELL, r.x1 / CELL, r.z1 / CELL]);
  const img = mmCtx.createImageData(w, h), d = img.data;
  for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) {
    const sp = cells[k * N + i];
    let col = G;
    if (sp) {
      const low = sp.find(q => q[0] < 1.9 && q[1] > 0.05);
      col = low ? (low[1] > 2 ? HI : LO) : OV;
    } else for (const r of roads) if (i >= r[0] && i < r[2] && k >= r[1] && k < r[3]) { col = RD; break; }
    const o = ((k - k0) * w + (i - i0)) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  mmCtx.putImageData(img, i0, k0);
}

function buildMinimap(def) {
  minimapCanvas ||= document.createElement('canvas');
  minimapCanvas.width = minimapCanvas.height = N;
  mmCtx = minimapCanvas.getContext('2d');
  paintMinimap(def);
}

// ---------- surface lookup ----------
// Collidable boxes bucketed on an 8 m grid, so a bullet impact looks at a handful of boxes.
const BUCKET = 8;
let boxGrid = new Map(), bigBoxes = [];
function indexBoxes() {
  boxGrid = new Map(); bigBoxes = [];
  for (const b of boxes) {
    if (b.collide === false) continue;
    const i0 = Math.floor(b.x0 / BUCKET), i1 = Math.floor(b.x1 / BUCKET), k0 = Math.floor(b.z0 / BUCKET), k1 = Math.floor(b.z1 / BUCKET);
    if ((i1 - i0 + 1) * (k1 - k0 + 1) > 64) { bigBoxes.push(b); continue; }
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const key = k * 8192 + i;
      let l = boxGrid.get(key);
      if (!l) boxGrid.set(key, l = []);
      l.push(b);
    }
  }
}

// Which surface a bullet hit, for impact particles.
export function materialAt(p, n) {
  const x = p.x - n.x * 0.05, y = p.y - n.y * 0.05, z = p.z - n.z * 0.05;
  const inside = (b) => !b.dead && x >= b.x0 - 0.01 && x <= b.x1 + 0.01 && y >= b.y0 - 0.01 && y <= b.y1 + 0.01 && z >= b.z0 - 0.01 && z <= b.z1 + 0.01;
  const list = boxGrid.get(Math.floor(z / BUCKET) * 8192 + Math.floor(x / BUCKET));
  if (list) for (const b of list) if (inside(b)) return b.mat;
  for (const b of bigBoxes) if (inside(b)) return b.mat;
  return y < 0.05 ? 'ground' : null;
}

// ---------- map loading ----------
export const props = [];
let group = null, waterMat = null, materials = [], matFor = null, kmats = null;
export let mapDef = null;
let reflection = null;
// the rain-wet floor's planar reflection (Shipment), rendered by main before each frame
export const wetFloor = () => reflection;

// Everything is drawn in 64 m chunks: the camera and the sun's shadow camera cull whole
// chunks, chunks past the fog are hidden, and a broken object rebuilds only its chunk.
const CH = 64, FAR_CH = 400;
const chunks = new Map();
let chunkList = [];
function chunkFor(x, z, always = false) {
  const far = x < -60 || z < -60 || x > SIZE + 60 || z > SIZE + 60;
  const s = far ? FAR_CH : CH;
  const cx = Math.floor(x / s), cz = Math.floor(z / s);
  const key = always ? 'always' : `${far ? 'f' : 'n'}${cx},${cz}`;
  let ch = chunks.get(key);
  if (!ch) {
    ch = { far: far || always, x: (cx + 0.5) * s, z: (cz + 0.5) * s, group: new THREE.Group(), stat: new THREE.Group(), near: new THREE.Group(), dyn: new THREE.Group(), dynNear: new THREE.Group(), objs: [], boxes: [], props: [] };
    ch.group.add(ch.stat, ch.near, ch.dyn, ch.dynNear);
    chunks.set(key, ch); chunkList.push(ch); group.add(ch.group);
  }
  return ch;
}

function makeApi() {
  return {
    box: (x0, y0, z0, x1, y1, z1, mat, collide = true, obj = -1) => addBox(x0, y0, z0, x1, y1, z1, mat, collide, obj),
    prop: (type, x, z, o = {}) => {
      const p = { type, x, z, ...o };
      props.push(p);
      if (o.obj >= 0) objects[o.obj].props.push(p);
    },
    spawn: (team, x, z, yaw, fwd = false) => spawns[team].push({ x, z, yaw, fwd }),
    interest: (x, z) => interest.push({ x, z }),
    obj: (kind) => newObject(kind),
    decal: (x, y, z, w, h, ry, idx, o = {}) => decals.push({ x, y, z, w, h, ry, idx, ...o }),
    flag: (id, x, z) => flags.push({ id, x, z }),
    site: (kind, x, z, o = {}) => sites.push({ kind, x, z, ...o }),
  };
}

export function mirrorApi(api) {
  return {
    box: (x0, y0, z0, x1, y1, z1, m, c, o) => api.box(SIZE - x0, y0, SIZE - z0, SIZE - x1, y1, SIZE - z1, m, c, o),
    prop: (type, x, z, o = {}) => api.prop(type, SIZE - x, SIZE - z, { ...o, rot: (o.rot || 0) + Math.PI }),
    spawn: (team, x, z, yaw, fwd) => api.spawn(1 - team, SIZE - x, SIZE - z, yaw + Math.PI, fwd),
    interest: (x, z) => api.interest(SIZE - x, SIZE - z),
    obj: (kind) => api.obj(kind),
    decal: (x, y, z, w, h, ry, idx, o) => api.decal(SIZE - x, y, SIZE - z, w, h, ry + Math.PI, idx, o),
    flag: (id, x, z) => api.flag(id, SIZE - x, SIZE - z),
    site: (kind, x, z, o) => api.site(kind, SIZE - x, SIZE - z, o),
  };
}

// the same builder moved by (dx, dz): lets the 80 m town layouts sit in the middle of the big map
export function shiftApi(api, dx, dz = dx) {
  return {
    box: (x0, y0, z0, x1, y1, z1, m, c, o) => api.box(x0 + dx, y0, z0 + dz, x1 + dx, y1, z1 + dz, m, c, o),
    prop: (type, x, z, o = {}) => api.prop(type, x + dx, z + dz, o),
    spawn: (team, x, z, yaw, fwd) => api.spawn(team, x + dx, z + dz, yaw, fwd),
    interest: (x, z) => api.interest(x + dx, z + dz),
    obj: (kind) => api.obj(kind),
    decal: (x, y, z, w, h, ry, idx, o) => api.decal(x + dx, y, z + dz, w, h, ry, idx, o),
    flag: (id, x, z) => api.flag(id, x + dx, z + dz),
    site: (kind, x, z, o) => api.site(kind, x + dx, z + dz, o),
  };
}

// ---------- decals: stencilled logos from one texture atlas ----------
function buildDecals(list) {
  const pos = [], nor = [], uv = [], col = [];
  const rows = 16, c = new THREE.Color();
  for (const d of list) {
    const rx = Math.cos(d.ry), rz = -Math.sin(d.ry), nx = Math.sin(d.ry), nz = Math.cos(d.ry);
    const hw = d.w / 2, hh = d.h / 2, v0 = 1 - (d.idx % rows + 1) / rows, v1 = 1 - (d.idx % rows) / rows;
    const P = (a, b) => [d.x + rx * a + nx * 0.02, d.y + b, d.z + rz * a + nz * 0.02];
    const q = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)], t = [[0, v0], [1, v0], [1, v1], [0, v1]];
    c.set(d.color ?? 0xe8e6de);
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...q[i]); nor.push(nx, 0, nz); uv.push(...t[i]); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.MeshStandardMaterial({ map: logoAtlas(), vertexColors: true, transparent: true, depthWrite: false, roughness: 0.7, metalness: 0.1,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  materials.push(m);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------- light beams: fake volumetric cones under floodlights ----------
const BEAM_VERT = `uniform float uLen; varying vec3 vN, vV; varying float vT;
void main() {
  vT = clamp(-position.y / uLen, 0.0, 1.0);
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = `uniform vec3 uColor; uniform float uTime, uInt; varying vec3 vN, vV; varying float vT;
void main() {
  float edge = pow(abs(dot(vN, vV)), 2.0);
  float fall = pow(1.0 - vT, 1.8) * smoothstep(0.0, 0.05, vT);
  float dust = 0.8 + 0.2 * sin(vT * 23.0 - uTime * 1.3) * sin(vT * 7.0 + uTime * 0.7);
  gl_FragColor = vec4(uColor * edge * fall * dust * uInt, 1.0);
}`;
const beamU = { uTime: { value: 0 } };
// p.beam: { pitch (down from level), len, angle (half-cone), color, intensity, power, h (mount height) }
function buildBeam(p) {
  const b = p.beam, len = b.len || 26, r = Math.tan(b.angle || 0.35) * len;
  const geo = new THREE.CylinderGeometry(0.25, r, len, 28, 1, true).translate(0, -len / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uLen: { value: len }, uColor: { value: new THREE.Color(b.color ?? 0xdde6ff) }, uInt: { value: b.intensity ?? 0.22 }, uTime: beamU.uTime },
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  materials.push(m);
  const mesh = new THREE.Mesh(geo, m);
  const rot = p.rot || 0, pitch = b.pitch ?? 0.6, fx = -Math.sin(rot), fz = -Math.cos(rot);
  mesh.position.set(p.x + fx * 0.3, (p.y || 0) + (b.h ?? p.h ?? 14), p.z + fz * 0.3);
  // the cone hangs along -y; tip it to aim forward and down
  const dir = new THREE.Vector3(fx * Math.cos(pitch), -Math.sin(pitch), fz * Math.cos(pitch)).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  mesh.renderOrder = 3;
  mesh.userData.beam = { dir, len };
  return mesh;
}

export function loadMap(scene, def) {
  if (group) {
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isLight) o.dispose?.(); });
    for (const m of materials) m.dispose();
  }
  reflection?.dispose(); reflection = null;
  setMapSize(def.size || 160);
  cells.fill(null); boxes.length = 0; props.length = 0; objects.length = 0; decals.length = 0; flags.length = 0; sites.length = 0;
  spawns[0].length = 0; spawns[1].length = 0; interest.length = 0;
  mapDef = def;
  hillAmp = def.hills || 0;

  const api = makeApi();
  def.layout(api, mirrorApi(api));
  const per = def.perimeter || {};
  const pm = per.mat || 'wall', ph = per.h || 6;
  const E = SIZE, E1 = SIZE - 1;
  addBox(0, 0, 0, E, ph, 1, pm); addBox(0, 0, E1, E, ph, E, pm);
  if (per.quay) {
    addBox(0, 0, 1, 1, 1.1, E1, 'concrete'); addBox(E1, 0, 1, E, 1.1, E1, 'concrete');
    addBox(0, 1.1, 1, 1, 6, E1, 'invis'); addBox(E1, 1.1, 1, E, 6, E1, 'invis');
  } else { addBox(0, 0, 1, 1, ph, E1, pm); addBox(E1, 0, 1, E, ph, E1, pm); }
  if (ph < 6) { addBox(0, ph, 0, E, 6, 1, 'invis'); addBox(0, ph, E1, E, 6, E, 'invis'); if (!per.quay) { addBox(0, ph, 1, 1, 6, E1, 'invis'); addBox(E1, ph, 1, E, 6, E1, 'invis'); } }
  if (def.backdrop) def.backdrop(api, mulberry(def.seed || 7));

  // snow settles on every exposed top (and falls with whatever it sits on)
  if (def.snowCaps) {
    for (const b of boxes.slice()) {
      if (b.mat === 'invis' || b.mat === 'backdrop' || b.y1 < 0.3) continue;
      const cap = { x0: b.x0 - 0.02, y0: b.y1, z0: b.z0 - 0.02, x1: b.x1 + 0.02, y1: b.y1 + 0.07, z1: b.z1 + 0.02, mat: 'snowcap', obj: b.obj };
      boxes.push(cap);
      if (b.obj >= 0) objects[b.obj].boxes.push(cap);
    }
  }
  mergeSpans();
  computeNav();
  indexBoxes();
  buildMinimap(def);

  group = new THREE.Group();
  chunks.clear(); chunkList = [];
  materials = [];
  const mats = {};
  matFor = (name) => {
    if (!mats[name]) { mats[name] = makeMaterial(name, def.mats?.[name]); materials.push(mats[name]); }
    return mats[name];
  };
  kmats = kitMaterials(enhance);
  materials.push(...Object.values(kmats));

  // sort every static box, prop and breakable object into its chunk
  for (const b of boxes) {
    if (b.mat === 'invis' || b.obj >= 0) continue;
    const big = b.x1 - b.x0 > CH * 1.5 || b.z1 - b.z0 > CH * 1.5;
    chunkFor((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, big).boxes.push(b);
  }
  props.forEach((p, i) => { p.seed = (def.seed || 7) * 1000 + i; if (!(p.obj >= 0)) chunkFor(p.x, p.z).props.push(p); });
  for (const o of objects) {
    if (o.x0 === Infinity) for (const p of o.props) { o.x0 = Math.min(o.x0, p.x - 0.4); o.x1 = Math.max(o.x1, p.x + 0.4); o.z0 = Math.min(o.z0, p.z - 0.4); o.z1 = Math.max(o.z1, p.z + 0.4); o.y0 = 0; o.y1 = 1; }
    const ch = chunkFor((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
    ch.objs.push(o); o.chunk = ch;
  }
  for (const ch of chunkList) { buildStatic(ch); buildChunk(ch); }
  if (decals.length) group.add(buildDecals(decals));

  // ground
  const gd = def.ground || { recipe: 'dirt', ts: 8 };
  const gt = surface(`${gd.recipe}:${JSON.stringify(gd.args || [])}`, R[gd.recipe](...(gd.args || [])), { size: 1024, seed: 5, normal: gd.normal ?? 1.5 });
  // one big sheet out to the horizon: flat under the play area, rolling hills beyond it
  const gw = gd.w || 4200, gl = gd.l || 4200;
  const seg = hillAmp ? 200 : 1;
  const groundGeo = new THREE.PlaneGeometry(gw, gl, gd.w ? 1 : seg, gd.l && !gd.w ? 1 : seg);
  groundGeo.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? gl : gw) / gd.ts; });
  if (hillAmp) {
    const pa = groundGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) pa.setZ(i, terrainY(SIZE / 2 + pa.getX(i), SIZE / 2 - pa.getY(i)));
    groundGeo.computeVertexNormals();
  }
  if (def.wet) reflection = new PlanarReflection(def.wet);
  const floors = [];
  const groundMat = enhance(new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normalMap, roughness: gd.rough ?? 0.97, metalness: gd.metal ?? 0 }), { macro: 0.3, wet: reflection });
  materials.push(groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(SIZE / 2 + (gd.dx || 0), 0, SIZE / 2 + (gd.dz || 0));
  ground.receiveShadow = true;
  group.add(ground); floors.push(ground);

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
    const m = enhance(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, transparent: !!r.alpha, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { macro: 0.25, wet: reflection });
    materials.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.set(-Math.PI / 2, 0, along ? 0 : Math.PI / 2);
    mesh.position.set((r.x0 + r.x1) / 2, ry, (r.z0 + r.z1) / 2);
    ry += 0.002;
    mesh.receiveShadow = true;
    group.add(mesh); floors.push(mesh);
  }
  for (const r of def.patches || []) {
    const t = surface('asphalt:[]', R.asphalt(), { seed: 9, normal: 1.2 });
    const m = enhance(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { macro: 0.25, wet: reflection });
    materials.push(m);
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
    g.attributes.uv.array.forEach((v, i, a) => { a[i] = v * (i % 2 ? r.z1 - r.z0 : r.x1 - r.x0) / 8; });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((r.x0 + r.x1) / 2, ry + 0.002, (r.z0 + r.z1) / 2);
    mesh.receiveShadow = true;
    group.add(mesh); floors.push(mesh);
  }

  // lamp light pools on the ground (only drawn when the map is dark enough to need them)
  if (def.look?.pools) {
    const pm2 = new THREE.MeshBasicMaterial({ map: poolTex(), color: def.look.poolColor || 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, opacity: def.look.pools });
    materials.push(pm2);
    for (const p of props) {
      if (p.type !== 'lamp' && p.type !== 'flood') continue;
      const off = p.type === 'lamp' ? 1.5 : 3;
      const x = p.x - Math.sin(p.rot || 0) * off, z = p.z - Math.cos(p.rot || 0) * off;
      if (x < -60 || z < -60 || x > SIZE + 60 || z > SIZE + 60) continue;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(p.pool || 9, p.pool || 9), pm2);
      q.rotation.x = -Math.PI / 2; q.position.set(x, 0.03, z);
      chunkFor(x, z).stat.add(q);
    }
  }

  // floodlight beams, and a few real spot lights for the brightest ones
  let spots = def.look?.spots || 0;
  for (const p of props) {
    if (!p.beam) continue;
    const beam = buildBeam(p);
    group.add(beam);
    if (spots-- > 0) {
      const b = p.beam, L = new THREE.SpotLight(b.color ?? 0xdde6ff, b.power ?? 700, 0, Math.min(1.2, (b.angle || 0.35) * 1.5), 0.55, 2);
      L.position.copy(beam.position);
      L.target.position.copy(beam.position).addScaledVector(beam.userData.beam.dir, 20);
      group.add(L, L.target);
    }
  }

  // water
  waterMat = null;
  if (def.water) {
    const wt = surface('waves:[]', R.waves(), { size: 512, seed: 3, normal: 3 });
    wt.normalMap.repeat.set(80, 80);
    waterMat = new THREE.MeshStandardMaterial({ color: def.water.color || 0x1a3a44, roughness: def.water.rough ?? 0.08, metalness: 0.1, normalMap: wt.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.3 });
    materials.push(waterMat);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(def.water.size || 1400, def.water.size || 1400), waterMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(SIZE / 2, def.water.y ?? -1.2, SIZE / 2);
    w.receiveShadow = true;
    group.add(w);
  }
  if (reflection) reflection.hide = floors;
  scene.add(group);
  return def;
}

// a chunk's permanent part: its static boxes by material, their contact shadows, and its props
function buildStatic(ch) {
  const byMat = {};
  for (const b of ch.boxes) (byMat[drawMat(b.mat)] ||= []).push(boxGeo(b, matFor(drawMat(b.mat)).userData.ts));
  for (const [m, geos] of Object.entries(byMat)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), matFor(m));
    mesh.castShadow = m !== 'backdrop';
    mesh.receiveShadow = true;
    ch.stat.add(mesh);
    for (const g of geos) g.dispose();
  }
  if (!ch.far) {
    const cs = ch.boxes.filter(b => b.y0 <= 0.01 && b.collide !== false && b.mat !== 'backdrop' && b.x1 - b.x0 < 60 && b.z1 - b.z0 < 60);
    if (cs.length) ch.near.add(contactShadows(cs));
  }
  // small props (and the contact shadows) are only drawn within a couple of hundred metres
  if (ch.props.length) {
    const kit = new Kit();
    for (const p of ch.props) buildProp(kit, p.type, p, p.seed);
    for (const m of kit.build(kmats)) (ch.far ? ch.stat : ch.near).add(m);
  }
  ch.boxes = []; ch.props = [];
}

// a chunk's breakable part, rebuilt whenever something in it breaks
function buildChunk(ch) {
  for (const m of [...ch.dyn.children, ...ch.dynNear.children]) m.geometry.dispose();
  ch.dyn.clear(); ch.dynNear.clear();
  if (!ch.objs.length) return;
  const byMat = {}, kit = new Kit();
  for (const o of ch.objs) {
    if (!o.gone) for (const b of o.boxes) if (b.mat !== 'invis') (byMat[drawMat(b.mat)] ||= []).push(boxGeo(b, matFor(drawMat(b.mat)).userData.ts));
    if (o.alive || o.spec.wreck) for (const p of o.props) buildProp(kit, p.type, p, p.seed);
  }
  for (const [m, geos] of Object.entries(byMat)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), matFor(m));
    mesh.castShadow = true; mesh.receiveShadow = true;
    ch.dyn.add(mesh);
    for (const g of geos) g.dispose();
  }
  for (const m of kit.build(kmats)) ch.dynNear.add(m);
}

// Breaks an object: frees its cells (a wreck keeps them), updates nav and redraws its chunk.
// Returns the object, or null if it was already broken.
export function breakObject(id) {
  const o = objects[id];
  if (!o || !o.alive) return null;
  o.alive = false;
  if (o.spec.wreck) for (const p of o.props) p.burnt = true;
  else {
    o.gone = true;
    for (const b of o.boxes) b.dead = true;
    for (const c of o.cells) cells[c] = mergeList((rawCells.get(c) || []).filter(s => s[2] < 0 || !objects[s[2]].gone));
    const i0 = Math.max(0, Math.floor(o.x0) - 1), i1 = Math.min(NAV - 1, Math.floor(o.x1) + 1);
    const k0 = Math.max(0, Math.floor(o.z0) - 1), k1 = Math.min(NAV - 1, Math.floor(o.z1) + 1);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) walk[k * NAV + i] = navFree(i, k);
    paintMinimap(mapDef, Math.floor(o.x0 / CELL) - 1, Math.floor(o.z0 / CELL) - 1, Math.ceil(o.x1 / CELL) + 1, Math.ceil(o.z1 / CELL) + 1);
  }
  if (o.chunk) buildChunk(o.chunk);
  return o;
}

export const brokenIds = () => objects.filter(o => !o.alive).map(o => o.id);

// the breakable object a ray hit, from the hit point and surface normal
export function objectAt(p, n) {
  const x = p.x - n.x * 0.05, y = p.y - n.y * 0.05, z = p.z - n.z * 0.05;
  const raw = rawCells.get(Math.floor(z / CELL) * N + Math.floor(x / CELL));
  if (!raw) return null;
  for (const s of raw) if (s[2] >= 0 && y >= s[0] - 0.02 && y <= s[1] + 0.02 && objects[s[2]].alive) return objects[s[2]];
  return null;
}

// live objects within r of p, with the distance to each one's box
export function objectsNear(p, r) {
  const out = [];
  for (const o of objects) {
    if (!o.alive) continue;
    const dx = Math.max(o.x0 - p.x, 0, p.x - o.x1), dy = Math.max(o.y0 - p.y, 0, p.y - o.y1), dz = Math.max(o.z0 - p.z, 0, p.z - o.z1);
    const d = Math.hypot(dx, dy, dz);
    if (d < r) out.push({ o, d });
  }
  return out;
}

// live objects whose spans a circle touches between heights lo and hi
export function objectsTouching(x, z, r, lo, hi) {
  const out = new Set();
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const k0 = Math.floor((z - r) / CELL), k1 = Math.floor((z + r) / CELL);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    if (i < 0 || k < 0 || i >= N || k >= N) continue;
    const raw = rawCells.get(k * N + i);
    if (raw) for (const s of raw) if (s[2] >= 0 && s[0] < hi && s[1] > lo && objects[s[2]].alive) out.add(objects[s[2]]);
  }
  return out;
}

// cam: the camera position; far: how far the fog lets you see. Chunks beyond it are hidden.
export function updateWorld(dt, cam, far = Infinity) {
  beamU.uTime.value += dt;
  if (cam) for (const ch of chunkList) {
    if (ch.far) continue;
    const d = Math.hypot(ch.x - cam.x, ch.z - cam.z) - CH * 0.72;
    ch.group.visible = d < far;
    ch.near.visible = ch.dynNear.visible = d < Math.min(far, 230 + Math.max(0, cam.y - 20) * 2);
  }
  if (waterMat) {
    const o = waterMat.normalMap.offset;
    o.x = (o.x + dt * 0.004) % 1; o.y = (o.y + dt * 0.0025) % 1;
  }
}
