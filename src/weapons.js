import * as THREE from 'three';
import { flashTexture } from './effects.js';

// Spread values are degrees; recoil is degrees per shot.
export const WEAPONS = {
  ar: {
    name: 'AR-4', model: 'ar', auto: true, rpm: 750, dmg: [30, 21], range: [22, 45], head: 1.5,
    mag: 30, reserve: 150, reload: 2.1, reloadEmpty: 2.6, hip: 3.2, ads: 0.12, move: 2.5, bloom: 0.35, bloomMax: 2.5,
    adsTime: 0.22, fov: 52, recoil: { v: 0.5, h: 0.22 }, kick: 0.035, speed: 0.95, pref: 24,
  },
  smg: {
    name: 'VX-9', model: 'smg', auto: true, rpm: 900, dmg: [26, 16], range: [10, 25], head: 1.4,
    mag: 32, reserve: 192, reload: 1.8, reloadEmpty: 2.2, hip: 2.2, ads: 0.35, move: 1.4, bloom: 0.25, bloomMax: 2,
    adsTime: 0.16, fov: 60, recoil: { v: 0.35, h: 0.3 }, kick: 0.025, speed: 1.05, pref: 12,
  },
  lmg: {
    name: 'HMG-7', model: 'lmg', auto: true, rpm: 650, dmg: [33, 25], range: [30, 60], head: 1.4,
    mag: 100, reserve: 200, reload: 4.8, reloadEmpty: 5.4, hip: 4.2, ads: 0.2, move: 3.5, bloom: 0.4, bloomMax: 3.5,
    adsTime: 0.34, fov: 50, recoil: { v: 0.45, h: 0.3 }, kick: 0.04, speed: 0.85, pref: 28,
  },
  sniper: {
    name: 'RSK-50', model: 'sniper', auto: false, rpm: 48, dmg: [120, 105], range: [60, 100], head: 2,
    mag: 5, reserve: 25, reload: 3.0, reloadEmpty: 3.4, hip: 7, ads: 0, move: 6, bloom: 0, bloomMax: 0,
    adsTime: 0.36, fov: 18, recoil: { v: 3.2, h: 0.5 }, kick: 0.12, speed: 0.9, pref: 45, action: 'bolt', scope: true,
  },
  shotgun: {
    name: 'M-87', model: 'shotgun', auto: false, rpm: 70, dmg: [18, 5], range: [7, 18], head: 1.3, pellets: 9,
    mag: 6, reserve: 30, shellReload: true, shellTime: 0.45, hip: 5.5, ads: 3.8, move: 1, bloom: 0, bloomMax: 0,
    adsTime: 0.2, fov: 62, recoil: { v: 2.2, h: 0.6 }, kick: 0.1, speed: 1, pref: 7, action: 'pump',
  },
  pistol: {
    name: 'P-12', model: 'pistol', auto: false, rpm: 420, dmg: [34, 20], range: [12, 28], head: 1.6,
    mag: 15, reserve: 75, reload: 1.4, reloadEmpty: 1.7, hip: 2.2, ads: 0.4, move: 1.5, bloom: 0.5, bloomMax: 2,
    adsTime: 0.14, fov: 62, recoil: { v: 0.9, h: 0.3 }, kick: 0.05, speed: 1.1, pref: 12,
  },
};

export const CLASSES = {
  assault: { name: 'Assault', desc: 'AR-4 rifle. Good at every range.', primary: 'ar', secondary: 'pistol', frags: 2 },
  rusher: { name: 'Rusher', desc: 'VX-9 SMG. Fast, strong up close.', primary: 'smg', secondary: 'pistol', frags: 2 },
  support: { name: 'Support', desc: 'HMG-7, 100-round belt. Slow to move.', primary: 'lmg', secondary: 'pistol', frags: 2 },
  marksman: { name: 'Marksman', desc: 'RSK-50 bolt-action. One shot to the chest.', primary: 'sniper', secondary: 'pistol', frags: 1 },
  breacher: { name: 'Breacher', desc: 'M-87 pump shotgun and 3 frags.', primary: 'shotgun', secondary: 'pistol', frags: 3 },
};

