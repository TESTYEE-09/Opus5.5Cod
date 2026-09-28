// Renders a top-down debug map of the generated world: node tools/horizon/mapdebug.mjs out.png
import { generate } from '../../horizon/src/world/gen.js';
import { coastZ } from '../../horizon/src/world/layout.js';
import sharp from './node_modules/sharp/lib/index.js';
const out = process.argv[2] ?? 'map.png';
const t0 = performance.now();
const W = generate({ N: 2049 });
console.log('generated in', ((performance.now() - t0) / 1000).toFixed(2), 's; roads', W.roads.length, 'total km', (W.roads.reduce((s, r) => s + r.length, 0) / 1000).toFixed(1));
const S = 1024, img = Buffer.alloc(S * S * 3);
const step = (W.N - 1) / S;
let hmin = 1e9, hmax = -1e9;
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const k = Math.round(j * step) * W.N + Math.round(i * step);
  const h = W.H[k]; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  const s = W.surf[k];
  // hillshade
  const k2 = Math.min(k + W.N + 1, W.H.length - 1);
  const shade = Math.max(0.35, Math.min(1.3, 1 + (W.H[k] - W.H[k2]) * 0.35));
  let c;
  if (h < 0) c = [30, 70 + h, 120];
  else if (h < 36 && Math.hypot(-1260 - (-2048 + i * 4), 330 - (-2048 + j * 4)) < 330) c = [40, 90, 140];
  else c = [[90, 90, 90], [200, 60, 60], [80, 140, 60], [150, 120, 80], [220, 200, 150], [130, 125, 120], [40, 95, 45], [160, 150, 130], [240, 240, 250]][s];
  const tint = 0.7 + 0.3 * Math.min(1, h / 300);
  img[(j * S + i) * 3] = Math.min(255, c[0] * shade * tint); img[(j * S + i) * 3 + 1] = Math.min(255, c[1] * shade * tint); img[(j * S + i) * 3 + 2] = Math.min(255, c[2] * shade * tint);
}
const col = { expressway: [255, 140, 0], highway: [250, 250, 90], coast: [250, 250, 90], street: [230, 230, 230], road: [255, 255, 255], touge: [255, 60, 200], circuit: [255, 30, 30], dirt: [140, 90, 40] };
for (const r of W.roads) {
  const c = col[r.type] ?? [255, 255, 255];
  for (let i = 0; i < r.n; i++) {
    const px = Math.round((r.xs[i] + 2048) / 4), pz = Math.round((r.zs[i] + 2048) / 4);
    const rad = Math.max(1, Math.round(r.T.hw / 4));
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const x = px + dx, z = pz + dz; if (x < 0 || z < 0 || x >= S || z >= S) continue;
      const e = r.elev[i] > 0.5;
      img[(z * S + x) * 3] = e ? 255 : c[0]; img[(z * S + x) * 3 + 1] = e ? 90 : c[1]; img[(z * S + x) * 3 + 2] = e ? 0 : c[2];
    }
  }
}
await sharp(img, { raw: { width: S, height: S, channels: 3 } }).png().toFile(out);
console.log('height range', hmin.toFixed(1), hmax.toFixed(1));
// road stats: steepest grade and cut/fill extremes
for (const r of W.roads.slice(0, 40)) {
  let gmax = 0, cut = 0, fill = 0;
  for (let i = 1; i < r.n; i++) gmax = Math.max(gmax, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.max(1e-3, r.cum[i] - r.cum[i - 1]));
  for (let i = 0; i < r.n; i++) { const d = r.ys[i] - W.sampleH.call(null, r.xs[i], r.zs[i]); }
  for (let i = 0; i < r.n; i += 5) { const h0 = sample(W.H0, W, r.xs[i], r.zs[i]); const d = r.ys[i] - h0; cut = Math.min(cut, d); fill = Math.max(fill, d); }
  if (!r.id.startsWith('c-')) console.log(r.id.padEnd(12), (r.length / 1000).toFixed(2) + 'km', 'grade', (gmax * 100).toFixed(1) + '%', 'cut', cut.toFixed(1), 'fill', fill.toFixed(1), 'y', Math.min(...r.ys).toFixed(0) + '..' + Math.max(...r.ys).toFixed(0));
}
function sample(arr, W, x, z) { const i = Math.round((x + 2048) / W.cell), j = Math.round((z + 2048) / W.cell); return arr[j * W.N + i]; }
