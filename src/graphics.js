// Renderer and post-processing: HDR scene render with MSAA, ambient occlusion (Ultra),
// sun shafts, bloom, filmic tone mapping and a final grade (contrast, saturation, vignette,
// grain, chromatic fringe, sharpening and a low-health desaturation).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { setAnisotropy } from './textures.js';

// reflect: render scale of the wet-floor reflection (0 = off); rays: sun shafts
export const QUALITY = {
  low: { name: 'Low', ratio: 0.85, shadow: 1024, post: false, reflect: 0 },
  medium: { name: 'Medium', ratio: 1, shadow: 2048, post: true, samples: 2, bloom: true, reflect: 0.35, sharpen: 0.2 },
  high: { name: 'High', ratio: 1.5, shadow: 4096, post: true, samples: 4, bloom: true, reflect: 0.5, rays: true, sharpen: 0.3 },
  ultra: { name: 'Ultra', ratio: 2, shadow: 4096, post: true, samples: 4, bloom: true, ao: true, reflect: 0.7, rays: true, sharpen: 0.35 },
};

// Crepuscular rays: march from each pixel toward the sun on screen, gathering whatever is
// brighter than the threshold (open sky around the sun), so buildings cut shafts out of it.
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2(0.5, 0.5) }, strength: { value: 0 }, aspect: { value: 1 }, tint: { value: new THREE.Color(1, 0.9, 0.75) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float strength, aspect; uniform vec3 tint; varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (strength <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 d = (vUv - sunPos) / 48.0;
      vec2 uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < 48; i++) {
        uv -= d;
        vec3 c = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
        acc += min(c, vec3(3.0)) * max(dot(c, vec3(0.3, 0.59, 0.11)) - 2.2, 0.0) * w;
        w *= 0.965;
      }
      float fall = 1.0 - smoothstep(0.0, 1.1, length((vUv - sunPos) * vec2(aspect, 1.0)));
      gl_FragColor = vec4(base + min(acc / 48.0, vec3(0.35)) * tint * strength * fall, 1.0);
    }`,
};

// Camera motion blur: each pixel's view ray is reprojected with last frame's camera rotation,
// and the image is smeared along the difference. Rotation drives almost all the blur you see
// in a shooter, and this needs no depth or velocity buffer. The viewmodel is drawn after it.
const BlurShader = {
  uniforms: { tDiffuse: { value: null }, reproj: { value: new THREE.Matrix4() }, scale: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform mat4 reproj; uniform float scale; varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (scale <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }
      vec4 ndc = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec4 prev = reproj * ndc;
      vec2 vel = (ndc.xy - prev.xy / prev.w) * 0.5 * scale;
      float len = length(vel);
      if (len < 0.0005) { gl_FragColor = vec4(base, 1.0); return; }
      vel *= min(1.0, 0.05 / len);
      vec3 acc = base; float w = 1.0;
      for (int i = 1; i <= 10; i++) {
        float t = float(i) / 10.0 - 0.5;
        acc += texture2D(tDiffuse, clamp(vUv + vel * t, 0.001, 0.999)).rgb;
        w += 1.0;
      }
      gl_FragColor = vec4(acc / w, 1.0);
    }`,
};

