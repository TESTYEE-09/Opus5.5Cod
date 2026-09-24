// The map: a 0.5 m collision grid where every cell holds solid vertical spans.
// Bodies, bullets, grenades and bot navigation all read the same grid.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  boxes.push({ x0, y0, z0, x1, y1, z1, mat });
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

// ---------- layout ----------
function building(B, x0, z0, x1, z1, h, open, mat) {
  const t = 0.5;
  const piece = (side, a, b, y0, y1) => {
    if (b - a <= 0) return;
    if (side === 's') B(a, y0, z0, b, y1, z0 + t, mat);
    else if (side === 'n') B(a, y0, z1 - t, b, y1, z1, mat);
    else if (side === 'w') B(x0, y0, a, x0 + t, y1, b, mat);
    else B(x1 - t, y0, a, x1, y1, b, mat);
  };
  for (const side of ['s', 'n', 'w', 'e']) {
    const horiz = side === 's' || side === 'n';
    let cur = horiz ? x0 : z0 + t;
    const end = horiz ? x1 : z1 - t;
    for (const o of open.filter(o => o.s === side).sort((p, q) => p.a - q.a)) {
      piece(side, cur, o.a, 0, h);
      if (o.t === 'door') piece(side, o.a, o.a + o.w, 2.5, h);
      else { piece(side, o.a, o.a + o.w, 0, 1.0); piece(side, o.a, o.a + o.w, 2.2, h); }
      cur = o.a + o.w;
    }
    piece(side, cur, end, 0, h);
  }
  B(x0, h, z0, x1, h + 0.3, z1, 'roof');
}

const crate = (B, x, z, stack) => {
  B(x, 0, z, x + 1.5, 1.3, z + 1.5, 'crate');
  if (stack) B(x, 1.3, z, x + 1.5, 2.6, z + 1.5, 'crate');
};
const car = (B, x0, z0, x1, z1) => {
  B(x0, 0, z0, x1, 1.1, z1, 'car');
  const ns = z1 - z0 > x1 - x0;
  if (ns) B(x0 + 0.5, 1.1, z0 + 1, x1 - 0.5, 1.7, z1 - 1.5, 'car');
  else B(x0 + 1, 1.1, z0 + 0.5, x1 - 1.5, 1.7, z1 - 0.5, 'car');
};