export function falloff(def, dist) {
  const [n, f] = def.range;
  if (dist <= n) return def.dmg[0];
  if (dist >= f) return def.dmg[1];
  return def.dmg[0] + (def.dmg[1] - def.dmg[0]) * (dist - n) / (f - n);
}

// ---------- viewmodels ----------
const M = {
  metal: new THREE.MeshStandardMaterial({ color: 0x45484b, roughness: 0.5, metalness: 0.3 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x3e4038, roughness: 0.8 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x8c7b5c, roughness: 0.8 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.65 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x6e7052, roughness: 0.95 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x3a3733, roughness: 0.9 }),
  glass: new THREE.MeshBasicMaterial({ color: 0x9fc4e0, transparent: true, opacity: 0.12, depthWrite: false }),
  dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  lens: new THREE.MeshStandardMaterial({ color: 0x14283a, roughness: 0.15, metalness: 0.4 }),
  blade: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 0.4 }),
  nade: new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.7 }),
};

const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cy = (r, l, s = 12) => new THREE.CylinderGeometry(r, r, l, s).rotateX(Math.PI / 2);
function part(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

function reflex(g, y, z, s) {
  const t = 0.007;
  part(g, bx(s + t, t, 0.035), M.metal, 0, y + s / 2, z);
  part(g, bx(s + t, t, 0.035), M.metal, 0, y - s / 2, z);
  part(g, bx(t, s, 0.035), M.metal, -s / 2, y, z);
  part(g, bx(t, s, 0.035), M.metal, s / 2, y, z);
  part(g, new THREE.PlaneGeometry(s, s), M.glass, 0, y, z - 0.01);
  part(g, new THREE.CircleGeometry(0.0022, 10), M.dot, 0, y, z - 0.009);
  part(g, bx(0.03, y - s / 2 - 0.05, 0.05), M.metal, 0, (y - s / 2 + 0.05) / 2, z);
}

function arms(g, grip, fore) {
  part(g, bx(0.055, 0.085, 0.09), M.glove, grip[0] + 0.005, grip[1], grip[2]);
  part(g, bx(0.08, 0.08, 0.3), M.sleeve, grip[0] + 0.05, grip[1] - 0.08, grip[2] + 0.17, 0.5, 0.2, 0);
  part(g, bx(0.06, 0.05, 0.11), M.glove, fore[0] - 0.01, fore[1] - 0.045, fore[2]);
  part(g, bx(0.08, 0.08, 0.34), M.sleeve, fore[0] - 0.09, fore[1] - 0.12, fore[2] + 0.17, 0.55, -0.5, 0);
}

function muzzleFlash(g, z, y, size) {
  const mat = new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f = new THREE.Group();
  f.position.set(0, y, z);
  const long = new THREE.PlaneGeometry(size * 0.6, size * 1.6).rotateX(Math.PI / 2).translate(0, 0, -size * 0.6);
  f.add(new THREE.Mesh(long, mat));
  const l2 = new THREE.Mesh(long, mat); l2.rotation.z = Math.PI / 2; f.add(l2);
  f.add(new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat));
  f.visible = false;
  g.add(f);
  return f;
}

function finish(g, o) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, o.muzzleY, o.muzzleZ);
  g.add(muzzle);
  o.flash = muzzleFlash(g, o.muzzleZ, o.muzzleY, o.flashSize || 0.18);
  o.root = g;
  o.muzzle = muzzle;
  o.magBase = o.mag.position.clone();
  o.adsPos = new THREE.Vector3(0, -o.sightY, -o.adsDist - o.sightZ);
  g.traverse(m => { if (m.isMesh) m.frustumCulled = false; });
  return o;
}

