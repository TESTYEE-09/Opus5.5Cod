// Sky, sun, fog and time of day.
//
// The sky dome is a single shader: a zenith-to-horizon gradient keyed on the sun's height
// (deep blue noon, orange and pink sunsets, blue-black night), an HDR sun disc with a Mie
// glow, a cloud layer (fbm on a plane 1.8 km up, lit toward the sun and thickened with a few
// samples), stars and a moon. The same dome is rendered into a small cube map for image-based
// lighting whenever the time changes enough. Every material gets height fog with sun-coloured
// in-scattering through shared uniforms (see installFog).
import * as THREE from 'three';

export const FOG = {
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogSunColor: { value: new THREE.Color(1, 0.8, 0.6) },
  uFogBase: { value: 0 },
  uFogFalloff: { value: 0.0045 },
};

// Replace three's fog chunks with height fog; all built-in materials pick up the shared uniforms.
export function installFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\nvarying float vFogDepth;\nvarying vec3 vFogWorld;\n#endif';
  C.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vec4 fogWP = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      fogWP = instanceMatrix * fogWP;
    #endif
    #ifdef USE_BATCHING
      fogWP = batchingMatrix * fogWP;
    #endif
    vFogWorld = (modelMatrix * fogWP).xyz;
  #endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying vec3 vFogWorld;
    uniform vec3 uFogSunDir; uniform vec3 uFogSunColor; uniform float uFogBase; uniform float uFogFalloff;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear; uniform float fogFar;
    #endif
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      vec3 fogRay = vFogWorld - cameraPosition;
      float fogDist = length(fogRay);
      float fh0 = max(cameraPosition.y - uFogBase, 0.0), fdh = fogRay.y;
      float fk = uFogFalloff;
      float fInteg = abs(fdh) > 0.5 ? (exp(-fk * fh0) - exp(-fk * (fh0 + fdh))) / (fk * fdh) : exp(-fk * (fh0 + fdh * 0.5));
      float fogFactor = 1.0 - exp(-fogDensity * fogDist * clamp(fInteg, 0.0, 1.5));
      float fSun = pow(max(dot(fogRay / max(fogDist, 1e-3), uFogSunDir), 0.0), 6.0);
      vec3 fCol = mix(fogColor, uFogSunColor, fSun * 0.8);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      vec3 fCol = fogColor;
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol * (gl_FragColor.a), fogFactor);
    gl_FragColor.rgb = any(isnan(gl_FragColor.rgb)) || any(isinf(gl_FragColor.rgb)) ? fCol : min(gl_FragColor.rgb, vec3(64.0));
  #endif`;
  // Every material gets the shared fog uniforms; custom onBeforeCompile hooks call addFog too.
  const proto = THREE.Material.prototype;
  const orig = proto.onBeforeCompile;
  proto.onBeforeCompile = function (shader, renderer) { addFog(shader); if (orig !== proto.onBeforeCompile) orig?.call(this, shader, renderer); };
}
export function addFog(shader) { Object.assign(shader.uniforms, FOG); }