// South half; mirrored through the centre for the north half.
function half(B, team) {
  // Building A: two-room house
  building(B, 6, 12, 22, 26, 4, [
    { s: 's', a: 18, w: 2, t: 'door' }, { s: 's', a: 9, w: 2, t: 'win' },
    { s: 'n', a: 16, w: 2, t: 'door' }, { s: 'n', a: 8, w: 2, t: 'win' },
    { s: 'e', a: 17, w: 2, t: 'door' }, { s: 'e', a: 21.5, w: 2, t: 'win' },
    { s: 'w', a: 15, w: 2, t: 'win' },
  ], 'plaster');
  B(14, 0, 12.5, 14.5, 4, 18, 'plaster'); B(14, 0, 20, 14.5, 4, 25.5, 'plaster'); B(14, 2.5, 18, 14.5, 4, 20, 'plaster');
  crate(B, 7, 23, false); crate(B, 19.5, 13, true);

  // Building B: warehouse
  building(B, 52, 10, 72, 24, 5, [
    { s: 'w', a: 15, w: 4, t: 'door' }, { s: 'n', a: 60, w: 2, t: 'door' }, { s: 's', a: 64, w: 2, t: 'door' },
    { s: 'n', a: 54, w: 2, t: 'win' }, { s: 'n', a: 67, w: 2, t: 'win' }, { s: 'e', a: 16, w: 2, t: 'win' },
  ], 'concrete');
  B(55, 0, 13, 61, 2.6, 15.5, team ? 'containerB' : 'containerR');
  crate(B, 64, 18, true); crate(B, 65.5, 18, false); crate(B, 68, 13, false);

  // Tower house with stairs to a roof position
  building(B, 26, 24, 32, 30, 3.6, [
    { s: 'n', a: 28, w: 2, t: 'door' }, { s: 'w', a: 26, w: 2, t: 'win' }, { s: 's', a: 28, w: 2, t: 'win' },
  ], 'brick');
  for (let i = 0; i < 13; i++) B(32, 0, 23 + 0.5 * i, 33.5, 0.3 * (i + 1), 23.5 + 0.5 * i, 'concrete');
  B(26, 3.9, 24, 32, 4.9, 24.5, 'brick'); B(26, 3.9, 29.5, 32, 4.9, 30, 'brick');
  B(26, 3.9, 24.5, 26.5, 4.9, 29.5, 'brick'); B(31.5, 3.9, 24.5, 32, 4.9, 27, 'brick');

  // Courtyard walls, containers, cover
  B(2, 0, 30, 10, 2.2, 30.5, 'brick'); B(13, 0, 30, 22, 2.2, 30.5, 'brick');
  B(1, 0, 33, 3.5, 2.6, 39, team ? 'containerR' : 'containerB');
  B(33, 0, 20, 33.5, 1.0, 24, 'sandbag'); B(46.5, 0, 26, 47, 1.0, 30, 'sandbag');
  B(33, 0, 37.5, 34, 1.0, 42.5, 'sandbag');
  B(22, 0, 38.5, 31, 2.8, 41.5, 'bus');
  B(22, 0, 32, 26, 1.1, 32.5, 'concrete');
  B(36.5, 0, 30, 39, 1.0, 30.5, 'concrete');
  B(16, 0, 9, 20, 1.0, 9.5, 'sandbag'); B(56, 0, 6, 60, 1.0, 6.5, 'sandbag');
  car(B, 37, 16, 39, 20.5); car(B, 41, 27, 43, 31.5); car(B, 10, 41, 14.5, 43);
  crate(B, 28, 12, true); crate(B, 29.5, 12, false); crate(B, 46, 12, false); crate(B, 46, 13.5, true);
  crate(B, 24, 34, false); crate(B, 16, 34, false); crate(B, 62, 31, true); crate(B, 63.5, 31, false);
  crate(B, 70, 33, false); crate(B, 49, 33, false); crate(B, 10, 5, false); crate(B, 66, 4, false); crate(B, 24, 8, false);
}

function layout() {
  const P = addBox;
  const M = (x0, y0, z0, x1, y1, z1, m, c) => addBox(SIZE - x0, y0, SIZE - z0, SIZE - x1, y1, SIZE - z1, m, c);
  P(0, 0, 0, 80, 6, 1, 'wall'); P(0, 0, 79, 80, 6, 80, 'wall');
  P(0, 0, 1, 1, 6, 79, 'wall'); P(79, 0, 1, 80, 6, 79, 'wall');
  P(38, 0, 38, 42, 1.2, 42, 'concrete'); P(39.5, 1.2, 39.5, 40.5, 5.5, 40.5, 'concrete');
  half(P, 0); half(M, 1);

  const sp = [[8, 4], [18, 4], [28, 4], [40, 4], [50, 4], [62, 4], [72, 4], [31, 8], [48, 8], [4, 10], [76, 10]];
  for (const [x, z] of sp) { spawns[0].push({ x, z, yaw: Math.PI }); spawns[1].push({ x: SIZE - x, z: SIZE - z, yaw: 0 }); }
  const pts = [[40, 34], [18, 20], [62, 17], [29, 27], [35, 26], [20, 36], [6, 36], [50, 30], [40, 22], [60, 36], [28, 45], [12, 46], [8, 20], [70, 28]];
  for (const [x, z] of pts) { interest.push({ x, z }); interest.push({ x: SIZE - x, z: SIZE - z }); }
}

