// Seeded 2D simplex noise with fbm and ridged variants (no DOM, no three.js: runs in Node too).
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function simplex2(seed = 1) {
  const rnd = mulberry(seed);
  const perm = new Uint8Array(512), grad = new Float32Array(512 * 2);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    const a = (perm[i] / 256) * Math.PI * 2;
    grad[i * 2] = Math.cos(a); grad[i * 2 + 1] = Math.sin(a);
  }
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = perm[ii + perm[jj]] * 2; t0 *= t0; n += t0 * t0 * (grad[g] * x0 + grad[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = perm[ii + i1 + perm[jj + j1]] * 2; t1 *= t1; n += t1 * t1 * (grad[g] * x1 + grad[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = perm[ii + 1 + perm[jj + 1]] * 2; t2 *= t2; n += t2 * t2 * (grad[g] * x2 + grad[g + 1] * y2); }
    return 70 * n;
  };
}

export function fbm(noise, x, y, oct = 5, lac = 2.03, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}

export function ridged(noise, x, y, oct = 5, lac = 2.1, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(noise(x * f, y * f));
    v *= v; v *= w; w = Math.min(1, v * 2);
    s += a * v; n += a; a *= gain; f *= lac;
  }
  return s / n;
}
