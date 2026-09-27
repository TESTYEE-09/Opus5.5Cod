// Signed-distance kit for procedural car bodies.
//
// A body is a tree of closures (x, y, z) => distance. The car is mirror-symmetric, so every
// node receives x >= 0. Leaves also write the id of the surface material they belong to into
// K.m, and the boolean ops pass on the id of whichever operand forms the surface, so each
// vertex of the final mesh knows whether it is paint, black trim, carbon, chrome and so on.
//
// Distances from the lofted sections are only approximately metric (the section is a
// normalised superellipse), which is all the mesher and the smooth blends need.

export const MAT = { PAINT: 0, TRIM: 1, CARBON: 2, CHROME: 3, GLOSS: 4, DARK: 5, PAINT2: 6, GRILLE: 7 };

export const K = { m: 0 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// axis-aligned bounds let the ops skip parts that cannot affect a point
const withBB = (f, min, max) => { f.bb = [min[0], min[1], min[2], max[0], max[1], max[2]]; return f; };
export function bbDist(bb, x, y, z) {
  const dx = Math.max(bb[0] - x, x - bb[3], 0), dy = Math.max(bb[1] - y, y - bb[4], 0), dz = Math.max(bb[2] - z, z - bb[5], 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
const mergeBB = (fs) => {
  if (fs.some((f) => !f.bb)) return null;
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const f of fs) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], f.bb[i]); b[i + 3] = Math.max(b[i + 3], f.bb[i + 3]); }
  return b;
};
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// Natural cubic spline (C2, may overshoot) through [t, v] pairs, tabulated; clamps outside.
export function spline(pts) {
  if (typeof pts === 'number') { const c = pts; return () => c; }
  const P = [...pts].sort((a, b) => a[0] - b[0]);
  const n = P.length;
  if (n < 3) return curve(pts);
  const X = P.map((p) => p[0]), Y = P.map((p) => p[1]);
  const h = [], al = [0], l = [1], mu = [0], zz = [0], c = new Array(n).fill(0), b = [], d = [];
  for (let i = 0; i < n - 1; i++) h.push(X[i + 1] - X[i]);
  for (let i = 1; i < n - 1; i++) al.push((3 / h[i]) * (Y[i + 1] - Y[i]) - (3 / h[i - 1]) * (Y[i] - Y[i - 1]));
  for (let i = 1; i < n - 1; i++) { l.push(2 * (X[i + 1] - X[i - 1]) - h[i - 1] * mu[i - 1]); mu.push(h[i] / l[i]); zz.push((al[i] - h[i - 1] * zz[i - 1]) / l[i]); }
  for (let j = n - 2; j >= 0; j--) { c[j] = j === 0 ? 0 : zz[j] - mu[j] * c[j + 1]; b[j] = (Y[j + 1] - Y[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3; d[j] = (c[j + 1] - c[j]) / (3 * h[j]); }
  c[0] = 0; b[0] = (Y[1] - Y[0]) / h[0] - (h[0] * (c[1] + 2 * c[0])) / 3; d[0] = (c[1] - c[0]) / (3 * h[0]);
  const x0 = X[0], x1 = X[n - 1], N = 2048, step = (x1 - x0) / N, tab = new Float64Array(N + 1);
  let seg = 0;
  for (let k = 0; k <= N; k++) {
    const x = x0 + k * step;
    while (seg < n - 2 && x > X[seg + 1]) seg++;
    const t = x - X[seg];
    tab[k] = Y[seg] + b[seg] * t + c[seg] * t * t + d[seg] * t * t * t;
  }
  const inv = 1 / step;
  const f = (x) => {
    if (x <= x0) return tab[0];
    if (x >= x1) return tab[N];
    const u = (x - x0) * inv, k = u | 0, fr = u - k;
    return tab[k] + (tab[k + 1] - tab[k]) * fr;
  };
  f.lo = x0; f.hi = x1;
  return f;
}

// Monotone cubic (Fritsch-Carlson) through [t, v] pairs, tabulated for speed; clamps outside.
export function curve(pts) {
  if (typeof pts === 'number') { const c = pts; return () => c; }
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) { const c = ys[0]; return () => c; }
  // sort by t ascending
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const X = idx.map((i) => xs[i]), Y = idx.map((i) => ys[i]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((Y[i + 1] - Y[i]) / Math.max(X[i + 1] - X[i], 1e-9));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const x0 = X[0], x1 = X[n - 1], N = 1024, step = (x1 - x0) / N, tab = new Float64Array(N + 1);
  let seg = 0;
  for (let k = 0; k <= N; k++) {
    const x = x0 + k * step;
    while (seg < n - 2 && x > X[seg + 1]) seg++;
    const h = X[seg + 1] - X[seg], t = h > 0 ? clamp((x - X[seg]) / h, 0, 1) : 0;
    const t2 = t * t, t3 = t2 * t;
    tab[k] = (2 * t3 - 3 * t2 + 1) * Y[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * Y[seg + 1] + (t3 - t2) * h * m[seg + 1];
  }
  const inv = 1 / step;
  const f = (x) => {
    if (x <= x0) return tab[0];
    if (x >= x1) return tab[N];
    const u = (x - x0) * inv, k = u | 0, fr = u - k;
    return tab[k] + (tab[k + 1] - tab[k]) * fr;
  };
  f.lo = x0; f.hi = x1;
  return f;
}

// ---------------------------------------------------------------- lofted superellipse body
// Profiles are functions of z (forward). W: half-width at the shoulder, S: shoulder height,
// T: top height on the centreline, Tf: crest height over the fenders (optional; the top
// blends from T at the centre to Tf at crestX of the half-width), B: bottom height.
// nT/nB: superellipse exponents above/below the shoulder (2 = round, 6+ = boxy).
// tumble/tuck: how much the width shrinks toward the top/bottom of the section.
export function loft(o) {
  const W = curve(o.W), S = curve(o.S), T = curve(o.T), B = curve(o.B);
  const Tf = o.Tf ? curve(o.Tf) : null;
  const nT = curve(o.nT ?? 3), nB = curve(o.nB ?? 5);
  const tumble = curve(o.tumble ?? 0.1), tuck = curve(o.tuck ?? 0.1);
  const crestX = curve(o.crestX ?? 0.72);
  const z0 = W.lo, z1 = W.hi, mat = o.mat ?? MAT.PAINT;
  const vals = (c, a) => (typeof c === 'number' ? [c] : c.map((p) => p[1]));
  const wMax = Math.max(...vals(o.W)), yMin = Math.min(...vals(o.B)), yMax = Math.max(...vals(o.T), ...(o.Tf ? vals(o.Tf) : [0]));
  return withBB((x, y, z) => {
    K.m = mat;
    const ez = Math.max(z0 - z, z - z1);
    const w = W(z);
    if (w < 1e-3 || ez > 0) return Math.max(ez, 0) + x + 0.002;
    const s = S(z);
    let Y, n, h, we;
    if (y >= s) {
      let t = T(z);
      if (Tf) { const cx = crestX(z); t += (Tf(z) - t) * smooth(x / (w * cx)); }
      h = Math.max(t - s, 1e-3); Y = (y - s) / h; n = nT(z);
      const yy = Y < 1 ? Y : 1;
      we = w * (1 - tumble(z) * yy * yy);
    } else {
      h = Math.max(s - B(z), 1e-3); Y = (s - y) / h; n = nB(z);
      const yy = Y < 1 ? Y : 1;
      we = w * (1 - tuck(z) * yy * yy);
    }
    const X = x / we;
    const F = Math.pow(Math.pow(X, n) + Math.pow(Y, n), 1 / n);
    return Math.max((F - 1) * Math.min(we, h), ez);
  }, [0, yMin, z0], [wMax, yMax, z1]);
}

// ---------------------------------------------------------------- keypoint loft
// The body is lofted through cross-sections ("stations") like a blueprint: each station is a
// half-section of M keypoints from the floor centre (x = 0) out and up to the top centre
// (x = 0). Keypoint j is interpolated along z through all stations with a monotone cubic, the
// section is mirrored into a closed outline, and corner-cutting rounds it except at keypoints
// listed in `sharp`, which stay crisp character lines. z-slices are cached, since the mesher
// sweeps x and y for each z.
export function kloft(o) {
  const st = [...o.stations].sort((a, b) => a.z - b.z);
  const M = st[0].p.length;
  const X = [], Y = [];
  const interp = o.interp === 'monotone' ? curve : spline;
  for (let j = 0; j < M; j++) {
    // x uses the monotone fit near the nose and tail where the section collapses to zero width
    const fx = o.xInterp === 'monotone' ? curve(st.map((s) => [s.z, s.p[j][0]])) : spline(st.map((s) => [s.z, s.p[j][0]]));
    X.push((z) => Math.max(0, fx(z)));
    Y.push(interp(st.map((s) => [s.z, s.p[j][1]])));
  }
  const sharp = new Set(o.sharp ?? []);
  const iters = o.smooth ?? 3;
  const z0 = st[0].z, z1 = st[st.length - 1].z, mat = o.mat ?? MAT.PAINT;
  let cz = NaN, poly = null, plen = 0;
  const buildSection = (z) => {
    // full closed outline: half (0..M-1) then mirrored back (M-2..1)
    let pts = [], sh = [];
    for (let j = 0; j < M; j++) { pts.push([X[j](z), Y[j](z)]); sh.push(sharp.has(j)); }
    for (let j = M - 2; j >= 1; j--) { pts.push([-X[j](z), Y[j](z)]); sh.push(sharp.has(j)); }
    // corner cutting (Chaikin); sharp keypoints are kept exactly
    for (let it = 0; it < iters; it++) {
      const out = [], osh = [], n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n], sa = sh[i], sb = sh[(i + 1) % n];
        if (sa) { out.push(a); osh.push(true); } else { out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]); osh.push(false); }
        if (!sb) { out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); osh.push(false); }
      }
      pts = out; sh = osh;
    }
    const n = pts.length;
    if (!poly || poly.length < n * 2) poly = new Float64Array(n * 2 + 64);
    for (let i = 0; i < n; i++) { poly[i * 2] = pts[i][0]; poly[i * 2 + 1] = pts[i][1]; }
    plen = n;
  };
  let xMax = 0, yMin = Infinity, yMax = -Infinity;
  for (const s of st) for (const [x, y] of s.p) { xMax = Math.max(xMax, x); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
  return withBB((x, y, z) => {
    K.m = mat;
    const ez = Math.max(z0 - z, z - z1);
    if (ez > 0) return ez + 0.001;
    if (z !== cz) { buildSection(z); cz = z; }
    const n = plen, P = poly;
    let d = Infinity, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const xi = P[i * 2], yi = P[i * 2 + 1], xj = P[j * 2], yj = P[j * 2 + 1];
      const ex = xj - xi, ey = yj - yi, wx = x - xi, wy = y - yi;
      const ee = ex * ex + ey * ey;
      const t = ee > 1e-12 ? clamp((wx * ex + wy * ey) / ee, 0, 1) : 0;
      const bx = wx - ex * t, by = wy - ey * t;
      const dd = bx * bx + by * by;
      if (dd < d) d = dd;
      const c1 = y >= yi, c2 = y < yj, c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    const d2 = s * Math.sqrt(d);
    return Math.max(d2, ez);
  }, [0, yMin, z0], [xMax, yMax, z1]);
}

