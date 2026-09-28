// Renderer and post-processing: HDR scene with MSAA, bloom, a final pass (camera motion blur,
// radial speed blur, chromatic fringe, vignette, grain, colour grade) and ACES tone mapping.
// Quality presets and a dynamic resolution scale keep the frame rate up.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const QUALITY = {
  low: { name: 'Low', scale: 0.7, shadow: 1024, shadowExtent: 60, samples: 0, bloom: false, post: true, lod: 0.6, trees: 0.35 },
  medium: { name: 'Medium', scale: 0.85, shadow: 2048, shadowExtent: 80, samples: 2, bloom: true, post: true, lod: 0.8, trees: 0.6 },
  high: { name: 'High', scale: 1, shadow: 2048, shadowExtent: 95, samples: 4, bloom: true, post: true, lod: 1, trees: 0.85 },
  ultra: { name: 'Ultra', scale: 1.25, shadow: 4096, shadowExtent: 110, samples: 4, bloom: true, post: true, lod: 1.3, trees: 1 },
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uReproj: { value: new THREE.Matrix4() }, uBlur: { value: 0 }, uSpeed: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uTime: { value: 0 }, uAspect: { value: 1 },
    uExposure: { value: 1 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 }, uVignette: { value: 0.32 },
    uTint: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: 0 }, uFringe: { value: 0.0015 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform mat4 uReproj; uniform float uBlur, uSpeed, uTime, uAspect, uExposure, uSat, uContrast, uVignette, uFlash, uFringe;
    uniform vec2 uCenter; uniform vec3 uTint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // camera rotation blur by reprojection at infinity, plus a radial blur with speed
      vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      vec4 prev = uReproj * ndc;
      vec2 vel = (ndc.xy - prev.xy / prev.w) * 0.5 * uBlur;
      vec2 toC = uv - uCenter;
      float rd = length(toC * vec2(uAspect, 1.0));
      vel += toC * uSpeed * smoothstep(0.15, 0.7, rd) * 0.06;
      float vl = length(vel);
      if (vl > 0.04) vel *= 0.04 / vl;
      vec3 acc = vec3(0.0); float w = 0.0;
      float jitter = hash(uv * 800.0 + uTime) - 0.5;
      for (int i = 0; i < 10; i++) {
        float t = (float(i) + jitter) / 10.0 - 0.5;
        vec2 p = clamp(uv + vel * t, 0.001, 0.999);
        acc += texture2D(tDiffuse, p).rgb; w += 1.0;
      }
      vec3 col = acc / w;
      // chromatic fringe toward the edges
      if (uFringe > 0.0) {
        vec2 off = toC * uFringe * (1.0 + uSpeed * 2.0) * rd;
        col.r = mix(col.r, texture2D(tDiffuse, uv + off).r, 0.7);
        col.b = mix(col.b, texture2D(tDiffuse, uv - off).b, 0.7);
      }
      // grade in HDR: exposure, saturation, contrast around mid grey, tint
      col *= uExposure * uTint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, uSat), 0.0);
      col = pow(col / 0.18, vec3(uContrast)) * 0.18;
      // vignette and grain
      float v = smoothstep(1.25, 0.35, rd);
      col *= mix(1.0 - uVignette, 1.0, v);
      col += (hash(uv * 1000.0 + fract(uTime)) - 0.5) * 0.012 * (0.3 + l);
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Graphics {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scale = 1;
    this.dynScale = 1;
    this.frameTimes = [];
    this.prevVP = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
  }

  setup(scene, camera, quality = 'high') {
    this.scene = scene; this.camera = camera;
    this.q = QUALITY[quality] ?? QUALITY.high;
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.q.samples });
    this.composer?.dispose();
    this.composer = new EffectComposer(r, rt);
    this.composer.renderToScreen = true;
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    if (this.q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.92);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio, 2) * this.q.scale * this.dynScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.final.uniforms.uAspect.value = w / h;
  }

  // adapt resolution to hold ~55+ fps; small, infrequent steps so it doesn't pulse
  adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const old = this.dynScale;
    if (avg > 1 / 45) this.dynScale = Math.max(0.55, this.dynScale - 0.1);
    else if (avg < 1 / 58 && this.dynScale < 1) this.dynScale = Math.min(1, this.dynScale + 0.05);
    if (old !== this.dynScale) this.resize();
  }

  render(dt, { speed = 0, blur = 0.5, exposure = 1, flash = 0 } = {}) {
    const cam = this.camera, U = this.final.uniforms;
    // reprojection: previous view-projection times the inverse of the current (rotation only)
    const vp = this.tmp.multiplyMatrices(cam.projectionMatrix, new THREE.Matrix4().extractRotation(cam.matrixWorldInverse));
    U.uReproj.value.copy(this.prevVP).multiply(new THREE.Matrix4().copy(vp).invert());
    this.prevVP.copy(vp);
    U.uBlur.value = blur;
    U.uSpeed.value = speed;
    U.uTime.value += dt;
    U.uExposure.value = exposure;
    U.uFlash.value = flash;
    this.composer.render(dt);
  }
}
