// World generation (pure JS, deterministic; runs in the browser or in Node for debug maps).
//
// 1. Base terrain: rolling fbm hills rising to the north, Mt. Haruna's ridged cone, the coast
//    falling to the seabed, and flat pads for the city, festival, circuit, paddies and lake.
// 2. Roads: centripetal Catmull-Rom splines sampled every 2 m. Endpoints snap onto more
//    important roads. Elevation follows the terrain, smoothed and grade-limited per road
//    class, pinned at junctions, lifted onto viaducts where marked.
// 3. Carving: every road cuts and fills the terrain inside its corridor with sloped banks.
// 4. Surface map: grass, dirt, sand, rock, forest floor, per 2 m cell.
import { simplex2, fbm, ridged, mulberry } from './noise.js';
import { SIZE, HALF, coastZ, PLACES, ROADS, ROAD_TYPES } from './layout.js';

export const SURF = { ASPHALT: 0, KERB: 1, GRASS: 2, DIRT: 3, SAND: 4, ROCK: 5, FOREST: 6, GRAVEL: 7, SNOW: 8 };
export const GRIP = [1.0, 0.95, 0.62, 0.72, 0.52, 0.8, 0.6, 0.68, 0.42];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function generate({ N = 2049, seed = 7, onProgress = () => {} } = {}) {
  const cell = SIZE / (N - 1);
  const H = new Float32Array(N * N);
  const n1 = simplex2(seed), n2 = simplex2(seed + 11), n3 = simplex2(seed + 23);
  const P = PLACES;

  // ------------------------------------------------------------ base terrain
  const base = (x, z) => {
    const hills = fbm(n1, x / 1100, z / 1100, 5);
    let h = 34 + 40 * hills + 16 * fbm(n2, x / 300, z / 300, 3);
    h += 110 * smoothstep(-150, -1500, z) * (0.6 + 0.4 * fbm(n3, x / 700, z / 700, 3));
    // Mt. Haruna
    const m = P.mountain, dm = Math.hypot(x - m.x, z - m.z);
    const cone = Math.exp(-(dm * dm) / (2 * m.r * m.r * 0.36));
    if (cone > 0.002) h += m.h * cone * (0.75 + 0.35 * ridged(n2, x / 520, z / 520, 4));
    // east hills behind the city
    h += 60 * smoothstep(1500, 1950, x) * smoothstep(1300, 600, z);
    // lake basin
    const L = P.lake, dl = Math.hypot(x - L.x, z - L.z);
    const lk = smoothstep(L.r + 260, L.r - 20, dl);
    h = mix(h, L.water + 6, lk * 0.85);
    if (dl < L.r) h = Math.min(h, L.water - 14 * (1 - (dl / L.r) ** 2) - 1.5);
    // flat pads
    const pad = (cx, cz, hx, hz, target, fall) => {
      const dx = Math.max(Math.abs(x - cx) - hx, 0), dz = Math.max(Math.abs(z - cz) - hz, 0);
      const w = 1 - smoothstep(0, fall, Math.hypot(dx, dz));
      h = mix(h, target, w);
    };
    const C = P.city;
    pad((C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, (C.x1 - C.x0) / 2, (C.z1 - C.z0) / 2, C.h, 220);
    pad(P.circuit.x, P.circuit.z, P.circuit.w / 2, P.circuit.d / 2, P.circuit.h, 260);
    pad(P.paddies.x, P.paddies.z, P.paddies.w / 2, P.paddies.d / 2, P.paddies.h, 300);
    pad(P.festival.x, P.festival.z, P.festival.r, P.festival.r * 0.7, P.festival.h, 160);
    // shrine hill
    const S = P.shrine, ds = Math.hypot(x - S.x, z - S.z);
    h = mix(h, Math.max(h, S.h), smoothstep(S.r + 140, S.r * 0.4, ds));
    // coast: land falls to beaches, then the seabed
    const cz = coastZ(x);
    const land = smoothstep(cz + 40, cz - 260, z);
    h = mix(-2 - 26 * smoothstep(cz, cz + 500, z) + 3 * n3(x / 90, z / 90), h, land);
    // cliffs west of the festival: steeper drop
    const cliff = smoothstep(-500, -700, x) + smoothstep(700, 900, x);
    h += 14 * cliff * smoothstep(cz - 30, cz - 120, z) * smoothstep(cz + 60, cz - 20, z);
    return h;
  };
  // the smooth base is evaluated on a grid 2x coarser and upsampled; a fine octave adds detail
  const Nc = (N - 1) / 2 + 1, cc = cell * 2, Hc = new Float32Array(Nc * Nc);
  for (let j = 0; j < Nc; j++) {
    const z = -HALF + j * cc;
    for (let i = 0; i < Nc; i++) Hc[j * Nc + i] = base(-HALF + i * cc, z);
    if ((j & 63) === 0) onProgress(0.35 * (j / Nc));
  }
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * cell, jc = j >> 1, fj = (j & 1) * 0.5;
    for (let i = 0; i < N; i++) {
      const ic = i >> 1, fi = (i & 1) * 0.5;
      const i1 = Math.min(ic + 1, Nc - 1), j1 = Math.min(jc + 1, Nc - 1);
      const h = (Hc[jc * Nc + ic] * (1 - fi) + Hc[jc * Nc + i1] * fi) * (1 - fj) + (Hc[j1 * Nc + ic] * (1 - fi) + Hc[j1 * Nc + i1] * fi) * fj;
      const x = -HALF + i * cell;
      H[j * N + i] = h + (h > 1 ? 0.9 * n3(x / 23, z / 23) : 0);
    }
  }
  const sampleH = (arr, x, z) => {
    const fx = clamp((x + HALF) / cell, 0, N - 1.001), fz = clamp((z + HALF) / cell, 0, N - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const a = arr[j * N + i], b = arr[j * N + i + 1], c = arr[(j + 1) * N + i], d = arr[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  onProgress(0.4);

  // ------------------------------------------------------------ roads
  const roads = [];
  const order = [...ROADS].sort((a, b) => ROAD_TYPES[b.type].prio - ROAD_TYPES[a.type].prio);
  for (const def of order) {
    const T = ROAD_TYPES[def.type];
    const loop = def.loop || T.loop;
    let pts = def.pts.map((p) => [p[0], p[1]]);
    // snap open ends onto existing roads
    const pins = [];
    if (!loop) for (const end of [0, pts.length - 1]) {
      const hit = nearestRoadPoint(roads, pts[end][0], pts[end][1], 70);
      if (hit) { pts[end] = [hit.x, hit.z]; pins.push({ end, y: hit.y, road: hit.road, idx: hit.i }); }
    }
    const S = spline(pts, loop, 2);
    const n = S.length;
    const xs = new Float32Array(n), zs = new Float32Array(n), ys = new Float32Array(n), hdg = new Float32Array(n), cum = new Float32Array(n);
    let dist = 0;
    for (let i = 0; i < n; i++) {
      xs[i] = S[i][0]; zs[i] = S[i][1];
      if (i > 0) dist += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      cum[i] = dist;
    }
    for (let i = 0; i < n; i++) {
      const a = loop ? (i - 1 + n) % n : Math.max(0, i - 1), b = loop ? (i + 1) % n : Math.min(n - 1, i + 1);
      hdg[i] = Math.atan2(xs[b] - xs[a], zs[b] - zs[a]);
    }
    // elevation: terrain, kept above the sea, smoothed, lifted where elevated
    const elev = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let y = Math.max(sampleH(H, xs[i], zs[i]), 3.5);
      elev[i] = 0;
      for (const [x0, x1] of def.elevated ?? []) {
        const w = smoothstep(x0 - 120, x0 + 40, xs[i]) * (1 - smoothstep(x1 - 40, x1 + 120, xs[i]));
        if (w > 0) { elev[i] = w; y = mix(y, y + 11, w); }
      }
      if (def.id === 'lake') y = Math.max(y, P.lake.water + 3);
      ys[i] = y;
    }
    const win = Math.max(1, Math.round(T.smooth / 2));
    smoothProfile(ys, win, loop, 3);
    // pins at junctions and grade limit
    const fixed = new Map();
    for (const p of pins) fixed.set(p.end === 0 ? 0 : n - 1, p.y);
    gradeLimit(ys, cum, T.grade, loop, fixed);
    for (const [i, y] of fixed) ys[i] = y;
    smoothProfile(ys, 3, loop, 2);
    for (const [i, y] of fixed) ys[i] = y;
    gradeLimit(ys, cum, T.grade * 1.05, loop, fixed);
    // banking on the circuit and expressway curves
    const bank = new Float32Array(n);
    if (def.type === 'circuit' || def.type === 'expressway') {
      for (let i = 0; i < n; i++) {
        const a = loop ? (i - 3 + n) % n : Math.max(0, i - 3), b = loop ? (i + 3) % n : Math.min(n - 1, i + 3);
        let dh = hdg[b] - hdg[a];
        while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        bank[i] = clamp(-dh * 0.9, -0.06, 0.06);
      }
    }
    roads.push({ id: def.id, name: def.name, type: def.type, T, loop, n, xs, zs, ys, hdg, cum, bank, elev, length: dist, pins });
  }
  onProgress(0.55);

  // ------------------------------------------------------------ carve roads into the terrain
  const H0 = H.slice();
  const best = new Float32Array(N * N).fill(1e9), target = new Float32Array(N * N), wgt = new Float32Array(N * N);
  for (const r of roads) {
    const T = r.T, edge = T.hw + T.shoulder;
    const segs = r.loop ? r.n : r.n - 1;
    for (let s = 0; s < segs; s++) {
      const a = s, b = (s + 1) % r.n;
      const ax = r.xs[a], az = r.zs[a], bx = r.xs[b], bz = r.zs[b];
      const ya = r.ys[a], yb = r.ys[b];
      if (r.elev[a] > 0.6 && r.elev[b] > 0.6) continue; // viaduct: leave the ground alone
      const dh = Math.abs(ya - sampleH(H0, ax, az));
      const bankW = clamp(dh * 1.7, 6, 45);
      const R = edge + bankW;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R + HALF) / cell)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + R + HALF) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R + HALF) / cell)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + R + HALF) / cell));
      const ex = bx - ax, ez = bz - az, ee = ex * ex + ez * ez || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * cell, z = -HALF + j * cell;
        const t = clamp(((x - ax) * ex + (z - az) * ez) / ee, 0, 1);
        const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
        if (d > R) continue;
        const k = j * N + i;
        const w = d <= edge ? 1 : 1 - smoothstep(0, bankW, d - edge);
        if (w > wgt[k] + 1e-4 || (Math.abs(w - wgt[k]) < 1e-4 && d < best[k])) {
          wgt[k] = w; best[k] = d;
          target[k] = mix(ya, yb, t) - (d <= T.hw ? 0.12 : 0.05);
        }
      }
    }
  }
  for (let k = 0; k < N * N; k++) if (wgt[k] > 0) H[k] = mix(H[k], target[k], wgt[k]);
  onProgress(0.75);

  // ------------------------------------------------------------ surfaces
  const surf = new Uint8Array(N * N).fill(SURF.GRASS);
  const rnd = mulberry(seed + 5);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i;
    const x = -HALF + i * cell, z = -HALF + j * cell;
    const h = H[k];
    const sx = (H[k + 1] - H[k - 1]) / (2 * cell), sz = (H[k + N] - H[k - N]) / (2 * cell);
    const slope = Math.hypot(sx, sz);
    let s = SURF.GRASS;
    const beach = h < 3.2 && z > coastZ(x) - 160;
    if (beach) s = SURF.SAND;
    else if (slope > 0.85) s = SURF.ROCK;
    else if (h > 150 && fbm(n3, x / 160, z / 160, 3) > -0.1) s = SURF.FOREST;
    else if (slope > 0.55) s = SURF.DIRT;
    if (wgt[k] > 0.2 && wgt[k] < 0.999 && best[k] < 30) s = slope > 0.6 ? SURF.ROCK : s === SURF.SAND ? SURF.SAND : SURF.GRASS;
    surf[k] = s;
  }
  // dirt roads stamp their surface
  for (const r of roads) {
    if (r.T.surface !== SURF.DIRT) continue;
    for (let s = 0; s < r.n; s++) {
      const ci = Math.round((r.xs[s] + HALF) / cell), cj = Math.round((r.zs[s] + HALF) / cell);
      const R = Math.ceil((r.T.hw + 1) / cell);
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        surf[j * N + i] = SURF.DIRT;
      }
    }
  }
  void rnd;
  onProgress(0.85);
  return { N, cell, H, H0, surf, roads, sampleH: (x, z) => sampleH(H, x, z) };
}

