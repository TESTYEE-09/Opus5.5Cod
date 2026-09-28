// Trees: procedural species built from a trunk and leaf-card clusters (canvas-drawn leaves,
// normals pointing out of the crown for soft volume, wind sway in the vertex shader).
// Near the camera trees are real geometry; every tree is also a camera-facing impostor baked
// from the species at startup, which the shader hides inside the near radius.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from './noise.js';
import { addFog } from './sky.js';

export const WIND = { uWind: { value: 0 }, uWindStr: { value: 1 } };

function leafTexture(kind) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry(kind.length * 97 + 3);
  const pal = {
    cedar: ['#1f3a1c', '#2a4a22', '#34592a', '#1a3016'], pine: ['#2b4a26', '#355a2c', '#40692f', '#23401f'],
    broad: ['#3f6b2a', '#4f7d30', '#5f8f36', '#355b24'], sakura: ['#f5c4d6', '#f7d6e2', '#eeaac2', '#ffe6ee'],
    maple: ['#c2381e', '#d8542a', '#a62a18', '#e0763a'], ginkgo: ['#6f9a36', '#86ad40', '#5b8a2e', '#9dbb4c'],
  }[kind];
  // leaves radiating from the centre, denser in the middle so the card edge is soft
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.65) * S * 0.46;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    g.fillStyle = pal[(rnd() * pal.length) | 0];
    g.save(); g.translate(x, y); g.rotate(rnd() * Math.PI);
    g.beginPath();
    if (kind === 'cedar' || kind === 'pine') { g.fillRect(-1, -7, 2.2, 14); }
    else if (kind === 'sakura') { for (let p = 0; p < 5; p++) { g.rotate((Math.PI * 2) / 5); g.ellipse(0, -3.2, 2.2, 3.4, 0, 0, Math.PI * 2); } }
    else { g.ellipse(0, 0, 3.4 + rnd() * 2, 6 + rnd() * 3, 0, 0, Math.PI * 2); }
    g.fill(); g.restore();
  }
  // a few twigs
  g.strokeStyle = 'rgba(60,40,30,0.6)'; g.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + (rnd() - 0.5) * S * 0.8, S / 2 + (rnd() - 0.5) * S * 0.8); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function barkTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3a2e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${20 + Math.random() * 60},${15 + Math.random() * 40},${10 + Math.random() * 30},0.5)`; g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 6 + Math.random() * 20); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// crossed leaf cards around a cluster centre; normals point away from the crown centre
function cluster(parts, cx, cy, cz, size, crown, rnd) {
  for (let k = 0; k < 3; k++) {
    const q = new THREE.PlaneGeometry(size, size);
    q.rotateY(rnd() * Math.PI); q.rotateX((rnd() - 0.5) * 1.2);
    q.translate(cx, cy, cz);
    const p = q.attributes.position, n = q.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - crown.x, dy = (p.getY(i) - crown.y) * 0.8, dz = p.getZ(i) - crown.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      n.setXYZ(i, dx / l, dy / l + 0.25, dz / l);
    }
    parts.push(q);
  }
}

function trunk(h, r0, r1, bend, rnd) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 4, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    p.setX(i, p.getX(i) + Math.sin(t * 2.3) * bend.x * t);
    p.setZ(i, p.getZ(i) + Math.sin(t * 1.7) * bend.z * t);
  }
  g.computeVertexNormals();
  return g;
}

// species: height ranges and shape
export const SPECIES = {
  cedar: { h: [16, 26], leaf: 'cedar' },
  pine: { h: [8, 14], leaf: 'pine' },
  broad: { h: [9, 15], leaf: 'broad' },
  sakura: { h: [6, 9], leaf: 'sakura' },
  maple: { h: [6, 10], leaf: 'maple' },
  ginkgo: { h: [9, 14], leaf: 'ginkgo' },
};

// one canonical tree per species (instances get scaled and rotated), roughly 10 m tall
function buildSpecies(kind, seed = 1) {
  const rnd = mulberry(seed * 131 + kind.length);
  const leaves = [], wood = [];
  if (kind === 'cedar') {
    wood.push(trunk(10, 0.32, 0.12, { x: 0.1, z: 0.1 }, rnd));
    for (let i = 0; i < 26; i++) {
      const t = i / 26, y = 2.2 + t * 8.2, r = (1 - t) * 2.2 + 0.3;
      const a = rnd() * Math.PI * 2;
      cluster(leaves, Math.cos(a) * r * 0.6, y, Math.sin(a) * r * 0.6, 1.4 + (1 - t) * 1.8, { x: 0, y: 6, z: 0 }, rnd);
    }
  } else if (kind === 'pine') {
    // leaning trunk with flat pads of needles
    wood.push(trunk(8, 0.3, 0.12, { x: 1.2, z: 0.5 }, rnd));
    for (let i = 0; i < 9; i++) {
      const y = 4.5 + rnd() * 4, a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 2.2;
      for (let k = 0; k < 3; k++) cluster(leaves, Math.cos(a) * r + (rnd() - 0.5) + 0.9, y + (rnd() - 0.5) * 0.4, Math.sin(a) * r + (rnd() - 0.5) + 0.3, 1.6 + rnd() * 0.8, { x: 0.8, y: 7, z: 0.3 }, rnd);
    }
  } else {
    const round = kind === 'broad' || kind === 'ginkgo';
    const th = kind === 'ginkgo' ? 5 : kind === 'sakura' ? 2.2 : 3;
    wood.push(trunk(th + 1.5, kind === 'sakura' ? 0.28 : 0.25, 0.14, { x: kind === 'sakura' ? 0.6 : 0.2, z: 0.3 }, rnd));
    // a few boughs
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI * 2 + rnd();
      const g = new THREE.CylinderGeometry(0.06, 0.12, 3, 5, 1, true);
      g.translate(0, 1.5, 0); g.rotateZ(0.8); g.rotateY(a); g.translate(0, th, 0);
      wood.push(g);
    }
    const cy = th + (kind === 'ginkgo' ? 3.5 : 2.4), R = kind === 'sakura' ? 3.2 : kind === 'ginkgo' ? 2.4 : 3.0;
    const n = kind === 'sakura' ? 34 : 30;
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.cbrt(rnd()) * R;
      const s = Math.sqrt(1 - u * u);
      cluster(leaves, Math.cos(a) * s * r, cy + u * r * (round ? 0.9 : 0.6), Math.sin(a) * s * r, 1.8 + rnd() * 0.9, { x: 0, y: cy, z: 0 }, rnd);
    }
  }
  const lg = mergeGeometries(leaves), wg = mergeGeometries(wood.map((g) => (g.index ? g.toNonIndexed() : g)));
  return { leaves: lg, wood: wg };
}

function windify(mat, leaves) {
  mat.onBeforeCompile = (sh) => {
    addFog(sh);
    Object.assign(sh.uniforms, WIND);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind, uWindStr;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float ph = ip.x * 0.05 + ip.z * 0.07;
          float h = max(position.y, 0.0) / 10.0;
          float sway = sin(uWind * 1.3 + ph) * 0.06 + sin(uWind * 2.9 + ph * 1.7) * 0.025;
          transformed.x += sway * h * h * uWindStr * 3.0;
          transformed.z += sway * 0.6 * h * h * uWindStr * 3.0;
          ${leaves ? 'transformed += normal * sin(uWind * 5.0 + ph * 9.0 + position.y) * 0.04 * uWindStr;' : ''}
        }`);
  };
  mat.customProgramCacheKey = () => (leaves ? 'treeleaf' : 'treewood');
}

