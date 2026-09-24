// Sky, sun, fog, image-based lighting and weather for the current map.
import * as THREE from 'three';
import { SIZE } from './world.js';

const SKY_VERT = `varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = `varying vec3 vDir;
uniform vec3 sunDir, zenith, horizon, groundCol, sunCol, cloudCol;
uniform float cover, time, sunDisk;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, sunDir), 0.0);
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
  col = mix(col, horizon * 1.05, (1.0 - smoothstep(0.0, 0.18, h)) * 0.5);
  col += sunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.45);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.1 + vec2(time * 0.006, time * 0.0035);
    float n = fbm(uv);
    float c = smoothstep(0.85 - cover * 0.6, 1.1 - cover * 0.6, n) * smoothstep(0.0, 0.1, h);
    float shade = fbm(uv * 2.1 + 3.7);
    vec3 cc = cloudCol * (0.72 + 0.4 * shade) + sunCol * pow(sd, 5.0) * 0.55 * (1.0 - c * 0.5);
    col = mix(col, cc, c * 0.92);
    col += sunCol * smoothstep(0.99955, 0.9998, sd) * sunDisk * (1.0 - c);
  }
  col = mix(col, groundCol, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Screen-facing flakes/motes simulated entirely on the GPU around the camera.
const WX_VERT = `attribute float seed;
uniform float time, scale, fall, sway, size;
uniform vec3 cam, boxSize;
varying float vA;
void main() {
  vec3 p = position;
  p.y -= time * fall * (0.7 + seed * 0.6);
  p.x += sin(time * 0.7 + seed * 40.0) * sway;
  p.z += cos(time * 0.6 + seed * 31.0) * sway;
  vec3 rel = mod(p - cam + boxSize * 0.5, boxSize) - boxSize * 0.5;
  vec4 mv = modelViewMatrix * vec4(cam + rel, 1.0);
  float d = length(rel);
  vA = smoothstep(boxSize.x * 0.5, boxSize.x * 0.25, d) * smoothstep(0.3, 1.5, -mv.z);
  gl_PointSize = size * (0.6 + seed * 0.8) * scale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}`;
const WX_FRAG = `uniform vec3 color; uniform float opacity; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(color, opacity * vA * smoothstep(0.5, 0.1, d));
  #include <colorspace_fragment>
}`;

const lin = (hex) => new THREE.Color(hex);
const _up = new THREE.Vector3(0, 1, 0), _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _sc = new THREE.Vector3();

export class Atmosphere {
  constructor(scene, wscene, renderer) {
    this.scene = scene; this.wscene = wscene; this.renderer = renderer;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 10, far: 260 });
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xffffff, 50, 250);

    this.uniforms = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      groundCol: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, cloudCol: { value: new THREE.Color() },
      cover: { value: 0.3 }, time: { value: 0 }, sunDisk: { value: 30 },
    };
    this.skyMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // the same sky, without the sun disk, captured into an environment map for reflections
    this.envScene = new THREE.Scene();
    this.envUniforms = THREE.UniformsUtils.clone(this.uniforms);
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ uniforms: this.envUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.env = null;

    // weather particles
    const n = 5000, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * 60; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = Math.random() * 60; seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.wxU = {
      time: { value: 0 }, scale: { value: 600 }, fall: { value: 1 }, sway: { value: 0.5 }, size: { value: 0.05 },
      cam: { value: new THREE.Vector3() }, boxSize: { value: new THREE.Vector3(60, 30, 60) }, color: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 0.9 },
    };
    this.wx = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.wxU, vertexShader: WX_VERT, fragmentShader: WX_FRAG, transparent: true, depthWrite: false }));
    this.wx.frustumCulled = false;
    this.wx.visible = false;
    scene.add(this.wx);
    this.time = 0;
  }

  apply(look) {
    this.look = look;
    const dir = new THREE.Vector3(...look.sunDir).normalize();
    this.sunDir = dir;
    this.sun.color.set(look.sunColor); this.sun.intensity = look.sunIntensity;
    this.sun.position.set(SIZE / 2, 0, SIZE / 2).addScaledVector(dir, 100);
    this.sun.target.position.set(SIZE / 2, 0, SIZE / 2);
    this.sun.shadow.radius = look.shadowSoft || 2;
    this.hemi.color.set(look.hemiSky); this.hemi.groundColor.set(look.hemiGround); this.hemi.intensity = look.hemiIntensity;
    this.scene.fog.color.set(look.fog); this.scene.fog.near = look.fogNear; this.scene.fog.far = look.fogFar;
    for (const u of [this.uniforms, this.envUniforms]) {
      u.sunDir.value.copy(dir);
      u.zenith.value.copy(lin(look.zenith)); u.horizon.value.copy(lin(look.horizon)); u.groundCol.value.copy(lin(look.groundColor));
      u.sunCol.value.copy(lin(look.sunGlow)); u.cloudCol.value.copy(lin(look.cloudColor)); u.cover.value = look.cloudCover;
    }
    this.envUniforms.sunDisk.value = 0;
    this.renderer.toneMappingExposure = look.exposure;
    this.refreshEnv();

    const wx = look.particles;
    this.wx.visible = !!wx;
    if (wx === 'snow') Object.assign(this, { wxCfg: { fall: 1.3, sway: 0.6, size: 0.06, opacity: 0.95, color: 0xffffff, count: 5000 } });
    else if (wx === 'dust') Object.assign(this, { wxCfg: { fall: -0.05, sway: 0.8, size: 0.02, opacity: 0.35, color: look.sunColor, count: 1500 } });
    if (wx) {
      const c = this.wxCfg;
      this.wxU.fall.value = c.fall; this.wxU.sway.value = c.sway; this.wxU.size.value = c.size; this.wxU.opacity.value = c.opacity;
      this.wxU.color.value.set(c.color);
      this.wx.geometry.setDrawRange(0, c.count);
    }
  }

  refreshEnv() {
    if (this.env) this.env.dispose();
    this.env = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.env.texture;
    this.wscene.environment = this.env.texture;
    this.scene.environmentIntensity = this.look.envIntensity;
    this.wscene.environmentIntensity = this.look.envIntensity * 1.2;
  }

  setShadowSize(s) {
    if (this.sun.shadow.mapSize.x === s) return;
    this.sun.shadow.mapSize.set(s, s);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  update(dt, camera, pxScale) {
    this.time += dt;
    // the shadow map follows the camera, snapped to whole texels so edges don't crawl
    if (this.sunDir) {
      const z = this.sunDir, x = _sx.crossVectors(_up, z).normalize(), y = _sy.crossVectors(z, x);
      const c = camera.position, texel = 124 / this.sun.shadow.mapSize.x;
      const a = Math.round(c.dot(x) / texel) * texel, b = Math.round(c.dot(y) / texel) * texel, d = c.dot(z);
      _sc.copy(x).multiplyScalar(a).addScaledVector(y, b).addScaledVector(z, d);
      this.sun.target.position.copy(_sc);
      this.sun.position.copy(_sc).addScaledVector(z, 120);
      // haze thins out with height so pilots can see the country around the battle
      const k = 1 + Math.min(Math.max(c.y - 8, 0) / 50, 1.6);
      this.scene.fog.near = this.look.fogNear * k; this.scene.fog.far = this.look.fogFar * k;
    }
    this.uniforms.time.value = this.time;
    this.sky.position.copy(camera.position);
    if (this.wx.visible) {
      this.wxU.time.value = this.time;
      this.wxU.cam.value.copy(camera.position);
      this.wxU.scale.value = pxScale;
    }
  }
}
