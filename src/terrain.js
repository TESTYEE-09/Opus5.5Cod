// Rolling ground inside the play area: a 1 m heightfield of layered noise that is pressed
// flat under everything the map builds (buildings, walls, props, flags, spawns, mission
// sites) and eases up to hills and ridges in the open ground between them. Roads follow it.
// Heights are never below 0, so anything placed at y = 0 sits on a flat pad.

let size = 0, G = 0, H = null, relief = 0;

export const hasTerrain = () => relief > 0;

// bilinear height at (x, z); 0 outside the play area
export function playH(x, z) {
  if (!relief || x <= 0 || z <= 0 || x >= size || z >= size) return 0;
  const i = Math.min(G - 1, Math.floor(x)), k = Math.min(G - 1, Math.floor(z)), fx = x - i, fz = z - k;
  const a = H[k * (G + 1) + i], b = H[k * (G + 1) + i + 1], c = H[(k + 1) * (G + 1) + i], d = H[(k + 1) * (G + 1) + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

// surface normal (unnormalised gradient form) into out {x, y, z}
export function playNormal(x, z, out) {
  const e = 0.5, hx = playH(x + e, z) - playH(x - e, z), hz = playH(x, z + e) - playH(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  out.x = -hx / l; out.y = 2 * e / l; out.z = -hz / l;
  return out;
}

function hash(i, k, s) {
  let h = (i * 374761393 + k * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, z, s) {
  const i = Math.floor(x), k = Math.floor(z), fx = x - i, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, k, s), b = hash(i + 1, k, s), c = hash(i, k + 1, s), d = hash(i + 1, k + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// o: { size, relief, seed, ridges, pads: [[x0, z0, x1, z1, margin]] }
export function buildTerrain(o) {
  size = o.size; G = size; relief = o.relief || 0;
  H = new Float32Array((G + 1) * (G + 1));
  if (!relief) return;
  const W = G + 1;
  // distance (m) from every vertex to the nearest pad, by a two-pass chamfer transform
  const D = new Float32Array(W * W).fill(1e6);
  for (const [x0, z0, x1, z1, m = 2] of o.pads) {
    const i0 = Math.max(0, Math.floor(x0 - m)), i1 = Math.min(G, Math.ceil(x1 + m));
    const k0 = Math.max(0, Math.floor(z0 - m)), k1 = Math.min(G, Math.ceil(z1 + m));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) D[k * W + i] = 0;
  }
  const S2 = Math.SQRT2;
  for (let k = 0; k < W; k++) for (let i = 0; i < W; i++) {
    let d = D[k * W + i];
    if (i > 0) d = Math.min(d, D[k * W + i - 1] + 1);
    if (k > 0) { d = Math.min(d, D[(k - 1) * W + i] + 1); if (i > 0) d = Math.min(d, D[(k - 1) * W + i - 1] + S2); if (i < G) d = Math.min(d, D[(k - 1) * W + i + 1] + S2); }
    D[k * W + i] = d;
  }
  for (let k = G; k >= 0; k--) for (let i = G; i >= 0; i--) {
    let d = D[k * W + i];
    if (i < G) d = Math.min(d, D[k * W + i + 1] + 1);
    if (k < G) { d = Math.min(d, D[(k + 1) * W + i] + 1); if (i < G) d = Math.min(d, D[(k + 1) * W + i + 1] + S2); if (i > 0) d = Math.min(d, D[(k + 1) * W + i - 1] + S2); }
    D[k * W + i] = d;
  }
  const s = o.seed || 1, ramp = o.ramp || 16;
  for (let k = 0; k < W; k++) for (let i = 0; i < W; i++) {
    // broad rolling land, medium hummocks, fine lumps; optional ridge lines
    let n = vnoise(i / 90, k / 90, s) * 0.55 + vnoise(i / 34, k / 34, s + 1) * 0.3 + vnoise(i / 11, k / 11, s + 2) * 0.1 + vnoise(i / 4, k / 4, s + 3) * 0.05;
    if (o.ridges) n = n * 0.6 + (1 - Math.abs(vnoise(i / 70, k / 70, s + 4) * 2 - 1)) ** 2 * 0.55;
    const edge = smooth(4, 40, Math.min(i, k, G - i, G - k));
    const pad = smooth(0, ramp, D[k * W + i]);
    H[k * W + i] = relief * pad * edge * Math.max(0, n - 0.18) * 1.5;
  }
}