// ---------------------------------------------------------------- primitives (metric SDFs)
// rounded box centred at c with half-extents h and corner radius r; optional rotations
// (radians) about x (pitch, nose down positive), y (yaw) and z (roll).
export function box(c, h, r = 0.01, mat = MAT.PAINT, rot = null) {
  const [cx, cy, cz] = c, hx = h[0] - r, hy = h[1] - r, hz = h[2] - r;
  const R = rot ? rotator(rot) : null;
  const e = rot ? [Math.hypot(...h), Math.hypot(...h), Math.hypot(...h)] : h;
  return withBB((x, y, z) => {
    K.m = mat;
    let px = x - cx, py = y - cy, pz = z - cz;
    if (R) { const q = R(px, py, pz); px = q[0]; py = q[1]; pz = q[2]; }
    const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy, qz = Math.abs(pz) - hz;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  }, [cx - e[0], cy - e[1], cz - e[2]], [cx + e[0], cy + e[1], cz + e[2]]);
}

export function ellipsoid(c, rad, mat = MAT.PAINT, rot = null) {
  const [cx, cy, cz] = c, [rx, ry, rz] = rad;
  const R = rot ? rotator(rot) : null;
  const e = rot ? Math.max(rx, ry, rz) : null;
  return withBB((x, y, z) => {
    K.m = mat;
    let px = x - cx, py = y - cy, pz = z - cz;
    if (R) { const q = R(px, py, pz); px = q[0]; py = q[1]; pz = q[2]; }
    const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
    const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  }, [cx - (e ?? rx), cy - (e ?? ry), cz - (e ?? rz)], [cx + (e ?? rx), cy + (e ?? ry), cz + (e ?? rz)]);
}

