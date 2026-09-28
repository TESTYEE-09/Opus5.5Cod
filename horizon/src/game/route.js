// GPS: a graph over the road network (samples every ~10 m, joined where roads meet or cross)
// searched with A*, returning a smooth polyline; plus the in-world route ribbon drawn on the
// road surface with scrolling chevrons, coloured by the speed you should be doing (the
// driving line) or plain pink for navigation.
import * as THREE from 'three';

const STEP = 5; // road samples are 2 m apart: a node every 10 m

export class RoadGraph {
  constructor(world) {
    this.world = world;
    const nodes = []; // {r, i, x, y, z}
    const edges = []; // adjacency lists [node, cost]
    const index = new Map();
    const add = (r, i) => {
      const k = `${r.id}:${i}`;
      if (index.has(k)) return index.get(k);
      const n = nodes.length;
      nodes.push({ r, i, x: r.xs[i], y: r.ys[i], z: r.zs[i] });
      edges.push([]);
      index.set(k, n);
      return n;
    };
    const link = (a, b) => {
      const A = nodes[a], B = nodes[b];
      const c = Math.hypot(A.x - B.x, A.z - B.z) + 0.5;
      edges[a].push([b, c]); edges[b].push([a, c]);
    };
    for (const r of world.roads) {
      let prev = -1;
      const last = r.loop ? r.n : r.n - 1;
      for (let i = 0; i <= last; i += STEP) {
        const ii = Math.min(i, r.n - 1) % r.n;
        const n = add(r, ii);
        if (prev >= 0 && prev !== n) link(prev, n);
        prev = n;
      }
      if (!r.loop) { const n = add(r, r.n - 1); if (prev !== n) link(prev, n); }
      else link(prev, add(r, 0));
    }
    // junctions: join nodes of different roads that nearly touch at the same height
    const cell = 12, hash = new Map();
    nodes.forEach((n, k) => {
      const key = Math.floor(n.x / cell) * 100003 + Math.floor(n.z / cell);
      (hash.get(key) ?? hash.set(key, []).get(key)).push(k);
    });
    nodes.forEach((n, k) => {
      const cx = Math.floor(n.x / cell), cz = Math.floor(n.z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const m of hash.get((cx + dx) * 100003 + cz + dz) ?? []) {
          if (m <= k) continue;
          const o = nodes[m];
          if (o.r === n.r) continue;
          if (Math.hypot(o.x - n.x, o.z - n.z) < Math.max(7, n.r.T.hw + o.r.T.hw) && Math.abs(o.y - n.y) < 2.5) link(k, m);
        }
      }
    });
    this.nodes = nodes; this.edges = edges; this.hash = hash; this.cell = cell;
  }

  nearest(x, z) {
    const w = this.world.nearestRoad(x, z, 600);
    if (!w) return -1;
    let best = -1, bd = Infinity;
    const cx = Math.floor(w.x / this.cell), cz = Math.floor(w.z / this.cell);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      for (const m of this.hash.get((cx + dx) * 100003 + cz + dz) ?? []) {
        const o = this.nodes[m], d = Math.hypot(o.x - w.x, o.z - w.z) + (o.r === w.road ? 0 : 5);
        if (d < bd) { bd = d; best = m; }
      }
    }
    return best;
  }

  // A* from world position a to b; returns [[x, z, y], ...] densified along the roads
  path(ax, az, bx, bz, heading = null) {
    const s = this.nearest(ax, az), t = this.nearest(bx, bz);
    if (s < 0 || t < 0) return null;
    const N = this.nodes, E = this.edges;
    const g = new Float64Array(N.length).fill(Infinity), from = new Int32Array(N.length).fill(-1);
    const open = new Heap();
    const T = N[t];
    const h = (k) => Math.hypot(N[k].x - T.x, N[k].z - T.z);
    g[s] = 0; open.push(s, h(s));
    // prefer leaving in the direction the car faces
    if (heading !== null) {
      for (const [m, c] of E[s]) {
        const dx = N[m].x - N[s].x, dz = N[m].z - N[s].z;
        const back = dx * Math.sin(heading) + dz * Math.cos(heading) < 0;
        g[m] = c + (back ? 60 : 0); from[m] = s; open.push(m, g[m] + h(m));
      }
    }
    while (open.size) {
      const k = open.pop();
      if (k === t) break;
      for (const [m, c] of E[k]) {
        const ng = g[k] + c;
        if (ng < g[m]) { g[m] = ng; from[m] = k; open.push(m, ng + h(m)); }
      }
    }
    if (from[t] < 0 && s !== t) return null;
    const ids = [];
    for (let k = t; k >= 0; k = from[k]) { ids.push(k); if (k === s) break; }
    ids.reverse();
    // densify along each road between consecutive nodes of the same road
    const out = [];
    for (let q = 0; q < ids.length; q++) {
      const A = N[ids[q]], B = N[ids[q + 1]];
      out.push([A.x, A.z, A.y]);
      if (B && A.r === B.r) {
        const r = A.r;
        let d = B.i - A.i;
        if (r.loop) { if (d > r.n / 2) d -= r.n; if (d < -r.n / 2) d += r.n; }
        const sgn = Math.sign(d);
        for (let j = 1; j < Math.abs(d); j++) { const ii = (A.i + sgn * j + r.n) % r.n; out.push([r.xs[ii], r.zs[ii], r.ys[ii]]); }
      }
    }
    return smooth(out);
  }
}

