// Road rendering: paved ribbons with procedural markings, viaducts, barriers and guardrails.
// Also collects wall segments for the physics (guardrails, barriers, viaduct edges).
import * as THREE from 'three';
import { addFog } from './sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// appends flat-shaded quads (both faces) and extra geometries into one buffer
class Builder {
  constructor() { this.p = []; this.n = []; this.extra = []; }
  quad(a, b, c, d) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c, a, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); }
    for (const q of [a, c, b, a, d, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(-nx, -ny, -nz); }
  }
  add(g) { this.extra.push(stripUv(g.index ? g.toNonIndexed() : g)); }
  geometry() {
    if (!this.p.length && !this.extra.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    return this.extra.length ? mergeGeometries([g, ...this.extra]) : g;
  }
}

const STYLE = { expressway: 0, road: 1, touge: 2, street: 3, circuit: 4, highway: 5, coast: 5, dirt: 6 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// per-sample helpers: position on the road at lateral offset `lat` (+ = left)
function at(r, i, lat, dy = 0) {
  const h = r.hdg[i];
  const lx = Math.cos(h), lz = -Math.sin(h); // left of travel for heading atan2(dx, dz)
  return [r.xs[i] + lx * lat, r.ys[i] + r.bank[i] * lat + dy, r.zs[i] + lz * lat];
}

export function buildRoads(world, mats) {
  const groups = { paved: [], dirt: [], concrete: [], metal: [] };
  const walls = [];
  for (const r of world.roads) {
    const T = r.T, edge = T.hw + T.shoulder;
    const style = STYLE[r.type] ?? 1;
    const n = r.n, loop = r.loop;
    const rows = loop ? n + 1 : n;
    const lats = [-(edge + 0.5), -edge, -T.hw, -T.hw * 0.5, 0, T.hw * 0.5, T.hw, edge, edge + 0.5];
    const drops = [1.6, 0, 0, 0, 0, 0, 0, 0, 1.6];
    const cols = lats.length;
    const pos = new Float32Array(rows * cols * 3), nrm = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), mark = new Float32Array(rows * cols * 4), junc = new Float32Array(rows * cols * 2);
    // kerbs where the circuit turns; crosswalks and broken edge lines at junctions
    const kerb = new Float32Array(n), cross = new Float32Array(n), jl = new Float32Array(n), jr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (style === 4) {
        const a = loop ? (i - 4 + n) % n : Math.max(0, i - 4), b = loop ? (i + 4) % n : Math.min(n - 1, i + 4);
        let dh = r.hdg[b] - r.hdg[a]; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        kerb[i] = clamp((Math.abs(dh) - 0.08) * 8, 0, 1);
      }
      // other roads close to either edge
      for (const side of [1, -1]) {
        const p = at(r, i, side * (edge + 1.5));
        const hit = world.roadAt(p[0], p[2], r.ys[i] + 2);
        if (hit && hit.road !== r && Math.abs(hit.y - r.ys[i]) < 2.5) (side > 0 ? jl : jr)[i] = 1;
      }
      if (style === 3) {
        // zebra crossing 5-9 m before an intersection with another street
        for (const off of [7, -7]) {
          const h = r.hdg[i];
          const x = r.xs[i] + Math.sin(h) * off, z = r.zs[i] + Math.cos(h) * off;
          const hit = world.roadAt(x, z, r.ys[i] + 2);
          if (hit && hit.road !== r && hit.road.type === 'street' && Math.abs(hit.lat) < 2) cross[i] = 1;
        }
      }
    }
    // widen junction flags a little so the gap covers the side road's full mouth
    const grow = (arr) => { const c = arr.slice(); for (let i = 0; i < n; i++) if (c[i]) for (let k = -4; k <= 4; k++) { const j = loop ? (i + k + n) % n : i + k; if (j >= 0 && j < n) arr[j] = 1; } };
    grow(jl); grow(jr);
    for (let row = 0; row < rows; row++) {
      const i = row % n;
      for (let c = 0; c < cols; c++) {
        const p = at(r, i, lats[c], -drops[c]);
        const o = (row * cols + c) * 3;
        pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
        // normal from bank (skirts face outward)
        if (drops[c] > 0) { const h = r.hdg[i], s = Math.sign(lats[c]); nrm[o] = Math.cos(h) * s; nrm[o + 1] = 0.3; nrm[o + 2] = -Math.sin(h) * s; }
        else { const b = r.bank[i], h = r.hdg[i]; nrm[o] = -Math.cos(h) * b; nrm[o + 1] = 1; nrm[o + 2] = Math.sin(h) * b; }
        uv[(row * cols + c) * 2] = lats[c]; uv[(row * cols + c) * 2 + 1] = row === n ? r.length : r.cum[i];
        const m4 = (row * cols + c) * 4;
        mark[m4] = T.hw; mark[m4 + 1] = style; mark[m4 + 2] = kerb[i]; mark[m4 + 3] = cross[i];
        junc[(row * cols + c) * 2] = jl[i]; junc[(row * cols + c) * 2 + 1] = jr[i];
      }
    }
    const idx = [];
    for (let row = 0; row < rows - 1; row++) for (let c = 0; c < cols - 1; c++) {
      const a = row * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aMark', new THREE.BufferAttribute(mark, 4));
    g.setAttribute('aJunc', new THREE.BufferAttribute(junc, 2));
    g.setIndex(idx);
    g.normalizeNormals?.();
    g.userData.prio = T.prio;
    (style === 6 ? groups.dirt : groups.paved).push(g);

    // viaducts: deck sides and underside, piers, concrete parapets
    const conc = new Builder();
    const segs = loop ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const ground = world.terrainHeight(r.xs[i], r.zs[i]);
      const high = r.ys[i] - ground > 3.5 || r.elev[i] > 0.5;
      if (!high) continue;
      for (const side of [-1, 1]) {
        const a0 = at(r, i, side * edge), b0 = at(r, j, side * edge), a1 = at(r, i, side * edge, -1.3), b1 = at(r, j, side * edge, -1.3);
        conc.quad(a0, b0, b1, a1);
        // parapet
        const pa = at(r, i, side * (edge - 0.3)), pb = at(r, j, side * (edge - 0.3));
        const ta = at(r, i, side * (edge - 0.3), 1.0), tb = at(r, j, side * (edge - 0.3), 1.0), ta2 = at(r, i, side * edge, 1.0), tb2 = at(r, j, side * edge, 1.0);
        conc.quad(pa, pb, tb, ta); conc.quad(ta, tb, tb2, ta2);
        walls.push({ ax: pa[0], az: pa[2], bx: pb[0], bz: pb[2], y0: pa[1] - 0.2, y1: pa[1] + 1.0, side });
      }
      const la = at(r, i, -edge, -1.3), lb = at(r, j, -edge, -1.3), ra = at(r, i, edge, -1.3), rb = at(r, j, edge, -1.3);
      conc.quad(la, ra, rb, lb);
      if (i % 16 === 0 && r.ys[i] - ground > 2) {
        const pier = new THREE.BoxGeometry(2.2, r.ys[i] - ground + 0.5, 1.6);
        pier.rotateY(r.hdg[i]);
        pier.translate(r.xs[i], ground + (r.ys[i] - ground) / 2 - 1, r.zs[i]);
        conc.add(pier);
        const cap = new THREE.BoxGeometry(edge * 1.6, 0.9, 2.0);
        cap.rotateY(r.hdg[i]);
        cap.translate(r.xs[i], r.ys[i] - 1.75, r.zs[i]);
        conc.add(cap);
      }
    }
    // expressway median barrier
    if (T.divided) {
      for (let i = 0; i < segs; i += 1) {
        const j = (i + 1) % n;
        const pts = [-0.3, -0.15, 0.15, 0.3].map((l) => [at(r, i, l), at(r, j, l)]);
        const up = (p, h) => [p[0], p[1] + h, p[2]];
        conc.quad(pts[0][0], pts[0][1], up(pts[1][1], 0.9), up(pts[1][0], 0.9));
        conc.quad(up(pts[1][0], 0.9), up(pts[1][1], 0.9), up(pts[2][1], 0.9), up(pts[2][0], 0.9));
        conc.quad(up(pts[2][0], 0.9), up(pts[2][1], 0.9), pts[3][1], pts[3][0]);
        walls.push({ ax: r.xs[i], az: r.zs[i], bx: r.xs[j], bz: r.zs[j], y0: r.ys[i] - 0.2, y1: r.ys[i] + 0.9, median: true });
      }
    }
    const cg = conc.geometry();
    if (cg) groups.concrete.push(cg);

    // guardrails (W-beam on posts) along both edges where the road isn't a viaduct or junction
    if (T.rail) {
      const beams = new Builder();
      for (const side of [-1, 1]) {
        const jf = side > 0 ? jl : jr;
        for (let i = 0; i < segs; i++) {
          const j = (i + 1) % n;
          const ground = world.terrainHeight(r.xs[i], r.zs[i]);
          if (jf[i] || jf[j] || r.ys[i] - ground > 3.5 || r.elev[i] > 0.5) continue;
          const off = side * (edge + 0.25);
          const a0 = at(r, i, off, 0.5), b0 = at(r, j, off, 0.5), a1 = at(r, i, off, 0.8), b1 = at(r, j, off, 0.8);
          const a2 = at(r, i, off + side * 0.06, 0.65), b2 = at(r, j, off + side * 0.06, 0.65);
          beams.quad(a0, b0, b2, a2); beams.quad(a2, b2, b1, a1);
          if (i % 2 === 0) {
            const post = new THREE.BoxGeometry(0.1, 0.9, 0.1);
            const p = at(r, i, off - side * 0.08, 0.3);
            post.translate(p[0], p[1], p[2]);
            beams.add(post);
          }
          walls.push({ ax: a0[0], az: a0[2], bx: b0[0], bz: b0[2], y0: a0[1] - 0.6, y1: a0[1] + 0.4, side, rail: true });
        }
      }
      const bg = beams.geometry();
      if (bg) groups.metal.push(bg);
    }
  }

  const root = new THREE.Group();
  root.name = 'roads';
  // one mesh per priority so bigger roads win where ribbons overlap at junctions
  const byPrio = new Map();
  for (const g of groups.paved) { const p = g.userData.prio; if (!byPrio.has(p)) byPrio.set(p, []); byPrio.get(p).push(g); }
  for (const [p, list] of byPrio) {
    const mat = mats.road.clone();
    mat.onBeforeCompile = mats.road.onBeforeCompile;
    mat.customProgramCacheKey = mats.road.customProgramCacheKey;
    mat.polygonOffset = true; mat.polygonOffsetFactor = -1 - p; mat.polygonOffsetUnits = -2 - p * 2;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.receiveShadow = true;
    root.add(m);
  }
  if (groups.dirt.length) { const m = new THREE.Mesh(mergeGeometries(groups.dirt), mats.dirt); m.receiveShadow = true; root.add(m); }
  if (groups.concrete.length) { const m = new THREE.Mesh(mergeGeometries(groups.concrete), mats.concrete); m.castShadow = m.receiveShadow = true; root.add(m); }
  if (groups.metal.length) { const m = new THREE.Mesh(mergeGeometries(groups.metal), mats.metal); m.castShadow = true; m.receiveShadow = true; root.add(m); }
  return { root, walls };
}

