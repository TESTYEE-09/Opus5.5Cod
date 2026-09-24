import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { flashTexture } from './effects.js';
import { surface, R } from './textures.js';

// Spread values are degrees; recoil is degrees per shot. Burst weapons fire `burst`
// rounds at `burstRpm` per trigger pull, then wait for `rpm`.
export const WEAPONS = {
  ar: {
    name: 'AR-4', model: 'ar', auto: true, rpm: 750, dmg: [30, 21], range: [22, 45], head: 1.5,
    mag: 30, reserve: 150, reload: 1.8, reloadEmpty: 2.2, hip: 3.2, ads: 0.12, move: 2.5, bloom: 0.35, bloomMax: 2.5,
    adsTime: 0.22, fov: 52, recoil: { v: 0.5, h: 0.22 }, kick: 0.035, speed: 0.95, pref: 24, reloadKind: 'mag',
  },
  smg: {
    name: 'VX-9', model: 'smg', auto: true, rpm: 900, dmg: [26, 16], range: [10, 25], head: 1.4,
    mag: 32, reserve: 192, reload: 1.55, reloadEmpty: 1.9, hip: 2.2, ads: 0.35, move: 1.4, bloom: 0.25, bloomMax: 2,
    adsTime: 0.16, fov: 60, recoil: { v: 0.35, h: 0.3 }, kick: 0.025, speed: 1.05, pref: 12, reloadKind: 'mag',
  },
  lmg: {
    name: 'HMG-7', model: 'lmg', auto: true, rpm: 650, dmg: [33, 25], range: [30, 60], head: 1.4,
    mag: 100, reserve: 200, reload: 4.1, reloadEmpty: 4.6, hip: 4.2, ads: 0.2, move: 3.5, bloom: 0.4, bloomMax: 3.5,
    adsTime: 0.34, fov: 50, recoil: { v: 0.45, h: 0.3 }, kick: 0.04, speed: 0.85, pref: 28, reloadKind: 'belt',
  },
  sniper: {
    name: 'RSK-50', model: 'sniper', auto: false, rpm: 48, dmg: [120, 105], range: [60, 100], head: 2,
    mag: 5, reserve: 25, reload: 2.6, reloadEmpty: 2.95, hip: 7, ads: 0, move: 6, bloom: 0, bloomMax: 0,
    adsTime: 0.36, fov: 18, recoil: { v: 3.2, h: 0.5 }, kick: 0.12, speed: 0.9, pref: 45, action: 'bolt', scope: true, reloadKind: 'mag',
  },
  shotgun: {
    name: 'M-87', model: 'shotgun', auto: false, rpm: 70, dmg: [18, 5], range: [7, 18], head: 1.3, pellets: 9,
    mag: 6, reserve: 30, shellReload: true, shellTime: 0.38, hip: 5.5, ads: 3.8, move: 1, bloom: 0, bloomMax: 0,
    adsTime: 0.2, fov: 62, recoil: { v: 2.2, h: 0.6 }, kick: 0.1, speed: 1, pref: 7, action: 'pump', reloadKind: 'shell',
  },
  pistol: {
    name: 'P-12', model: 'pistol', auto: false, rpm: 420, dmg: [34, 20], range: [12, 28], head: 1.6,
    mag: 15, reserve: 75, reload: 1.2, reloadEmpty: 1.45, hip: 2.2, ads: 0.4, move: 1.5, bloom: 0.5, bloomMax: 2,
    adsTime: 0.14, fov: 62, recoil: { v: 0.9, h: 0.3 }, kick: 0.05, speed: 1.1, pref: 12, reloadKind: 'mag',
  },
  burst: {
    name: 'BR-3', model: 'burst', auto: false, burst: 3, burstRpm: 1000, rpm: 280, dmg: [34, 24], range: [25, 50], head: 1.5,
    mag: 30, reserve: 150, reload: 1.9, reloadEmpty: 2.3, hip: 3, ads: 0.08, move: 2.4, bloom: 0.3, bloomMax: 2.2,
    adsTime: 0.24, fov: 50, recoil: { v: 0.55, h: 0.16 }, kick: 0.035, speed: 0.95, pref: 26, reloadKind: 'mag',
  },
  dmr: {
    name: 'SVX-10', model: 'dmr', auto: false, rpm: 320, dmg: [58, 48], range: [35, 75], head: 1.8,
    mag: 10, reserve: 60, reload: 2.1, reloadEmpty: 2.5, hip: 5, ads: 0.03, move: 3.5, bloom: 0.6, bloomMax: 2,
    adsTime: 0.3, fov: 32, recoil: { v: 1.5, h: 0.35 }, kick: 0.07, speed: 0.92, pref: 38, reloadKind: 'mag', overlay: 'acog',
  },
  rpg: {
    name: 'RPG-7', model: 'rpg', launcher: 'rpg', auto: false, rpm: 30, dmg: [200, 200], range: [1, 2], head: 1,
    mag: 1, reserve: 3, reload: 2.3, reloadEmpty: 2.3, hip: 2.5, ads: 0.3, move: 2, bloom: 0, bloomMax: 0,
    adsTime: 0.3, fov: 55, recoil: { v: 3.5, h: 0.8 }, kick: 0.2, speed: 0.92, pref: 30, reloadKind: 'rocket',
  },
  stinger: {
    name: 'Stinger', model: 'stinger', launcher: 'stinger', auto: false, rpm: 30, dmg: [200, 200], range: [1, 2], head: 1,
    mag: 1, reserve: 2, reload: 2.6, reloadEmpty: 2.6, hip: 3, ads: 0.4, move: 2, bloom: 0, bloomMax: 0, lock: 1.0,
    adsTime: 0.35, fov: 45, recoil: { v: 2.5, h: 0.5 }, kick: 0.16, speed: 0.9, pref: 30, reloadKind: 'rocket',
  },
  revolver: {
    name: 'R-44', model: 'revolver', auto: false, rpm: 140, dmg: [62, 38], range: [14, 32], head: 1.7,
    mag: 6, reserve: 36, reload: 2.3, reloadEmpty: 2.3, hip: 2.6, ads: 0.3, move: 1.8, bloom: 0.9, bloomMax: 2.5,
    adsTime: 0.18, fov: 58, recoil: { v: 2.6, h: 0.5 }, kick: 0.09, speed: 1.08, pref: 14, reloadKind: 'cyl',
  },
};

export const CLASSES = {
  assault: { name: 'Assault', desc: 'AR-4 rifle. Good at every range.', primary: 'ar', secondary: 'pistol', frags: 2 },
  rusher: { name: 'Rusher', desc: 'VX-9 SMG. Fast, strong up close.', primary: 'smg', secondary: 'pistol', frags: 2 },
  support: { name: 'Support', desc: 'HMG-7, 100-round belt. Slow to move.', primary: 'lmg', secondary: 'pistol', frags: 2 },
  marksman: { name: 'Marksman', desc: 'RSK-50 bolt-action. One shot to the chest.', primary: 'sniper', secondary: 'pistol', frags: 1 },
  breacher: { name: 'Breacher', desc: 'M-87 pump shotgun and 3 frags.', primary: 'shotgun', secondary: 'pistol', frags: 3 },
  tactician: { name: 'Tactician', desc: 'BR-3 three-round burst. Kills in one burst up close.', primary: 'burst', secondary: 'pistol', frags: 2 },
  recon: { name: 'Recon', desc: 'SVX-10 marksman rifle, 4x scope, and an R-44 Magnum.', primary: 'dmr', secondary: 'revolver', frags: 1 },
  antitank: { name: 'Anti-Tank', desc: 'VX-9 SMG plus an RPG-7 (key 3) for tanks and helicopters.', primary: 'smg', secondary: 'pistol', launcher: 'rpg', frags: 1 },
  antiair: { name: 'Anti-Air', desc: 'AR-4 plus a Stinger (key 3). Aim at aircraft until it locks.', primary: 'ar', secondary: 'pistol', launcher: 'stinger', frags: 1 },
};

export function falloff(def, dist) {
  const [n, f] = def.range;
  if (dist <= n) return def.dmg[0];
  if (dist >= f) return def.dmg[1];
  return def.dmg[0] + (def.dmg[1] - def.dmg[0]) * (dist - n) / (f - n);
}