const BUILD = {
  ar() {
    const g = new THREE.Group();
    part(g, bx(0.06, 0.09, 0.4), M.metal, 0, 0, 0);
    part(g, bx(0.045, 0.018, 0.42), M.metal, 0, 0.054, -0.02);
    part(g, bx(0.07, 0.075, 0.3), M.tan, 0, 0.005, -0.34);
    part(g, cy(0.011, 0.2), M.metal, 0, 0.01, -0.58);
    part(g, cy(0.017, 0.07), M.metal, 0, 0.01, -0.7);
    const mag = part(g, bx(0.045, 0.19, 0.085), M.poly, 0, -0.13, -0.07, 0.18);
    part(g, bx(0.04, 0.11, 0.05), M.poly, 0, -0.095, 0.12, -0.35);
    part(g, bx(0.05, 0.09, 0.24), M.tan, 0, -0.01, 0.33);
    reflex(g, 0.108, -0.05, 0.05);
    arms(g, [0, -0.1, 0.12], [0, -0.01, -0.34]);
    return finish(g, { mag, muzzleZ: -0.745, muzzleY: 0.01, sightY: 0.108, sightZ: -0.05, adsDist: 0.26, hip: new THREE.Vector3(0.14, -0.17, -0.5) });
  },
  smg() {
    const g = new THREE.Group();
    part(g, bx(0.055, 0.085, 0.3), M.poly, 0, 0, -0.02);
    part(g, bx(0.04, 0.016, 0.3), M.metal, 0, 0.05, -0.02);
    part(g, bx(0.06, 0.07, 0.12), M.poly, 0, -0.005, -0.22);
    part(g, cy(0.012, 0.1), M.metal, 0, 0.01, -0.32);
    const mag = part(g, bx(0.035, 0.2, 0.055), M.metal, 0, -0.14, -0.04);
    part(g, bx(0.038, 0.1, 0.048), M.poly, 0, -0.09, 0.08, -0.25);
    part(g, bx(0.012, 0.012, 0.22), M.metal, 0.02, 0.0, 0.2);
    part(g, bx(0.012, 0.012, 0.22), M.metal, -0.02, 0.0, 0.2);
    part(g, bx(0.05, 0.07, 0.02), M.poly, 0, -0.01, 0.31);
    reflex(g, 0.095, -0.02, 0.045);
    arms(g, [0, -0.09, 0.08], [0, -0.01, -0.21]);
    return finish(g, { mag, muzzleZ: -0.375, muzzleY: 0.01, sightY: 0.095, sightZ: -0.02, adsDist: 0.24, hip: new THREE.Vector3(0.13, -0.16, -0.44), flashSize: 0.14 });
  },
  lmg() {
    const g = new THREE.Group();
    part(g, bx(0.08, 0.11, 0.45), M.metal, 0, 0, 0);
    part(g, bx(0.05, 0.018, 0.4), M.metal, 0, 0.064, -0.05);
    part(g, cy(0.016, 0.42), M.metal, 0, 0.015, -0.46);
    part(g, bx(0.05, 0.03, 0.3), M.poly, 0, 0.045, -0.42);
    part(g, cy(0.024, 0.08), M.metal, 0, 0.015, -0.7);
    part(g, bx(0.012, 0.012, 0.25), M.metal, 0.02, -0.03, -0.45);
    part(g, bx(0.012, 0.012, 0.25), M.metal, -0.02, -0.03, -0.45);
    const mag = part(g, bx(0.11, 0.12, 0.13), M.poly, -0.02, -0.11, -0.06);
    part(g, bx(0.04, 0.11, 0.05), M.poly, 0, -0.1, 0.14, -0.3);
    part(g, bx(0.06, 0.1, 0.26), M.poly, 0, -0.01, 0.34);
    reflex(g, 0.125, -0.08, 0.052);
    arms(g, [0, -0.1, 0.14], [0, -0.02, -0.3]);
    return finish(g, { mag, muzzleZ: -0.75, muzzleY: 0.015, sightY: 0.125, sightZ: -0.08, adsDist: 0.28, hip: new THREE.Vector3(0.15, -0.18, -0.5), flashSize: 0.22 });
  },
  sniper() {
    const g = new THREE.Group();
    part(g, bx(0.06, 0.08, 0.45), M.metal, 0, 0, 0);
    part(g, cy(0.013, 0.52), M.metal, 0, 0.01, -0.48);
    part(g, cy(0.02, 0.08), M.metal, 0, 0.01, -0.77);
    part(g, bx(0.065, 0.075, 0.35), M.tan, 0, -0.01, -0.28);
    part(g, bx(0.06, 0.12, 0.34), M.tan, 0, -0.025, 0.36);
    part(g, bx(0.05, 0.04, 0.15), M.tan, 0, 0.055, 0.34);
    const mag = part(g, bx(0.05, 0.08, 0.1), M.poly, 0, -0.07, -0.04);
    part(g, bx(0.04, 0.11, 0.05), M.tan, 0, -0.09, 0.13, -0.3);
    part(g, cy(0.007, 0.05), M.metal, 0.045, 0.02, 0.1, 0, Math.PI / 2, 0).rotation.set(0, Math.PI / 2, 0);
    part(g, new THREE.SphereGeometry(0.012, 8, 6), M.metal, 0.07, 0.02, 0.1);
    part(g, cy(0.022, 0.34), M.metal, 0, 0.1, -0.05);
    part(g, cy(0.032, 0.09), M.metal, 0, 0.1, -0.25);
    part(g, cy(0.028, 0.07), M.metal, 0, 0.1, 0.15);
    part(g, bx(0.02, 0.05, 0.03), M.metal, 0, 0.065, -0.14);
    part(g, bx(0.02, 0.05, 0.03), M.metal, 0, 0.065, 0.06);
    part(g, new THREE.CircleGeometry(0.026, 16), M.lens, 0, 0.1, 0.186);
    arms(g, [0, -0.09, 0.13], [0, -0.03, -0.3]);
    return finish(g, { mag, muzzleZ: -0.815, muzzleY: 0.01, sightY: 0.1, sightZ: 0.15, adsDist: 0.12, hip: new THREE.Vector3(0.14, -0.17, -0.52), flashSize: 0.2 });
  },
  shotgun() {
    const g = new THREE.Group();
    part(g, bx(0.06, 0.085, 0.3), M.metal, 0, 0, 0);
    part(g, cy(0.016, 0.5), M.metal, 0, 0.02, -0.4);
    part(g, cy(0.014, 0.4), M.metal, 0, -0.022, -0.36);
    const pump = part(g, bx(0.07, 0.06, 0.2), M.wood, 0, -0.022, -0.36);
    part(g, bx(0.05, 0.1, 0.32), M.wood, 0, -0.04, 0.3, 0.1);
    part(g, new THREE.SphereGeometry(0.006, 8, 6), M.dot, 0, 0.04, -0.63);
    const mag = part(g, bx(0.02, 0.02, 0.05), M.metal, 0, -0.04, 0.02);
    arms(g, [0, -0.08, 0.14], [0, -0.022, -0.36]);
    const o = finish(g, { mag, muzzleZ: -0.65, muzzleY: 0.02, sightY: 0.04, sightZ: 0, adsDist: 0.34, hip: new THREE.Vector3(0.14, -0.17, -0.5), flashSize: 0.28 });
    o.pump = pump; o.pumpBase = pump.position.z;
    return o;
  },
  pistol() {
    const g = new THREE.Group();
    part(g, bx(0.035, 0.035, 0.18), M.poly, 0, 0, -0.03);
    const slide = part(g, bx(0.038, 0.036, 0.2), M.metal, 0, 0.034, -0.03);
    part(g, bx(0.034, 0.11, 0.05), M.poly, 0, -0.065, 0.04, -0.2);
    const mag = part(g, bx(0.03, 0.1, 0.04), M.metal, 0, -0.075, 0.045, -0.2);
    part(g, bx(0.006, 0.012, 0.008), M.metal, 0, 0.058, -0.12);
    part(g, bx(0.008, 0.012, 0.008), M.metal, 0.01, 0.058, 0.06);
    part(g, bx(0.008, 0.012, 0.008), M.metal, -0.01, 0.058, 0.06);
    part(g, bx(0.06, 0.085, 0.09), M.glove, 0.005, -0.06, 0.05);
    part(g, bx(0.085, 0.085, 0.4), M.sleeve, 0.06, -0.15, 0.25, 0.5, 0.15, 0);
    part(g, bx(0.05, 0.08, 0.08), M.glove, -0.03, -0.07, 0.04);
    part(g, bx(0.085, 0.085, 0.42), M.sleeve, -0.1, -0.16, 0.25, 0.5, -0.35, 0);
    const o = finish(g, { mag, muzzleZ: -0.135, muzzleY: 0.034, sightY: 0.058, sightZ: 0, adsDist: 0.36, hip: new THREE.Vector3(0.11, -0.13, -0.4), flashSize: 0.12 });
    o.slide = slide; o.slideBase = slide.position.z;
    return o;
  },
};

