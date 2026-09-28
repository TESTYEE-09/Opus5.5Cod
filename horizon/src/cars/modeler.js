// Parametric car body modeler.
//
// A body is a loft through cross-sections ("stations") exactly like a blueprint. Each station
// is a half-section of keypoints from the floor centre out and up to the top centre. Every
// keypoint is tracked along z with a monotone cubic that is then lightly smoothed, so surfaces
// flow without kinks. A section is rounded by corner cutting (keypoints marked sharp stay
// crisp) and resampled by arc length into a fixed number of points, with the sharp points at
// fixed columns so creases run cleanly along the car. The grid is triangulated directly, so
// the surface is exact and the normals analytic, with creases split.
//
// Wheel arches are cut by lifting the lower keypoints to the arch circle: the side skin then
// ends on the arch, with a wheel-well ceiling and inner wall behind it. Intakes, vents, lamp
// recesses and bulges are displacements along the normal inside polygons drawn in one of four
// projections (side z-y, front/rear x-y, top z-x), the same way the paint decals are drawn.
//
// Output is plain arrays (positions, normals, material ids, indices) so the same code runs in
// the offline build and, if needed, in the browser.
import { curve } from './sdf.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ tracks
// keypoint j as functions of z, tabulated and smoothed with a small gaussian
function tracks(loft) {
  const st = [...loft.stations].sort((a, b) => a.z - b.z);
  const M = st[0].p.length;
  const z0 = st[0].z, z1 = st[st.length - 1].z;
  const N = 1600, step = (z1 - z0) / N;
  const sig = loft.blur ?? 0.02; // metres
  const ker = [];
  const kr = Math.ceil((sig * 2.5) / step);
  for (let k = -kr; k <= kr; k++) ker.push(Math.exp(-0.5 * ((k * step) / sig) ** 2));
  const tabs = [];
  for (let j = 0; j < M; j++) {
    const fx = curve(st.map((s) => [s.z, s.p[j][0]])), fy = curve(st.map((s) => [s.z, s.p[j][1]]));
    const tx = new Float64Array(N + 1), ty = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) { tx[i] = fx(z0 + i * step); ty[i] = fy(z0 + i * step); }
    const sx = new Float64Array(N + 1), sy = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      let ax = 0, ay = 0, w = 0;
      for (let k = -kr; k <= kr; k++) {
        const ii = clamp(i + k, 0, N), kw = ker[k + kr];
        ax += tx[ii] * kw; ay += ty[ii] * kw; w += kw;
      }
      // keep the ends pinned so the nose and tail close exactly
      const edge = Math.min(i, N - i) / (kr + 1);
      const b = edge >= 1 ? 1 : edge;
      sx[i] = tx[i] + (ax / w - tx[i]) * b; sy[i] = ty[i] + (ay / w - ty[i]) * b;
    }
    tabs.push([sx, sy]);
  }
  const at = (z) => {
    const u = clamp((z - z0) / step, 0, N), k = Math.min(u | 0, N - 1), f = u - k;
    const out = [];
    for (let j = 0; j < M; j++) out.push([tabs[j][0][k] + (tabs[j][0][k + 1] - tabs[j][0][k]) * f, tabs[j][1][k] + (tabs[j][1][k + 1] - tabs[j][1][k]) * f]);
    return out;
  };
  return { at, z0, z1, M };
}

// ------------------------------------------------------------------ sections
// Corner-cut a half section with mirrored neighbours at both ends so the curve crosses the
// centreline square; keep sharp keypoints exact; return the refined points and which are sharp.
function refine(P, sharp, iters, closedTop, closedBottom) {
  // helper points mirrored across x = 0 make the curve cross the centreline square
  let pts = P.map((p) => [p[0], p[1]]);
  let sh = P.map((_, i) => sharp.has(i));
  if (closedBottom) { pts.unshift([-P[1][0], P[1][1]]); sh.unshift(false); }
  if (closedTop) { pts.push([-P[P.length - 2][0], P[P.length - 2][1]]); sh.push(false); }
  for (let it = 0; it < iters; it++) {
    const n = pts.length, out = [pts[0]], osh = [false];
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (i > 0) {
        if (sh[i]) { out.push(a); osh.push(true); } else { out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]); osh.push(false); }
      }
      if (!(sh[i + 1] && i + 1 < n - 1)) { out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); osh.push(false); }
    }
    out.push(pts[n - 1]); osh.push(false);
    pts = out; sh = osh;
  }
  const clipStart = (arr, flags) => {
    let i = 0;
    while (i < arr.length - 2 && arr[i + 1][0] <= 0) i++;
    const a = arr[i], b = arr[i + 1];
    const t = Math.abs(b[0] - a[0]) < 1e-12 ? 0 : clamp((0 - a[0]) / (b[0] - a[0]), 0, 1);
    return [[[0, a[1] + (b[1] - a[1]) * t], ...arr.slice(i + 1)], [false, ...flags.slice(i + 1)]];
  };
  if (closedBottom) [pts, sh] = clipStart(pts, sh);
  if (closedTop) {
    const [cp, cs] = clipStart([...pts].reverse(), [...sh].reverse());
    pts = cp.reverse(); sh = cs.reverse();
  }
  return { pts, sh };
}