// ---------- viewmodels ----------
const fine = surface('fine:[]', R.fine(), { size: 256, seed: 41, normal: 0.8 });
const fabric = surface('fabric:[]', R.fabric(), { size: 256, seed: 43, normal: 1.5 });
const woodT = surface('planks:[7039526,false]', R.planks(0x6b4226, false), { seed: 44, normal: 1 });
const std = (o) => new THREE.MeshStandardMaterial(o);
const nrm = (t, s = 0.5) => ({ normalMap: t.normalMap, normalScale: new THREE.Vector2(s, s) });
const M = {
  metal: std({ color: 0x2c2e31, roughness: 0.38, metalness: 0.85, ...nrm(fine, 0.35) }),
  steel: std({ color: 0x7a7e82, roughness: 0.28, metalness: 0.95, ...nrm(fine, 0.2) }),
  poly: std({ color: 0x27292a, roughness: 0.62, metalness: 0.05, ...nrm(fine, 0.8) }),
  tan: std({ color: 0x9a8662, roughness: 0.68, metalness: 0.02, ...nrm(fine, 0.8) }),
  od: std({ color: 0x505a3c, roughness: 0.66, metalness: 0.02, ...nrm(fine, 0.8) }),
  wood: std({ color: 0xffffff, map: woodT.map, roughness: 0.5, metalness: 0, ...nrm(woodT, 0.4) }),
  sleeve: std({ color: 0x5c6048, roughness: 0.95, map: null, ...nrm(fabric, 0.9) }),
  cuff: std({ color: 0x3d4030, roughness: 0.95, ...nrm(fabric, 0.9) }),
  glove: std({ color: 0x2d2a27, roughness: 0.78, ...nrm(fabric, 0.4) }),
  glass: new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.045, depthWrite: false }),
  dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.5, 0.25) }),
  tri: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 4, 0.8) }),
  lens: std({ color: 0x0c1a28, roughness: 0.08, metalness: 0.6 }),
  blade: std({ color: 0xc8ccd0, roughness: 0.2, metalness: 1 }),
  nade: std({ color: 0x3d4a2e, roughness: 0.7, ...nrm(fine, 0.6) }),
  brass: std({ color: 0xc8a050, roughness: 0.3, metalness: 1 }),
  shell: std({ color: 0xa02a20, roughness: 0.5, metalness: 0.1 }),
};
M.tube = M.metal.clone(); M.tube.side = THREE.DoubleSide;

const reticleTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(10,10,10,0.95)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(100, 128); g.moveTo(156, 128); g.lineTo(256, 128); g.moveTo(128, 256); g.lineTo(128, 150); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.moveTo(100, 128); g.lineTo(122, 128); g.moveTo(134, 128); g.lineTo(156, 128); g.moveTo(128, 150); g.lineTo(128, 134); g.stroke();
  g.strokeStyle = 'rgba(255,60,30,1)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(118, 138); g.lineTo(128, 126); g.lineTo(138, 138); g.stroke();
  const grd = g.createRadialGradient(128, 128, 90, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
M.reticle = new THREE.MeshBasicMaterial({ map: reticleTex, transparent: true, depthWrite: false });

const geos = {};
const bx = (w, h, d) => (geos[`b${w},${h},${d}`] ||= new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.22));
const sb = (w, h, d) => (geos[`s${w},${h},${d}`] ||= new THREE.BoxGeometry(w, h, d));
const cy = (r, l, s = 16) => (geos[`c${r},${l},${s}`] ||= new THREE.CylinderGeometry(r, r, l, s).rotateX(Math.PI / 2));
const tb = (r, l) => (geos[`t${r},${l}`] ||= new THREE.CylinderGeometry(r, r, l, 20, 1, true).rotateX(Math.PI / 2));
function part(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
const group = (parent, x, y, z, rx = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.x = rx; parent.add(g); return g; };

function rail(g, y, z0, z1, w = 0.024) {
  part(g, sb(w, 0.008, z1 - z0), M.metal, 0, y, (z0 + z1) / 2);
  for (let z = z0 + 0.006; z < z1; z += 0.012) part(g, sb(w + 0.004, 0.006, 0.005), M.metal, 0, y + 0.006, z);
}

// open reflex sight: a thin hood around a big, nearly clear window
function reflex(g, y, z, s) {
  part(g, bx(0.032, 0.014, 0.06), M.metal, 0, y - s / 2 - 0.009, z);
  const t = 0.0035;
  part(g, sb(s + t * 2, t, 0.03), M.metal, 0, y + s / 2 + 0.004, z);
  part(g, sb(t, s, 0.03), M.metal, -s / 2 - t / 2 - 0.004, y, z);
  part(g, sb(t, s, 0.03), M.metal, s / 2 + t / 2 + 0.004, y, z);
  part(g, new THREE.PlaneGeometry(s + 0.006, s + 0.006), M.glass, 0, y, z - 0.012);
  part(g, new THREE.CircleGeometry(0.0026, 14), M.dot, 0, y, z - 0.011);
}

function holo(g, y, z) {
  part(g, bx(0.042, 0.014, 0.09), M.metal, 0, y - 0.033, z);
  part(g, sb(0.05, 0.0035, 0.05), M.metal, 0, y + 0.027, z - 0.01);
  for (const x of [-0.025, 0.025]) part(g, sb(0.0035, 0.056, 0.05), M.metal, x, y, z - 0.01);
  part(g, new THREE.PlaneGeometry(0.048, 0.05), M.glass, 0, y, z - 0.035);
  part(g, new THREE.RingGeometry(0.0045, 0.0053, 24), M.dot, 0, y, z - 0.034);
  part(g, new THREE.CircleGeometry(0.0013, 10), M.dot, 0, y, z - 0.034);
}

// glowing dots on iron sights so the front post is easy to find
function tritium(g, x, y, z, r = 0.0022) { part(g, new THREE.CircleGeometry(r, 10), M.tri, x, y, z); }

// scope body along z, rear lens at zRear, radius r
function scope(g, y, zRear, len, r, reticle = false) {
  part(g, tb(r, len), M.tube, 0, y, zRear - len / 2);
  part(g, cy(r * 1.35, 0.06), M.metal, 0, y, zRear - len + 0.03);
  part(g, cy(r * 1.2, 0.05), M.metal, 0, y, zRear - 0.025);
  part(g, cy(r * 0.5, 0.03), M.metal, 0, y + r + 0.012, zRear - len / 2).rotation.set(0, 0, 0);
  part(g, cy(0.008, 0.024, 10), M.metal, 0, y + r + 0.012, zRear - len / 2, -Math.PI / 2);
  part(g, cy(0.008, 0.024, 10), M.metal, r + 0.012, y, zRear - len / 2, 0, Math.PI / 2);
  part(g, new THREE.CircleGeometry(r * 1.3, 24), M.lens, 0, y, zRear - len + 0.005).rotation.y = Math.PI;
  if (reticle) part(g, new THREE.CircleGeometry(r * 0.98, 32), M.reticle, 0, y, zRear - 0.004);
  else part(g, new THREE.CircleGeometry(r * 1.1, 24), M.lens, 0, y, zRear + 0.001);
  for (const z of [zRear - 0.04, zRear - len + 0.07]) part(g, bx(0.03, 0.03, 0.02), M.metal, 0, y - r - 0.01, z);
}

function hand(parent, x, y, z) {
  const h = group(parent, x, y, z);
  part(h, bx(0.052, 0.08, 0.088), M.glove, 0.005, 0, 0);
  for (let i = 0; i < 3; i++) part(h, bx(0.058, 0.018, 0.022), M.glove, 0.002, 0.026 - i * 0.021, -0.048);
  part(h, bx(0.018, 0.022, 0.05), M.glove, -0.028, 0.035, -0.025);
  return h;
}

function arms(g, grip, fore) {
  const gh = hand(g, ...grip);
  part(gh, bx(0.085, 0.085, 0.32), M.sleeve, 0.05, -0.08, 0.17, 0.5, 0.2, 0);
  part(gh, bx(0.07, 0.07, 0.04), M.cuff, 0.025, -0.035, 0.055, 0.5, 0.2, 0);
  const off = group(g, ...fore);
  part(off, bx(0.064, 0.05, 0.11), M.glove, -0.01, -0.045, 0);
  for (let i = 0; i < 4; i++) part(off, bx(0.018, 0.048, 0.022), M.glove, 0.03, -0.026, -0.042 + i * 0.026);
  part(off, bx(0.02, 0.04, 0.06), M.glove, -0.042, -0.02, 0.005);
  part(off, bx(0.085, 0.085, 0.36), M.sleeve, -0.09, -0.12, 0.17, 0.55, -0.5, 0);
  part(off, bx(0.07, 0.07, 0.04), M.cuff, -0.04, -0.07, 0.05, 0.55, -0.5, 0);
  return off;
}

function muzzleFlash(g, z, y, size) {
  const mat = new THREE.MeshBasicMaterial({ map: flashTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(2.5, 2.2, 1.8) });
  const f = new THREE.Group();
  f.position.set(0, y, z);
  const long = new THREE.PlaneGeometry(size * 0.6, size * 1.8).rotateX(Math.PI / 2).translate(0, 0, -size * 0.7);
  f.add(new THREE.Mesh(long, mat));
  const l2 = new THREE.Mesh(long, mat); l2.rotation.z = Math.PI / 2; f.add(l2);
  const l3 = new THREE.Mesh(long, mat); l3.rotation.z = Math.PI / 4; f.add(l3);
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
  o.magRot = o.mag.rotation.x;
  o.offBase = o.off.position.clone();
  o.offRot = o.off.rotation.clone();
  if (o.charge) o.chargeBase = o.charge.position.z;
  if (o.bolt) { o.boltBase = o.bolt.position.z; o.boltRot = o.bolt.rotation.z; }
  if (o.lid) o.lidRot = o.lid.rotation.x;
  if (o.cyl) o.cylBase = o.cyl.position.clone();
  if (o.pump) o.pumpBase = o.pump.position.z;
  if (o.slide) o.slideBase = o.slide.position.z;
  o.eject = o.eject || new THREE.Vector3(0.04, 0.04, 0);
  o.adsPos = new THREE.Vector3(0, -o.sightY, -o.adsDist - o.sightZ);
  g.traverse(m => { if (m.isMesh) m.frustumCulled = false; });
  return o;
}

// AR-style rifle; furniture colour and optic vary
function rifleBody(g, furn, { stock = true } = {}) {
  part(g, bx(0.056, 0.06, 0.22), M.metal, 0, -0.012, 0.02);
  part(g, bx(0.06, 0.058, 0.27), M.metal, 0, 0.045, -0.02);
  part(g, sb(0.002, 0.02, 0.05), M.poly, 0.031, 0.045, 0.0);
  part(g, cy(0.008, 0.02), M.steel, 0.034, 0.05, 0.05, 0, 0, 0);
  rail(g, 0.078, -0.4, 0.1);
  part(g, bx(0.066, 0.066, 0.3), furn, 0, 0.035, -0.3);
  for (let z = -0.42; z < -0.18; z += 0.04) for (const x of [-0.034, 0.034]) part(g, sb(0.004, 0.016, 0.022), M.poly, x, 0.03, z);
  part(g, cy(0.009, 0.22), M.metal, 0, 0.035, -0.54);
  part(g, bx(0.02, 0.03, 0.03), M.metal, 0, 0.042, -0.47);
  part(g, cy(0.014, 0.065), M.metal, 0, 0.035, -0.675);
  for (const a of [0, Math.PI / 2]) part(g, sb(0.03, 0.004, 0.03), M.poly, 0, 0.035, -0.67, 0, 0, a);
  part(g, bx(0.046, 0.05, 0.085), M.metal, 0, -0.05, -0.07);
  part(g, sb(0.01, 0.008, 0.07), M.metal, 0, -0.058, 0.03);
  part(g, bx(0.034, 0.1, 0.045), M.poly, 0, -0.09, 0.1, -0.35);
  if (stock) {
    part(g, cy(0.016, 0.18), M.metal, 0, 0.035, 0.24);
    part(g, bx(0.048, 0.07, 0.16), furn, 0, 0.018, 0.33);
    part(g, bx(0.05, 0.1, 0.022), M.poly, 0, 0.01, 0.415);
  }
  const charge = part(g, bx(0.034, 0.012, 0.03), M.steel, 0, 0.078, 0.12);
  const mag = group(g, 0, -0.1, -0.07, 0.18);
  part(mag, bx(0.03, 0.15, 0.072), M.poly, 0, 0.0, 0);
  part(mag, bx(0.03, 0.06, 0.07), M.poly, 0, -0.095, 0.012, 0.25);
  part(mag, bx(0.034, 0.012, 0.076), M.poly, 0, -0.13, 0.02, 0.25);
  return { charge, mag };
}

const BUILD = {
  ar() {
    const g = new THREE.Group();
    const { charge, mag } = rifleBody(g, M.tan);
    reflex(g, 0.118, -0.05, 0.05);
    const off = arms(g, [0, -0.1, 0.12], [0, -0.01, -0.34]);
    return finish(g, { mag, charge, off, muzzleZ: -0.71, muzzleY: 0.035, sightY: 0.118, sightZ: -0.05, adsDist: 0.26, hip: new THREE.Vector3(0.14, -0.19, -0.5), eject: new THREE.Vector3(0.04, 0.05, 0) });
  },
  burst() {
    const g = new THREE.Group();
    const { charge, mag } = rifleBody(g, M.od);
    holo(g, 0.118, -0.05);
    part(g, bx(0.03, 0.07, 0.035), M.od, 0, -0.03, -0.3, 0.5);
    part(g, cy(0.02, 0.12), M.metal, 0, 0.035, -0.72);
    const off = arms(g, [0, -0.1, 0.12], [0, -0.02, -0.3]);
    return finish(g, { mag, charge, off, muzzleZ: -0.79, muzzleY: 0.035, sightY: 0.118, sightZ: -0.05, adsDist: 0.26, hip: new THREE.Vector3(0.14, -0.19, -0.5), eject: new THREE.Vector3(0.04, 0.05, 0) });
  },
  smg() {
    const g = new THREE.Group();
    part(g, bx(0.055, 0.08, 0.3), M.poly, 0, 0, -0.02);
    part(g, bx(0.045, 0.03, 0.3), M.metal, 0, 0.05, -0.02);
    rail(g, 0.068, -0.17, 0.12, 0.02);
    part(g, bx(0.06, 0.07, 0.13), M.poly, 0, -0.005, -0.22);
    part(g, cy(0.012, 0.1), M.metal, 0, 0.01, -0.32);
    part(g, cy(0.017, 0.05), M.metal, 0, 0.01, -0.36);
    part(g, bx(0.03, 0.08, 0.03), M.poly, 0, -0.07, -0.22, 0.2);
    part(g, bx(0.04, 0.035, 0.07), M.metal, 0, -0.05, -0.04);
    const mag = group(g, 0, -0.14, -0.04, 0.1);
    part(mag, bx(0.034, 0.19, 0.052), M.metal, 0, 0, 0);
    part(mag, bx(0.037, 0.014, 0.056), M.poly, 0, -0.1, 0);
    part(g, bx(0.036, 0.1, 0.046), M.poly, 0, -0.09, 0.08, -0.25);
    part(g, sb(0.01, 0.012, 0.22), M.metal, 0.02, 0.0, 0.2);
    part(g, sb(0.01, 0.012, 0.22), M.metal, -0.02, 0.0, 0.2);
    part(g, bx(0.05, 0.075, 0.02), M.poly, 0, -0.01, 0.31);
    const charge = part(g, bx(0.012, 0.02, 0.03), M.steel, -0.03, 0.03, -0.15);
    reflex(g, 0.1, -0.02, 0.045);
    const off = arms(g, [0, -0.09, 0.08], [0, -0.03, -0.21]);
    return finish(g, { mag, charge, off, muzzleZ: -0.39, muzzleY: 0.01, sightY: 0.1, sightZ: -0.02, adsDist: 0.24, hip: new THREE.Vector3(0.13, -0.17, -0.44), flashSize: 0.14, eject: new THREE.Vector3(0.035, 0.04, -0.02) });
  },
  lmg() {
    const g = new THREE.Group();
    part(g, bx(0.08, 0.1, 0.45), M.metal, 0, 0, 0);
    const lid = group(g, 0, 0.055, 0.12);
    part(lid, bx(0.075, 0.018, 0.24), M.metal, 0, 0, -0.12);
    rail(lid, 0.012, -0.22, -0.02, 0.026);
    part(g, cy(0.017, 0.44), M.metal, 0, 0.015, -0.46);
    part(g, bx(0.055, 0.035, 0.32), M.poly, 0, 0.045, -0.42);
    for (let z = -0.56; z < -0.3; z += 0.035) part(g, sb(0.057, 0.006, 0.014), M.metal, 0, 0.06, z);
    part(g, cy(0.026, 0.09), M.metal, 0, 0.015, -0.71);
    part(g, bx(0.02, 0.05, 0.12), M.metal, 0, 0.1, -0.1);
    part(g, sb(0.012, 0.012, 0.25), M.metal, 0.02, -0.035, -0.45);
    part(g, sb(0.012, 0.012, 0.25), M.metal, -0.02, -0.035, -0.45);
    const mag = group(g, -0.02, -0.11, -0.06);
    part(mag, bx(0.11, 0.12, 0.13), M.od, 0, 0, 0);
    part(mag, bx(0.114, 0.02, 0.134), M.poly, 0, 0.05, 0);
    for (let i = 0; i < 5; i++) part(mag, cy(0.006, 0.02, 8), M.brass, 0.05 - i * 0.012, 0.07 + Math.sin(i) * 0.005, 0.0, 0, Math.PI / 2, 0);
    part(g, bx(0.04, 0.11, 0.05), M.poly, 0, -0.1, 0.14, -0.3);
    part(g, bx(0.06, 0.1, 0.26), M.poly, 0, -0.01, 0.34);
    const charge = part(g, bx(0.02, 0.02, 0.03), M.steel, 0.045, 0.01, -0.05);
    reflex(g, 0.13, -0.08, 0.052);
    const off = arms(g, [0, -0.1, 0.14], [0, -0.02, -0.3]);
    return finish(g, { mag, lid, charge, off, muzzleZ: -0.76, muzzleY: 0.015, sightY: 0.13, sightZ: -0.08, adsDist: 0.28, hip: new THREE.Vector3(0.15, -0.19, -0.5), flashSize: 0.22, eject: new THREE.Vector3(0.05, 0.02, -0.02) });
  },
  sniper() {
    const g = new THREE.Group();
    part(g, bx(0.058, 0.07, 0.36), M.metal, 0, 0.005, -0.02);
    part(g, cy(0.013, 0.54), M.metal, 0, 0.012, -0.48);
    part(g, cy(0.02, 0.09), M.metal, 0, 0.012, -0.78);
    for (let i = 0; i < 4; i++) part(g, sb(0.042, 0.004, 0.012), M.poly, 0, 0.012, -0.76 + i * 0.016);
    part(g, bx(0.066, 0.075, 0.36), M.tan, 0, -0.02, -0.28);
    part(g, bx(0.06, 0.12, 0.34), M.tan, 0, -0.03, 0.36);
    part(g, bx(0.05, 0.035, 0.15), M.tan, 0, 0.05, 0.34);
    part(g, bx(0.064, 0.13, 0.02), M.poly, 0, -0.03, 0.535);
    const mag = group(g, 0, -0.07, -0.04);
    part(mag, bx(0.05, 0.08, 0.1), M.poly, 0, 0, 0);
    part(g, bx(0.04, 0.11, 0.05), M.tan, 0, -0.095, 0.13, -0.3);
    const bolt = group(g, 0.03, 0.02, 0.1);
    part(bolt, cy(0.009, 0.1), M.steel, -0.02, 0, 0.0);
    part(bolt, cy(0.006, 0.05, 10), M.steel, 0.018, 0, 0.03, 0, Math.PI / 2, 0).rotation.set(0, Math.PI / 2, 0);
    part(bolt, new THREE.SphereGeometry(0.013, 12, 8), M.metal, 0.045, 0, 0.03);
    scope(g, 0.1, 0.16, 0.42, 0.022, false);
    for (const z of [-0.14, 0.07]) part(g, bx(0.03, 0.06, 0.03), M.metal, 0, 0.065, z);
    const off = arms(g, [0, -0.09, 0.13], [0, -0.035, -0.3]);
    return finish(g, { mag, bolt, off, muzzleZ: -0.83, muzzleY: 0.012, sightY: 0.1, sightZ: 0.15, adsDist: 0.12, hip: new THREE.Vector3(0.14, -0.18, -0.52), flashSize: 0.2, eject: new THREE.Vector3(0.04, 0.04, 0.06) });
  },
  dmr() {
    const g = new THREE.Group();
    part(g, bx(0.054, 0.06, 0.26), M.metal, 0, 0.03, -0.02);
    part(g, bx(0.062, 0.07, 0.62), M.wood, 0, -0.005, -0.12);
    part(g, bx(0.056, 0.11, 0.3), M.wood, 0, -0.03, 0.35, 0.08);
    part(g, bx(0.058, 0.12, 0.02), M.poly, 0, -0.035, 0.51, 0.08);
    part(g, cy(0.011, 0.34), M.metal, 0, 0.03, -0.58);
    part(g, cy(0.016, 0.07), M.metal, 0, 0.03, -0.77);
    part(g, bx(0.03, 0.02, 0.02), M.metal, 0, 0.05, -0.74);
    part(g, sb(0.01, 0.008, 0.07), M.metal, 0, -0.045, 0.06);
    part(g, bx(0.036, 0.1, 0.045), M.wood, 0, -0.07, 0.12, -0.4);
    const mag = group(g, 0, -0.08, -0.04, 0.06);
    part(mag, bx(0.04, 0.1, 0.075), M.metal, 0, 0, 0);
    part(mag, bx(0.043, 0.012, 0.079), M.poly, 0, -0.055, 0);
    const charge = part(g, bx(0.012, 0.02, 0.04), M.steel, 0.034, 0.03, -0.1);
    scope(g, 0.118, 0.1, 0.24, 0.02, true);
    for (const z of [0.04, -0.1]) part(g, bx(0.028, 0.05, 0.028), M.metal, 0, 0.078, z);
    const off = arms(g, [0, -0.08, 0.13], [0, -0.035, -0.32]);
    return finish(g, { mag, charge, off, muzzleZ: -0.81, muzzleY: 0.03, sightY: 0.118, sightZ: 0.1, adsDist: 0.075, hip: new THREE.Vector3(0.14, -0.18, -0.52), flashSize: 0.2, eject: new THREE.Vector3(0.04, 0.05, -0.02) });
  },
  shotgun() {
    const g = new THREE.Group();
    part(g, bx(0.058, 0.08, 0.3), M.metal, 0, 0, 0);
    part(g, sb(0.002, 0.018, 0.06), M.poly, 0.03, 0.01, -0.02);
    part(g, cy(0.016, 0.52), M.metal, 0, 0.022, -0.41);
    part(g, cy(0.014, 0.42), M.metal, 0, -0.02, -0.37);
    part(g, cy(0.016, 0.02), M.metal, 0, -0.02, -0.58);
    const pump = group(g, 0, -0.022, -0.36);
    part(pump, bx(0.07, 0.058, 0.2), M.wood, 0, 0, 0);
    for (let z = -0.08; z < 0.09; z += 0.02) for (const x of [-0.036, 0.036]) part(pump, sb(0.003, 0.05, 0.006), M.poly, x, 0, z);
    part(g, bx(0.05, 0.1, 0.32), M.wood, 0, -0.04, 0.3, 0.1);
    part(g, bx(0.052, 0.11, 0.02), M.poly, 0, -0.055, 0.46, 0.1);
    part(g, sb(0.01, 0.008, 0.07), M.metal, 0, -0.05, 0.05);
    part(g, new THREE.SphereGeometry(0.005, 8, 6), M.steel, 0, 0.042, -0.66);
    tritium(g, 0, 0.046, -0.654, 0.003);
    const mag = group(g, 0, -0.04, 0.02);
    part(mag, sb(0.02, 0.01, 0.05), M.metal, 0, 0, 0);
    const shell = group(g, 0, 0, 0);
    part(shell, cy(0.011, 0.055, 12), M.shell, 0, 0, 0);
    part(shell, cy(0.0115, 0.014, 12), M.brass, 0, 0, 0.026);
    shell.visible = false;
    const off = arms(g, [0, -0.08, 0.14], [0, -0.022, -0.36]);
    const o = finish(g, { mag, off, pump, shell, muzzleZ: -0.67, muzzleY: 0.022, sightY: 0.047, sightZ: 0, adsDist: 0.34, hip: new THREE.Vector3(0.14, -0.18, -0.5), flashSize: 0.3, eject: new THREE.Vector3(0.04, 0.01, -0.02) });
    return o;
  },
  pistol() {
    const g = new THREE.Group();
    part(g, bx(0.034, 0.034, 0.18), M.poly, 0, 0, -0.03);
    const slide = group(g, 0, 0.034, -0.03);
    part(slide, bx(0.038, 0.036, 0.2), M.metal, 0, 0, 0);
    for (let i = 0; i < 6; i++) for (const x of [-0.0195, 0.0195]) part(slide, sb(0.002, 0.03, 0.003), M.poly, x, 0, 0.06 + i * 0.006);
    part(slide, sb(0.002, 0.014, 0.04), M.poly, 0.0195, 0.004, -0.01);
    part(slide, bx(0.006, 0.012, 0.008), M.metal, 0, 0.024, -0.09);
    part(slide, bx(0.008, 0.012, 0.008), M.metal, 0.01, 0.024, 0.09);
    part(slide, bx(0.008, 0.012, 0.008), M.metal, -0.01, 0.024, 0.09);
    tritium(slide, 0, 0.025, -0.0855, 0.0018);
    tritium(slide, 0.01, 0.024, 0.0945, 0.0014);
    tritium(slide, -0.01, 0.024, 0.0945, 0.0014);
    part(g, cy(0.007, 0.02), M.steel, 0, 0.034, -0.135);
    part(g, bx(0.034, 0.11, 0.05), M.poly, 0, -0.065, 0.04, -0.2);
    part(g, sb(0.008, 0.006, 0.04), M.poly, 0, -0.028, -0.01);
    const mag = group(g, 0, -0.075, 0.045, -0.2);
    part(mag, bx(0.028, 0.1, 0.038), M.metal, 0, 0, 0);
    part(mag, bx(0.031, 0.012, 0.042), M.poly, 0, -0.054, 0);
    const gh = group(g, 0.005, -0.06, 0.05);
    part(gh, bx(0.06, 0.085, 0.09), M.glove, 0, 0, 0);
    part(gh, bx(0.085, 0.085, 0.4), M.sleeve, 0.055, -0.09, 0.2, 0.5, 0.15, 0);
    const off = group(g, -0.03, -0.07, 0.04);
    part(off, bx(0.05, 0.08, 0.08), M.glove, 0, 0, 0);
    part(off, bx(0.085, 0.085, 0.42), M.sleeve, -0.07, -0.09, 0.21, 0.5, -0.35, 0);
    return finish(g, { mag, off, slide, muzzleZ: -0.145, muzzleY: 0.034, sightY: 0.058, sightZ: 0, adsDist: 0.36, hip: new THREE.Vector3(0.11, -0.14, -0.4), flashSize: 0.12, eject: new THREE.Vector3(0.025, 0.045, -0.02) });
  },
  revolver() {
    const g = new THREE.Group();
    part(g, bx(0.03, 0.05, 0.12), M.steel, 0, 0.01, -0.02);
    part(g, cy(0.01, 0.2), M.steel, 0, 0.03, -0.17);
    part(g, bx(0.012, 0.012, 0.2), M.steel, 0, 0.044, -0.17);
    part(g, bx(0.02, 0.018, 0.2), M.steel, 0, 0.012, -0.17);
    part(g, bx(0.004, 0.012, 0.006), M.metal, 0, 0.056, -0.26);
    tritium(g, 0, 0.058, -0.2565, 0.0018);
    part(g, bx(0.012, 0.018, 0.02), M.metal, 0, 0.05, 0.045, -0.4);
    const cyl = group(g, 0, 0.022, -0.035);
    part(cyl, cy(0.024, 0.055, 12), M.steel, 0, 0, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(cyl, sb(0.004, 0.004, 0.05), M.metal, Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0); }
    part(g, bx(0.032, 0.1, 0.045), M.wood, 0, -0.055, 0.05, -0.35);
    part(g, sb(0.008, 0.006, 0.04), M.steel, 0, -0.025, 0.0);
    const mag = group(g, 0, 0.022, 0.01);
    part(mag, cy(0.022, 0.018, 12), M.metal, 0, 0, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(mag, cy(0.005, 0.03, 8), M.brass, Math.cos(a) * 0.014, Math.sin(a) * 0.014, -0.02); }
    mag.visible = false;
    const gh = group(g, 0.005, -0.06, 0.06);
    part(gh, bx(0.06, 0.085, 0.09), M.glove, 0, 0, 0);
    part(gh, bx(0.085, 0.085, 0.4), M.sleeve, 0.055, -0.09, 0.2, 0.5, 0.15, 0);
    const off = group(g, -0.03, -0.07, 0.05);
    part(off, bx(0.05, 0.08, 0.08), M.glove, 0, 0, 0);
    part(off, bx(0.085, 0.085, 0.42), M.sleeve, -0.07, -0.09, 0.21, 0.5, -0.35, 0);
    return finish(g, { mag, off, cyl, loader: true, muzzleZ: -0.275, muzzleY: 0.03, sightY: 0.058, sightZ: 0, adsDist: 0.38, hip: new THREE.Vector3(0.11, -0.14, -0.42), flashSize: 0.16, eject: new THREE.Vector3(0, 0.02, -0.035) });
  },
  rpg() {
    const g = new THREE.Group();
    part(g, cy(0.042, 1.0), M.od, 0, 0.02, -0.15);
    part(g, tb(0.06, 0.14), M.tube, 0, 0.02, 0.4);
    part(g, cy(0.05, 0.24), M.wood, 0, 0.02, -0.02);
    part(g, bx(0.034, 0.1, 0.045), M.wood, 0, -0.06, 0.1, -0.35);
    part(g, bx(0.03, 0.09, 0.04), M.wood, 0, -0.06, -0.14, -0.2);
    part(g, bx(0.01, 0.03, 0.01), M.metal, 0, 0.087, -0.52);
    for (const x of [-0.012, 0.012]) part(g, bx(0.008, 0.03, 0.01), M.metal, x, 0.087, 0.05);
    part(g, bx(0.012, 0.03, 0.02), M.metal, 0, 0.06, 0.05);
    tritium(g, 0, 0.1, -0.514, 0.0028);
    const mag = group(g, 0, 0.02, -0.65);
    part(mag, cy(0.03, 0.12), M.od, 0, 0, 0.02);
    part(mag, cy(0.075, 0.14), M.od, 0, 0, -0.12);
    part(mag, new THREE.ConeGeometry(0.075, 0.22, 16).rotateX(-Math.PI / 2), M.od, 0, 0, -0.3);
    part(mag, new THREE.ConeGeometry(0.075, 0.08, 16).rotateX(Math.PI / 2), M.od, 0, 0, -0.01);
    const off = arms(g, [0, -0.09, 0.12], [0, -0.04, -0.14]);
    return finish(g, { mag, off, warhead: true, muzzleZ: -0.72, muzzleY: 0.02, sightY: 0.1, sightZ: 0.05, adsDist: 0.26, hip: new THREE.Vector3(0.12, -0.14, -0.42), flashSize: 0.32, eject: new THREE.Vector3(0, 0, 0.4) });
  },
  stinger() {
    const g = new THREE.Group();
    part(g, cy(0.05, 1.3), M.od, 0, 0.03, -0.2);
    part(g, cy(0.058, 0.06), M.poly, 0, 0.03, -0.85);
    part(g, cy(0.058, 0.06), M.poly, 0, 0.03, 0.45);
    part(g, bx(0.05, 0.14, 0.14), M.poly, 0, -0.07, 0.05);
    part(g, bx(0.034, 0.1, 0.045), M.poly, 0, -0.14, 0.1, -0.3);
    part(g, bx(0.2, 0.01, 0.012), M.metal, -0.1, 0.1, -0.35);
    part(g, bx(0.006, 0.05, 0.006), M.metal, 0, 0.1, -0.15);
    part(g, new THREE.RingGeometry(0.03, 0.0335, 32), M.tri, 0, 0.13, -0.15);
    tritium(g, 0, 0.13, -0.149, 0.0015);
    const mag = group(g, 0, -0.08, -0.2);
    part(mag, cy(0.022, 0.12), M.poly, 0, -0.02, 0);
    part(mag, bx(0.03, 0.05, 0.05), M.metal, 0, 0.02, 0);
    const off = arms(g, [0, -0.13, 0.12], [0, -0.03, -0.3]);
    return finish(g, { mag, off, muzzleZ: -0.9, muzzleY: 0.03, sightY: 0.13, sightZ: -0.15, adsDist: 0.3, hip: new THREE.Vector3(0.13, -0.15, -0.45), flashSize: 0.3, eject: new THREE.Vector3(0, 0, 0.45) });
  },
};

function buildKnife() {
  const g = new THREE.Group();
  part(g, bx(0.028, 0.032, 0.11), M.glove, 0, 0, 0);
  part(g, bx(0.05, 0.012, 0.012), M.metal, 0, 0, -0.06);
  part(g, sb(0.005, 0.03, 0.17), M.blade, 0, 0.003, -0.15);
  part(g, bx(0.06, 0.085, 0.09), M.glove, 0, -0.01, 0.01);
  part(g, bx(0.085, 0.085, 0.42), M.sleeve, 0.03, -0.1, 0.22, 0.45, 0, 0);
  g.visible = false;
  return g;
}

function buildNade() {
  const g = new THREE.Group();
  part(g, new THREE.SphereGeometry(0.035, 16, 12), M.nade, 0, 0, 0);
  part(g, bx(0.02, 0.03, 0.02), M.metal, 0, 0.04, 0);
  part(g, bx(0.01, 0.04, 0.012), M.steel, 0.015, 0.02, 0, 0, 0, -0.3);
  part(g, bx(0.06, 0.085, 0.09), M.glove, 0, -0.04, 0.03);
  part(g, bx(0.085, 0.085, 0.42), M.sleeve, -0.03, -0.12, 0.24, 0.45, 0, 0);
  g.visible = false;
  return g;
}

export const FUSE = 3.5;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => t < 0 ? 0 : t > 1 ? 1 : t;
// eased 0..1 progress of p through [a, b]
const P = (p, a, b) => smooth(clamp01((p - a) / (b - a)));
const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _h = new THREE.Vector3(), _q = new THREE.Vector3();

// Shell casings flicked out of the ejection port, in viewmodel space.
class Casings {
  constructor(holder) {
    const brass = new THREE.Group();
    this.pool = [];
    const bgeo = cy(0.0045, 0.022, 8), sgeo = cy(0.01, 0.05, 10);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(i < 12 ? bgeo : sgeo, i < 12 ? M.brass : M.shell);
      m.visible = false; m.frustumCulled = false;
      brass.add(m);
      this.pool.push({ m, v: new THREE.Vector3(), s: new THREE.Vector3(), t: 0, shell: i >= 12 });
    }
    holder.add(brass);
  }
  spawn(pos, shell = false, down = false) {
    const c = this.pool.find(q => q.t <= 0 && q.shell === shell) || this.pool.find(q => q.shell === shell);
    c.m.position.copy(pos);
    if (down) c.v.set((Math.random() - 0.5) * 0.3, -0.4, 0.1);
    else c.v.set(0.9 + Math.random() * 0.6, 0.9 + Math.random() * 0.5, 0.15 + Math.random() * 0.2);
    c.s.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.t = 0.7; c.m.visible = true;
  }
  update(dt) {
    for (const c of this.pool) {
      if (c.t <= 0) continue;
      c.t -= dt;
      c.v.y -= 6 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.s.x * dt; c.m.rotation.y += c.s.y * dt; c.m.rotation.z += c.s.z * dt;
      if (c.t <= 0) c.m.visible = false;
    }
  }
  clear() { for (const c of this.pool) { c.t = 0; c.m.visible = false; } }
}

