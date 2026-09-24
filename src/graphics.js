// Renderer and post-processing: HDR scene render with MSAA, ambient occlusion (Ultra),
// bloom, filmic tone mapping and a final grade (contrast, saturation, vignette, grain,
// chromatic fringe and a low-health desaturation).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { setAnisotropy } from './textures.js';

export const QUALITY = {
  low: { name: 'Low', ratio: 0.85, shadow: 1024, post: false },
  medium: { name: 'Medium', ratio: 1, shadow: 2048, post: true, samples: 2, bloom: true },
  high: { name: 'High', ratio: 1.5, shadow: 4096, post: true, samples: 4, bloom: true },
  ultra: { name: 'Ultra', ratio: 2, shadow: 4096, post: true, samples: 4, bloom: true, ao: true },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, sat: { value: 1 }, contrast: { value: 1 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, vignette: { value: 0.35 }, grain: { value: 0.035 },
    fringe: { value: 0.0015 }, hurt: { value: 0 }, flash: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, sat, contrast, vignette, grain, fringe, hurt, flash; uniform vec3 tint;
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
    if (q.ao) {
      const ao = new GTAOPass(this.scene, this.camera, w, h);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
      c.addPass(ao);
      this.ao = ao;
    } else this.ao = null;
    const vm = new RenderPass(this.wscene, this.wcamera);
    vm.clear = false; vm.clearDepth = true;
    c.addPass(vm);
    this.vmPass = vm;
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

  resize() {
    const q = this.q || QUALITY.high;
    const ratio = Math.min(devicePixelRatio, q.ratio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight);
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