const skyVert = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const skyFrag = `
uniform vec3 uSun, uZenith, uHorizon, uGround, uSunColor, uMoon;
uniform float uSunSize, uCloudCover, uTime, uNight, uCloudBright;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  // gradient: horizon band widens at sunset
  float t = pow(max(h, 0.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  float sd = dot(d, uSun);
  // sunset glow along the horizon toward the sun
  float glow = pow(max(sd, 0.0), 4.0) * exp(-max(h, 0.0) * 6.0);
  col += uSunColor * glow * 0.9;
  // mie halo and disc
  col += uSunColor * (pow(max(sd, 0.0), 180.0) * 1.2 + pow(max(sd, 0.0), 16.0) * 0.18);
  col += uSunColor * smoothstep(uSunSize, uSunSize * 1.02, sd) * 60.0 * step(0.0, h + 0.02);
  // below the horizon: darker ground haze
  col = mix(col, uGround, smoothstep(0.0, -0.08, h));
  // stars and moon at night
  if (uNight > 0.01 && h > 0.0) {
    vec2 sp = d.xz / (d.y + 0.2) * 220.0;
    float s = step(0.9965, hash(floor(sp))) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(floor(sp) + 3.0) * 20.0));
    col += vec3(s) * uNight * 2.0 * smoothstep(0.0, 0.2, h);
    float md = dot(d, uMoon);
    col += vec3(0.8, 0.85, 1.0) * (smoothstep(0.9994, 0.9996, md) * 6.0 + pow(max(md, 0.0), 60.0) * 0.08) * uNight;
  }
  // clouds: a plane 1.8 km up, projected
  if (h > 0.0 && uCloudCover > 0.01) {
    vec2 cp = d.xz / (h + 0.06) * 1.8 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(cp * 0.9);
    float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.35, c);
    // light: sample toward the sun for self shadowing
    float c2 = fbm(cp * 0.9 + uSun.xz * 0.08);
    float shade = clamp(0.55 + (c - c2) * 2.5, 0.15, 1.0);
    vec3 lit = mix(uHorizon * 0.9, uSunColor * 1.4 + uZenith * 0.25, shade) * uCloudBright;
    lit += uSunColor * pow(max(sd, 0.0), 8.0) * 1.5 * (1.0 - cov * 0.5);
    float fade = smoothstep(0.0, 0.12, h);
    col = mix(col, lit, cov * fade * 0.92);
  }
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.55, 0.68, 0.85);
  gl_FragColor = vec4(min(col, vec3(64.0)), 1.0);
}`;