function buildKnife() {
  const g = new THREE.Group();
  part(g, bx(0.028, 0.032, 0.11), M.glove, 0, 0, 0);
  part(g, bx(0.05, 0.012, 0.012), M.metal, 0, 0, -0.06);
  part(g, bx(0.005, 0.03, 0.17), M.blade, 0, 0.003, -0.15);
  part(g, bx(0.06, 0.085, 0.09), M.glove, 0, -0.01, 0.01);
  part(g, bx(0.085, 0.085, 0.42), M.sleeve, 0.03, -0.1, 0.22, 0.45, 0, 0);
  g.visible = false;
  return g;
}

function buildNade() {
  const g = new THREE.Group();
  part(g, new THREE.SphereGeometry(0.035, 12, 10), M.nade, 0, 0, 0);
  part(g, bx(0.02, 0.03, 0.02), M.metal, 0, 0.04, 0);
  part(g, bx(0.06, 0.085, 0.09), M.glove, 0, -0.04, 0.03);
  part(g, bx(0.085, 0.085, 0.42), M.sleeve, -0.03, -0.12, 0.24, 0.45, 0, 0);
  g.visible = false;
  return g;
}

export const FUSE = 3.5;
const smooth = (t) => t * t * (3 - 2 * t);
const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3();

// The player's two guns, knife and grenades: timing, ammo and the viewmodel pose.
export class Arsenal {
  constructor(game, wscene) {
    this.game = game;
    this.holder = new THREE.Group();
    wscene.add(this.holder);
    this.knife = buildKnife();
    this.nade = buildNade();
    this.holder.add(this.knife, this.nade);
    this.slots = [];
    this.cur = 0;
  }