function stripUv(g) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  if (!g.attributes.normal) g.computeVertexNormals();
  out.setAttribute('normal', g.attributes.normal);
  return out;
}

export function roadMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex.asphalt, normalMap: tex.asphaltN, roughnessMap: tex.asphaltR, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) });
  const uniforms = { uWet: { value: 0 }, uTime: { value: 0 } };
  m.userData.uniforms = uniforms;
  m.customProgramCacheKey = () => 'road';
  m.onBeforeCompile = (sh) => {
    addFog(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aMark; attribute vec2 aJunc; varying vec4 vMark; varying vec2 vJunc; varying vec2 vRUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMark = aMark; vJunc = aJunc; vRUv = uv; vMapUv = vec2(uv.x / 4.0, uv.y / 4.0); vNormalMapUv = vMapUv; vRoughnessMapUv = vMapUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWet, uTime;
        varying vec4 vMark; varying vec2 vJunc; varying vec2 vRUv;
        float band(float x, float c, float w) { float f = fwidth(x) * 0.75; return smoothstep(c - w - f, c - w + f, x) - smoothstep(c + w - f, c + w + f, x); }
        float dashes(float v, float on, float off) { float f = fwidth(v) * 0.75; float p = mod(v, on + off); return smoothstep(0.0, f, p) * (1.0 - smoothstep(on - f, on, p)); }
        float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      `)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float hw = vMark.x; int style = int(vMark.y + 0.5);
        float u = vRUv.x, v = vRUv.y, au = abs(u);
        vec3 paint = vec3(0.0); float pm = 0.0;
        vec3 white = vec3(0.86), yellow = vec3(0.9, 0.62, 0.08);
        // worn, tyre-polished lanes
        float track = 0.5 + 0.5 * cos(u * 3.14159 / max(hw * 0.5, 1.0) * 1.0);
        diffuseColor.rgb *= mix(1.0, 0.82, track * 0.35);
        float suppress = u > 0.0 ? vJunc.x : vJunc.y;
        if (style != 6) {
          float edgeL = band(au, hw - 0.2, 0.075) * (1.0 - suppress);
          if (style == 4) edgeL = band(au, hw - 0.1, 0.08);
          pm = max(pm, edgeL); paint = white;
        }
        if (style == 0) {
          // divided: median, then two lanes each way
          float lane = band(au, 0.3 + (hw - 0.3) * 0.5, 0.075) * dashes(v, 8.0, 12.0);
          float inner = band(au, 0.55, 0.075);
          pm = max(pm, max(lane, inner));
        } else if (style == 1 || style == 3) {
          pm = max(pm, band(u, 0.0, 0.07) * dashes(v, 5.0, 5.0));
        } else if (style == 2) {
          float yl = band(au, 0.12, 0.06);
          if (yl > pm) { pm = yl; paint = yellow; }
        } else if (style == 5) {
          float yl = band(u, 0.0, 0.075);
          if (yl > pm) { pm = yl; paint = yellow; }
        } else if (style == 4) {
          // kerbs and the start line
          float k = vMark.z * step(hw, au) * (1.0 - step(hw + 1.6, au));
          float st = step(0.5, fract(v / 2.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.75, 0.05, 0.03), vec3(0.85), st), k);
          float line = step(v, 1.2) * step(au, hw);
          float chk = mod(floor(u / 0.6) + floor(v / 0.6), 2.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(chk * 0.85 + 0.03), line);
          float grid = step(3.0, v) * step(v, 60.0) * band(mod(v, 9.0), 0.6, 0.08) * step(au, hw * 0.6) * step(0.8, au);
          pm = max(pm, grid);
        }
        if (style == 3 && vMark.w > 0.5) {
          float z = step(0.5, fract(u / 0.9)) * step(au, hw - 0.3);
          pm = max(pm, z);
          paint = white;
        }
        // shoulders are a touch lighter and rougher
        diffuseColor.rgb *= mix(1.0, 1.12, step(hw, au));
        float wear = 0.75 + 0.25 * hash1(floor(vec2(u * 3.0, v * 0.7)));
        diffuseColor.rgb = mix(diffuseColor.rgb, paint * wear, pm);
        diffuseColor.rgb *= 1.0 - 0.45 * uWet;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, pm);
        roughnessFactor = mix(roughnessFactor, 0.08 + 0.2 * roughnessFactor, uWet);
      `);
  };
  return m;
}
