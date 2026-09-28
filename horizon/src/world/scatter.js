// Where trees go: forests from the surface map, groves on the plains from a clustering noise,
// pines on the coast, cherry avenues along the shrine and lake roads, ginkgo in the city.
import { mulberry, simplex2 } from './noise.js';
import { HALF, SIZE, PLACES, coastZ } from './layout.js';
import { SURF } from './gen.js';

export function scatterTrees(world, density = 1) {
  const rnd = mulberry(99), n2 = simplex2(31);
  const out = [];
  const N = world.N;
  const L = PLACES.lake, C = PLACES.city, F = PLACES.festival, S = PLACES.shrine, R = PLACES.circuit, Pd = PLACES.paddies;
  const inRect = (x, z, cx, cz, w, d) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2;
  const clearOfRoads = (x, z, m) => {
    if (world.roadAt(x, z)) return false;
    for (const [dx, dz] of [[m, 0], [-m, 0], [0, m], [0, -m]]) if (world.roadAt(x + dx, z + dz)) return false;
    return true;
  };
  const step = 7.5 / Math.sqrt(density);
  for (let z = -HALF + 20; z < HALF - 20; z += step) {
    for (let x = -HALF + 20; x < HALF - 20; x += step) {
      const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
      const i = Math.round((px + HALF) / world.cell), j = Math.round((pz + HALF) / world.cell);
      const s = world.surf[j * N + i];
      const h = world.H[j * N + i];
      if (h < 1.5) continue;
      if (Math.hypot(px - L.x, pz - L.z) < L.r + 8) continue;
      if (px > C.x0 - 30 && px < C.x1 + 30 && pz > C.z0 - 30 && pz < C.z1 + 30) continue;
      if (Math.hypot(px - F.x, (pz - F.z) * 1.3) < F.r) continue;
      if (inRect(px, pz, R.x, R.z, R.w * 0.95, R.d * 0.95) && rnd() < 0.85) continue;
      if (inRect(px, pz, Pd.x, Pd.z, Pd.w * 0.9, Pd.d * 0.9)) continue;
      if (pz > coastZ(px) - 40) continue;
      const grove = n2(px / 260, pz / 260) * 0.7 + n2(px / 60, pz / 60) * 0.3;
      let p, k;
      if (s === SURF.FOREST) { p = 0.8; const r = rnd(); k = r < 0.6 ? 'cedar' : r < 0.85 ? 'pine' : 'broad'; }
      else if (s === SURF.GRASS) {
        p = Math.max(0.015, Math.min(0.6, (grove - 0.25) * 1.6));
        const coast = pz > coastZ(px) - 260;
        const r = rnd();
        if (coast) k = r < 0.75 ? 'pine' : 'broad';
        else if (h > 120) k = r < 0.45 ? 'cedar' : r < 0.7 ? 'maple' : 'broad';
        else k = r < 0.45 ? 'broad' : r < 0.62 ? 'pine' : r < 0.78 ? 'sakura' : r < 0.9 ? 'maple' : 'cedar';
      } else if (s === SURF.DIRT || s === SURF.ROCK) { p = 0.06; k = rnd() < 0.5 ? 'pine' : 'cedar'; }
      else continue;
      if (rnd() > p) continue;
      if (!clearOfRoads(px, pz, 7)) continue;
      const sp = { cedar: [1.6, 2.5], pine: [0.9, 1.4], broad: [0.9, 1.5], sakura: [0.8, 1.1], maple: [0.7, 1.05], ginkgo: [0.9, 1.3] }[k];
      out.push({ x: px, y: world.terrainHeight(px, pz), z: pz, s: sp[0] + rnd() * (sp[1] - sp[0]), r: rnd() * Math.PI * 2, k });
    }
  }
  // avenues: cherry trees along the shrine road and the lake loop, ginkgo along city streets
  for (const r of world.roads) {
    const kind = r.id === 'shrine' || r.id === 'lake' || r.id === 'paddy' ? 'sakura' : r.type === 'street' ? 'ginkgo' : r.id === 'festival' ? 'sakura' : null;
    if (!kind) continue;
    const gap = kind === 'sakura' ? 7 : 8;
    for (let i = 0; i < r.n; i += gap) {
      for (const side of [-1, 1]) {
        const off = r.T.hw + r.T.shoulder + (kind === 'ginkgo' ? 2.2 : 4.5);
        const hd = r.hdg[i];
        const x = r.xs[i] + Math.cos(hd) * off * side, z = r.zs[i] - Math.sin(hd) * off * side;
        if (world.roadAt(x, z)) continue;
        out.push({ x, y: world.terrainHeight(x, z), z, s: kind === 'sakura' ? 0.95 + rnd() * 0.2 : 1 + rnd() * 0.2, r: rnd() * 6.28, k: kind });
      }
    }
  }
  // shrine hill: a ring of cedars and maples around the pagoda
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    const rr = S.r * (0.8 + rnd() * 0.5), x = S.x + Math.cos(a) * rr, z = S.z + Math.sin(a) * rr;
    if (world.roadAt(x, z)) continue;
    out.push({ x, y: world.terrainHeight(x, z), z, s: 1 + rnd() * 0.6, r: rnd() * 6.28, k: rnd() < 0.5 ? 'cedar' : 'maple' });
  }
  return out;
}