// keyframes over sun elevation (degrees): zenith, horizon, sun colour, sun intensity, ambient
const KEYS = [
  { e: -14, zen: [0.004, 0.006, 0.018], hor: [0.02, 0.028, 0.05], sun: [0.3, 0.35, 0.6], si: 0, amb: 0.08 },
  { e: -5, zen: [0.02, 0.03, 0.09], hor: [0.3, 0.16, 0.14], sun: [1.0, 0.35, 0.12], si: 0.0, amb: 0.2 },
  { e: 0, zen: [0.08, 0.14, 0.32], hor: [1.2, 0.55, 0.25], sun: [1.6, 0.6, 0.22], si: 0.6, amb: 0.45 },
  { e: 6, zen: [0.12, 0.26, 0.6], hor: [1.25, 0.8, 0.52], sun: [1.6, 0.95, 0.6], si: 2.2, amb: 0.7 },
  { e: 20, zen: [0.1, 0.3, 0.85], hor: [0.75, 0.88, 1.05], sun: [1.55, 1.35, 1.1], si: 3.6, amb: 0.95 },
  { e: 55, zen: [0.07, 0.25, 0.8], hor: [0.62, 0.8, 1.05], sun: [1.6, 1.5, 1.35], si: 4.2, amb: 1.0 },
];
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export class Sky {
  constructor(renderer) {
    this.renderer = renderer;
    this.uniforms = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uSunSize: { value: 0.99975 }, uCloudCover: { value: 0.45 },
      uTime: { value: 0 }, uNight: { value: 0 }, uCloudBright: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.dome.scale.setScalar(20000);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    this.hemi = new THREE.HemisphereLight(0x8fb6ff, 0x3a3226, 0.3);
    this.fog = new THREE.FogExp2(0x9fb8d8, 0.00011);
    this.time = 16.5; // hours
    this.lastEnv = -99;
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.envDome.scale.setScalar(100);
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = null;
    this.shadowSize = 90;
  }

  addTo(scene) {
    scene.add(this.dome, this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
  }

  setShadowQuality(size, extent) {
    this.sun.shadow.mapSize.set(size, size);
    this.shadowSize = extent;
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -extent; c.right = c.top = extent; c.near = 1; c.far = 1400;
    c.updateProjectionMatrix();
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
  }

  // time in hours (0-24); sun path tilted for southern Japan in summer
  update(dt, cam, scene, timeScale = 0) {
    this.time = (this.time + (dt * timeScale) / 3600 + 24) % 24;
    const t = this.time;
    const ang = ((t - 6) / 12) * Math.PI; // 6h sunrise, 18h sunset
    const elev = Math.sin(ang) * 68;
    const az = ang * 0.9 + 0.4;
    const e = (elev * Math.PI) / 180;
    const sunDir = this.uniforms.uSun.value.set(Math.cos(az) * Math.cos(e), Math.sin(e), -Math.sin(az) * Math.cos(e) * 0.6 - 0.35).normalize();
    this.uniforms.uMoon.value.set(-sunDir.x, Math.max(0.3, -sunDir.y), -sunDir.z).normalize();
    // key interpolation
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) if (elev >= KEYS[i].e && elev <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; }
    const k = b.e === a.e ? 0 : Math.min(1, Math.max(0, (elev - a.e) / (b.e - a.e)));
    const zen = lerp3(a.zen, b.zen, k), hor = lerp3(a.hor, b.hor, k), sc = lerp3(a.sun, b.sun, k);
    const si = a.si + (b.si - a.si) * k, amb = a.amb + (b.amb - a.amb) * k;
    const U = this.uniforms;
    const cloudDark = 1 - U.uCloudCover.value * 0.45;
    U.uZenith.value.setRGB(zen[0] * cloudDark, zen[1] * cloudDark, zen[2] * cloudDark);
    U.uHorizon.value.setRGB(...hor);
    U.uGround.value.setRGB(hor[0] * 0.35, hor[1] * 0.35, hor[2] * 0.38);
    U.uSunColor.value.setRGB(...sc);
    U.uNight.value = Math.min(1, Math.max(0, (-elev - 2) / 10));
    U.uTime.value += dt;
    U.uCloudBright.value = 0.35 + 0.65 * Math.min(1, Math.max(0, (elev + 6) / 20));
    // sun light: follows the camera; snap to shadow texels to stop shimmer
    const lightDir = elev > -2 ? sunDir : this.uniforms.uMoon.value;
    const moon = elev <= -2;
    this.sun.intensity = moon ? 0.25 : si * (1 - U.uCloudCover.value * 0.35);
    this.sun.color.setRGB(...(moon ? [0.55, 0.65, 1.0] : sc)).multiplyScalar(moon ? 1 : 1 / Math.max(sc[0], sc[1], sc[2]));
    const ex = this.shadowSize, texel = (ex * 2) / this.sun.shadow.mapSize.x;
    const cx = Math.round(cam.x / texel) * texel, cz = Math.round(cam.z / texel) * texel;
    this.sun.target.position.set(cx, cam.y, cz);
    this.sun.position.set(cx + lightDir.x * 600, cam.y + lightDir.y * 600, cz + lightDir.z * 600);
    this.hemi.intensity = amb * 0.25;
    this.hemi.color.setRGB(zen[0] * 2 + 0.1, zen[1] * 2 + 0.1, zen[2] * 2 + 0.15);
    this.hemi.groundColor.setRGB(0.18 * amb, 0.15 * amb, 0.1 * amb);
    // fog matches the horizon
    this.fog.color.setRGB(hor[0] * 0.85, hor[1] * 0.85, hor[2] * 0.88);
    FOG.uFogSunDir.value.copy(sunDir);
    FOG.uFogSunColor.value.setRGB(sc[0] * 0.9, sc[1] * 0.75, sc[2] * 0.6).multiplyScalar(elev > -4 ? 1 : 0);
    this.elev = elev;
    this.night = U.uNight.value;
    // refresh image-based lighting when the sky has changed enough
    if (Math.abs(t - this.lastEnv) > 0.12 || !this.envMap) {
      this.lastEnv = t;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
      this.envMap?.dispose();
      this.envMap = rt;
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.35 + 0.65 * Math.min(1, Math.max(0, (elev + 4) / 16));
    }
    this.dome.position.copy(cam);
  }
}