function smooth(p) {
  if (p.length < 3) return p;
  const o = [p[0]];
  for (let i = 1; i < p.length - 1; i++) o.push([(p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4, (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4, (p[i - 1][2] + 2 * p[i][2] + p[i + 1][2]) / 4]);
  o.push(p[p.length - 1]);
  return o;
}

class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) {
    const K = this.k, P = this.p;
    K.push(k); P.push(p);
    let i = K.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (P[j] <= P[i]) break; [K[i], K[j]] = [K[j], K[i]]; [P[i], P[j]] = [P[j], P[i]]; i = j; }
  }
  pop() {
    const K = this.k, P = this.p, top = K[0];
    const lk = K.pop(), lp = P.pop();
    if (K.length) {
      K[0] = lk; P[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < K.length && P[l] < P[m]) m = l;
        if (r < K.length && P[r] < P[m]) m = r;
        if (m === i) break;
        [K[i], K[m]] = [K[m], K[i]]; [P[i], P[m]] = [P[m], P[i]]; i = m;
      }
    }
    return top;
  }
}

// cumulative distance and curvature-limited target speeds along a polyline
export function speedProfile(pts, { mu = 1.15, vmax = 90, decel = 9, closed = false } = {}) {
  const n = pts.length, cum = new Float64Array(n), vs = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const K = 6;
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - K + n) % n : Math.max(0, i - K)], b = pts[i], c = pts[closed ? (i + K) % n : Math.min(n - 1, i + K)];
    // circumradius through three points
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const R = cross > 1e-6 ? (ab * bc * ca) / (2 * cross) : 1e6;
    vs[i] = Math.min(vmax, Math.sqrt(mu * 9.81 * R));
  }
  // braking pass backwards, acceleration pass forwards
  for (let pass = 0; pass < (closed ? 2 : 1); pass++) {
    for (let i = n - 2; i >= 0; i--) { const d = cum[i + 1] - cum[i]; vs[i] = Math.min(vs[i], Math.sqrt(vs[i + 1] ** 2 + 2 * decel * d)); }
    if (closed) vs[n - 1] = Math.min(vs[n - 1], vs[0]);
  }
  return { cum, vs, length: cum[n - 1] };
}

// ------------------------------------------------------------------ ribbon on the road
function chevronTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.moveTo(4, 110); g.lineTo(32, 60); g.lineTo(60, 110); g.lineTo(60, 84); g.lineTo(32, 34); g.lineTo(4, 84); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export class RouteRibbon {
  constructor(world) {
    this.world = world;
    this.mat = new THREE.MeshBasicMaterial({ map: chevronTexture(), transparent: true, depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.pts = null;
  }

  // colors: per point [r,g,b] or null for GPS pink
  set(pts, colors = null, width = 0.9) {
    this.pts = pts;
    if (!pts || pts.length < 2) { this.mesh.visible = false; return; }
    const n = pts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), col = new Float32Array(n * 8), idx = [];
    let v = 0;
    const pink = [1, 0.18, 0.54, 1];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const x = pts[i][0], z = pts[i][1];
      if (i) v += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      for (let s = 0; s < 2; s++) {
        const sx = x + tz * width * (s ? 1 : -1), sz = z - tx * width * (s ? 1 : -1);
        const g = this.world.ground(sx, sz, (pts[i][2] ?? 0) + 3);
        pos.set([sx, g.h + 0.06, sz], (i * 2 + s) * 3);
        uv.set([s, v / 2.2], (i * 2 + s) * 2);
        col.set(colors ? colors[i] : pink, (i * 2 + s) * 4);
      }
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.mesh.visible = true;
    this.n = n;
  }

  // recolour points [a, b) with fn(i) -> [r, g, b, a] (the racing line reacts to your speed)
  recolor(a, b, fn) {
    const c = this.mesh.geometry.getAttribute('color');
    if (!c) return;
    for (let i = Math.max(0, a); i < Math.min(this.n, b); i++) { const v = fn(i); c.setXYZW(i * 2, v[0], v[1], v[2], v[3]); c.setXYZW(i * 2 + 1, v[0], v[1], v[2], v[3]); }
    c.needsUpdate = true;
  }

  // draw only the stretch ahead of the car; returns the index of the nearest point
  update(dt, x, z, ahead = 260) {
    if (!this.pts || !this.mesh.visible) return -1;
    this.mat.map.offset.y -= dt * 0.9;
    const p = this.pts;
    let best = this.near ?? 0, bd = Infinity;
    const lo = Math.max(0, best - 40), hi = Math.min(p.length - 1, best + 200);
    for (let i = lo; i <= hi; i++) { const d = (p[i][0] - x) ** 2 + (p[i][1] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    if (bd > 60 * 60) for (let i = 0; i < p.length; i++) { const d = (p[i][0] - x) ** 2 + (p[i][1] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    this.near = best;
    let end = best, dist = 0;
    while (end < p.length - 1 && dist < ahead) { dist += Math.hypot(p[end + 1][0] - p[end][0], p[end + 1][1] - p[end][1]); end++; }
    const start = Math.max(0, best - 2);
    this.mesh.geometry.setDrawRange(start * 6, Math.max(0, end - start) * 6);
    return best;
  }
}