// split a refined curve at its sharp points into runs; resample each run by arc length
function runs(ref) {
  const idx = [0];
  ref.sh.forEach((s, i) => { if (s && i > 0 && i < ref.pts.length - 1) idx.push(i); });
  idx.push(ref.pts.length - 1);
  const out = [];
  for (let k = 0; k < idx.length - 1; k++) out.push(ref.pts.slice(idx[k], idx[k + 1] + 1));
  return out;
}
function polyLen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
function resample(p, n) {
  const L = polyLen(p), out = [];
  if (L < 1e-9) { for (let i = 0; i <= n; i++) out.push([p[0][0], p[0][1]]); return out; }
  let seg = 0, acc = 0;
  for (let i = 0; i <= n; i++) {
    const target = (L * i) / n;
    while (seg < p.length - 2 && acc + Math.hypot(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) < target) {
      acc += Math.hypot(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]); seg++;
    }
    const sl = Math.hypot(p[seg + 1][0] - p[seg][0], p[seg + 1][1] - p[seg][1]) || 1;
    const t = clamp((target - acc) / sl, 0, 1);
    out.push([p[seg][0] + (p[seg + 1][0] - p[seg][0]) * t, p[seg][1] + (p[seg + 1][1] - p[seg][1]) * t]);
  }
  return out;
}

// ------------------------------------------------------------------ polygon sdf (for features)
export function sdPoly(u, v, P, closed = true) {
  const n = P.length;
  if (n === 1) return Math.hypot(u - P[0][0], v - P[0][1]);
  let d = Infinity, s = 1;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1], wx = u - a[0], wy = v - a[1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
    d = Math.min(d, (wx - ex * t) ** 2 + (wy - ey * t) ** 2);
    if (closed) {
      const c1 = v >= a[1], c2 = v < b[1], c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
  }
  return closed ? s * Math.sqrt(d) : Math.sqrt(d);
}

// projection coordinates, gate value and facing for a point/normal (x is |x|)
function project(p, x, y, z, nx, ny, nz) {
  if (p === 'side') return [z, y, x, Math.abs(nx)];
  if (p === 'front') return [x, y, z, nz];
  if (p === 'rear') return [x, y, z, -nz];
  return [z, x, y, ny];
}

