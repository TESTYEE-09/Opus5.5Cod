// Car body materials.
//
// The body mesh carries a per-vertex material id (paint, trim, carbon, chrome, ...). On top of
// that, "decals" are drawn in the fragment shader as signed-distance polygons in one of four
// projections of the car's own coordinates (side z-y, front/rear x-y, top z-x). They give
// headlights, tail lights, grilles, windows, panel gaps and badges crisp edges at any zoom,
// with no UVs. Emissive decals belong to light groups (head, DRL, tail, brake, reverse) that
// the game switches through uniforms.
//
// The same geometry is drawn twice: an opaque pass that discards window pixels, and a glass
// pass that only draws them, premultiplied so reflections stay bright while the cabin shows
// through.
import * as THREE from 'three';
import { addFog } from '../world/sky.js';

export const LAYERS = {
  paint: 0, trim: 1, carbon: 2, chrome: 3, gloss: 4, dark: 5, paint2: 6, grille: 7,
  glass: 8, head: 9, tail: 10, amber: 11, led: 12, gap: 13, vent: 14, reverse: 15, badge: 16, smoke: 17, rubber: 18, mesh: 19,
};
const PROJ = { side: 0, front: 1, rear: 2, top: 3 };
export const EMIS = { none: 0, head: 1, drl: 2, tail: 3, brake: 4, turn: 5, reverse: 6 };

const TEXW = 256;

// Pack decals into an RGBA float texture: [n, layer, proj, emis] [r, g0, g1, flags] [bbox] [verts...]
export function decalTexture(decals) {
  const texels = [];
  for (const d of decals) {
    const pts = d.pts;
    const n = pts.length;
    const r = d.r ?? 0;
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const [u, v] of pts) { u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
    const pad = r + 0.01;
    const flags = (d.line ? 1 : 0) + (d.thru ? 2 : 0);
    const g = d.g ?? [-99, 99];
    texels.push([n, LAYERS[d.l], PROJ[d.p], EMIS[d.e ?? 'none']], [r, g[0], g[1], flags], [u0 - pad, v0 - pad, u1 + pad, v1 + pad]);
    for (let i = 0; i < n; i += 2) texels.push([pts[i][0], pts[i][1], pts[i + 1]?.[0] ?? 0, pts[i + 1]?.[1] ?? 0]);
  }
  const rows = Math.max(1, Math.ceil(texels.length / TEXW));
  const data = new Float32Array(TEXW * rows * 4);
  texels.forEach((t, i) => data.set(t, i * 4));
  const tex = new THREE.DataTexture(data, TEXW, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, count: decals.length };
}