// Drops NaN/infinite pixels and caps extreme highlights before bloom. One bad pixel (a
// degenerate normal, a specular spike) otherwise blooms into a flash or blacks the screen.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
      c = max(c, 0.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      if (l > 12.0) c *= 12.0 / l;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, sat: { value: 1 }, contrast: { value: 1 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, vignette: { value: 0.35 }, grain: { value: 0.035 },
    fringe: { value: 0.0015 }, hurt: { value: 0 }, flash: { value: 0 }, sharpen: { value: 0 }, texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, sat, contrast, vignette, grain, fringe, hurt, flash, sharpen; uniform vec3 tint; uniform vec2 texel;
    varying vec2 vUv;
    float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * fringe * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      if (sharpen > 0.0) {
        vec3 nb = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb
                + texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
        col += (col - nb * 0.25) * sharpen;
      }
      col *= tint;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat * (1.0 - hurt * 0.75));
      col = (col - 0.5) * contrast + 0.5;
      col *= 1.0 - vignette * smoothstep(0.1, 0.75, r2 * 2.2);
      col += (rand(vUv * 1000.0 + fract(time * 7.3)) - 0.5) * grain;
      col = mix(col, vec3(1.0), flash);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();

export class Graphics {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.autoClear = false;
    setAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.q = null;
    this.override = null;
    this.blurAmount = 0.3; // 0..1 from settings
    this.renderScale = 1; // user render scale, 0.5..1
    this.dynamic = true; // lower the resolution when frames run long
    this.dynScale = 1;
    this.frameMs = 16;
    this.dynT = 0;
    this.prevRot = null;
    this.composer = null;
    this.grade = null;
  }

  setup(scene, camera, wscene, wcamera) {
    Object.assign(this, { scene, camera, wscene, wcamera });
  }

  setQuality(key, atmosphere) {
    const q = QUALITY[key] || QUALITY.high;
    this.q = q; this.qKey = key;
    atmosphere?.setShadowSize(q.shadow);
    this.buildComposer();
    this.resize();
  }

  buildComposer() {
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    const q = this.q;
    if (!q.post) return;
    const w = innerWidth, h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.samples || 0 });
    const c = this.composer = new EffectComposer(this.renderer, rt);
    const main = new RenderPass(this.scene, this.camera);
    c.addPass(main);
    this.rays = q.rays ? new ShaderPass(RaysShader) : null;
    if (this.rays) c.addPass(this.rays);
    if (q.ao) {
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
      c.addPass(ao);
      this.ao = ao;
    } else this.ao = null;
    this.blur = new ShaderPass(BlurShader);
    c.addPass(this.blur);
    const vm = new RenderPass(this.wscene, this.wcamera);
    vm.clear = false; vm.clearDepth = true;
    c.addPass(vm);
    this.vmPass = vm;
    c.addPass(new ShaderPass(SanitizeShader));
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.32, 0.55, 0.92);
      c.addPass(this.bloom);
    }
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
  }

  applyLook(look) {
    this.look = look;
    if (!this.grade) return;
    const g = look.grade || {};
    const u = this.grade.uniforms;
    u.sat.value = g.sat ?? 1; u.contrast.value = g.contrast ?? 1;
    u.tint.value.set(...(g.tint || [1, 1, 1]));
  }

  // sun position in 0..1 screen space and how strong the shafts should be (0 hides them)
  setSun(x, y, strength, color) {
    if (!this.rays) return;
    const u = this.rays.uniforms;
    u.sunPos.value.set(x, y); u.strength.value = strength; u.aspect.value = innerWidth / innerHeight;
    if (color) u.tint.value.set(color);
  }

  resize() {
    const q = this.q || QUALITY.high;
    const ratio = Math.max(0.5, Math.min(devicePixelRatio, q.ratio) * this.renderScale * this.dynScale);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.grade) {
      this.grade.uniforms.texel.value.set(1 / (innerWidth * ratio), 1 / (innerHeight * ratio));
      this.grade.uniforms.sharpen.value = q.sharpen || 0;
    }
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(innerWidth, innerHeight);
      if (this.look) this.applyLook(this.look);
    }
  }

  // Dynamic resolution: average the frame time and step the scale down when it runs over
  // ~60 fps budget, back up when there is headroom. Checked twice a second.
  dynamicRes(dt) {
    // slow average and a wide dead band: the resolution changes rarely, so the image
    // does not visibly pulse
    this.frameMs += (dt * 1000 - this.frameMs) * 0.03;
    if ((this.dynT += dt) < 2) return;
    this.dynT = 0;
    let s = this.dynScale;
    if (!this.dynamic) s = 1;
    else if (this.frameMs > 21) s = Math.max(0.65, s - 0.05);
    else if (this.frameMs < 12 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.dynScale) { this.dynScale = s; this.resize(); }
  }

  updateBlur(dt) {
    const cam = this.camera, u = this.blur.uniforms;
    const rot = _m1.extractRotation(cam.matrixWorld);
    if (!this.prevRot || this.blurAmount <= 0 || dt <= 0) {
      u.scale.value = 0;
    } else {
      // current NDC ray -> world direction -> last frame's NDC
      _m2.copy(cam.projectionMatrix).multiply(_m3.copy(this.prevRot).invert()).multiply(rot).multiply(cam.projectionMatrixInverse);
      u.reproj.value.copy(_m2);
      // blur as if the shutter were open for amount x 1/50 s, whatever the frame rate
      u.scale.value = Math.min(3, this.blurAmount * (1 / 50) / dt);
    }
    (this.prevRot ||= new THREE.Matrix4()).copy(rot);
  }

  // hurt: 0..1 desaturation; flash: 0..1 white-out (stun)
  render(showViewmodel, dt, hurt = 0, flash = 0) {
    const r = this.renderer;
    this.dynamicRes(dt);
    if (this.composer) {
      this.updateBlur(dt);
      this.vmPass.enabled = showViewmodel;
      const u = this.grade.uniforms;
      u.time.value += dt; u.hurt.value = hurt; u.flash.value = flash;
      if (this.look) this.applyLook(this.look);
      // vehicle cameras and scopes restyle the grade: thermal, FPV feed, clean glass
      const o = this.override;
      u.vignette.value = o?.vignette ?? 0.35; u.grain.value = o?.grain ?? 0.035; u.fringe.value = o?.fringe ?? 0.0015;
      if (o?.sat !== undefined) u.sat.value = o.sat;
      if (o?.contrast !== undefined) u.contrast.value = o.contrast;
      if (o?.tint) u.tint.value.set(...o.tint);
      this.composer.render(dt);
      return;
    }
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scene, this.camera);
    if (showViewmodel) { r.clearDepth(); r.render(this.wscene, this.wcamera); }
  }
}
