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
  low: { name: 'Low', ratio: 0.85, shadow: 1024, extent: 62, post: false, reflect: 0 },
  medium: { name: 'Medium', ratio: 1, shadow: 2048, extent: 62, post: true, samples: 2, bloom: true, reflect: 0.35, sharpen: 0.2, lens: true },
  high: { name: 'High', ratio: 1.5, shadow: 4096, extent: 50, post: true, samples: 4, bloom: true, ao: 8, reflect: 0.5, rays: true, sharpen: 0.3, lens: true },
  ultra: { name: 'Ultra', ratio: 2, shadow: 4096, extent: 40, post: true, samples: 4, bloom: true, ao: 14, reflect: 0.7, rays: true, sharpen: 0.35, lens: true },
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

// Camera blur. `drift` is how far the view swung this frame in screen space, `radial` pulls
// the taps outward from the centre for the tunnel blur while aiming down sights. Both are
// zero most of the time, and the pass early-outs when they are.
const LensShader = {
  uniforms: { tDiffuse: { value: null }, drift: { value: new THREE.Vector2() }, radial: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 drift; uniform float radial; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      vec2 dir = drift + c * radial * dot(c, c) * 4.0;
      if (dot(dir, dir) < 1e-8) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      dir = clamp(dir, vec2(-0.06), vec2(0.06));
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int i = -3; i <= 3; i++) {
        float f = float(i) / 3.0, w = 1.0 - abs(f) * 0.55;
        acc += texture2D(tDiffuse, clamp(vUv + dir * f, 0.001, 0.999)).rgb * w;
        wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, 1.0);
    }`,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, sat: { value: 1 }, contrast: { value: 1 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, vignette: { value: 0.35 }, grain: { value: 0.035 },
    fringe: { value: 0.0015 }, hurt: { value: 0 }, flash: { value: 0 }, sharpen: { value: 0 }, filmic: { value: 0.3 }, texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, sat, contrast, vignette, grain, fringe, hurt, flash, sharpen, filmic; uniform vec3 tint; uniform vec2 texel;
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
      // a soft S-curve on top of the linear contrast: deeper toe, highlights that roll off
      col = mix(col, clamp(col, 0.0, 1.0) * clamp(col, 0.0, 1.0) * (3.0 - 2.0 * clamp(col, 0.0, 1.0)), filmic);
      col *= 1.0 - vignette * smoothstep(0.1, 0.75, r2 * 2.2);
      col += (rand(vUv * 1000.0 + fract(time * 7.3)) - 0.5) * grain;
      col = mix(col, vec3(1.0), flash);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

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
    atmosphere?.setShadowExtent(q.extent);
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
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1, samples: q.ao });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: q.ao });
      c.addPass(ao);
      this.ao = ao;
    } else this.ao = null;
    const vm = new RenderPass(this.wscene, this.wcamera);
    vm.clear = false; vm.clearDepth = true;
    c.addPass(vm);
    this.vmPass = vm;
    this.lens = q.lens ? new ShaderPass(LensShader) : null;
    if (this.lens) c.addPass(this.lens);
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

  // dx/dy: how far the view swung this frame, in screen widths. radial: sights blur, 0..1.
  setLens(dx, dy, radial) {
    if (!this.lens) return;
    const u = this.lens.uniforms;
    u.drift.value.set(dx, dy);
    u.radial.value = radial;
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
    const ratio = Math.min(devicePixelRatio, q.ratio);
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

  // hurt: 0..1 desaturation; flash: 0..1 white-out (stun)
  render(showViewmodel, dt, hurt = 0, flash = 0) {
    const r = this.renderer;
    if (this.composer) {
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