  get w() { return this.slots[this.cur]; }

  equip(cls) {
    for (const s of this.slots) this.holder.remove(s.model.root);
    this.slots = [cls.primary, cls.secondary].map(id => {
      const def = WEAPONS[id], model = BUILD[def.model]();
      model.root.visible = false;
      this.holder.add(model.root);
      return { id, def, mag: def.mag, reserve: def.reserve, model };
    });
    this.frags = cls.frags;
    this.cur = 0;
    this.slots[0].model.root.visible = true;
    this.sw = { t: 0, phase: 'up', to: 0 };
    this.cool = 0; this.reload = null; this.melee = 0; this.cook = null; this.throwT = 0;
    this.action = 0; this.actionSnd = 0; this.ads = 0; this.bloom = 0; this.kick = 0; this.flashT = 0;
    this.slideBack = 0; this.sprintBlend = 0; this.swayX = 0; this.swayY = 0; this.autoReload = 0;
    this.breath = 4; this.holding = false;
  }

  refill() {
    for (const s of this.slots) s.reserve = Math.min(s.def.reserve, s.reserve + s.def.mag * 2);
  }

  spread(pl) {
    const d = this.w.def, e = smooth(this.ads);
    let s = d.hip + (d.ads - d.hip) * e;
    s += d.move * Math.min(1, pl.hSpeed / 5) * (1 - e * 0.85);
    if (!pl.body.onGround) s += 3 * (1 - e * 0.5);
    if (pl.crouched && pl.body.onGround) s *= 0.8;
    s += this.bloom * (1 - e * 0.6);
    if (d.scope && e < 0.95) s = Math.max(s, d.hip);
    return s;
  }

