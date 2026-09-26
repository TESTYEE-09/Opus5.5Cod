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

// Rain: camera-facing streaks stretched along the fall direction (instanced quads), wrapped
// in a box that follows the camera, plus little splash rings on the floor around you.
const RAIN_VERT = `attribute vec2 corner; attribute vec4 drop;
uniform float time, fall, len, width; uniform vec3 cam, boxSize, wind;
varying float vA; varying vec2 vUv;
void main() {
  float sp = fall * (0.85 + drop.w * 0.3);
  vec3 p = drop.xyz * boxSize + vec3(wind.x, -sp, wind.z) * time;
  vec3 rel = mod(p - cam + boxSize * 0.5, boxSize) - boxSize * 0.5;
  vec3 wp = cam + rel;
  vec3 vel = normalize(vec3(wind.x, -sp, wind.z));
  vec3 side = normalize(cross(vel, normalize(cameraPosition - wp))) * width;
  vec3 pos = wp + side * corner.x - vel * len * (0.7 + drop.w * 0.6) * corner.y;
  vA = smoothstep(boxSize.x * 0.5, boxSize.x * 0.15, length(rel.xz)) * smoothstep(0.4, 2.0, length(rel));
  vUv = vec2(corner.x + 0.5, corner.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;
const RAIN_FRAG = `uniform vec3 color; uniform float opacity; varying float vA; varying vec2 vUv;
void main() {
  float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * (1.0 - vUv.y) * vA * opacity;
  gl_FragColor = vec4(color, a);
  #include <colorspace_fragment>
}`;
const SPLASH_VERT = `attribute vec3 seed3; uniform float time, scale, floorY; uniform vec3 cam; varying float vA, vT;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float cyc = time * 2.4 + seed3.z * 10.0, id = floor(cyc);
  vT = fract(cyc);
  vec2 xz = vec2(h1(id * 12.9898 + seed3.x * 78.233), h1(id * 39.346 + seed3.y * 11.135)) - 0.5;
  vec3 wp = vec3(cam.x + xz.x * 30.0, floorY + 0.03, cam.z + xz.y * 30.0);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vA = (1.0 - vT) * smoothstep(15.0, 5.0, length(xz * 30.0));
  gl_PointSize = (0.05 + vT * 0.22) * scale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}`;
const SPLASH_FRAG = `uniform vec3 color; varying float vA, vT;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float ring = smoothstep(0.5, 0.38, d) * smoothstep(0.1 + vT * 0.25, 0.38, d);
  gl_FragColor = vec4(color, ring * vA * 0.55);
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
    this.shadowHalf = 62;
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

    // rain streaks
    const RN = 9000, rg = new THREE.InstancedBufferGeometry();
    rg.setAttribute('corner', new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1], 2));
    rg.setIndex([0, 1, 2, 0, 2, 3]);
    const drops = new Float32Array(RN * 4);
    for (let i = 0; i < drops.length; i++) drops[i] = Math.random();
    rg.setAttribute('drop', new THREE.InstancedBufferAttribute(drops, 4));
    rg.instanceCount = RN;
    this.rainU = {
      time: { value: 0 }, fall: { value: 16 }, len: { value: 0.55 }, width: { value: 0.012 },
      cam: { value: new THREE.Vector3() }, boxSize: { value: new THREE.Vector3(34, 22, 34) }, wind: { value: new THREE.Vector3(1.6, 0, 0.9) },
      color: { value: new THREE.Color(0xb8c4d0) }, opacity: { value: 0.32 },
    };
    this.rain = new THREE.Mesh(rg, new THREE.ShaderMaterial({ uniforms: this.rainU, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 5;
    scene.add(this.rain);
    const SN = 700, sp = new Float32Array(SN * 3);
    for (let i = 0; i < sp.length; i++) sp[i] = Math.random();
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SN * 3), 3));
    sg.setAttribute('seed3', new THREE.BufferAttribute(sp, 3));
    this.splashU = { time: { value: 0 }, scale: { value: 600 }, floorY: { value: 0 }, cam: { value: new THREE.Vector3() }, color: { value: new THREE.Color(0xc8d4e0) } };
    this.splash = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: this.splashU, vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, transparent: true, depthWrite: false }));
    this.splash.frustumCulled = false; this.splash.visible = false;
    scene.add(this.splash);
    this.flash = 0; this.boltT = 8; this.onThunder = null;
    this.time = 0;
  }

  apply(look) {
    this.look = look;
    const dir = new THREE.Vector3(...look.sunDir).normalize();
    this.sunDir = dir;
    this.sun.color.set(look.sunColor); this.sun.intensity = look.sunIntensity;
    this.sun.position.set(SIZE / 2, 0, SIZE / 2).addScaledVector(dir, 100);
    this.sun.target.position.set(SIZE / 2, 0, SIZE / 2);
    this.baseSun = look.sunIntensity; this.baseHemi = look.hemiIntensity;
    this.sun.shadow.radius = look.shadowSoft || 2;
    this.hemi.color.set(look.hemiSky); this.hemi.groundColor.set(look.hemiGround); this.hemi.intensity = look.hemiIntensity;
    this.scene.fog.color.set(look.fog); this.scene.fog.near = look.fogNear; this.scene.fog.far = look.fogFar;
    for (const u of [this.uniforms, this.envUniforms]) {
      u.sunDir.value.copy(dir);
      u.zenith.value.copy(lin(look.zenith)); u.horizon.value.copy(lin(look.horizon)); u.groundCol.value.copy(lin(look.groundColor));
      u.sunCol.value.copy(lin(look.sunGlow)); u.cloudCol.value.copy(lin(look.cloudColor)); u.cover.value = look.cloudCover;
    }
    this.envUniforms.sunDisk.value = 0;
    this.uniforms.sunDisk.value = look.sunDisk ?? 30;
    this.renderer.toneMappingExposure = look.exposure;
    this.refreshEnv();

    const wx = look.particles;
    const rain = wx === 'rain';
    this.rain.visible = this.splash.visible = rain;
    this.lightning = !!look.lightning; this.flash = 0; this.boltT = 6 + Math.random() * 8;
    this.wx.visible = !!wx && !rain;
    if (wx === 'snow') Object.assign(this, { wxCfg: { fall: 1.3, sway: 0.6, size: 0.06, opacity: 0.95, color: 0xffffff, count: 5000 } });
    else if (wx === 'dust') Object.assign(this, { wxCfg: { fall: -0.05, sway: 0.8, size: 0.02, opacity: 0.35, color: look.sunColor, count: 1500 } });
    if (wx && !rain) {
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

  // Half-width of the sun's shadow box in metres. Smaller means finer texels for the same map
  // size — crisper shadows near the player, at the cost of how far they reach.
  setShadowExtent(half) {
    if (this.shadowHalf === half) return;
    this.shadowHalf = half;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
    this.sun.shadow.camera.updateProjectionMatrix();
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
      const c = camera.position, texel = this.shadowHalf * 2 / this.sun.shadow.mapSize.x;
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
    if (this.rain.visible) {
      this.rainU.time.value = this.time; this.rainU.cam.value.copy(camera.position);
      this.splashU.time.value = this.time; this.splashU.cam.value.copy(camera.position); this.splashU.scale.value = pxScale;
      this.splash.visible = camera.position.y < 30;
    }
    // lightning: a double flicker that lights the sky and the whole scene, thunder follows
    if (this.lightning) {
      if ((this.boltT -= dt) <= 0) {
        this.boltT = 7 + Math.random() * 14;
        this.flashT = 0; this.flashing = true;
        const dist = 0.3 + Math.random() * 2.5;
        this.onThunder?.(dist, 1 - dist / 3);
      }
      if (this.flashing) {
        this.flashT += dt;
        const t = this.flashT;
        this.flash = t < 0.07 ? 1 : t < 0.14 ? 0.25 : t < 0.2 ? 0.8 : Math.max(0, 0.8 - (t - 0.2) * 3);
        if (t > 0.5) { this.flashing = false; this.flash = 0; }
      }
      this.hemi.intensity = this.baseHemi * (1 + this.flash * 3.5);
      this.renderer.toneMappingExposure = this.look.exposure * (1 + this.flash * 0.45);
      this.uniforms.cover.value = this.look.cloudCover;
      this.uniforms.cloudCol.value.copy(lin(this.look.cloudColor)).multiplyScalar(1 + this.flash * 4);
    }
    if (this.wx.visible) {
      this.wxU.time.value = this.time;
      this.wxU.cam.value.copy(camera.position);
      this.wxU.scale.value = pxScale;
    }
  }
}