const common = /* glsl */`
uniform highp sampler2D uDecals;
uniform int uDecalCount;
uniform vec3 uPaint, uPaint2;
uniform float uPaintMetal, uPaintRough, uFlake, uPearl, uMatte;
uniform vec4 uLights;          // head, tail, brake, reverse
uniform vec4 uArchF, uArchR;   // wheel y, z, arch radius, inner x
uniform sampler2D uCarbon;
uniform float uGlassPass, uTime, uDirt;
varying vec3 vOP;
varying vec3 vON;
varying vec4 vMatA;
varying vec4 vMatB;

struct Lyr { vec3 alb; float rough; float metal; float cc; float ccr; vec3 emis; float bump; float glass; float flake; };

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
vec4 dfetch(int i) { return texelFetch(uDecals, ivec2(i % ${TEXW}, i / ${TEXW}), 0); }

// hexagonal mesh, 1 at the wire, 0 in the holes
float hexMesh(vec2 p, float s) {
  p /= s;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float d = max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
  return smoothstep(0.36, 0.44, d);
}

Lyr layerProps(int id, vec2 q, float emisGroup) {
  Lyr L;
  L.alb = vec3(0.03); L.rough = 0.5; L.metal = 0.0; L.cc = 0.0; L.ccr = 0.1; L.emis = vec3(0.0); L.bump = 0.0; L.glass = 0.0; L.flake = 0.0;
  if (id == 0) { L.alb = uPaint; L.rough = uPaintRough; L.metal = uPaintMetal; L.cc = 1.0 - uMatte; L.ccr = 0.03; L.flake = uFlake; }
  else if (id == 1) { L.alb = vec3(0.028); L.rough = 0.62; }
  else if (id == 2) { L.alb = vec3(0.045); L.rough = 0.3; L.cc = 1.0; L.ccr = 0.04; }
  else if (id == 3) { L.alb = vec3(0.92); L.rough = 0.07; L.metal = 1.0; }
  else if (id == 4) { L.alb = vec3(0.012); L.rough = 0.12; L.cc = 1.0; L.ccr = 0.03; }
  else if (id == 5) { L.alb = vec3(0.22, 0.225, 0.235); L.rough = 0.32; L.metal = 1.0; }
  else if (id == 6) { L.alb = uPaint2; L.rough = uPaintRough; L.metal = uPaintMetal; L.cc = 1.0 - uMatte; L.ccr = 0.03; L.flake = uFlake; }
  else if (id == 7 || id == 19) { float m = hexMesh(q, id == 7 ? 0.018 : 0.009); L.alb = vec3(0.02 + 0.03 * m); L.rough = 0.45; L.bump = m * 0.0015; L.metal = 0.3 * m; }
  else if (id == 8) { L.alb = vec3(0.012, 0.014, 0.016); L.rough = 0.03; L.glass = 1.0; }
  else if (id == 9) {
    // headlight: chrome reflector under a clear lens, with projector rings
    vec2 cell = fract(q * vec2(16.0, 16.0)) - 0.5;
    float ring = smoothstep(0.3, 0.26, length(cell)) - smoothstep(0.2, 0.16, length(cell));
    L.alb = vec3(0.16 + 0.5 * ring); L.rough = 0.1 + 0.2 * (1.0 - ring); L.metal = 1.0; L.cc = 1.0; L.ccr = 0.01;
    L.emis = vec3(1.0, 0.97, 0.9) * (emisGroup == 1.0 ? uLights.x * 14.0 : emisGroup == 2.0 ? 5.0 : 0.0);
  }
  else if (id == 10) {
    float stripes = smoothstep(0.35, 0.65, abs(fract(q.y * 90.0) - 0.5) * 2.0);
    L.alb = vec3(0.32, 0.012, 0.01) * (0.8 + 0.2 * stripes); L.rough = 0.08; L.cc = 1.0; L.ccr = 0.01;
    float e = emisGroup == 4.0 ? uLights.z * 16.0 + uLights.y * 1.5 : uLights.y * 3.5 + uLights.z * 5.0;
    L.emis = vec3(1.0, 0.03, 0.015) * e * (0.75 + 0.25 * stripes);
  }
  else if (id == 11) { L.alb = vec3(0.55, 0.25, 0.02); L.rough = 0.08; L.cc = 1.0; L.ccr = 0.01; }
  else if (id == 12) { L.alb = vec3(0.9); L.rough = 0.1; L.cc = 1.0; L.ccr = 0.01; L.emis = vec3(0.85, 0.92, 1.0) * (6.0 + uLights.x * 6.0); }
  else if (id == 13) { L.alb = vec3(0.004); L.rough = 0.7; L.bump = -0.0012; }
  else if (id == 14) { float s = abs(fract(q.x * 45.0) - 0.5) * 2.0; L.alb = vec3(0.015 + 0.03 * s); L.rough = 0.5; L.bump = s * 0.002; }
  else if (id == 15) { L.alb = vec3(0.7); L.rough = 0.06; L.cc = 1.0; L.ccr = 0.01; L.emis = vec3(1.0) * uLights.w * 10.0; }
  else if (id == 16) { L.alb = vec3(0.9, 0.9, 0.92); L.rough = 0.1; L.metal = 1.0; }
  else if (id == 17) { L.alb = vec3(0.03, 0.02, 0.02); L.rough = 0.05; L.cc = 1.0; L.ccr = 0.01; }
  else if (id == 18) { L.alb = vec3(0.02); L.rough = 0.85; }
  return L;
}

Lyr mixL(Lyr a, Lyr b, float t) {
  Lyr o;
  o.alb = mix(a.alb, b.alb, t); o.rough = mix(a.rough, b.rough, t); o.metal = mix(a.metal, b.metal, t);
  o.cc = mix(a.cc, b.cc, t); o.ccr = mix(a.ccr, b.ccr, t); o.emis = mix(a.emis, b.emis, t);
  o.bump = mix(a.bump, b.bump, t); o.glass = mix(a.glass, b.glass, t); o.flake = mix(a.flake, b.flake, t);
  return o;
}

float sdPoly(vec2 p, int ptr, int n, bool closed) {
  vec4 v0 = dfetch(ptr);
  vec2 first = v0.xy;
  float d = dot(p - first, p - first);
  float s = 1.0;
  vec2 prev = first;
  for (int i = 1; i <= 16; i++) {
    if (i > n) break;
    if (i == n && !closed) break;
    vec2 cur;
    if (i == n) cur = first;
    else { vec4 t = dfetch(ptr + i / 2); cur = (i % 2 == 0) ? t.xy : t.zw; }
    vec2 e = prev - cur, w = p - cur;
    vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
    d = min(d, dot(b, b));
    if (closed) {
      bvec3 c = bvec3(p.y >= cur.y, p.y < prev.y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s *= -1.0;
    }
    prev = cur;
  }
  if (n == 1) return sqrt(d);
  return closed ? s * sqrt(d) : sqrt(d);
}

Lyr carSurface(vec3 P, vec3 N, float footprint) {
  vec3 ap = vec3(abs(P.x), P.y, P.z);
  // base layer from the mesh's material weights (strongest wins, others blend in)
  int base = 0; float best = -1.0;
  for (int i = 0; i < 4; i++) { if (vMatA[i] > best) { best = vMatA[i]; base = i; } }
  for (int i = 0; i < 4; i++) { if (vMatB[i] > best) { best = vMatB[i]; base = i + 4; } }
  vec2 bq = abs(N.x) > 0.5 ? P.zy : abs(N.z) > 0.5 ? ap.xy : P.zx;
  Lyr L = layerProps(base, bq, 0.0);
  if (base == 2) {
    vec2 cq = (abs(N.x) > 0.5 ? P.zy : abs(N.y) > 0.5 ? P.zx : P.xy) * 18.0;
    float c = texture2D(uCarbon, cq).r;
    L.alb = vec3(0.02 + 0.08 * c); L.rough = 0.25 + 0.2 * (1.0 - c);
  }
  // decals
  int ptr = 0;
  for (int i = 0; i < 96; i++) {
    if (i >= uDecalCount) break;
    vec4 h0 = dfetch(ptr), h1 = dfetch(ptr + 1), bb = dfetch(ptr + 2);
    int n = int(h0.x);
    int vptr = ptr + 3;
    ptr = vptr + (n + 1) / 2;
    int proj = int(h0.z);
    vec2 q; float gv; float face;
    if (proj == 0) { q = P.zy; gv = ap.x; face = abs(N.x); }
    else if (proj == 1) { q = ap.xy; gv = P.z; face = N.z; }
    else if (proj == 2) { q = ap.xy; gv = P.z; face = -N.z; }
    else { q = vec2(P.z, ap.x); gv = P.y; face = N.y; }
    if (gv < h1.y || gv > h1.z) continue;
    int flags = int(h1.w);
    if ((flags & 2) == 0 && face < 0.12) continue;
    if (q.x < bb.x || q.y < bb.y || q.x > bb.z || q.y > bb.w) continue;
    float sd = sdPoly(q, vptr, n, (flags & 1) == 0 && n > 2) - h1.x;
    float aa = footprint * 1.2 + 0.0004;
    float cov = clamp(0.5 - sd / aa, 0.0, 1.0);
    if ((flags & 2) == 0) cov *= smoothstep(0.12, 0.3, face);
    if (cov <= 0.0) continue;
    Lyr D = layerProps(int(h0.y), q, h0.w);
    L = mixL(L, D, cov);
  }
  // wheel-arch and underbody occlusion
  float ao = 1.0;
  for (int k = 0; k < 2; k++) {
    vec4 a = k == 0 ? uArchF : uArchR;
    float d = length(vec2(P.y - a.x, P.z - a.y));
    ao *= 1.0 - 0.85 * smoothstep(a.z + 0.03, a.z - 0.06, d) * smoothstep(a.w - 0.12, a.w + 0.05, ap.x);
  }
  ao *= mix(0.35, 1.0, smoothstep(0.08, 0.3, P.y + N.y * 0.1));
  L.alb *= ao;
  L.cc *= mix(0.2, 1.0, ao);
  // road grime low on the body
  L.alb = mix(L.alb, vec3(0.08, 0.07, 0.06), uDirt * smoothstep(0.35, 0.1, P.y) * 0.6);
  return L;
}
`;