// ------------------------------------------------------------------ surface builder
// loft: { stations, sharp, blur, smooth, closedTop, closedBottom, cols: [counts per run] }
function buildLoft(loft, opts, out) {
  const T = tracks(loft);
  const sharp = new Set(loft.sharp ?? []);
  const iters = loft.smooth ?? 3;
  const closedTop = loft.closedTop ?? true, closedBottom = loft.closedBottom ?? true;
  const dz = opts.dz ?? 0.012;
  // z samples: uniform plus extra resolution at the ends
  const zs = [];
  const L = T.z1 - T.z0;
  const nz = Math.ceil(L / dz);
  for (let i = 0; i <= nz; i++) {
    const t = i / nz;
    // ease the ends so the nose and tail get more rows
    const e = t < 0.08 ? 0.08 * Math.pow(t / 0.08, 1.6) : t > 0.92 ? 1 - 0.08 * Math.pow((1 - t) / 0.08, 1.6) : t;
    zs.push(T.z0 + e * L);
  }
  const archs = opts.arches ?? [];
  const sectionAt = (z) => {
    const P = T.at(z);
    if (loft.arch && archs.length) {
      // lift the lower keypoints onto the arch circle
      const A = loft.arch; // { floorEdge, wellTop, last } keypoint indices
      for (const a of archs) {
        const d = z - a.z;
        if (Math.abs(d) >= a.r) continue;
        const yA = a.y + Math.sqrt(a.r * a.r - d * d);
        let lipX = 0;
        for (let j = A.wellTop + 1; j <= A.last; j++) lipX = Math.max(lipX, P[j][0]);
        P[A.floorEdge][0] = Math.min(P[A.floorEdge][0], a.xin);
        P[A.wellTop] = [Math.min(a.xin, lipX - 0.02), Math.max(P[A.wellTop][1], yA)];
        for (let j = A.wellTop + 1; j <= A.last; j++) if (P[j][1] < yA) P[j] = [lipX - (j - A.wellTop - 1) * 0.0004, yA + (j - A.wellTop) * 0.0006];
      }
    }
    if (loft.attach) {
      // pin keypoint 0 of this loft onto a keypoint of another (the greenhouse sits on the crest line)
      const q = loft.attach.tracks.at(z)[loft.attach.k];
      P[0] = [q[0], q[1]];
    }
    const ref = refine(P, sharp, iters, closedTop, closedBottom);
    return runs(ref);
  };
  // column counts per run come from the widest station
  let cols = loft.cols;
  if (!cols) {
    const mid = sectionAt((T.z0 + T.z1) / 2);
    const target = opts.dv ?? 0.012;
    cols = mid.map((r) => Math.max(2, Math.round(polyLen(r) / target)));
  }
  const nRuns = cols.length;
  // grid rows
  const rows = zs.map((z) => {
    const r = sectionAt(z);
    const row = [];
    for (let k = 0; k < nRuns; k++) {
      const pts = resample(r[Math.min(k, r.length - 1)] ?? r[r.length - 1], cols[k]);
      row.push(pts.map(([x, y]) => [x, y, z]));
    }
    return row;
  });
  return { rows, cols, zs, tracks: T };
}

// triangulate rows (each row = runs of points) for one side, mirrored when sgn = -1
function emitGrid(g, sgn, out, mat, flip = false) {
  const { rows, cols } = g;
  const nR = rows.length;
  for (let k = 0; k < cols.length; k++) {
    const nc = cols[k] + 1;
    const base = out.pos.length / 3;
    for (let i = 0; i < nR; i++) for (let j = 0; j < nc; j++) {
      const p = rows[i][k][j];
      out.pos.push(p[0] * sgn, p[1], p[2]);
      out.mat.push(mat);
    }
    for (let i = 0; i < nR - 1; i++) for (let j = 0; j < nc - 1; j++) {
      const a = base + i * nc + j, b = a + 1, c = a + nc, d = c + 1;
      const f = (sgn > 0) !== flip;
      if (f) out.idx.push(a, b, c, b, d, c); else out.idx.push(a, c, b, b, c, d);
    }
    out.runs.push({ base, nR, nc, sgn });
  }
}