export class Forest {
  constructor(world, placements, { nearRadius = 220, maxNear = 3500 } = {}) {
    this.world = world;
    this.near = nearRadius;
    this.group = new THREE.Group();
    this.group.name = 'trees';
    this.kinds = Object.keys(SPECIES);
    const bark = barkTexture();
    this.species = {};
    for (const k of this.kinds) {
      const g = buildSpecies(k);
      const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(SPECIES[k].leaf), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
      windify(leafMat, true);
      const woodMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95, color: k === 'sakura' ? 0x5a4038 : 0x6a5646 });
      windify(woodMat, false);
      const leaves = new THREE.InstancedMesh(g.leaves, leafMat, maxNear);
      const wood = new THREE.InstancedMesh(g.wood, woodMat, maxNear);
      leaves.castShadow = true; wood.castShadow = true; leaves.receiveShadow = true;
      leaves.count = wood.count = 0;
      leaves.frustumCulled = wood.frustumCulled = false;
      this.group.add(leaves, wood);
      this.species[k] = { geo: g, leaves, wood, leafMat };
    }
    // placements: {x, y, z, s, r, k}
    this.list = placements;
    // spatial buckets of 128 m for the near set
    this.buckets = new Map();
    for (const t of placements) {
      const key = Math.floor(t.x / 128) * 1000 + Math.floor(t.z / 128);
      if (!this.buckets.has(key)) this.buckets.set(key, []);
      this.buckets.get(key).push(t);
    }
    this.lastX = 1e9; this.lastZ = 1e9;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  // bake a side view of each species into an atlas for the far impostors
  bakeImpostors(renderer) {
    const kinds = this.kinds, cell = 256;
    const rt = new THREE.WebGLRenderTarget(cell * kinds.length, cell, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-7, 7, 14, 0, 0.1, 100);
    cam.position.set(0, 7, 40); cam.lookAt(0, 7, 0);
    scene.add(new THREE.HemisphereLight(0xdfefff, 0x445533, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 10, 8); scene.add(sun);
    const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevTone = renderer.toneMapping;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.toneMapping = THREE.NoToneMapping;
    kinds.forEach((k, i) => {
      const s = this.species[k];
      const lm = new THREE.Mesh(s.geo.leaves, new THREE.MeshStandardMaterial({ map: s.leafMat.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }));
      const wm = new THREE.Mesh(s.geo.wood, new THREE.MeshStandardMaterial({ color: 0x4a3a2e, roughness: 1 }));
      scene.add(lm, wm);
      renderer.setViewport(i * cell, 0, cell, cell);
      renderer.setScissor(i * cell, 0, cell, cell); renderer.setScissorTest(true);
      renderer.render(scene, cam);
      scene.remove(lm, wm);
    });
    renderer.setScissorTest(false);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.toneMapping = prevTone;
    renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
    // one instanced quad per tree
    const n = this.list.length;
    const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry().copy(quad);
    geo.instanceCount = n;
    const off = new Float32Array(n * 4), kind = new Float32Array(n);
    this.list.forEach((t, i) => { off.set([t.x, t.y, t.z, t.s], i * 4); kind[i] = this.kinds.indexOf(t.k); });
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { tAtlas: { value: rt.texture }, uNear: { value: this.near * 0.92 }, uKinds: { value: kinds.length }, uLight: { value: new THREE.Color(1, 1, 1) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, ...WIND },
      vertexShader: `
        attribute vec4 aOff; attribute float aKind;
        uniform float uNear, uKinds, uWind; varying vec2 vUv; varying float vFade; varying vec3 vWP; varying float vFogDepth; varying vec3 vFogWorld;
        void main() {
          vec3 base = aOff.xyz; float sc = aOff.w;
          float d = distance(base.xz, cameraPosition.xz);
          vFade = smoothstep(uNear, uNear + 25.0, d);
          vec3 toCam = normalize(vec3(cameraPosition.x - base.x, 0.0, cameraPosition.z - base.z));
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          float w = 14.0 * sc, h = 14.0 * sc;
          vec3 p = base + right * position.x * w + vec3(0.0, position.y * h, 0.0);
          p.x += sin(uWind * 1.3 + base.x * 0.05) * 0.15 * position.y * sc;
          vUv = vec2((aKind + uv.x) / uKinds, uv.y);
          vWP = p;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFogDepth = -mv.z; vFogWorld = p;
          gl_Position = projectionMatrix * mv;
          if (vFade <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tAtlas; uniform vec3 uLight; varying vec2 vUv; varying float vFade; varying vec3 vWP;
        #include <fog_pars_fragment>
        void main() {
          vec4 c = texture2D(tAtlas, vUv);
          if (c.a < 0.5) discard;
          gl_FragColor = vec4(c.rgb * uLight, 1.0);
          #include <fog_fragment>
        }`,
      fog: true, defines: { USE_FOG: '', FOG_EXP2: '' },
    });
    mat.onBeforeCompile = (sh) => addFog(sh);
    this.impostorMat = mat;
    this.impostors = new THREE.Mesh(geo, mat);
    this.impostors.frustumCulled = false;
    this.group.add(this.impostors);
  }

  update(cam, dt, scene, sunLight) {
    WIND.uWind.value += dt;
    if (this.impostorMat) {
      const f = scene.fog;
      this.impostorMat.uniforms.fogColor.value.copy(f.color);
      this.impostorMat.uniforms.fogDensity.value = f.density;
      const L = this.impostorMat.uniforms.uLight.value;
      L.setRGB(0.25, 0.27, 0.3).addScaledVector(sunLight.color, sunLight.intensity * 0.18);
    }
    if (Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) < 24) return;
    this.lastX = cam.x; this.lastZ = cam.z;
    const counts = {};
    for (const k of this.kinds) counts[k] = 0;
    const R = this.near, r2 = R * R;
    const b0x = Math.floor((cam.x - R) / 128), b1x = Math.floor((cam.x + R) / 128), b0z = Math.floor((cam.z - R) / 128), b1z = Math.floor((cam.z + R) / 128);
    for (let bx = b0x; bx <= b1x; bx++) for (let bz = b0z; bz <= b1z; bz++) {
      const list = this.buckets.get(bx * 1000 + bz);
      if (!list) continue;
      for (const t of list) {
        const dx = t.x - cam.x, dz = t.z - cam.z;
        if (dx * dx + dz * dz > r2) continue;
        const S = this.species[t.k];
        const i = counts[t.k]++;
        if (i >= S.leaves.instanceMatrix.count) continue;
        this._q.setFromAxisAngle(this._p.set(0, 1, 0), t.r);
        this._m.compose(this._p.set(t.x, t.y - 0.2, t.z), this._q, this._s.setScalar(t.s));
        S.leaves.setMatrixAt(i, this._m); S.wood.setMatrixAt(i, this._m);
      }
    }
    for (const k of this.kinds) {
      const S = this.species[k];
      S.leaves.count = S.wood.count = Math.min(counts[k], S.leaves.instanceMatrix.count);
      S.leaves.instanceMatrix.needsUpdate = S.wood.instanceMatrix.needsUpdate = true;
    }
  }
}
