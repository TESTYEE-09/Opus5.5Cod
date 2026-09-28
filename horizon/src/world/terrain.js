// Terrain rendering: 128 m chunks with four detail levels built on demand, skirts to hide
// the seams between levels, and a splatting material (grass, forest floor, dirt, gravel,
// rock, sand) driven by the generator's surface map, slope, height and a macro variation.
import * as THREE from 'three';
import { addFog } from './sky.js';
import { HALF, SIZE } from './layout.js';
import { SURF } from './gen.js';

const CH = 128;
const STEPS = [2, 4, 8, 16];

export class Terrain {
  constructor(world, material) {
    this.world = world;
    this.material = material;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    const n = SIZE / CH;
    this.n = n;
    this.chunks = [];
    for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
      const x0 = -HALF + cx * CH, z0 = -HALF + cz * CH;
      const mesh = new THREE.Mesh(undefined, material);
      mesh.receiveShadow = true;
      mesh.position.set(x0, 0, z0);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      const c = { cx, cz, x0, z0, mesh, lod: -1, geos: [], cxw: x0 + CH / 2, czw: z0 + CH / 2 };
      // lowest level right away so the whole map shows
      this.setLod(c, 3);
      this.group.add(mesh);
      this.chunks.push(c);
    }
  }

  build(c, lod) {
    if (c.geos[lod]) return c.geos[lod];
    const W = this.world, N = W.N, cell = W.cell, H = W.H;
    const step = STEPS[lod];
    const m = CH / step + 1;
    const skirt = 6 + step;
    // grid plus a ring of skirt vertices
    const count = m * m + 4 * m;
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
    const hAt = (x, z) => {
      const i = Math.min(N - 1, Math.max(0, Math.round((x + HALF) / cell))), j = Math.min(N - 1, Math.max(0, Math.round((z + HALF) / cell)));
      return H[j * N + i];
    };
    const nAt = (x, z, out, o) => {
      const e = Math.max(step, cell);
      const hx = hAt(x + e, z) - hAt(x - e, z), hz = hAt(x, z + e) - hAt(x, z - e);
      const l = Math.hypot(hx, 2 * e, hz);
      out[o] = -hx / l; out[o + 1] = (2 * e) / l; out[o + 2] = -hz / l;
    };
    let v = 0;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const lx = i * step, lz = j * step, x = c.x0 + lx, z = c.z0 + lz;
      pos[v * 3] = lx; pos[v * 3 + 1] = hAt(x, z); pos[v * 3 + 2] = lz;
      nAt(x, z, nrm, v * 3); v++;
    }
    const idx = [];
    for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
      const a = j * m + i, b = a + 1, cc = a + m, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    // skirts: duplicate each border vertex lowered, stitched to the border
    const border = [];
    for (let i = 0; i < m; i++) border.push([i, 0]);
    for (let j = 1; j < m; j++) border.push([m - 1, j]);
    for (let i = m - 2; i >= 0; i--) border.push([i, m - 1]);
    for (let j = m - 2; j > 0; j--) border.push([0, j]);
    const base = v;
    for (const [i, j] of border) {
      const src = j * m + i;
      pos[v * 3] = pos[src * 3]; pos[v * 3 + 1] = pos[src * 3 + 1] - skirt; pos[v * 3 + 2] = pos[src * 3 + 2];
      nrm[v * 3] = nrm[src * 3]; nrm[v * 3 + 1] = nrm[src * 3 + 1]; nrm[v * 3 + 2] = nrm[src * 3 + 2];
      v++;
    }
    for (let k = 0; k < border.length; k++) {
      const [i0, j0] = border[k], [i1, j1] = border[(k + 1) % border.length];
      const a = j0 * m + i0, b = j1 * m + i1, a2 = base + k, b2 = base + ((k + 1) % border.length);
      idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, v * 3), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    c.geos[lod] = g;
    return g;
  }

  setLod(c, lod) {
    if (c.lod === lod) return;
    c.mesh.geometry = this.build(c, lod);
    c.lod = lod;
  }

  // pick detail levels by distance to the camera; build at most a few new geometries per frame
  update(camPos, budget = 3) {
    let built = 0;
    for (const c of this.chunks) c.dist = Math.hypot(camPos.x - c.cxw, camPos.z - c.czw) - CH * 0.7;
    const order = this.order ??= [...this.chunks];
    order.sort((a, b) => a.dist - b.dist);
    for (const c of order) {
      const d = c.dist;
      const want = d < 180 ? 0 : d < 520 ? 1 : d < 1300 ? 2 : 3;
      if (want === c.lod) continue;
      if (!c.geos[want]) { if (built >= budget) continue; built++; }
      this.setLod(c, want);
      // free fine geometry far away
      if (want >= 2 && c.geos[0]) { c.geos[0].dispose(); c.geos[0] = null; }
    }
  }
}