// cylinder along x from x0 to x1 with centre (cy, cz) in the side plane, radius r
export function cylX(cy, cz, r, x0, x1, mat = MAT.TRIM) {
  return withBB((x, y, z) => {
    K.m = mat;
    const dr = Math.hypot(y - cy, z - cz) - r;
    const dx = Math.max(x0 - x, x - x1);
    const ox = Math.max(dr, 0), oy = Math.max(dx, 0);
    return Math.min(Math.max(dr, dx), 0) + Math.sqrt(ox * ox + oy * oy);
  }, [x0, cy - r, cz - r], [x1, cy + r, cz + r]);
}

// capped cylinder between points a and b
export function cyl(a, b, r, mat = MAT.TRIM) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const baba = bax * bax + bay * bay + baz * baz;
  return withBB((x, y, z) => {
    K.m = mat;
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const paba = pax * bax + pay * bay + paz * baz;
    const cx = pax * baba - bax * paba, cy = pay * baba - bay * paba, cz = paz * baba - baz * paba;
    const X = Math.sqrt(cx * cx + cy * cy + cz * cz) - r * baba;
    const Y = Math.abs(paba - baba * 0.5) - baba * 0.5;
    const x2 = X * X, y2 = Y * Y * baba;
    const d = Math.max(X, Y) < 0 ? -Math.min(x2, y2) : (X > 0 ? x2 : 0) + (Y > 0 ? y2 : 0);
    return (Math.sign(d) * Math.sqrt(Math.abs(d))) / baba;
  }, a.map((v, i) => Math.min(v, b[i]) - r), a.map((v, i) => Math.max(v, b[i]) + r));
}

