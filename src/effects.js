import * as THREE from 'three';
import { fbm } from './textures.js';

const PARTICLE_VERT = `attribute float size; attribute vec4 color; attribute float seed;
uniform float scale;
varying vec4 vC; varying float vSeed; varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  vC = color; vSeed = seed; vDepth = -mv.z;
}`;

const PARTICLE_FRAG = `uniform sampler2D map; uniform vec3 light; uniform vec3 fogCol; uniform float fogNear, fogFar, additive, spin;
varying vec4 vC; varying float vSeed; varying float vDepth;
void main() {
  float a = vSeed * 6.2831 + spin * vSeed;
  vec2 p = gl_PointCoord - 0.5;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p + 0.5;
  vec4 t = texture2D(map, p);
  float f = smoothstep(fogNear, fogFar, vDepth);
  vec3 col = vC.rgb * t.rgb * mix(light, vec3(1.0), additive);
  float alpha = vC.a * t.a;
  if (additive > 0.5) alpha *= 1.0 - f;
  else col = mix(col, fogCol, f);
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, max, { additive = false, map, fog }) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.base = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.sz = new Float32Array(max * 2);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.phys = new Float32Array(max * 3); // gravity, drag, bounce
    this.next = 0;
    this.live = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('seed', new THREE.BufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        scale: { value: 600 }, map: { value: map }, light: { value: new THREE.Color(1, 1, 1) },
        fogCol: fog.col, fogNear: fog.near, fogFar: fog.far, additive: { value: additive ? 1 : 0 }, spin: { value: 0 },
      },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0, bounce = 0.3) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 4] = r; this.base[i * 4 + 1] = g; this.base[i * 4 + 2] = b; this.base[i * 4 + 3] = a;
    this.sz[i * 2] = s0; this.sz[i * 2 + 1] = s1;
    this.life[i] = life; this.maxLife[i] = life;
    this.phys[i * 3] = grav; this.phys[i * 3 + 1] = drag; this.phys[i * 3 + 2] = bounce;
    this.seed[i] = Math.random();
    this.live = this.max;
  }

  update(dt) {
    if (!this.live) return;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.max(0, 1 - this.phys[i * 3 + 1] * dt);
      const i3 = i * 3;
      this.vel[i3] *= drag; this.vel[i3 + 2] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag - this.phys[i3] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -this.phys[i3 + 2];
        this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
      }
      this.size[i] = this.sz[i * 2] + (this.sz[i * 2 + 1] - this.sz[i * 2]) * (1 - (1 - t) * (1 - t));
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      // quick fade in, slow fade out
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, t * 12) * (1 - t) * (1 - t * 0.3);
    }
    this.live = alive;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.seed.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.size.fill(0); this.live = this.max; }
}

function spriteTex(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft billowing puff from noise
function puffTex(size, seed, hard = 1) {
  const n = fbm(size, 4, 5, seed, 0.55);
  return spriteTex((g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
      const v = n[y * s + x];
      const a = Math.max(0, Math.min(1, (1 - r) * 1.6 - (1 - v) * 0.9 * hard)) ** 1.3;
      const o = (y * s + x) * 4;
      const sh = 190 + v * 65;
      img.data[o] = sh; img.data[o + 1] = sh; img.data[o + 2] = sh; img.data[o + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  }, size);
}

export const flashTexture = spriteTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,250,230,1)'); grd.addColorStop(0.2, 'rgba(255,215,120,0.95)'); grd.addColorStop(0.55, 'rgba(255,140,40,0.35)'); grd.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = grd;
  g.translate(s / 2, s / 2);
  for (let i = 0; i < 7; i++) {
    g.rotate(Math.PI * 2 / 7 + (i % 2) * 0.2);
    g.beginPath(); g.moveTo(-s * 0.05, 0); g.lineTo(0, -s * (0.36 + (i % 3) * 0.05)); g.lineTo(s * 0.05, 0); g.fill();
  }
  g.beginPath(); g.arc(0, 0, s * 0.2, 0, 7); g.fill();
}, 128);

const glowTex = spriteTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
}, 32);

const chunkTex = spriteTex((g, s) => {
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28, r = s * (0.28 + Math.random() * 0.18); g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); }
  g.fill();
}, 32);

const holeTex = spriteTex((g, s) => {
  const c = s / 2;
  const grd = g.createRadialGradient(c, c, 0, c, c, c);
  grd.addColorStop(0, 'rgba(8,6,5,1)'); grd.addColorStop(0.18, 'rgba(20,16,12,0.95)'); grd.addColorStop(0.32, 'rgba(70,62,52,0.55)'); grd.addColorStop(0.6, 'rgba(40,34,28,0.2)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(25,20,15,0.6)'; g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * 6.28, l = c * (0.35 + Math.random() * 0.45);
    g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.15, c + Math.sin(a) * c * 0.15);
    g.lineTo(c + Math.cos(a + 0.2) * l * 0.6, c + Math.sin(a + 0.2) * l * 0.6); g.lineTo(c + Math.cos(a) * l, c + Math.sin(a) * l); g.stroke();
  }
});

const scorchTex = spriteTex((g, s) => {
  const n = fbm(s, 4, 4, 77);
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x / s - 0.5, dy = y / s - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
    const a = Math.max(0, Math.min(1, (1 - r) * 1.8 - (1 - n[y * s + x]) * 0.8));
    const o = (y * s + x) * 4;
    img.data[o] = 12; img.data[o + 1] = 10; img.data[o + 2] = 8; img.data[o + 3] = a * 235;
  }
  g.putImageData(img, 0, 0);
}, 128);

const bloodTex = spriteTex((g, s) => {
  g.fillStyle = 'rgba(90,6,4,0.85)';
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.2, 0, 7); g.fill();
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * 6.28, d = s * (0.15 + Math.random() * 0.3), r = s * (0.02 + Math.random() * 0.06);
    g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, r, 0, 7); g.fill();
  }
}, 64);

const ringTex = spriteTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
}, 128);

// surface → [dust rgb, sparks, splinters, chip rgb]
const SURF = {
  concrete: [[0.62, 0.6, 0.56], 0.3, 0, [0.5, 0.49, 0.46]],
  plaster: [[0.74, 0.66, 0.52], 0.2, 0, [0.7, 0.62, 0.48]],
  plaster2: [[0.7, 0.68, 0.64], 0.2, 0, [0.66, 0.64, 0.6]],
  brick: [[0.62, 0.42, 0.32], 0.2, 0, [0.5, 0.26, 0.18]],
  wall: [[0.58, 0.55, 0.5], 0.3, 0, [0.48, 0.45, 0.4]],
  trim: [[0.7, 0.68, 0.62], 0.2, 0, [0.6, 0.58, 0.52]],
  sandbag: [[0.62, 0.54, 0.38], 0, 0, [0.5, 0.44, 0.3]],
  hesco: [[0.6, 0.54, 0.4], 0.2, 0, [0.5, 0.44, 0.32]],
  crate: [[0.5, 0.4, 0.26], 0, 1, [0.46, 0.34, 0.2]],
  planks: [[0.46, 0.38, 0.28], 0, 1, [0.42, 0.33, 0.22]],
  deck: [[0.5, 0.42, 0.3], 0, 1, [0.44, 0.36, 0.26]],
  snowcap: [[0.92, 0.94, 0.97], 0, 0, [0.9, 0.92, 0.95]],
  roof: [[0.4, 0.37, 0.34], 0.2, 0, [0.3, 0.28, 0.26]],
  metal: [[0.4, 0.4, 0.4], 1, 0, [0.3, 0.3, 0.3]],
};
const METAL = [[0.35, 0.34, 0.33], 1, 0, [0.28, 0.27, 0.26]];

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const fog = { col: { value: new THREE.Color(0xd8cbb0) }, near: { value: 50 }, far: { value: 280 } };
    this.fog = fog;
    this.smoke = new Particles(scene, 3000, { map: puffTex(128, 11), fog });
    this.dust = new Particles(scene, 1500, { map: puffTex(64, 23, 1.4), fog });
    this.fire = new Particles(scene, 600, { additive: true, map: puffTex(64, 37, 1.2), fog });
    this.glow = new Particles(scene, 2000, { additive: true, map: glowTex, fog });
    this.debris = new Particles(scene, 900, { map: chunkTex, fog });
    this.systems = [this.smoke, this.dust, this.fire, this.glow, this.debris];
    this.groundDust = [0.6, 0.52, 0.4];

    this.tracers = [];
    const tgeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 5, 1, true).rotateX(Math.PI / 2);
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, active: false, speed: 400 });
    }

    const dgeo = new THREE.PlaneGeometry(1, 1);
    const decalMat = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...extra });
    this.holes = []; this.holeIdx = 0;
    const hm = decalMat(holeTex);
    for (let i = 0; i < 200; i++) { const m = new THREE.Mesh(dgeo, hm); m.visible = false; scene.add(m); this.holes.push(m); }
    this.scorches = []; this.scorchIdx = 0;
    const sm = decalMat(scorchTex);
    for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(dgeo, sm); m.visible = false; scene.add(m); this.scorches.push(m); }
    this.bloods = []; this.bloodIdx = 0;
    const bm = decalMat(bloodTex);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(dgeo, bm); m.visible = false; scene.add(m); this.bloods.push(m); }

    this.rings = [];
    const rgeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, color: 0xd8c8a8, opacity: 0 }));
      m.visible = false; scene.add(m);
      this.rings.push({ mesh: m, t: 1 });
    }

    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 12, 2);
    this.boomLight = new THREE.PointLight(0xff8a30, 0, 35, 2);
    scene.add(this.muzzleLight, this.boomLight);
    this.muzzleT = 0; this.boomT = 0; this.boomMax = 1;

    this.flashes = [];
    const fmat = new THREE.SpriteMaterial({ map: flashTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(2, 1.8, 1.5) });
    for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(fmat); s.visible = false; scene.add(s); this.flashes.push({ s, t: 0 }); }
    this.flashIdx = 0;
  }

  // match smoke lighting and fog to the map
  setLook(look, fog) {
    const c = new THREE.Color(look.sunColor).multiplyScalar(0.35 * look.sunIntensity / 3).add(new THREE.Color(look.hemiSky).multiplyScalar(0.55 * look.hemiIntensity / 0.5));
    c.r = Math.min(1.1, c.r); c.g = Math.min(1.1, c.g); c.b = Math.min(1.1, c.b);
    for (const s of this.systems) s.mat.uniforms.light.value.copy(c);
    this.fog.col.value.copy(fog.color); this.fog.near.value = fog.near; this.fog.far.value = fog.far;
    this.groundDust = look.groundDust || [0.6, 0.52, 0.4];
  }

  setScale(px) { for (const s of this.systems) s.mat.uniforms.scale.value = px; }

  tracer(from, to, color = 0xffd890, speed = 400) {
    const len = from.distanceTo(to);
    if (len < 1.5) return;
    const tr = this.tracers.find(t => !t.active) || this.tracers.reduce((a, b) => (a.t > b.t ? a : b));
    tr.from.copy(from);
    tr.dir.subVectors(to, from).divideScalar(len);
    tr.len = len;
    tr.t = 0; tr.active = true; tr.speed = speed;
    tr.mesh.material.color.setHex(color).multiplyScalar(2.2);
    tr.mesh.visible = false;
  }

  decal(p, n, size = 0.13) {
    const m = this.holes[this.holeIdx];
    this.holeIdx = (this.holeIdx + 1) % this.holes.length;
    m.position.copy(p).addScaledVector(n, 0.01);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    m.visible = true;
  }

  bloodSplat(p, n) {
    const m = this.bloods[this.bloodIdx];
    this.bloodIdx = (this.bloodIdx + 1) % this.bloods.length;
    m.position.copy(p).addScaledVector(n, 0.012);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(0.5 + Math.random() * 0.5);
    m.visible = true;
  }

  impact(p, n, mat = null) {
    const s = mat === 'ground' ? [this.groundDust, 0.1, 0, this.groundDust.map(v => v * 0.8)]
      : SURF[mat] || (mat && mat.startsWith('container') || mat === 'corrugated' || mat === 'invis' ? METAL : SURF.concrete);
    const [dc, sparks, splinter, cc] = s;
    const metal = sparks >= 1;
    this.decal(p, n, metal ? 0.08 : splinter ? 0.12 : 0.14);
    const nx = n.x, ny = n.y, nz = n.z, r = () => Math.random() - 0.5;
    // dust puff that drifts out of the surface
    for (let i = 0; i < (metal ? 2 : 5); i++) {
      this.dust.emit(p.x + nx * 0.05, p.y + ny * 0.05, p.z + nz * 0.05, nx * 1.4 + r() * 1.2, ny * 1.4 + Math.random() * 0.8, nz * 1.4 + r() * 1.2,
        0.7 + Math.random() * 0.8, 0.08, 0.7 + Math.random() * 0.4, dc[0], dc[1], dc[2], 0.55, -0.2, 3);
    }
    // a fast narrow jet
    for (let i = 0; i < 3; i++) {
      this.dust.emit(p.x, p.y, p.z, nx * 6 + r() * 2, ny * 6 + r() * 2 + 1, nz * 6 + r() * 2, 0.25 + Math.random() * 0.2, 0.05, 0.25, dc[0], dc[1], dc[2], 0.7, 2, 6);
    }
    // chips / splinters
    for (let i = 0; i < (splinter ? 8 : 5); i++) {
      this.debris.emit(p.x, p.y, p.z, nx * 3 + r() * 4, ny * 3 + Math.random() * 3.5, nz * 3 + r() * 4,
        0.5 + Math.random() * 0.6, splinter ? 0.05 : 0.035, splinter ? 0.04 : 0.03, cc[0], cc[1], cc[2], 1, 14, 0.5, 0.3);
    }
    const ns = metal ? 10 : Math.round(sparks * 6);
    for (let i = 0; i < ns; i++) {
      this.glow.emit(p.x, p.y, p.z, nx * 5 + r() * 7, ny * 5 + Math.random() * 5, nz * 5 + r() * 7,
        0.12 + Math.random() * 0.25, 0.035, 0.012, 3, 2.1, 1.0, 1, 12, 0.8, 0.4);
    }
    if (metal) this.glow.emit(p.x + nx * 0.03, p.y + ny * 0.03, p.z + nz * 0.03, 0, 0, 0, 0.06, 0.35, 0.2, 3, 2.2, 1.2, 1);
  }

  blood(p, d) {
    for (let i = 0; i < 10; i++) {
      this.smoke.emit(p.x, p.y, p.z, d.x * 2.5 + (Math.random() - 0.5) * 2, d.y * 2 + Math.random() * 1.2, d.z * 2.5 + (Math.random() - 0.5) * 2,
        0.3 + Math.random() * 0.35, 0.1, 0.45, 0.42, 0.03, 0.02, 0.8, 1.5, 3);
    }
    for (let i = 0; i < 10; i++) {
      this.debris.emit(p.x, p.y, p.z, d.x * 4 + (Math.random() - 0.5) * 3, d.y * 3 + Math.random() * 2, d.z * 4 + (Math.random() - 0.5) * 3,
        0.4 + Math.random() * 0.4, 0.035, 0.025, 0.35, 0.02, 0.02, 1, 14, 0.4, 0);
    }
  }

  flash(p, scale = 0.6) {
    const f = this.flashes[this.flashIdx];
    this.flashIdx = (this.flashIdx + 1) % this.flashes.length;
    f.s.position.copy(p);
    f.s.scale.setScalar(scale * (0.8 + Math.random() * 0.4));
    f.s.material.rotation = Math.random() * 6.28;
    f.s.visible = true; f.t = 0.05;
    this.muzzleLight.position.copy(p);
    this.muzzleLight.intensity = 8; this.muzzleT = 0.05;
    this.smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, 0.6, 0.1, 0.5, 0.75, 0.73, 0.7, 0.12, -0.3, 2);
  }

  // muzzle smoke for the player's own gun
  muzzleSmoke(p, dir) {
    for (let i = 0; i < 2; i++) {
      this.smoke.emit(p.x + dir.x * 0.1, p.y + dir.y * 0.1, p.z + dir.z * 0.1, dir.x * 0.8 + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.2, dir.z * 0.8 + (Math.random() - 0.5) * 0.3,
        0.5 + Math.random() * 0.4, 0.05, 0.35, 0.8, 0.78, 0.75, 0.1, -0.4, 3);
    }
  }

  explosion(p, big = 1) {
    this.boomLight.position.set(p.x, p.y + 1.5, p.z);
    this.boomMax = 90 * big; this.boomLight.intensity = this.boomMax; this.boomT = 0.45;
    const r = () => Math.random() - 0.5;
    // core flash and fireball puffs
    this.glow.emit(p.x, p.y + 0.8, p.z, 0, 0, 0, 0.12, 5 * big, 7 * big, 4, 3, 2, 1);
    for (let i = 0; i < 26 * big; i++) {
      const a = Math.random() * 6.28, s = Math.random() * 5 * big;
      this.fire.emit(p.x + r() * big, p.y + 0.4 + Math.random() * big, p.z + r() * big, Math.cos(a) * s, 1.5 + Math.random() * 4, Math.sin(a) * s,
        0.35 + Math.random() * 0.45, 1.2 * big, (2.4 + Math.random() * 1.6) * big, 3, 1.6 + Math.random() * 0.6, 0.5, 1, -2, 3);
    }
    // sparks and embers
    for (let i = 0; i < 70 * big; i++) {
      const a = Math.random() * 6.28, u = Math.random(), s = 6 + Math.random() * 14;
      this.glow.emit(p.x, p.y + 0.4, p.z, Math.cos(a) * s * u, 3 + Math.random() * 12, Math.sin(a) * s * u,
        0.5 + Math.random() * 1.2, 0.07, 0.02, 3, 1.6 + Math.random() * 0.8, 0.5, 1, 14, 0.8, 0.4);
    }
    // thick smoke column
    for (let i = 0; i < 34 * big; i++) {
      const a = Math.random() * 6.28, s = Math.random() * 3.5;
      const c = 0.14 + Math.random() * 0.14;
      this.smoke.emit(p.x + Math.cos(a) * s * 0.3, p.y + 0.6 + Math.random(), p.z + Math.sin(a) * s * 0.3, Math.cos(a) * s, 1.2 + Math.random() * 3.5, Math.sin(a) * s,
        3 + Math.random() * 3.5, 1.4, (5 + Math.random() * 2) * big, c, c * 0.96, c * 0.92, 0.8, -0.35, 1.1);
    }
    // ground dust ring
    const gd = this.groundDust;
    for (let i = 0; i < 28 * big; i++) {
      const a = i / (28 * big) * 6.28, s = 7 + Math.random() * 4;
      this.dust.emit(p.x, p.y + 0.2, p.z, Math.cos(a) * s, 0.4 + Math.random() * 0.8, Math.sin(a) * s,
        1.6 + Math.random() * 1.2, 0.8, 3.2 * big, gd[0], gd[1], gd[2], 0.6, 0, 2.2);
    }
    // debris
    for (let i = 0; i < 40 * big; i++) {
      this.debris.emit(p.x, p.y + 0.2, p.z, r() * 16, 4 + Math.random() * 11, r() * 16,
        1 + Math.random() * 1.4, 0.09, 0.07, 0.16, 0.14, 0.12, 1, 18, 0.2, 0.35);
    }
    const ring = this.rings.find(q => q.t >= 1) || this.rings[0];
    ring.t = 0; ring.big = big; ring.mesh.position.set(p.x, Math.max(0.05, p.y + 0.05), p.z); ring.mesh.visible = true;
  }

  // tank gun: a blast of smoke along the barrel and a hard flash
  cannonBlast(p, d) {
    const r = () => Math.random() - 0.5;
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 0.08, 2.5, 3.5, 4, 3, 2, 1);
    for (let i = 0; i < 18; i++) {
      const s = 2 + Math.random() * 7;
      this.smoke.emit(p.x, p.y, p.z, d.x * s + r() * 2, d.y * s + Math.random(), d.z * s + r() * 2,
        1.5 + Math.random() * 1.5, 0.4, 2.8, 0.62, 0.6, 0.57, 0.5, -0.2, 1.6);
    }
    for (let i = 0; i < 12; i++) this.glow.emit(p.x, p.y, p.z, d.x * 20 + r() * 8, d.y * 20 + r() * 8, d.z * 20 + r() * 8, 0.2 + Math.random() * 0.2, 0.08, 0.02, 3, 1.8, 0.7, 1, 6, 0.6);
  }

  // flak and other air bursts: a flash and a hanging black puff
  airBurst(p, s = 1) {
    const r = () => Math.random() - 0.5;
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 0.08, 1.6 * s, 2.6 * s, 4, 2.6, 1.4, 1);
    for (let i = 0; i < 8; i++) {
      this.smoke.emit(p.x + r() * s, p.y + r() * s, p.z + r() * s, r() * 2, r() * 2, r() * 2,
        2 + Math.random() * 1.5, 0.8 * s, 2.6 * s, 0.12, 0.11, 0.1, 0.85, -0.1, 1.2);
    }
    for (let i = 0; i < 14; i++) this.glow.emit(p.x, p.y, p.z, r() * 18, r() * 18, r() * 18, 0.3 + Math.random() * 0.4, 0.06, 0.02, 3, 1.8, 0.8, 1, 8, 0.8);
  }

  // rocket and missile exhaust
  trail(p, d) {
    const r = () => (Math.random() - 0.5) * 0.4;
    this.smoke.emit(p.x, p.y, p.z, r() - d.x * 2, r() + 0.2 - d.y * 2, r() - d.z * 2, 1.2 + Math.random(), 0.18, 1.1, 0.78, 0.76, 0.74, 0.5, -0.15, 1.5);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 0.05, 0.5, 0.2, 4, 2.4, 1, 1);
  }

  scorch(p, n) {
    const m = this.scorches[this.scorchIdx];
    this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;
    m.position.copy(p).addScaledVector(n, 0.02);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(4.5 + Math.random());
    m.visible = true;
  }

  update(dt) {
    for (const s of this.systems) s.update(dt);
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.t += dt;
      const dist = tr.t * tr.speed;
      const head = Math.min(tr.len, dist);
      const tail = Math.max(0, dist - 9);
      // done once the tail has passed the end, however short the shot was
      if (tail >= tr.len) { tr.active = false; tr.mesh.visible = false; continue; }
      const seg = head - tail;
      if (seg < 0.01) { tr.mesh.visible = false; continue; }
      tr.mesh.visible = true;
      tr.mesh.position.copy(tr.from).addScaledVector(tr.dir, tail + seg / 2);
      tr.mesh.lookAt(tr.mesh.position.x + tr.dir.x, tr.mesh.position.y + tr.dir.y, tr.mesh.position.z + tr.dir.z);
      tr.mesh.scale.set(1, 1, seg);
      tr.mesh.material.opacity = 0.85;
    }
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / 0.5);
      r.mesh.scale.setScalar((1 + r.t * 16) * r.big);
      r.mesh.material.opacity = (1 - r.t) * 0.5;
      if (r.t >= 1) r.mesh.visible = false;
    }
    for (const f of this.flashes) if (f.t > 0 && (f.t -= dt) <= 0) f.s.visible = false;
    if (this.muzzleT > 0 && (this.muzzleT -= dt) <= 0) this.muzzleLight.intensity = 0;
    if (this.boomT > 0) { this.boomT -= dt; this.boomLight.intensity = Math.max(0, this.boomT / 0.45) ** 2 * this.boomMax; }
  }

  clear() {
    for (const m of this.holes) m.visible = false;
    for (const m of this.scorches) m.visible = false;
    for (const m of this.bloods) m.visible = false;
    for (const t of this.tracers) { t.active = false; t.mesh.visible = false; }
    for (const s of this.systems) s.clear();
  }
}