// RGBA weights per 4 m texel: R dirt/gravel, G rock, B sand, A forest floor (grass is the rest)
export function splatTexture(world, res = 1024) {
  const N = world.N, S = world.surf;
  const data = new Uint8Array(res * res * 4);
  const f = (N - 1) / res;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    let r = 0, g = 0, b = 0, a = 0, c = 0;
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const s = S[Math.min(N - 1, Math.round(j * f + dj)) * N + Math.min(N - 1, Math.round(i * f + di))];
      if (s === SURF.DIRT || s === SURF.GRAVEL) r++;
      else if (s === SURF.ROCK) g++;
      else if (s === SURF.SAND) b++;
      else if (s === SURF.FOREST) a++;
      c++;
    }
    const o = (j * res + i) * 4;
    data[o] = (r / c) * 255; data[o + 1] = (g / c) * 255; data[o + 2] = (b / c) * 255; data[o + 3] = (a / c) * 255;
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function terrainMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const uniforms = {
    tSplat: { value: tex.splat }, tNoise: { value: tex.noise },
    tGrass: { value: tex.grass }, tGrassN: { value: tex.grassN },
    tDirt: { value: tex.dirt }, tDirtN: { value: tex.dirtN },
    tRock: { value: tex.rock }, tRockN: { value: tex.rockN },
    tGravel: { value: tex.gravel }, tGravelN: { value: tex.gravelN },
    tSand: { value: tex.sand }, tSandN: { value: tex.sandN },
    uGrassTint: { value: new THREE.Color(0.78, 0.9, 0.62) }, uForestTint: { value: new THREE.Color(0.42, 0.55, 0.3) },
    uWet: { value: 0 }, uSnow: { value: 0 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    addFog(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm;
        uniform sampler2D tSplat, tNoise, tGrass, tGrassN, tDirt, tDirtN, tRock, tRockN, tGravel, tGravelN, tSand, tSandN;
        uniform vec3 uGrassTint, uForestTint; uniform float uWet, uSnow;
        vec3 TN; float TR;
        // two scales, rotated, blended by distance, to hide tiling
        vec4 tri(sampler2D t, vec2 p, float s) {
          vec4 a = texture2D(t, p / s);
          vec4 b = texture2D(t, mat2(0.8, -0.6, 0.6, 0.8) * p / (s * 3.7) + 0.37);
          return mix(a, b, 0.35);
        }
      `)
      .replace('#include <map_fragment>', `
        vec2 wp = vWPos.xz;
        vec4 sp = texture2D(tSplat, (wp + ${HALF.toFixed(1)}) / ${SIZE.toFixed(1)});
        float macro = texture2D(tNoise, wp / 900.0).r, macro2 = texture2D(tNoise, wp / 170.0 + 0.3).g;
        vec3 N0 = normalize(vWNrm);
        float steep = smoothstep(0.8, 0.62, N0.y);
        float wRock = max(sp.g, steep), wSand = sp.b * (1.0 - wRock), wDirt = sp.r * (1.0 - wRock), wForest = sp.a * (1.0 - wRock);
        float wGrass = max(0.0, 1.0 - wRock - wSand - wDirt - wForest);
        // breakup noise on the transitions
        float br = (macro2 - 0.5) * 0.5;
        wDirt = clamp(wDirt + br * wDirt, 0.0, 1.0);
        vec4 cG = tri(tGrass, wp, 5.0), cD = tri(tDirt, wp, 6.0), cR = tri(tRock, wp + vWPos.y * 0.5, 7.0), cS = tri(tSand, wp, 5.0), cV = tri(tGravel, wp, 5.0);
        vec3 grass = cG.rgb * uGrassTint * (0.75 + 0.5 * macro);
        vec3 forest = mix(cG.rgb * uForestTint, cD.rgb * 0.6, 0.35);
        vec3 col = grass * wGrass + forest * wForest + mix(cD.rgb, cV.rgb, macro2) * wDirt + cR.rgb * wRock + cS.rgb * wSand;
        col *= mix(0.85, 1.12, macro);
        // wetness darkens
        col *= 1.0 - 0.35 * uWet;
        diffuseColor.rgb = col;
        vec3 nG = tri(tGrassN, wp, 5.0).xyz, nD = tri(tDirtN, wp, 6.0).xyz, nR = tri(tRockN, wp + vWPos.y * 0.5, 7.0).xyz, nS = tri(tSandN, wp, 5.0).xyz;
        TN = normalize((nG * (wGrass + wForest) + nD * wDirt + nR * wRock + nS * wSand) * 2.0 - 1.0);
        TR = 0.95 * (wGrass + wForest) + 0.97 * wDirt + 0.82 * wRock + 0.9 * wSand;
        TR = mix(TR, 0.35, uWet * 0.7);
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = TR;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 Nw = normalize(vWNrm);
          vec3 T = normalize(cross(vec3(0.0, 0.0, 1.0), Nw));
          vec3 B = cross(Nw, T);
          vec3 nw = normalize(T * TN.x * 1.2 + B * -TN.y * 1.2 + Nw * TN.z);
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }`);
  };
  return m;
}

// small tiling noise texture for macro variation (R, G: two independent fbm layers)
export function noiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const rnd = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  const val = (x, y, p, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const r = (a, b) => rnd(((a % p) + p) % p, ((b % p) + p) % p, s);
    return (r(xi, yi) * (1 - u) + r(xi + 1, yi) * u) * (1 - v) + (r(xi, yi + 1) * (1 - u) + r(xi + 1, yi + 1) * u) * v;
  };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    for (let c = 0; c < 2; c++) {
      let a = 0, amp = 0.5, f = 4;
      for (let o = 0; o < 5; o++) { a += amp * val((i / size) * f, (j / size) * f, f, c * 17 + o); amp *= 0.5; f *= 2; }
      data[(j * size + i) * 4 + c] = Math.min(255, a * 255);
    }
    data[(j * size + i) * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