export function capsule(a, b, r, mat = MAT.TRIM) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const bb = bax * bax + bay * bay + baz * baz;
  return withBB((x, y, z) => {
    K.m = mat;
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const h = clamp((pax * bax + pay * bay + paz * baz) / bb, 0, 1);
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  }, a.map((v, i) => Math.min(v, b[i]) - r), a.map((v, i) => Math.max(v, b[i]) + r));
}

// 2D polygon in some plane, extruded between lo and hi along the remaining axis.
// plane: 'zy' (side view, extruded along x), 'xy' (front view, along z), 'zx' (top view, along y)
export function prism(plane, pts, lo, hi, r = 0, mat = MAT.PAINT) {
  const P = pts.map((p) => [p[0], p[1]]);
  const n = P.length;
  const u0 = Math.min(...P.map((p) => p[0])), u1 = Math.max(...P.map((p) => p[0]));
  const v0 = Math.min(...P.map((p) => p[1])), v1 = Math.max(...P.map((p) => p[1]));
  const bbMin = plane === 'zy' ? [lo, v0, u0] : plane === 'xy' ? [u0, v0, lo] : [v0, lo, u0];
  const bbMax = plane === 'zy' ? [hi, v1, u1] : plane === 'xy' ? [u1, v1, hi] : [v1, hi, u1];
  return withBB((x, y, z) => {
    K.m = mat;
    let u, v, w;
    if (plane === 'zy') { u = z; v = y; w = x; } else if (plane === 'xy') { u = x; v = y; w = z; } else { u = z; v = x; w = y; }
    // polygon sdf (iq)
    let d = (u - P[0][0]) ** 2 + (v - P[0][1]) ** 2, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1];
      const wx = u - P[i][0], wy = v - P[i][1];
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
      const bx = wx - ex * t, by = wy - ey * t;
      d = Math.min(d, bx * bx + by * by);
      const c1 = v >= P[i][1], c2 = v < P[j][1], c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    const d2 = s * Math.sqrt(d) + r;
    const dw = Math.max(lo - w, w - hi);
    const ox = Math.max(d2, 0), oy = Math.max(dw, 0);
    return Math.min(Math.max(d2, dw), 0) + Math.sqrt(ox * ox + oy * oy) - r;
  }, bbMin, bbMax);
}

