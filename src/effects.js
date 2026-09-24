import * as THREE from 'three';

class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.base = new Float32Array(max * 4); // r g b a0
    this.size = new Float32Array(max);
    this.sz = new Float32Array(max * 2);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.phys = new Float32Array(max * 2); // gravity, drag
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; vC = color; }`,
      fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.15, d)); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 4] = r; this.base[i * 4 + 1] = g; this.base[i * 4 + 2] = b; this.base[i * 4 + 3] = a;
    this.sz[i * 2] = s0; this.sz[i * 2 + 1] = s1;
    this.life[i] = life; this.maxLife[i] = life;
    this.phys[i * 2] = grav; this.phys[i * 2 + 1] = drag;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.max(0, 1 - this.phys[i * 2 + 1] * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.phys[i * 2] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.sz[i * 2] + (this.sz[i * 2 + 1] - this.sz[i * 2]) * t;
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * (1 - t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
  }
}

function spriteTex(draw, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const flashTexture = spriteTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,200,90,0.9)'); grd.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grd;
  g.translate(s / 2, s / 2);
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-s * 0.06, 0); g.lineTo(0, -s / 2); g.lineTo(s * 0.06, 0); g.fill(); }
  g.beginPath(); g.arc(0, 0, s * 0.22, 0, 7); g.fill();
}, 128);

const holeTex = spriteTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(10,8,6,1)'); grd.addColorStop(0.3, 'rgba(25,20,15,0.9)'); grd.addColorStop(0.55, 'rgba(60,50,40,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});

const scorchTex = spriteTex((g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(8,6,4,0.95)'); grd.addColorStop(0.6, 'rgba(20,15,10,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
}, 128);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new Particles(scene, 2500, false);
    this.glow = new Particles(scene, 1500, true);

    this.tracers = [];
    const tgeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true).rotateX(Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tgeo, new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, active: false });
    }

    const dgeo = new THREE.PlaneGeometry(1, 1);
    const decalMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holes = []; this.holeIdx = 0;
    const hm = decalMat(holeTex);
    for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(dgeo, hm); m.visible = false; scene.add(m); this.holes.push(m); }
    this.scorches = []; this.scorchIdx = 0;
    const sm = decalMat(scorchTex);
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(dgeo, sm); m.visible = false; scene.add(m); this.scorches.push(m); }

    this.fireballs = [];
    const fgeo = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.fireballs.push({ mesh: m, t: 1 });
    }

    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 10, 2);
    this.boomLight = new THREE.PointLight(0xff8a30, 0, 30, 2);
    scene.add(this.muzzleLight, this.boomLight);
    this.muzzleT = 0; this.boomT = 0;

    this.flashes = [];
    const fmat = new THREE.SpriteMaterial({ map: flashTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(fmat); s.visible = false; scene.add(s); this.flashes.push({ s, t: 0 }); }
    this.flashIdx = 0;
  }

  setScale(px) { this.smoke.mat.uniforms.scale.value = px; this.glow.mat.uniforms.scale.value = px; }

  tracer(from, to, color = 0xffd890) {
    const tr = this.tracers.find(t => !t.active) || this.tracers[0];
    tr.from.copy(from);
    tr.dir.subVectors(to, from);
    tr.len = tr.dir.length();
    if (tr.len < 1) return;
    tr.dir.divideScalar(tr.len);
    tr.t = 0; tr.active = true;
    tr.mesh.material.color.setHex(color);
    tr.mesh.visible = true;
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

  impact(p, n) {
    this.decal(p, n);
    for (let i = 0; i < 6; i++) {
      this.smoke.emit(p.x, p.y, p.z, n.x * 1.5 + (Math.random() - 0.5) * 1.5, n.y * 1.5 + Math.random() * 1.2, n.z * 1.5 + (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.4, 0.06, 0.3, 0.55, 0.5, 0.42, 0.55, 1, 2);
    }
    for (let i = 0; i < 4; i++) {
      this.glow.emit(p.x, p.y, p.z, n.x * 4 + (Math.random() - 0.5) * 5, n.y * 4 + Math.random() * 4, n.z * 4 + (Math.random() - 0.5) * 5,
        0.15 + Math.random() * 0.15, 0.04, 0.01, 1, 0.75, 0.35, 1, 12, 1);
    }
  }

  blood(p, d) {
    for (let i = 0; i < 8; i++) {
      this.smoke.emit(p.x, p.y, p.z, d.x * 2 + (Math.random() - 0.5) * 2, d.y * 2 + Math.random() * 1.5, d.z * 2 + (Math.random() - 0.5) * 2,
        0.35 + Math.random() * 0.3, 0.08, 0.25, 0.45, 0.04, 0.03, 0.85, 6, 2);
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
    this.muzzleLight.intensity = 6; this.muzzleT = 0.05;
  }

  explosion(p, big = 1) {
    const fb = this.fireballs.find(f => f.t >= 1) || this.fireballs[0];
    fb.t = 0; fb.big = big; fb.mesh.position.copy(p); fb.mesh.visible = true;
    this.boomLight.position.set(p.x, p.y + 1.5, p.z);
    this.boomLight.intensity = 60 * big; this.boomT = 0.35;
    for (let i = 0; i < 40 * big; i++) {
      const a = Math.random() * 6.28, u = Math.random(), s = 3 + Math.random() * 7;
      this.glow.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * s * u, 2 + Math.random() * 8, Math.sin(a) * s * u,
        0.3 + Math.random() * 0.5, 0.25, 0.05, 1, 0.55 + Math.random() * 0.3, 0.2, 1, 14, 1);
    }
    for (let i = 0; i < 26 * big; i++) {
      const a = Math.random() * 6.28, s = Math.random() * 3;
      const c = 0.18 + Math.random() * 0.15;
      this.smoke.emit(p.x + Math.cos(a) * s * 0.3, p.y + 0.5, p.z + Math.sin(a) * s * 0.3, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s,
        2 + Math.random() * 2.5, 1.2, 4.5 * big, c, c * 0.95, c * 0.9, 0.75, -0.3, 1.2);
    }
    for (let i = 0; i < 20; i++) {
      this.smoke.emit(p.x, p.y + 0.2, p.z, (Math.random() - 0.5) * 12, 3 + Math.random() * 9, (Math.random() - 0.5) * 12,
        0.8 + Math.random() * 0.6, 0.07, 0.06, 0.2, 0.17, 0.14, 1, 18, 0.5);
    }
  }

  scorch(p, n) {
    const m = this.scorches[this.scorchIdx];
    this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;
    m.position.copy(p).addScaledVector(n, 0.02);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    m.scale.setScalar(4 + Math.random());
    m.visible = true;
  }

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.t += dt;
      const head = Math.min(tr.len, tr.t * 420);
      const tail = Math.max(0, head - 7);
      if (tail >= tr.len - 0.01) { tr.active = false; tr.mesh.visible = false; continue; }
      const seg = head - tail;
      tr.mesh.position.copy(tr.from).addScaledVector(tr.dir, tail + seg / 2);
      tr.mesh.lookAt(tr.mesh.position.x + tr.dir.x, tr.mesh.position.y + tr.dir.y, tr.mesh.position.z + tr.dir.z);
      tr.mesh.scale.set(1, 1, seg);
      tr.mesh.material.opacity = 0.75;
    }
    for (const fb of this.fireballs) {
      if (fb.t >= 1) continue;
      fb.t = Math.min(1, fb.t + dt / 0.4);
      fb.mesh.scale.setScalar((0.6 + fb.t * 3.2) * fb.big);
      fb.mesh.material.opacity = (1 - fb.t) * 0.9;
      fb.mesh.material.color.setRGB(1, 0.7 - fb.t * 0.4, 0.3 - fb.t * 0.25);
      if (fb.t >= 1) fb.mesh.visible = false;
    }
    for (const f of this.flashes) if (f.t > 0 && (f.t -= dt) <= 0) f.s.visible = false;
    if (this.muzzleT > 0 && (this.muzzleT -= dt) <= 0) this.muzzleLight.intensity = 0;
    if (this.boomT > 0) { this.boomT -= dt; this.boomLight.intensity = Math.max(0, this.boomT / 0.35) * 60; }
  }

  clear() {
    for (const m of this.holes) m.visible = false;
    for (const m of this.scorches) m.visible = false;
  }
}