// Backdrop skyline outside the wall, from a fixed seed so it never changes.
function skyline() {
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 70; n++) {
    const side = n % 4, along = -30 + rnd() * 140, dist = 6 + rnd() * 30;
    const w = 6 + rnd() * 12, d = 6 + rnd() * 12, h = 8 + rnd() * 22;
    let x, z;
    if (side === 0) { x = along; z = -dist - d; }
    else if (side === 1) { x = along; z = SIZE + dist; }
    else if (side === 2) { x = -dist - w; z = along; }
    else { x = SIZE + dist; z = along; }
    addBox(x, 0, z, x + w, h, z + d, 'backdrop', false);
  }
}

// ---------- textures & meshes ----------
function tex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}

function speckle(g, s, base, n, spread, maxR = 2) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * spread;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    const r = Math.random() * maxR + 0.5;
    g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}

function makeMaterials() {
  const std = (map, ts, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...extra });
    m.userData.ts = ts;
    return m;
  };
  const plaster = tex(256, (g, s) => {
    speckle(g, s, '#c7b28c', 5000, 0.12, 3);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.08})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 40, 0, 7); g.fill(); }
  });
  const concrete = tex(256, (g, s) => {
    speckle(g, s, '#9e9a90', 6000, 0.14, 2);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    for (let y = 0; y <= s; y += s / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  });
  const brick = tex(256, (g, s) => {
    g.fillStyle = '#b5a48a'; g.fillRect(0, 0, s, s);
    const rows = 8, bw = s / 4;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
      const x = c * bw + (r % 2) * bw / 2, y = r * s / rows;
      const l = 38 + Math.random() * 14;
      g.fillStyle = `hsl(${14 + Math.random() * 10},42%,${l}%)`;
      g.fillRect(x + 2, y + 2, bw - 4, s / rows - 4);
    }
  });
  const wall = tex(256, (g, s) => {
    speckle(g, s, '#8d867a', 5000, 0.12, 2);
    g.strokeStyle = 'rgba(40,35,30,0.35)'; g.lineWidth = 3;
    for (let y = 0; y <= s; y += s / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    for (let r = 0; r < 4; r++) for (let x = (r % 2) * s / 4; x < s; x += s / 2) { g.beginPath(); g.moveTo(x, r * s / 4); g.lineTo(x, (r + 1) * s / 4); g.stroke(); }
  });
  const crateT = tex(256, (g, s) => {
    g.fillStyle = '#8a6a3c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`; g.fillRect(0, i * s / 8, s, 2); }
    g.fillStyle = '#6a4f2a';
    g.fillRect(0, 0, s, 22); g.fillRect(0, s - 22, s, 22); g.fillRect(0, 0, 22, s); g.fillRect(s - 22, 0, 22, s);
    g.save(); g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); g.fillRect(-s * 0.7, -11, s * 1.4, 22); g.restore();
  });
  const container = (col) => tex(256, (g, s) => {
    g.fillStyle = col; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 5, s); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 8, 0, 3, s); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,60,20,${Math.random() * 0.25})`; g.fillRect(Math.random() * s, Math.random() * s, 4 + Math.random() * 20, 3 + Math.random() * 12); }
  });
  const sandbag = tex(128, (g, s) => {
    g.fillStyle = '#7d6d4c'; g.fillRect(0, 0, s, s);
    for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
      const x = c * s / 2 + (r % 2) * s / 4, y = r * s / 4;
      g.fillStyle = `hsl(42,${24 + Math.random() * 8}%,${44 + Math.random() * 6}%)`;
      g.beginPath(); g.ellipse(x + s / 4, y + s / 8, s / 4 - 2, s / 8 - 2, 0, 0, 7); g.fill();
    }
  });
  const metal = tex(128, (g, s) => {
    speckle(g, s, '#6a625a', 1500, 0.2, 3);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(120,55,20,${Math.random() * 0.35})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 10, 0, 7); g.fill(); }
  });
  const bus = tex(256, (g, s) => {
    speckle(g, s, '#8a6a30', 2000, 0.2, 3);
    g.fillStyle = '#1d1c1a';
    for (let x = 12; x < s; x += 64) g.fillRect(x, s * 0.12, 48, s * 0.3);
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(20,15,10,${Math.random() * 0.4})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 3 + Math.random() * 18, 0, 7); g.fill(); }
  });
  const roof = tex(128, (g, s) => speckle(g, s, '#5a4f45', 1500, 0.2, 2));
  const backdrop = tex(256, (g, s) => {
    g.fillStyle = '#a39a8a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#4a4540';
    for (let y = 16; y < s; y += 64) for (let x = 16; x < s; x += 64) g.fillRect(x, y, 30, 36);
  });
  return {
    plaster: std(plaster, 3), concrete: std(concrete, 3), brick: std(brick, 2.5), wall: std(wall, 4),
    crate: std(crateT, 1.5), containerR: std(container('#7b3325'), 3), containerB: std(container('#2d5870'), 3),
    sandbag: std(sandbag, 1.2), car: std(metal, 2, { roughness: 0.75, metalness: 0.1 }), bus: std(bus, 3),
    roof: std(roof, 3), backdrop: std(backdrop, 6, { fog: true }),
  };
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

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(450, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sun;
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 top = vec3(0.36,0.52,0.72), hor = vec3(0.86,0.8,0.68);
        vec3 c = mix(hor, top, pow(max(h,0.0), 0.55));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += vec3(1.0,0.85,0.6) * (pow(s, 4000.0) * 1.6 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.position.set(SIZE / 2, 0, SIZE / 2);
  sky.renderOrder = -1;
  scene.add(sky);
}

let minimapCanvas = null;
export function minimapImage() { return minimapCanvas; }

function buildMinimap() {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
    const sp = cells[k * N + i];
    const road = (i >= 72 && i < 88) || (k >= 72 && k < 88);
    let col = road ? [70, 70, 68] : [96, 86, 70];
    if (sp) {
      const low = sp.find(s => s[0] < 1.9 && s[1] > 0.05);
      if (low) col = low[1] > 2 ? [214, 204, 180] : [160, 146, 118];
      else col = [70, 62, 52];
    }
    const o = (k * N + i) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  minimapCanvas = c;
}

export function buildWorld(scene) {
  layout();
  skyline();
  mergeSpans();
  computeNav();
  buildMinimap();

  const mats = makeMaterials();
  const byMat = {};
  for (const b of boxes) (byMat[b.mat] ||= []).push(boxGeo(b, mats[b.mat].userData.ts));
  for (const [m, geos] of Object.entries(byMat)) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats[m]);
    mesh.castShadow = m !== 'backdrop';
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const dirt = tex(256, (g, s) => {
    speckle(g, s, '#9c8665', 9000, 0.16, 3);
    for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(70,55,35,${Math.random() * 0.1})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 30, 0, 7); g.fill(); }
  }, 30);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(SIZE / 2, 0, SIZE / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = () => tex(256, (g, s) => {
    speckle(g, s, '#4b4946', 8000, 0.18, 2);
    g.fillStyle = '#c9b46a';
    for (let y = 0; y < s; y += 64) g.fillRect(s / 2 - 3, y + 8, 6, 36);
    g.fillStyle = 'rgba(220,220,210,0.5)';
    g.fillRect(10, 0, 4, s); g.fillRect(s - 14, 0, 4, s);
  });
  const roadMat = (rep) => { const t = asphalt(); t.repeat.set(1, rep); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }); };
  const ns = new THREE.Mesh(new THREE.PlaneGeometry(8, 78), roadMat(10));
  ns.rotation.x = -Math.PI / 2; ns.position.set(40, 0.01, 40); ns.receiveShadow = true; scene.add(ns);
  const ew = new THREE.Mesh(new THREE.PlaneGeometry(8, 78), roadMat(10));
  ew.rotation.set(-Math.PI / 2, 0, Math.PI / 2); ew.position.set(40, 0.012, 40); ew.receiveShadow = true; scene.add(ew);

  buildSky(scene);
}