// The player's two guns, knife and grenades: timing, ammo and the viewmodel pose.
export class Arsenal {
  constructor(game, wscene) {
    this.game = game;
    this.holder = new THREE.Group();
    wscene.add(this.holder);
    this.knife = buildKnife();
    this.nade = buildNade();
    this.holder.add(this.knife, this.nade);
    this.casings = new Casings(this.holder);
    this.light = new THREE.PointLight(0xffa860, 0, 1.6, 2);
    this.holder.add(this.light);
    this.slots = [];
    this.cur = 0;
    this.shellBlend = 0;
  }

  get w() { return this.slots[this.cur]; }

  equip(cls) {
    for (const s of this.slots) this.holder.remove(s.model.root);
    this.slots = [cls.primary, cls.secondary, cls.launcher].filter(Boolean).map(id => {
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
    this.breath = 4; this.holding = false; this.burstLeft = 0; this.ejectAt = -1; this.roll = 0;
    this.lockTarget = null; this.lockT = 0; this.locked = false; this.toneT = 0;
    this.casings.clear();
  }

  refill() {
    for (const s of this.slots) s.reserve = Math.min(s.def.reserve, s.reserve + (s.def.launcher ? 1 : s.def.mag * 2));
  }

  spread(pl) {
    const d = this.w.def, e = smooth(this.ads);
    let s = d.hip + (d.ads - d.hip) * e;
    s += d.move * Math.min(1, pl.hSpeed / 5) * (1 - e * 0.85);
    if (!pl.body.onGround) s += 3 * (1 - e * 0.5);
    if (pl.crouched && pl.body.onGround) s *= 0.8;
    s *= 1 - 0.4 * pl.proneAmt;
    s += this.bloom * (1 - e * 0.6);
    if (d.scope && e < 0.95) s = Math.max(s, d.hip);
    return s;
  }

  adsEase() { return smooth(this.ads); }
  get busy() { return !!(this.sw || this.melee > 0 || this.cook || this.throwT > 0 || this.transit); }

  startReload() {
    const w = this.w, d = w.def;
    if (this.reload || w.mag >= d.mag || w.reserve <= 0 || this.busy) return;
    this.burstLeft = 0;
    this.reload = d.shellReload ? { t: 0, shell: true, next: 0.3 } : { t: 0, dur: w.mag === 0 ? d.reloadEmpty : d.reload, empty: w.mag === 0, s: 0 };
  }

  update(dt, inp, pl) {
    const g = this.game, audio = g.audio;
    let w = this.w, d = w.def;
    // going prone or getting up: hands are busy for a moment
    this.transit = Math.abs(pl.proneAmt - (pl.prone ? 1 : 0)) > 0.3;
    this.cool = Math.max(0, this.cool - dt);
    this.bloom = Math.max(0, this.bloom - dt * 4);
    this.flashT -= dt;
    this.slideBack = Math.max(0, this.slideBack - dt * 12);
    this.casings.update(dt);
    if (this.action > 0) {
      this.action -= dt;
      if (this.actionSnd > 0 && (this.actionSnd -= dt) <= 0) audio.reload(d.model, d.action === 'pump' ? 'pump' : 'bolt');
    }

    // weapon switch
    if (inp.switchTo !== null && inp.switchTo !== this.cur && inp.switchTo < this.slots.length && !this.sw && !this.melee && !this.cook) {
      this.sw = { t: 0, phase: 'down', to: inp.switchTo };
      this.reload = null; this.action = 0; this.burstLeft = 0;
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
      this.melee = 0.6; this.meleeHit = false; this.reload = null; this.burstLeft = 0;
      audio.knife();
    }
    if (this.melee > 0) {
      this.melee -= dt;
      if (!this.meleeHit && this.melee < 0.45) { this.meleeHit = true; g.playerMelee(); }
    }

    // grenade: hold to cook, release to throw
    if (inp.nadePressed && this.frags > 0 && !this.cook && this.melee <= 0 && !this.sw && this.throwT <= 0) {
      this.cook = { t: 0 }; this.reload = null; this.burstLeft = 0;
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
        const cylinder = d.reloadKind === 'cyl';
        if (p > (cylinder ? 0.1 : 0.18) && r.s === 0) { r.s = 1; audio.reload(d.model, 'out'); }
        if (cylinder && p > 0.22 && !r.ejected) { r.ejected = true; this.ejectCylinder(w); }
        if (p > (cylinder ? 0.6 : 0.5) && r.s === 1) { r.s = 2; audio.reload(d.model, 'in'); }
        if (r.empty && !cylinder && p > 0.8 && r.s === 2) { r.s = 3; audio.reload(d.model, d.action === 'bolt' ? 'bolt' : 'charge'); }
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

    // rest of a burst already under way
    if (this.burstLeft > 0 && this.cool <= 0) {
      if (w.mag > 0 && !this.busy && !this.reload) this.fire(pl);
      else this.burstLeft = 0;
    }
    // fire
    const trig = d.auto ? inp.fire : inp.firePressed;
    if (trig && !this.busy && this.burstLeft <= 0) {
      if (pl.sprinting) pl.breakSprint();
      else if (this.reload && this.reload.shell && w.mag > 0) this.reload = null;
      else if (!this.reload && this.cool <= 0 && this.action <= 0 && pl.sprintOut <= 0) {
        if (w.mag > 0) { if (d.burst) this.burstLeft = d.burst; this.fire(pl); }
        else if (inp.firePressed) {
          audio.empty(d.model); this.cool = 0.25;
          if (w.reserve > 0) this.startReload();
        }
      }
    }

    // Stinger seeker: hold an aircraft near the centre while aimed until it locks
    if (d.launcher === 'stinger' && smooth(this.ads) > 0.8 && w.mag > 0 && !this.reload) {
      const cand = g.lockCandidate();
      if (cand && cand === this.lockTarget) this.lockT += dt;
      else { this.lockTarget = cand; this.lockT = 0; }
      this.locked = !!cand && this.lockT >= d.lock;
      if (cand && (this.toneT -= dt) <= 0) {
        this.toneT = this.locked ? 0.09 : 0.3;
        audio.tone(this.locked ? 1250 : 800, this.locked ? 0.07 : 0.1);
      }
    } else { this.lockTarget = null; this.lockT = 0; this.locked = false; }

    // sniper hold breath (sprint key while scoped)
    const e = smooth(this.ads);
    this.holding = d.scope && e > 0.9 && inp.sprint && this.breath > 0;
    this.breath = this.holding ? this.breath - dt : Math.min(4, this.breath + dt * 0.8);
    if ((d.scope || d.model === 'dmr') && e > 0.5) {
      const t = g.time, k = (this.holding ? 0.08 : d.scope ? 1 : 0.35) * e;
      pl.scopeSwayX = (Math.sin(t * 0.9) * 0.009 + Math.sin(t * 2.3) * 0.003) * k;
      pl.scopeSwayY = (Math.sin(t * 1.3 + 1) * 0.007 + Math.cos(t * 1.9) * 0.003) * k;
    } else pl.scopeSwayX = pl.scopeSwayY = 0;
  }

  fire(pl) {
    const w = this.w, d = w.def, g = this.game;
    w.mag--;
    if (d.burst) {
      this.burstLeft = Math.max(0, this.burstLeft - 1);
      this.cool = this.burstLeft > 0 ? 60 / d.burstRpm : 60 / d.rpm;
    } else this.cool = 60 / d.rpm;
    const spread = this.spread(pl);
    const muzzle = this.muzzleWorld();
    if (d.launcher) { g.playerLaunch(d, spread, this.locked ? this.lockTarget : null); this.lockT = 0; this.locked = false; }
    else g.playerShoot(d, spread, muzzle);
    const e = smooth(this.ads), steady = 1 - 0.35 * pl.proneAmt;
    pl.addRecoil(d.recoil.v * (1 - 0.3 * e) * (0.85 + Math.random() * 0.3) * steady, (Math.random() * 2 - 1) * d.recoil.h * steady);
    this.kick = Math.min(this.kick + d.kick, 0.2);
    this.roll += (Math.random() - 0.5) * d.kick * 2;
    this.bloom = Math.min(this.bloom + d.bloom, d.bloomMax);
    this.flashT = 0.05;
    if (d.action && w.mag > 0) { this.action = 60 / d.rpm; this.actionSnd = 0.22; this.ejectAt = 0.45; }
    else if (!d.action && d.reloadKind !== 'cyl' && !d.launcher) this.casings.spawn(this.ejectPoint());
    if (w.model.slide) this.slideBack = 1;
    if (w.mag === 0 && w.reserve > 0) this.autoReload = d.launcher ? 0.6 : 60 / d.rpm + 0.2;
    if (!d.launcher) g.effects.muzzleSmoke(muzzle, g.camera.getWorldDirection(_q));
  }

  ejectPoint() {
    const m = this.w.model;
    return _h.copy(m.eject).applyMatrix4(m.root.matrix);
  }

  ejectCylinder(w) {
    const m = w.model;
    for (let i = 0; i < Math.min(6, w.def.mag - w.mag); i++) {
      _h.set((Math.random() - 0.5) * 0.02, 0.02 + (Math.random() - 0.5) * 0.02, 0).applyMatrix4(m.root.matrix);
      this.casings.spawn(_h, false, true);
    }
  }

  muzzleWorld() {
    const e = smooth(this.ads);
    return _v.set(0.13 * (1 - e), -0.1 * (1 - e) - 0.04, -0.75).applyMatrix4(this.game.camera.matrixWorld).clone();
  }

  fovFor(base) {
    const d = this.w.def, e = smooth(this.ads);
    return base + (d.fov - base) * e;
  }

  // Keyframed reload: where the gun, magazine and support hand are at progress p.
  reloadPose(m, d, r, empty) {
    const p = Math.min(1, r.t / r.dur);
    const kind = d.reloadKind;
    const off = m.off.position.copy(m.offBase);
    m.off.rotation.copy(m.offRot);
    if (kind === 'rocket') {
      // muzzle up, a fresh round slides in from the front and seats
      const tilt = P(p, 0, 0.15) * (1 - P(p, 0.85, 1));
      _r.x += 0.35 * tilt; _r.z += 0.25 * tilt; _p.y -= 0.06 * tilt; _p.z += 0.05 * tilt;
      const inn = P(p, 0.3, 0.7), seat = P(p, 0.7, 0.78);
      m.mag.visible = p > 0.25;
      m.mag.position.copy(m.magBase);
      m.mag.position.z -= 0.35 * (1 - inn) + 0.03 * (1 - seat);
      m.mag.position.y -= 0.25 * (1 - inn);
      if (p < 0.25) off.lerp(_h.set(m.magBase.x, m.magBase.y - 0.3, m.magBase.z - 0.35), P(p, 0.05, 0.25));
      else if (p < 0.8) off.copy(m.mag.position).add(_q.set(0, -0.05, 0.03));
      else off.lerpVectors(_h.copy(m.magBase).add(_q.set(0, -0.05, 0.03)), m.offBase, P(p, 0.8, 0.95));
      return;
    }
    if (kind === 'cyl') {
      const open = P(p, 0.05, 0.15) * (1 - P(p, 0.8, 0.9));
      const up = P(p, 0.15, 0.24) * (1 - P(p, 0.3, 0.4));
      _r.z -= 0.35 * open; _r.x += 0.3 * open + 0.55 * up; _p.y -= 0.02 * open; _p.x -= 0.04 * open;
      m.cyl.position.copy(m.cylBase); m.cyl.position.x -= 0.028 * open;
      m.cyl.rotation.z = open * 0.4;
      const load = P(p, 0.38, 0.62), gone = p > 0.72;
      m.mag.visible = p > 0.34 && !gone;
      m.mag.position.copy(m.magBase); m.mag.position.x -= 0.028 * open;
      m.mag.position.y -= 0.3 * (1 - load); m.mag.position.z += 0.05 * (1 - load);
      _v.copy(m.mag.position).add(_q.set(0.02, -0.05, 0.02));
      if (p < 0.15) off.lerp(_v.set(m.cylBase.x - 0.028, m.cylBase.y - 0.05, m.cylBase.z), P(p, 0.05, 0.15));
      else if (p < 0.34) off.set(m.cylBase.x - 0.03, m.cylBase.y - 0.05 - 0.3 * P(p, 0.24, 0.34), m.cylBase.z + 0.05 * P(p, 0.24, 0.34));
      else if (p < 0.72) off.copy(_v);
      else off.lerpVectors(_v, m.offBase, P(p, 0.72, 0.9));
      return;
    }
    const heavy = kind === 'belt';
    const endT = empty ? 0.92 : 0.82;
    const tilt = P(p, 0, 0.14) * (1 - P(p, endT, 1));
    _r.z += (heavy ? 0.3 : 0.5) * tilt; _r.x += (heavy ? 0.3 : 0.16) * tilt; _r.y += 0.14 * tilt;
    _p.y -= 0.035 * tilt; _p.x -= 0.03 * tilt;
    if (m.lid) m.lid.rotation.x = m.lidRot - 1.1 * P(p, 0.08, 0.18) * (1 - P(p, 0.62, 0.72));
    // magazine: drops away, then a fresh one comes up and seats
    const out = P(p, 0.16, 0.32), inn = P(p, 0.34, 0.52), seat = P(p, 0.52, 0.57);
    m.mag.position.copy(m.magBase);
    m.mag.rotation.x = m.magRot;
    if (p < 0.33) { m.mag.position.y -= 0.34 * out * out; m.mag.position.z += 0.04 * out; m.mag.rotation.x += 0.5 * out; }
    else { m.mag.position.y -= 0.3 * (1 - inn) + 0.014 * (1 - seat); m.mag.position.z += 0.03 * (1 - inn); m.mag.rotation.x -= 0.3 * (1 - inn); }
    m.mag.visible = !(p > 0.31 && p < 0.35);
    const bump = Math.sin(Math.PI * P(p, 0.52, 0.62));
    _p.y += 0.012 * bump; _r.x -= 0.05 * bump;
    // support hand: grip → mag → down → back up with the new mag → grip
    _h.set(m.magBase.x - 0.005, m.magBase.y - 0.07, m.magBase.z + 0.02);
    if (p < 0.16) off.lerp(_h, P(p, 0.05, 0.16));
    else if (p < 0.34) off.copy(_h).add(_q.set(0, m.mag.position.y - m.magBase.y, m.mag.position.z - m.magBase.z));
    else if (p < 0.6) off.copy(_h).add(_q.set(0, m.mag.position.y - m.magBase.y - 0.01 * bump, m.mag.position.z - m.magBase.z));
    else off.lerpVectors(_h, m.offBase, P(p, 0.6, 0.74));
    if (p > 0.1 && p < 0.7) m.off.rotation.z += 0.4 * Math.sin(Math.PI * P(p, 0.1, 0.7));
    // empty: rack the charging handle / bolt / slide
    if (empty) {
      const reach = P(p, 0.72, 0.8) * (1 - P(p, 0.86, 0.95));
      const pull = P(p, 0.8, 0.84) * (1 - P(p, 0.845, 0.87));
      _r.z -= 0.18 * reach;
      if (m.charge) {
        m.charge.position.z = m.chargeBase + 0.06 * pull;
        _h.set(m.charge.position.x - 0.02, m.charge.position.y + 0.01, m.charge.position.z + 0.03);
        off.lerp(_h, reach);
      }
      if (m.bolt) {
        const lift = P(p, 0.74, 0.8) * (1 - P(p, 0.9, 0.95)), back = P(p, 0.8, 0.85) * (1 - P(p, 0.86, 0.9));
        m.bolt.rotation.z = m.boltRot - 1.1 * lift; m.bolt.position.z = m.boltBase + 0.08 * back;
      }
    }
  }

  animate(dt, pl, lookDX, lookDY) {
    const m = this.w.model, d = this.w.def, t = this.game.time;
    const e = smooth(this.ads);
    _p.copy(m.hip).lerp(m.adsPos, e);
    _r.set(0, 0, 0);

    // breathing idle
    _p.y += Math.sin(t * 1.6) * 0.003 * (1 - e * 0.8);
    _p.x += Math.sin(t * 0.8) * 0.002 * (1 - e);
    _r.z += Math.sin(t * 0.7) * 0.006 * (1 - e);

    const mv = Math.min(1, pl.hSpeed / 6) * (pl.body.onGround ? 1 : 0.2);
    const amp = (1 - e * 0.85) * mv * (pl.sprinting ? 1.8 : 1);
    _p.x += Math.sin(pl.bobPhase) * 0.014 * amp;
    _p.y -= Math.abs(Math.cos(pl.bobPhase)) * 0.012 * amp;
    _r.z += Math.sin(pl.bobPhase) * 0.02 * amp;
    _r.x += Math.abs(Math.cos(pl.bobPhase)) * 0.012 * amp;

    // lean into strafing
    const lat = pl.vel.x * Math.cos(pl.yaw) - pl.vel.z * Math.sin(pl.yaw);
    this.roll += (-lat * 0.012 * (1 - e * 0.7) - this.roll) * Math.min(1, dt * 6);
    _r.z += this.roll;

    this.sprintBlend += ((pl.sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 9);
    const sb2 = this.sprintBlend;
    _p.x += 0.02 * sb2; _p.y -= 0.07 * sb2; _p.z += 0.04 * sb2;
    _r.y += 0.75 * sb2; _r.x -= 0.2 * sb2; _r.z += 0.35 * sb2;

    const k = Math.min(1, dt * 10);
    this.swayX += (Math.max(-0.03, Math.min(0.03, -lookDX * 0.0007)) - this.swayX) * k;
    this.swayY += (Math.max(-0.03, Math.min(0.03, lookDY * 0.0007)) - this.swayY) * k;
    const sw = 1 - e * 0.75;
    _p.x += this.swayX * sw; _p.y += this.swayY * sw;
    _r.y += this.swayX * 2 * sw; _r.x -= this.swayY * 2 * sw;

    _p.z += this.kick * (1 - e * 0.3);
    _r.x += this.kick * 2.2 * (1 - e * 0.5);
    this.kick *= Math.exp(-dt * 14);

    // reset animated parts
    m.mag.position.copy(m.magBase); m.mag.rotation.x = m.magRot;
    m.off.position.copy(m.offBase); m.off.rotation.copy(m.offRot);
    if (m.loader) m.mag.visible = false;
    else m.mag.visible = !m.warhead || this.w.mag > 0;
    if (m.charge) m.charge.position.z = m.chargeBase;
    if (m.bolt) { m.bolt.position.z = m.boltBase; m.bolt.rotation.z = m.boltRot; }
    if (m.lid) m.lid.rotation.x = m.lidRot;
    if (m.cyl) { m.cyl.position.copy(m.cylBase); m.cyl.rotation.z = 0; }

    const r = this.reload;
    if (r && !r.shell) this.reloadPose(m, d, r, r.empty);

    // shotgun: tilt and thumb shells into the loading port one at a time
    this.shellBlend += ((r && r.shell ? 1 : 0) - this.shellBlend) * Math.min(1, dt * 10);
    if (m.shell) {
      const sb = this.shellBlend;
      _r.z += 0.45 * sb; _r.x += 0.18 * sb; _r.y += 0.2 * sb; _p.x -= 0.03 * sb; _p.y -= 0.02 * sb;
      m.shell.visible = false;
      if (r && r.shell) {
        const ph = 1 - clamp01((r.next - r.t) / d.shellTime);
        const port = _h.set(0.0, -0.055, 0.0);
        const low = _q.set(0.05, -0.2, 0.08);
        const off = m.off.position;
        if (ph < 0.35) off.lerpVectors(m.offBase, low, P(ph, 0, 0.35));
        else if (ph < 0.75) off.lerpVectors(low, port, P(ph, 0.35, 0.75));
        else off.lerpVectors(port, m.offBase, P(ph, 0.8, 1) * 0.6);
        off.lerp(m.offBase, 1 - sb);
        if (ph > 0.3 && ph < 0.8) {
          m.shell.visible = true;
          m.shell.position.set(off.x + 0.01, off.y + 0.03, off.z - 0.015 - 0.03 * P(ph, 0.6, 0.78));
        }
        if (ph > 0.7 && ph < 0.8) _p.y += 0.004;
      }
    }

    // bolt / pump cycling after a shot
    if (this.action > 0) {
      const a = clamp01(1 - this.action / (60 / d.rpm));
      const s = Math.sin(Math.PI * a);
      _r.z += 0.14 * s; _p.y -= 0.02 * s; _r.x += 0.05 * s;
      if (m.bolt) {
        const lift = P(a, 0.1, 0.25) * (1 - P(a, 0.72, 0.88)), back = P(a, 0.25, 0.45) * (1 - P(a, 0.52, 0.72));
        m.bolt.rotation.z = m.boltRot - 1.1 * lift; m.bolt.position.z = m.boltBase + 0.08 * back;
      }
      if (m.pump) {
        const back = P(a, 0.1, 0.45) * (1 - P(a, 0.55, 0.9));
        m.pump.position.z = m.pumpBase + 0.09 * back;
        m.off.position.z += 0.09 * back;
      }
      if (this.ejectAt >= 0 && a >= this.ejectAt) { this.ejectAt = -1; this.casings.spawn(this.ejectPoint(), !!m.pump); }
    } else if (m.pump) m.pump.position.z = m.pumpBase;
    if (m.slide) {
      const lockBack = this.w.mag === 0 && !(r && r.empty && r.t / r.dur > 0.82);
      m.slide.position.z = m.slideBase + 0.035 * this.slideBack + (lockBack ? 0.035 : 0);
    }

    if (this.sw) {
      const s = this.sw.phase === 'down' ? smooth(this.sw.t / 0.2) : 1 - smooth(Math.min(1, this.sw.t / 0.28));
      _p.y -= 0.3 * s; _r.x -= 0.8 * s; _r.z += 0.3 * s;
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

    // lying down: gun sits lower and rolls a little while crawling
    _p.y -= pl.landDip * 0.5 + 0.02 * pl.proneAmt * (1 - e);
    _r.z += Math.sin(pl.bobPhase * 0.5) * 0.05 * pl.proneAmt * mv;
    m.root.position.copy(_p);
    m.root.rotation.set(_r.x, _r.y, _r.z);
    m.root.updateMatrix();
    m.flash.visible = this.flashT > 0;
    // a smaller, dimmer flash when aimed so it does not white out the sight picture
    if (m.flash.visible) { m.flash.rotation.z = Math.random() * 6.28; m.flash.scale.setScalar((0.8 + Math.random() * 0.5) * (1 - 0.6 * e)); }
    this.light.intensity = this.flashT > 0 ? 3 : 0;
    if (this.flashT > 0) this.light.position.copy(m.muzzle.position).applyMatrix4(m.root.matrix);
    m.root.visible = !((d.scope || d.overlay) && e > 0.92);
  }
}