// flake normal: tiny mirrors tilted at random inside ~0.3 mm cells
const flakeGlsl = /* glsl */`
vec3 flakeNormal(vec3 n, vec3 P, float amt) {
  vec3 c = floor(P * 2600.0);
  vec3 r = hash33(c) - 0.5;
  return normalize(n + r * amt * 0.9);
}
`;

export function createBodyMaterials(def, { carbonTex } = {}) {
  const { tex, count } = decalTexture(def.decals ?? []);
  const d = def.dims;
  const uniforms = {
    uDecals: { value: tex }, uDecalCount: { value: count },
    uPaint: { value: new THREE.Color(0.7, 0.02, 0.02) }, uPaint2: { value: new THREE.Color(0.02, 0.02, 0.02) },
    uPaintMetal: { value: 0.0 }, uPaintRough: { value: 0.35 }, uFlake: { value: 0 }, uPearl: { value: 0 }, uMatte: { value: 0 },
    uLights: { value: new THREE.Vector4(0, 0, 0, 0) },
    uArchF: { value: new THREE.Vector4(d.rF, d.wb / 2, d.rF + 0.05, (d.trackF / 2) - (d.wF / 2) - 0.05) },
    uArchR: { value: new THREE.Vector4(d.rR, -d.wb / 2, d.rR + 0.05, (d.trackR / 2) - (d.wR / 2) - 0.05) },
    uCarbon: { value: carbonTex ?? null },
    uGlassPass: { value: 0 }, uTime: { value: 0 }, uDirt: { value: 0 },
  };
  const make = (glass, cabin = false) => {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, side: glass || cabin ? THREE.DoubleSide : THREE.FrontSide });
    m.defines = { CAR_BODY: '', ...(glass ? { CAR_GLASS: '' } : {}), ...(cabin ? { CAR_CABIN: '' } : {}) };
    if (glass) {
      m.transparent = true; m.depthWrite = false; m.premultipliedAlpha = true;
      m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    }
    m.customProgramCacheKey = () => (glass ? 'carglass' : cabin ? 'carcabin' : 'carbody');
    m.onBeforeCompile = (sh) => {
      addFog(sh);
    Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float matId;
          varying vec3 vOP; varying vec3 vON; varying vec4 vMatA; varying vec4 vMatB;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vOP = position; vON = normal;
          vMatA = vec4(equal(vec4(matId), vec4(0.0, 1.0, 2.0, 3.0)));
          vMatB = vec4(equal(vec4(matId), vec4(4.0, 5.0, 6.0, 7.0)));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${common}\n${flakeGlsl}
          vec3 perturbCar(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
            vec3 sX = dFdx(surf_pos), sY = dFdy(surf_pos);
            vec3 R1 = cross(sY, surf_norm), R2 = cross(surf_norm, sX);
            float det = dot(sX, R1) * faceDir;
            vec3 g = sign(det) * (dHdxy.x * R1 + dHdxy.y * R2);
            return normalize(abs(det) * surf_norm - g);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float fp = max(length(dFdx(vOP)), length(dFdy(vOP)));
          Lyr CL = carSurface(vOP, normalize(vON), fp);
          #ifdef CAR_GLASS
            if (CL.glass < 0.5) discard;
          #else
            if (CL.glass > 0.5) discard;
          #endif
          #ifdef CAR_CABIN
            if (!gl_FrontFacing) { CL.alb = vec3(0.025); CL.rough = 0.9; CL.metal = 0.0; CL.cc = 0.0; CL.emis = vec3(0.0); CL.flake = 0.0; }
          #endif
          diffuseColor.rgb = CL.alb;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = CL.rough;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = CL.metal;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 dH = vec2(dFdx(CL.bump), dFdy(CL.bump));
          normal = perturbCar(-vViewPosition, normal, dH, faceDirection);
          if (CL.flake > 0.0) normal = flakeNormal(normal, vOP, CL.flake * smoothstep(0.0022, 0.0006, fp));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += CL.emis;`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
          material.clearcoat = CL.cc;
          material.clearcoatRoughness = max(CL.ccr, 0.0525);`)
        .replace('#include <opaque_fragment>', `
          #ifdef CAR_GLASS
            float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 4.0);
            float ga = mix(0.42, 0.95, fres);
            gl_FragColor = vec4(outgoingLight - totalDiffuse * (1.0 - ga), ga);
          #else
            #include <opaque_fragment>
          #endif`);
    };
    return m;
  };
  const opaque = make(false), glass = make(true), cabin = make(false, true);
  return { opaque, glass, cabin, uniforms };
}

// Paint finishes. color is sRGB hex.
export const FINISH = {
  gloss: { metal: 0.0, rough: 0.3, flake: 0 },
  metallic: { metal: 0.55, rough: 0.32, flake: 0.35 },
  pearl: { metal: 0.35, rough: 0.28, flake: 0.2 },
  matte: { metal: 0.25, rough: 0.55, flake: 0, matte: 1 },
  chrome: { metal: 1.0, rough: 0.05, flake: 0 },
  tintcoat: { metal: 0.45, rough: 0.25, flake: 0.25 },
};

export function setPaint(uniforms, color, finish = 'metallic', color2 = 0x111111) {
  const f = FINISH[finish] ?? FINISH.metallic;
  uniforms.uPaint.value.set(color);
  uniforms.uPaint2.value.set(color2);
  uniforms.uPaintMetal.value = f.metal;
  uniforms.uPaintRough.value = f.rough;
  uniforms.uFlake.value = f.flake;
  uniforms.uMatte.value = f.matte ?? 0;
}
