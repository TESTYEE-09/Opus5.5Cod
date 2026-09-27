// Narrow-band surface nets: turns a car's signed distance function into a watertight mesh.
//
// The grid is mirror-symmetric about x = 0 and the SDF is only evaluated for x >= 0. A coarse
// pass (every 4th point) finds the band around the surface; only the fine points in that band
// are evaluated exactly, the rest take the coarse field's trilinear value (only their sign
// matters). Each fine cell the surface crosses gets one vertex at the mean of its edge
// crossings, and every crossed grid edge becomes a quad joining the four cells around it.
import { K } from './sdf.js';

export function polygonize(f, bounds, h) {
  const [[bx0, by0, bz0], [bx1, by1, bz1]] = bounds;
  const C = 4;
  const half = Math.ceil(Math.max(Math.abs(bx0), Math.abs(bx1)) / h / C) * C; // grid points each side of 0
  const nx = half * 2 + 1;
  const ny = Math.ceil((by1 - by0) / h / C) * C + 1;
  const nz = Math.ceil((bz1 - bz0) / h / C) * C + 1;
  const ox = -half * h, oy = by0, oz = bz0;
  const sx = 1, sy = nx, sz = nx * ny;
  const val = new Float32Array(nx * ny * nz);

  // coarse field on x >= 0
  const cnx = half / C + 1, cny = (ny - 1) / C + 1, cnz = (nz - 1) / C + 1;
  const coarse = new Float32Array(cnx * cny * cnz);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    coarse[i + cnx * (j + cny * k)] = f(i * C * h, oy + j * C * h, oz + k * C * h);
  }
  const band = C * h * 1.6;
  const cval = (i, j, k) => coarse[i + cnx * (j + cny * k)];
  for (let k = 0; k < cnz - 1; k++) for (let j = 0; j < cny - 1; j++) for (let i = 0; i < cnx - 1; i++) {
    const c000 = cval(i, j, k), c100 = cval(i + 1, j, k), c010 = cval(i, j + 1, k), c110 = cval(i + 1, j + 1, k);
    const c001 = cval(i, j, k + 1), c101 = cval(i + 1, j, k + 1), c011 = cval(i, j + 1, k + 1), c111 = cval(i + 1, j + 1, k + 1);
    const mn = Math.min(c000, c100, c010, c110, c001, c101, c011, c111), mx = Math.max(c000, c100, c010, c110, c001, c101, c011, c111);
    const exact = mn < band && mx > -band;
    for (let kk = 0; kk <= C; kk++) for (let jj = 0; jj <= C; jj++) for (let ii = 0; ii <= C; ii++) {
      const gi = half + i * C + ii, gj = j * C + jj, gk = k * C + kk;
      const idx = gi + sy * gj + sz * gk;
      if (exact) {
        val[idx] = f(i * C * h + ii * h, oy + gj * h, oz + gk * h);
      } else {
        const u = ii / C, v = jj / C, w = kk / C;
        val[idx] = (((c000 * (1 - u) + c100 * u) * (1 - v) + (c010 * (1 - u) + c110 * u) * v) * (1 - w)
          + ((c001 * (1 - u) + c101 * u) * (1 - v) + (c011 * (1 - u) + c111 * u) * v) * w);
      }
    }
  }
  // mirror to x < 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < half; i++) {
    val[i + sy * j + sz * k] = val[(nx - 1 - i) + sy * j + sz * k];
  }
  // boundary guard: everything on the grid border is outside
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) {
      const idx = i + sy * j + sz * k; if (val[idx] < 0) val[idx] = h;
    }
  }

  // vertices: one per crossed cell
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const cornerOff = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz];
  const cornerXYZ = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const base = i + sy * j + sz * k;
    let mask = 0;
    for (let c = 0; c < 8; c++) { cv[c] = val[base + cornerOff[c]]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      const A = cornerXYZ[a], B = cornerXYZ[b];
      px += A[0] + (B[0] - A[0]) * t; py += A[1] + (B[1] - A[1]) * t; pz += A[2] + (B[2] - A[2]) * t; n++;
    }
    cellVert[base] = pos.length / 3;
    pos.push(ox + (i + px / n) * h, oy + (j + py / n) * h, oz + (k + pz / n) * h);
  }

  // faces: one quad per crossed edge
  const idx = [];
  const P = pos;
  const quad = (a, b, c, d) => {
    // split along the shorter diagonal
    const d1 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const d2 = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (d1 < d2) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const g = i + sy * j + sz * k;
    const v0 = val[g] < 0;
    // x edge: cells around it vary in (y, z)
    if (i < nx - 1 && v0 !== (val[g + sx] < 0)) {
      const a = cellVert[g - sy - sz], b = cellVert[g - sz], c = cellVert[g], d = cellVert[g - sy];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? quad(a, b, c, d) : quad(d, c, b, a);
    }
    // y edge: cells vary in (z, x)
    if (j < ny - 1 && v0 !== (val[g + sy] < 0)) {
      const a = cellVert[g - sz - sx], b = cellVert[g - sx], c = cellVert[g], d = cellVert[g - sz];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? quad(a, b, c, d) : quad(d, c, b, a);
    }
    // z edge: cells vary in (x, y)
    if (k < nz - 1 && v0 !== (val[g + sz] < 0)) {
      const a = cellVert[g - sx - sy], b = cellVert[g - sy], c = cellVert[g], d = cellVert[g - sx];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? quad(a, b, c, d) : quad(d, c, b, a);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

// Snap each vertex onto the zero set (two Newton steps along the gradient), then smooth
// normals from the SDF gradient and the surface material at each vertex.
export function shade(f, positions, eps = 0.002, project = true) {
  const n = positions.length / 3;
  const normals = new Float32Array(n * 3), mats = new Uint8Array(n);
  if (project) for (let v = 0; v < n; v++) {
    for (let it = 0; it < 2; it++) {
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      const ax = Math.abs(x), sgn = x < 0 ? -1 : 1;
      const d = f(ax, y, z);
      if (Math.abs(d) < 1e-5) break;
      const gx = ax < eps ? 0 : (f(ax + eps, y, z) - f(ax - eps, y, z)) / (2 * eps);
      const gy = (f(ax, y + eps, z) - f(ax, y - eps, z)) / (2 * eps);
      const gz = (f(ax, y, z + eps) - f(ax, y, z - eps)) / (2 * eps);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-8) break;
      const k = Math.max(-0.01, Math.min(0.01, d / g2));
      positions[v * 3] = sgn * Math.max(0, ax - gx * k); positions[v * 3 + 1] = y - gy * k; positions[v * 3 + 2] = z - gz * k;
    }
  }
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const ax = Math.abs(x), sgn = x < 0 ? -1 : 1;
    const gx = f(ax + eps, y, z) - f(Math.max(ax - eps, 0) , y, z);
    const gy = f(ax, y + eps, z) - f(ax, y - eps, z);
    const gz = f(ax, y, z + eps) - f(ax, y, z - eps);
    // near the mirror plane the x-derivative is one-sided; symmetry makes it ~0 there
    const gxx = ax < eps ? 0 : gx;
    const l = Math.hypot(gxx, gy, gz) || 1;
    normals[v * 3] = (gxx / l) * sgn; normals[v * 3 + 1] = gy / l; normals[v * 3 + 2] = gz / l;
    f(ax, y, z);
    mats[v] = K.m;
  }
  return { normals, mats };
}

// Drop unreferenced vertices after simplification.
export function compact(positions, indices) {
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const out = [];
  const idx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (remap[v] < 0) { remap[v] = out.length / 3; out.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    idx[i] = remap[v];
  }
  return { positions: new Float32Array(out), indices: idx };
}