  adsEase() { return smooth(this.ads); }
  get busy() { return !!(this.sw || this.melee > 0 || this.cook || this.throwT > 0); }

  startReload() {
    const w = this.w, d = w.def;
    if (this.reload || w.mag >= d.mag || w.reserve <= 0 || this.busy) return;
    this.reload = d.shellReload ? { t: 0, shell: true, next: 0.35 } : { t: 0, dur: w.mag === 0 ? d.reloadEmpty : d.reload, empty: w.mag === 0, s: 0 };
  }

  update(dt, inp, pl) {
    const g = this.game, audio = g.audio;
    let w = this.w, d = w.def;
    this.cool = Math.max(0, this.cool - dt);
    this.bloom = Math.max(0, this.bloom - dt * 4);
    this.flashT -= dt;
    this.slideBack = Math.max(0, this.slideBack - dt * 12);
    if (this.action > 0) {
      this.action -= dt;
      if (this.actionSnd > 0 && (this.actionSnd -= dt) <= 0) audio.reload(d.model, d.action === 'pump' ? 'pump' : 'bolt');
    }

    // weapon switch
    if (inp.switchTo !== null && inp.switchTo !== this.cur && inp.switchTo < this.slots.length && !this.sw && !this.melee && !this.cook) {
      this.sw = { t: 0, phase: 'down', to: inp.switchTo };
      this.reload = null; this.action = 0;
    }
    if (this.sw) {
      this.sw.t += dt;
      if (this.sw.phase === 'down' && this.sw.t >= 0.2) {
        this.w.model.root.visible = false;
        this.cur = this.sw.to;
        this.w.model.root.visible = true;
        this.sw = { t: 0, phase: 'up', to: this.cur };
        audio.swap();
      } else if (this.sw.phase === 'up' && this.sw.t >= 0.28) this.sw = null;
      w = this.w; d = w.def;
    }

    // knife
    if (inp.melee && this.melee <= 0 && !this.cook && !this.sw) {
      this.melee = 0.6; this.meleeHit = false; this.reload = null;
      audio.knife();
    }
    if (this.melee > 0) {
      this.melee -= dt;
      if (!this.meleeHit && this.melee < 0.45) { this.meleeHit = true; g.playerMelee(); }
    }

    // grenade: hold to cook, release to throw
    if (inp.nadePressed && this.frags > 0 && !this.cook && this.melee <= 0 && !this.sw && this.throwT <= 0) {
      this.cook = { t: 0 }; this.reload = null;
      audio.pin();
    }
    if (this.cook) {
      this.cook.t += dt;
      if (!inp.nade || this.cook.t >= FUSE) {
        g.throwGrenade(pl, this.cook.t);
        this.frags--; this.cook = null; this.throwT = 0.45;
      }
    }
    if (this.throwT > 0) this.throwT -= dt;

    // reload
    if (inp.reload) this.startReload();
    if (this.autoReload > 0 && (this.autoReload -= dt) <= 0) this.startReload();
    const r = this.reload;
    if (r) {
      r.t += dt;
      if (r.shell) {
        if (r.t >= r.next) {
          if (w.mag < d.mag && w.reserve > 0) { w.mag++; w.reserve--; audio.reload(d.model, 'shell'); r.next += d.shellTime; }
          else { this.reload = null; audio.reload(d.model, 'pump'); }
        }
      } else {
        const p = r.t / r.dur;
        if (p > 0.2 && r.s === 0) { r.s = 1; audio.reload(d.model, 'out'); }
        if (p > 0.6 && r.s === 1) { r.s = 2; audio.reload(d.model, 'in'); }
        if (r.empty && p > 0.82 && r.s === 2) { r.s = 3; audio.reload(d.model, d.action === 'bolt' ? 'bolt' : 'charge'); }
        if (p >= 1) {
          const amt = Math.min(d.mag - w.mag, w.reserve);
          w.mag += amt; w.reserve -= amt;
          this.reload = null;
        }
      }
    }

    // aim down sights
    const wantAds = inp.ads && !this.busy && !(this.reload && !this.reload.shell) && !pl.sprinting;
    this.ads = Math.max(0, Math.min(1, this.ads + (wantAds ? 1 : -1) * dt / d.adsTime));

    // fire
    const trig = d.auto ? inp.fire : inp.firePressed;
    if (trig && !this.busy) {
      if (pl.sprinting) pl.breakSprint();
      else if (this.reload && this.reload.shell && w.mag > 0) this.reload = null;
      else if (!this.reload && this.cool <= 0 && this.action <= 0 && pl.sprintOut <= 0) {
        if (w.mag > 0) this.fire(pl);
        else if (inp.firePressed) {
          audio.empty(d.model); this.cool = 0.25;
          if (w.reserve > 0) this.startReload();
        }
      }
    }

    // sniper hold breath (sprint key while scoped)
    const e = smooth(this.ads);
    this.holding = d.scope && e > 0.9 && inp.sprint && this.breath > 0;
    this.breath = this.holding ? this.breath - dt : Math.min(4, this.breath + dt * 0.8);
    if (d.scope && e > 0.5) {
      const t = g.time, k = (this.holding ? 0.08 : 1) * e;
      pl.scopeSwayX = (Math.sin(t * 0.9) * 0.009 + Math.sin(t * 2.3) * 0.003) * k;
      pl.scopeSwayY = (Math.sin(t * 1.3 + 1) * 0.007 + Math.cos(t * 1.9) * 0.003) * k;
    } else pl.scopeSwayX = pl.scopeSwayY = 0;
  }