// NACA-like wing section in the zy plane (chord along -z from the leading edge at c),
// extruded from x0 to x1. pitch: angle of attack, nose down negative.
export function wing(c, chord, thick, x0, x1, pitch = 0, camber = 0.04, mat = MAT.CARBON) {
  const N = 16, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, yt = 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
    const yc = camber * 4 * t * (1 - t);
    pts.push([t, yc + yt]);
  }
  for (let i = N - 1; i > 0; i--) {
    const t = i / N, yt = 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
    const yc = camber * 4 * t * (1 - t);
    pts.push([t, yc - yt]);
  }
  // inverted wing: downforce, so flip camber to the bottom
  const cs = Math.cos(pitch), sn = Math.sin(pitch);
  const P = pts.map(([t, v]) => {
    const zz = -t * chord, yy = -v * chord;
    return [c[2] + zz * cs - yy * sn, c[1] + zz * sn + yy * cs];
  });
  return prism('zy', P, x0, x1, 0.002, mat);
}

function rotator([ax, ay, az]) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  const out = [0, 0, 0];
  return (x, y, z) => {
    // inverse rotation: undo z, then y, then x
    let x1 = x * cz + y * sz, y1 = -x * sz + y * cz, z1 = z;
    let x2 = x1 * cy - z1 * sy, z2 = x1 * sy + z1 * cy;
    let y3 = y1 * cx + z2 * sx, z3 = -y1 * sx + z2 * cx;
    out[0] = x2; out[1] = y3; out[2] = z3;
    return out;
  };
}

// ---------------------------------------------------------------- operations
export function union(...fs) {
  const u = (x, y, z) => {
    let d = Infinity, m = 0;
    for (const f of fs) {
      if (f.bb && d < Infinity && bbDist(f.bb, x, y, z) >= d) continue;
      const v = f(x, y, z); if (v < d) { d = v; m = K.m; }
    }
    K.m = m; return d;
  };
  u.bb = mergeBB(fs);
  return u;
}

