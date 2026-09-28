// Sea and lake: PBR water with two scrolling normal maps, depth-tinted colour from a packed
// terrain height texture (turquoise shallows over sand, deep blue offshore) and shore foam.
import * as THREE from 'three';
import { HALF, SIZE, PLACES } from './layout.js';
import { addFog } from './sky.js';

export function heightTexture(world, res = 1024) {
  const data = new Uint8Array(res * res);
  const N = world.N, f = (N - 1) / res;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const h = world.H[Math.round(j * f) * N + Math.round(i * f)];
    data[j * res + i] = Math.max(0, Math.min(255, (h + 40) * 2));
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

export function waterMaterial(normals, heightTex, level, deep = 0x0a3a52, shallow = 0x2aa8a0) {
  const m = new THREE.MeshStandardMaterial({ color: deep, roughness: 0.06, metalness: 0.0, transparent: true, normalMap: normals, normalScale: new THREE.Vector2(0.35, 0.35) });
  const U = { uTime: { value: 0 }, tHeight: { value: heightTex }, uLevel: { value: level }, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) } };
  m.userData.uniforms = U;
  m.customProgramCacheKey = () => 'water';
  m.onBeforeCompile = (sh) => {
    addFog(sh);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; uniform float uTime, uLevel; uniform sampler2D tHeight; uniform vec3 uDeep, uShallow;
        float wDepth;`)
      .replace('#include <map_fragment>', `
        float th = texture2D(tHeight, (vWP.xz + ${HALF.toFixed(1)}) / ${SIZE.toFixed(1)}).r * 255.0 / 2.0 - 40.0;
        wDepth = uLevel - th;
        float sh = smoothstep(0.0, 6.0, wDepth);
        diffuseColor.rgb = mix(uShallow, uDeep, sh);
        diffuseColor.a = mix(0.35, 0.94, smoothstep(0.0, 2.5, wDepth));
        // foam line
        float foam = (1.0 - smoothstep(0.0, 0.9, wDepth)) * (0.6 + 0.4 * sin(uTime * 1.3 + vWP.x * 0.2 + vWP.z * 0.13));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), foam * 0.7);
        diffuseColor.a = max(diffuseColor.a, foam * 0.8);
      `)
      .replace('#include <normal_fragment_maps>', `
        vec2 wuv = vWP.xz;
        vec3 n1 = texture2D(normalMap, wuv / 38.0 + vec2(uTime * 0.012, uTime * 0.008)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, wuv / 11.0 - vec2(uTime * 0.02, -uTime * 0.013)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, wuv / 160.0 + vec2(-uTime * 0.004, uTime * 0.003)).xyz * 2.0 - 1.0;
        vec3 nt = normalize(vec3((n1.xy + n2.xy * 0.6 + n3.xy * 0.8) * 0.45, 1.0));
        vec3 nw = normalize(vec3(nt.x, nt.z, nt.y));
        normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
      `);
  };
  return m;
}

export function buildWater(world, tex) {
  const g = new THREE.Group();
  const hTex = heightTexture(world);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), waterMaterial(tex.waterN, hTex, 0));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  sea.renderOrder = 1;
  g.add(sea);
  const L = PLACES.lake;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(L.r + 40, 64), waterMaterial(tex.waterN, hTex, L.water, 0x0e3a3a, 0x3a8a70));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(L.x, L.water, L.z);
  lake.renderOrder = 1;
  g.add(lake);
  g.userData.mats = [sea.material, lake.material];
  return g;
}
