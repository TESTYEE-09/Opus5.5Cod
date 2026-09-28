// Runtime world: ground queries for the physics (roads first, then terrain), water, and a
// spatial index of road segments. Rendering lives in terrain.js / roadmesh.js / scenery.js.
import { SURF, GRIP } from './gen.js';
import { HALF, SEA, PLACES } from './layout.js';

const CELL = 32;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class World {
  constructor(data) {
    this.data = data;
    this.N = data.N; this.cell = data.cell; this.H = data.H; this.surf = data.surf;
    this.roads = data.roads;
    this._g = { h: 0, nx: 0, ny: 1, nz: 0, surface: SURF.GRASS, grip: GRIP[SURF.GRASS], road: null, seg: 0, t: 0, lat: 0, water: 0, bump: 0 };
    this.lastGround = this._g;
    this.weather = { wet: 0 };
    this.index();
  }

  // road segments into a hash of 32 m cells
  index() {
    this.grid = new Map();
    this.roads.forEach((r, ri) => {
      const segs = r.loop ? r.n : r.n - 1;
      const edge = r.T.hw + r.T.shoulder;
      for (let s = 0; s < segs; s++) {
        const a = s, b = (s + 1) % r.n;
        const x0 = Math.min(r.xs[a], r.xs[b]) - edge, x1 = Math.max(r.xs[a], r.xs[b]) + edge;
        const z0 = Math.min(r.zs[a], r.zs[b]) - edge, z1 = Math.max(r.zs[a], r.zs[b]) + edge;
        for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
          const k = cx * 100003 + cz;
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(ri, s);
        }
      }
    });
  }

  terrainHeight(x, z) {
    const N = this.N, c = this.cell, H = this.H;
    const fx = clamp((x + HALF) / c, 0, N - 1.001), fz = clamp((z + HALF) / c, 0, N - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const k = j * N + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N] * (1 - u) + H[k + N + 1] * u) * v;
  }

  // Road surface under (x, z) no higher than yHint + 1.2 (so viaducts above don't count).
  roadAt(x, z, yHint = 1e9, out = null) {
    const list = this.grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!list) return null;
    let best = null, by = -1e9;
    for (let q = 0; q < list.length; q += 2) {
      const r = this.roads[list[q]], s = list[q + 1];
      const a = s, b = (s + 1) % r.n;
      const ax = r.xs[a], az = r.zs[a], ex = r.xs[b] - ax, ez = r.zs[b] - az;
      const ee = ex * ex + ez * ez;
      if (ee < 1e-6) continue;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / ee, 0, 1);
      const px = x - ax - ex * t, pz = z - az - ez * t;
      const d = Math.hypot(px, pz);
      const edge = r.T.hw + r.T.shoulder;
      if (d > edge) continue;
      // signed lateral offset: + to the left of travel direction
      const lat = (ex * pz - ez * px) / Math.sqrt(ee) > 0 ? -d : d;
      const bank = r.bank[a] + (r.bank[b] - r.bank[a]) * t;
      const y = r.ys[a] + (r.ys[b] - r.ys[a]) * t + bank * lat;
      if (y > yHint + 1.2 || y < by) continue;
      by = y;
      best = out ?? {};
      best.road = r; best.seg = s; best.t = t; best.lat = lat; best.y = y; best.d = d;
      best.slope = (r.ys[b] - r.ys[a]) / Math.sqrt(ee); best.ex = ex / Math.sqrt(ee); best.ez = ez / Math.sqrt(ee); best.bank = bank;
    }
    return best;
  }

  // Ground under (x, z): height, normal, surface, grip. Returns a shared object.
  ground(x, z, yHint = 1e9) {
    const g = this._g;
    const r = this.roadAt(x, z, yHint, this._road ??= {});
    g.water = 0;
    if (r) {
      g.h = r.y; g.road = r.road; g.seg = r.seg; g.t = r.t; g.lat = r.lat;
      // normal from the road's slope and bank
      const tx = r.ex, tz = r.ez, sl = r.slope;
      // tangent T = (tx, sl, tz), left side S = (tz, bank, -tx); normal = T x S
      const sx = tz, sy = r.bank, sz = -tx;
      const nx = sl * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - sl * sx;
      const l = Math.hypot(nx, ny, nz);
      g.nx = nx / l; g.ny = ny / l; g.nz = nz / l;
      const dirt = r.road.T.surface === SURF.DIRT;
      const kerb = r.road.type === 'circuit' && r.d > r.road.T.hw;
      g.surface = dirt ? SURF.DIRT : kerb ? SURF.KERB : SURF.ASPHALT;
      g.grip = (dirt ? GRIP[SURF.DIRT] : r.d > r.road.T.hw + 0.3 && !kerb ? 0.9 : 1) * (dirt ? 1 : 1 - 0.18 * this.weather.wet);
      g.bump = kerb ? 0.012 : dirt ? 0.02 : 0;
      return g;
    }
    g.road = null;
    const N = this.N, c = this.cell, H = this.H;
    const fx = clamp((x + HALF) / c, 1, N - 2.001), fz = clamp((z + HALF) / c, 1, N - 2.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const k = j * N + i;
    const h = (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + N] * (1 - u) + H[k + N + 1] * u) * v;
    const hx = ((H[k + 1] - H[k - 1]) * (1 - u) + (H[k + 2] - H[k]) * u) / (2 * c);
    const hz = ((H[k + N] - H[k - N]) * (1 - v) + (H[k + 2 * N] - H[k]) * v) / (2 * c);
    const l = Math.hypot(hx, 1, hz);
    g.h = h; g.nx = -hx / l; g.ny = 1 / l; g.nz = -hz / l;
    const s = this.surf[(v < 0.5 ? j : j + 1) * N + (u < 0.5 ? i : i + 1)];
    g.surface = s; g.grip = GRIP[s] * (1 - 0.12 * this.weather.wet);
    g.bump = s === SURF.ROCK || s === SURF.GRAVEL ? 0.03 : s === SURF.DIRT ? 0.02 : 0.012;
    const lvl = this.waterLevel(x, z);
    if (h < lvl) g.water = lvl - h;
    return g;
  }

  waterLevel(x, z) {
    const L = PLACES.lake;
    if (Math.hypot(x - L.x, z - L.z) < L.r + 60) return L.water;
    return SEA;
  }

  // nearest point on any road (for GPS, respawns and AI); returns {road, i, x, z, y, d}
  nearestRoad(x, z, maxD = 300, filter = null) {
    let best = null, bd = maxD;
    const cr = Math.ceil(maxD / CELL);
    const cx0 = Math.floor(x / CELL), cz0 = Math.floor(z / CELL);
    for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
      const list = this.grid.get((cx0 + dx) * 100003 + cz0 + dz);
      if (!list) continue;
      for (let q = 0; q < list.length; q += 2) {
        const r = this.roads[list[q]], s = list[q + 1];
        if (filter && !filter(r)) continue;
        const d = Math.hypot(r.xs[s] - x, r.zs[s] - z);
        if (d < bd) { bd = d; best = { road: r, i: s, x: r.xs[s], z: r.zs[s], y: r.ys[s], d, hdg: r.hdg[s] }; }
      }
    }
    return best;
  }
}