export function smin(a, b, k, mat = null) {
  const f = (x, y, z) => {
    const da = a(x, y, z), ma = K.m;
    if (b.bb && bbDist(b.bb, x, y, z) >= da + k) { K.m = mat ?? ma; return da; }
    const db = b(x, y, z), mb = K.m;
    const h = clamp(0.5 + (0.5 * (db - da)) / k, 0, 1);
    K.m = mat ?? (da < db ? ma : mb);
    return db + (da - db) * h - k * h * (1 - h);
  };
  f.bb = mergeBB([a, b]);
  if (f.bb) for (let i = 0; i < 3; i++) { f.bb[i] -= k; f.bb[i + 3] += k; }
  return f;
}

// blend many parts into a base with the same radius
export function blend(base, parts, k) {
  let f = base;
  for (const p of parts) f = smin(f, p, k);
  return f;
}

// a minus b; the cut face takes b's material unless cutMat is given
export function sub(a, b, cutMat = null) {
  const f = (x, y, z) => {
    const da = a(x, y, z), ma = K.m;
    if (b.bb && bbDist(b.bb, x, y, z) >= -da) { K.m = ma; return da; }
    const db = b(x, y, z), mb = K.m;
    if (-db > da) { K.m = cutMat ?? mb; return -db; }
    K.m = ma; return da;
  };
  f.bb = a.bb;
  return f;
}

export function ssub(a, b, k, cutMat = null) {
  const f = (x, y, z) => {
    const da = a(x, y, z), ma = K.m;
    if (b.bb && bbDist(b.bb, x, y, z) >= k - da) { K.m = ma; return da; }
    const db = b(x, y, z), mb = K.m;
    const h = clamp(0.5 - (0.5 * (da + db)) / k, 0, 1);
    K.m = -db > da ? cutMat ?? mb : ma;
    return da + (-db - da) * h + k * h * (1 - h);
  };
  f.bb = a.bb;
  return f;
}

export function inter(a, b) {
  return (x, y, z) => {
    const da = a(x, y, z), ma = K.m, db = b(x, y, z), mb = K.m;
    if (da > db) { K.m = ma; return da; }
    K.m = mb; return db;
  };
}

export function sinter(a, b, k) {
  return (x, y, z) => {
    const da = a(x, y, z), ma = K.m, db = b(x, y, z), mb = K.m;
    const h = clamp(0.5 - (0.5 * (db - da)) / k, 0, 1);
    K.m = da > db ? ma : mb;
    return db + (da - db) * h + k * h * (1 - h);
  };
}

// only evaluate f near its bounding box (a cheap speed-up for small parts)
export function bounded(f, min, max, pad = 0.05) {
  const x0 = min[0] - pad, y0 = min[1] - pad, z0 = min[2] - pad, x1 = max[0] + pad, y1 = max[1] + pad, z1 = max[2] + pad;
  return (x, y, z) => {
    const dx = Math.max(x0 - x, x - x1, 0), dy = Math.max(y0 - y, y - y1, 0), dz = Math.max(z0 - z, z - z1, 0);
    const out = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (out > 0) { K.m = 0; return out + pad; }
    return f(x, y, z);
  };
}

// assign a material to whatever f produces
export const paint = (f, mat) => { const g = (x, y, z) => { const d = f(x, y, z); K.m = mat; return d; }; g.bb = f.bb; return g; };

// shell: keep only a band of thickness t inside the surface of f
export const shell = (f, t) => (x, y, z) => Math.abs(f(x, y, z) + t * 0.5) - t * 0.5;

export const offset = (f, r) => {
  const g = (x, y, z) => f(x, y, z) - r;
  if (f.bb) g.bb = f.bb.map((v, i) => (i < 3 ? v - Math.max(r, 0) : v + Math.max(r, 0)));
  return g;
};

export const translate = (f, dx, dy, dz) => (x, y, z) => f(x - dx, y - dy, z - dz);

// A wheel arch: cut a cylinder around the wheel (radius ra) from xin outward, with a rounded lip.
export function arch(body, wz, wy, ra, xin, k = 0.015) {
  return ssub(body, cylX(wy, wz, ra, xin, 3, MAT.TRIM), k, MAT.TRIM);
}

export { clamp, smooth };