  fire(pl) {
    const w = this.w, d = w.def, g = this.game;
    w.mag--;
    this.cool = 60 / d.rpm;
    const spread = this.spread(pl);
    g.playerShoot(d, spread, this.muzzleWorld());
    const e = smooth(this.ads);
    pl.addRecoil(d.recoil.v * (1 - 0.3 * e) * (0.85 + Math.random() * 0.3), (Math.random() * 2 - 1) * d.recoil.h);
    this.kick = Math.min(this.kick + d.kick, 0.2);
    this.bloom = Math.min(this.bloom + d.bloom, d.bloomMax);
    this.flashT = 0.05;
    if (d.action && w.mag > 0) { this.action = 60 / d.rpm; this.actionSnd = 0.22; }
    if (w.model.slide) this.slideBack = 1;
    if (w.mag === 0 && w.reserve > 0) this.autoReload = 60 / d.rpm + 0.2;
  }

  muzzleWorld() {
    const e = smooth(this.ads);
    return _v.set(0.13 * (1 - e), -0.1 * (1 - e) - 0.04, -0.75).applyMatrix4(this.game.camera.matrixWorld).clone();
  }

  fovFor(base) {
    const d = this.w.def, e = smooth(this.ads);
    return base + (d.fov - base) * e;
  }