// normals from the grid (per run, so creases stay split). Rows where the section has collapsed
// onto the centreline (nose tip, tail) borrow the next row's normal with the sideways part removed.
function gridNormals(out) {
  const P = out.pos, N = new Float32Array(P.length);
  for (const r of out.runs) {
    const { base, nR, nc, sgn } = r;
    const at = (i, j) => base + clamp(i, 0, nR - 1) * nc + clamp(j, 0, nc - 1);
    const d = (a, b) => [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const collapsed = (i) => { for (let j = 0; j < nc; j++) if (Math.abs(P[at(i, j) * 3]) > 2e-4) return false; return true; };
    for (let i = 0; i < nR; i++) for (let j = 0; j < nc; j++) {
      const v = at(i, j);
      const du = d(at(i - 1, j), at(i + 1, j));
      let dv = d(at(i, j - 1), at(i, j + 1));
      if (Math.hypot(...dv) < 1e-7) dv = d(at(i + (i < nR / 2 ? 1 : -1), j - 1), at(i + (i < nR / 2 ? 1 : -1), j + 1));
      let nx = dv[1] * du[2] - dv[2] * du[1], ny = dv[2] * du[0] - dv[0] * du[2], nz = dv[0] * du[1] - dv[1] * du[0];
      if (sgn < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l;
    }
    for (const [i, k] of [[0, 1], [nR - 1, nR - 2]]) {
      if (!collapsed(i)) continue;
      for (let j = 0; j < nc; j++) {
        const v = at(i, j), w = at(k, j);
        let x = 0, y = N[w * 3 + 1], z = N[w * 3 + 2];
        // push the tip normal further along the car axis
        z += (i === 0 ? -1 : 1) * 0.6;
        const l = Math.hypot(x, y, z) || 1;
        N[v * 3] = x / l; N[v * 3 + 1] = y / l; N[v * 3 + 2] = z / l;
      }
    }
  }
  return N;
}

function displace(out, N, features) {
  if (!features?.length) return;
  const P = out.pos;
  const nv = P.length / 3;
  const d = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = Math.abs(P[v * 3]), y = P[v * 3 + 1], z = P[v * 3 + 2];
    const nx = Math.abs(N[v * 3]), ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    let best = 0, mat = -1;
    for (const f of features) {
      const [u, w, g, face] = project(f.p, x, y, z, nx, ny, nz);
      if (f.g && (g < f.g[0] || g > f.g[1])) continue;
      if (face < (f.face ?? 0.2)) continue;
      const s = sdPoly(u, w, f.pts) - (f.r ?? 0);
      if (s > 0) continue;
      const t = smoothstep(0, f.soft ?? 0.012, -s) * smoothstep(f.face ?? 0.2, (f.face ?? 0.2) + 0.15, face);
      const dd = f.depth * t;
      if (Math.abs(dd) > Math.abs(best)) best = dd;
      if (f.mat !== undefined && t > 0.5) mat = f.mat;
    }
    d[v] = best;
    if (mat >= 0) out.mat[v] = mat;
  }
  for (let v = 0; v < nv; v++) {
    if (!d[v]) continue;
    P[v * 3] -= N[v * 3] * d[v]; P[v * 3 + 1] -= N[v * 3 + 1] * d[v]; P[v * 3 + 2] -= N[v * 3 + 2] * d[v];
  }
}

// Build a whole body: shape = { lower, cabin?, arches, features, parts? }
export function buildBody(shape, opts = {}) {
  const out = { pos: [], mat: [], idx: [], runs: [] };
  const arches = shape.arches ?? [];
  const lower = buildLoft(shape.lower, { ...opts, arches }, out);
  emitGrid(lower, 1, out, 0); emitGrid(lower, -1, out, 0);
  let N = gridNormals(out);
  displace(out, N, shape.features);
  N = gridNormals(out);
  const body = { positions: new Float32Array(out.pos), normals: N, mats: new Uint8Array(out.mat), indices: new Uint32Array(out.idx) };
  let cabin = null;
  if (shape.cabin) {
    const o2 = { pos: [], mat: [], idx: [], runs: [] };
    const cb = buildLoft({ closedBottom: false, ...shape.cabin, attach: shape.cabin.attachTo !== undefined ? { tracks: lower.tracks, k: shape.cabin.attachTo } : null }, opts, o2);
    emitGrid(cb, 1, o2, 0); emitGrid(cb, -1, o2, 0);
    let N2 = gridNormals(o2);
    displace(o2, N2, shape.cabinFeatures);
    N2 = gridNormals(o2);
    cabin = { positions: new Float32Array(o2.pos), normals: N2, mats: new Uint8Array(o2.mat), indices: new Uint32Array(o2.idx) };
  }
  return { body, cabin };
}

// merge vertices that share a position and normal (the grid duplicates seams)
export function weld(m, eps = 1e-5) {
  const map = new Map(), P = m.positions, N = m.normals, n = P.length / 3;
  const remap = new Uint32Array(n), pos = [], nrm = [], mat = [];
  const q = (v) => Math.round(v / eps);
  for (let i = 0; i < n; i++) {
    const key = `${q(P[i * 3])},${q(P[i * 3 + 1])},${q(P[i * 3 + 2])},${Math.round(N[i * 3] * 50)},${Math.round(N[i * 3 + 1] * 50)},${Math.round(N[i * 3 + 2] * 50)}`;
    let k = map.get(key);
    if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); mat.push(m.mats[i]); }
    remap[i] = k;
  }
  const idx = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = remap[m.indices[t]], b = remap[m.indices[t + 1]], c = remap[m.indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), mats: new Uint8Array(mat), indices: new Uint32Array(idx) };
}