// centripetal Catmull-Rom through points, resampled every `step` metres
export function spline(pts, loop, step) {
  const P = loop ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const dense = [];
  const segs = loop ? pts.length : pts.length - 1;
  for (let s = 0; s < segs; s++) {
    const p0 = P[s], p1 = P[s + 1], p2 = P[s + 2], p3 = P[s + 3];
    const d = (a, b) => Math.max(Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5), 1e-3);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.ceil(len / 0.5));
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      dense.push(L(B1, B2, t1, t2));
    }
  }
  if (!loop) dense.push(pts[pts.length - 1]);
  // resample by arc length
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let from = a;
    while (acc + seg >= step) {
      const t = (step - acc) / seg;
      const p = [from[0] + (b[0] - from[0]) * t, from[1] + (b[1] - from[1]) * t];
      out.push(p);
      seg = Math.hypot(b[0] - p[0], b[1] - p[1]);
      from = p; acc = 0;
    }
    acc += seg;
  }
  if (!loop) { const last = pts[pts.length - 1], o = out[out.length - 1]; if (Math.hypot(last[0] - o[0], last[1] - o[1]) > 0.5) out.push(last); }
  return out;
}

function smoothProfile(y, win, loop, passes) {
  const n = y.length, tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -win; k <= win; k++) {
        let j = i + k;
        if (loop) j = (j + n) % n; else if (j < 0 || j >= n) continue;
        s += y[j]; c++;
      }
      tmp[i] = s / c;
    }
    y.set(tmp);
  }
}

function gradeLimit(y, cum, g, loop, fixed) {
  const n = y.length;
  for (const [i, v] of fixed) y[i] = v;
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i < n; i++) { const ds = cum[i] - cum[i - 1]; if (!fixed.has(i)) y[i] = clamp(y[i], y[i - 1] - g * ds, y[i - 1] + g * ds); }
    for (let i = n - 2; i >= 0; i--) { const ds = cum[i + 1] - cum[i]; if (!fixed.has(i)) y[i] = clamp(y[i], y[i + 1] - g * ds, y[i + 1] + g * ds); }
  }
}

function nearestRoadPoint(roads, x, z, maxD) {
  let best = null, bd = maxD;
  for (const r of roads) {
    for (let i = 0; i < r.n; i += 1) {
      const d = Math.hypot(r.xs[i] - x, r.zs[i] - z);
      if (d < bd) { bd = d; best = { x: r.xs[i], z: r.zs[i], y: r.ys[i], road: r.id, i }; }
    }
  }
  return best;
}