  animate(dt, pl, lookDX, lookDY) {
    const m = this.w.model, d = this.w.def, t = this.game.time;
    const e = smooth(this.ads);
    _p.copy(m.hip).lerp(m.adsPos, e);
    _r.set(0, 0, 0);

    _p.y += Math.sin(t * 1.6) * 0.003 * (1 - e * 0.8);
    _p.x += Math.sin(t * 0.8) * 0.002 * (1 - e);

    const mv = Math.min(1, pl.hSpeed / 6) * (pl.body.onGround ? 1 : 0.2);
    const amp = (1 - e * 0.85) * mv * (pl.sprinting ? 1.8 : 1);
    _p.x += Math.sin(pl.bobPhase) * 0.014 * amp;
    _p.y -= Math.abs(Math.cos(pl.bobPhase)) * 0.012 * amp;
    _r.z += Math.sin(pl.bobPhase) * 0.02 * amp;

    this.sprintBlend += ((pl.sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 9);
    const sb = this.sprintBlend;
    _p.x += 0.02 * sb; _p.y -= 0.07 * sb; _p.z += 0.04 * sb;
    _r.y += 0.75 * sb; _r.x -= 0.2 * sb; _r.z += 0.35 * sb;

    const k = Math.min(1, dt * 10);
    this.swayX += (Math.max(-0.03, Math.min(0.03, -lookDX * 0.0007)) - this.swayX) * k;
    this.swayY += (Math.max(-0.03, Math.min(0.03, lookDY * 0.0007)) - this.swayY) * k;
    const sw = 1 - e * 0.75;
    _p.x += this.swayX * sw; _p.y += this.swayY * sw;
    _r.y += this.swayX * 2 * sw; _r.x -= this.swayY * 2 * sw;

    _p.z += this.kick * (1 - e * 0.3);
    _r.x += this.kick * 2.2 * (1 - e * 0.5);
    this.kick *= Math.exp(-dt * 14);

    m.mag.position.copy(m.magBase);
    if (this.reload) {
      const r = this.reload;
      const p = r.shell ? 0.5 : Math.min(1, r.t / r.dur);
      const rp = r.shell ? Math.min(1, r.t * 4) : Math.sin(Math.PI * p);
      _r.x += 0.3 * rp; _r.z += 0.45 * rp; _p.y -= 0.05 * rp; _p.x -= 0.02 * rp;
      if (!r.shell) {
        const out = p < 0.2 ? 0 : p < 0.35 ? (p - 0.2) / 0.15 : p < 0.5 ? 1 : p < 0.62 ? 1 - (p - 0.5) / 0.12 : 0;
        m.mag.position.y -= 0.3 * out;
        m.mag.position.z += 0.05 * out;
      }
    }
    if (this.action > 0) {
      const a = Math.sin(Math.PI * Math.max(0, 1 - this.action / (60 / d.rpm)));
      _r.z += 0.12 * a; _p.y -= 0.02 * a; _r.x += 0.05 * a;
      if (m.pump) m.pump.position.z = m.pumpBase + 0.09 * a;
    } else if (m.pump) m.pump.position.z = m.pumpBase;
    if (m.slide) m.slide.position.z = m.slideBase + 0.035 * this.slideBack + (this.w.mag === 0 ? 0.035 : 0);

    if (this.sw) {
      const s = this.sw.phase === 'down' ? this.sw.t / 0.2 : 1 - this.sw.t / 0.28;
      _p.y -= 0.3 * s; _r.x -= 0.8 * s;
    }

    const kn = this.melee > 0 ? 1 - this.melee / 0.6 : 0;
    this.knife.visible = this.melee > 0;
    if (this.melee > 0) {
      const s = smooth(Math.min(1, Math.max(0, (kn - 0.08) / 0.3)));
      const back = kn > 0.6 ? (kn - 0.6) / 0.4 : 0;
      this.knife.position.set(0.28 - 0.42 * s, -0.12 + 0.05 * s - 0.25 * back, -0.28 - 0.14 * s);
      this.knife.rotation.set(-0.2, 0.9 - 1.8 * s, -0.4 + 0.3 * s);
      const dip = Math.sin(Math.PI * kn);
      _p.y -= 0.25 * dip; _r.x -= 0.4 * dip;
    }

    this.nade.visible = !!this.cook || this.throwT > 0;
    if (this.cook) {
      const c = Math.min(1, this.cook.t * 5);
      this.nade.position.set(-0.2 + 0.05 * c, -0.14 + 0.06 * c, -0.35);
      _p.y -= 0.15 * c; _r.x -= 0.3 * c;
    } else if (this.throwT > 0) {
      const th = 1 - this.throwT / 0.45;
      this.nade.position.set(-0.15 + 0.1 * th, -0.08 + 0.1 * th - th * th * 0.4, -0.35 - 0.5 * th);
      if (th > 0.4) this.nade.visible = false;
      _p.y -= 0.15 * (1 - th);
    }

    _p.y -= pl.landDip * 0.5;
    m.root.position.copy(_p);
    m.root.rotation.set(_r.x, _r.y, _r.z);
    m.flash.visible = this.flashT > 0;
    if (m.flash.visible) { m.flash.rotation.z = Math.random() * 6.28; m.flash.scale.setScalar(0.8 + Math.random() * 0.5); }
    m.root.visible = !(d.scope && e > 0.92);
  }
}
