// Vehicles: tanks, jets, FPV drones, AA emplacements and the attack chopper, plus the
// rockets, shells, bombs and flak they fire. Any vehicle can be run by the local player
// (control → update → view → drawHud) or by its own AI when a bot owns it. On a client,
// vehicles driven by someone else are VehicleProxy objects fed by the host's snapshots.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { raycastWorld, overlaps, groundAt, floorAt, lineOfSight, findPath, interest, spawns, objectsTouching, SIZE, terrainY } from './world.js';
import { AIRFRAMES, airframeFor, buildAircraft, paint } from './aircraft.js';
import { buildChopper, chopperHit } from './streaks.js';
import { flashTexture } from './effects.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();
const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const rotLocal = (q, axis, a) => { if (a) q.multiply(_q.setFromAxisAngle(axis, a)); };
const rotWorld = (q, axis, a) => { if (a) q.premultiply(_q.setFromAxisAngle(axis, a)); };
const fwdOf = (q, out) => out.set(0, 0, -1).applyQuaternion(q);
const aimDir = (yaw, pitch, out) => { const c = Math.cos(pitch); return out.set(-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c); };

// ---------- specs and damage ----------
export const SPEC = {
  apc: { name: 'APC', hp: 900, armor: 0.2, bounty: 150, seat: 'inside', air: false, size: 2.4, boom: 1.6, ground: true },
  ifv: { name: 'IFV', hp: 1150, armor: 0.1, bounty: 200, seat: 'inside', air: false, size: 2.5, boom: 1.8, ground: true },
  tank: { name: 'Tank', hp: 1500, armor: 0.03, bounty: 300, seat: 'inside', air: false, size: 2.6, boom: 2, ground: true },
  mbt: { name: 'MBT', hp: 1900, armor: 0.025, bounty: 400, seat: 'inside', air: false, size: 2.7, boom: 2.2, ground: true },
  jet: { name: 'Jet', hp: 1250, armor: 0.18, bounty: 250, seat: 'remote', air: true, size: 3, boom: 1.8, splash: { Flak: 0.4 }, fixed: true },
  attacker: { name: 'Attack jet', hp: 2200, armor: 0.3, bounty: 300, seat: 'remote', air: true, size: 3.5, boom: 2, splash: { Flak: 0.35 }, fixed: true },
  drone: { name: 'FPV Drone', hp: 45, armor: 0.75, bounty: 50, seat: 'remote', air: true, size: 0.4, boom: 0.4, splash: { Flak: 0.5 }, drone: true },
  drone10: { name: '10" FPV', hp: 90, armor: 0.6, bounty: 75, seat: 'remote', air: true, size: 0.7, boom: 0.7, splash: { Flak: 0.5 }, drone: true },
  recon: { name: 'Recon Drone', hp: 30, armor: 0.8, bounty: 100, seat: 'remote', air: true, size: 0.35, boom: 0.3, splash: { Flak: 0.5 }, drone: true, recon: true },
  aa: { name: 'AA Gun', hp: 900, armor: 0.25, bounty: 150, seat: 'inside', air: false, size: 1.5, boom: 1.2 },
  heli: { name: 'Attack Chopper', hp: 1400, armor: 0.6, bounty: 150, seat: 'remote', air: true, size: 2.3, boom: 1.6 },
};
// what each side fields
// Ground vehicles by kind, [USA, Russia]. main: cannon (tank shells), auto (autocannon) or
// hmg (heavy machine gun); atgm: wire-guided missiles fired with R.
export const ARMOR = {
  apc: [
    { name: 'M113', hp: 800, speed: 11, boost: 14, turn: 1.1, main: { type: 'hmg', name: 'M2 .50', rate: 0.11, dmg: 48 } },
    { name: 'BTR-80', hp: 900, speed: 13, boost: 16, turn: 0.8, main: { type: 'hmg', name: 'KPVT 14.5mm', rate: 0.1, dmg: 55 } },
  ],
  ifv: [
    { name: 'M2 Bradley', hp: 1150, speed: 10, boost: 12.5, turn: 1, main: { type: 'auto', name: '25mm', rate: 0.3, dmg: 110 }, atgm: { n: 2, name: 'TOW' } },
    { name: 'BMP-2', hp: 1000, speed: 11, boost: 13.5, turn: 1, main: { type: 'auto', name: '30mm', rate: 0.25, dmg: 115 }, atgm: { n: 2, name: 'Konkurs' } },
  ],
  tank: [
    { name: 'M1 Abrams', hp: 1500, speed: 8, boost: 10.5, turn: 0.85, main: { type: 'cannon', reload: 3.2 } },
    { name: 'T-80', hp: 1450, speed: 8.5, boost: 11, turn: 0.85, main: { type: 'cannon', reload: 3.4 } },
  ],
  mbt: [
    { name: 'M1A2 SEPv3', hp: 1900, speed: 8.5, boost: 11, turn: 0.9, main: { type: 'cannon', reload: 2.7 } },
    { name: 'T-90M', hp: 1850, speed: 8, boost: 10.5, turn: 0.85, main: { type: 'cannon', reload: 2.9 } },
  ],
};
export const isGround = (kind) => !!SPEC[kind]?.ground;

// FPV frames: a 5-inch racer (fast, small charge that does little to armour) and a 10-inch
// heavy lifter (slower, a big charge that kills tanks)
export const FPV = {
  drone: { thrust: 30, drag: 0.22, battery: 90, radius: 4.5, dmg: 190, direct: 260, weapon: 'FPV Drone', scale: 1, pitch: 1 },
  drone10: { thrust: 21.5, drag: 0.3, battery: 75, radius: 9, dmg: 320, direct: 1700, weapon: 'Heavy FPV', scale: 1.9, pitch: 0.6 },
};
export const isDrone = (kind) => !!SPEC[kind]?.drone;
const MODEL_NAME = { apc: ['M113', 'BTR-80'], ifv: ['M2 Bradley', 'BMP-2'], mbt: ['M1A2 SEPv3', 'T-90M'], tank: ['M1 Abrams', 'T-80'], jet: ['F-16C', 'Su-27'], attacker: ['A-10C', 'Su-25'], aa: ['AA Gun', 'AA Gun'], heli: ['AH-64 Apache', 'Mi-24 Hind'] };
export const vehicleName = (kind, team) => MODEL_NAME[kind]?.[team] || SPEC[kind]?.name || kind;
const HELP = {
  tank: 'WASD drive · Shift boost · Mouse aim turret · LMB cannon · Space coax MG · RMB gunner sight · F exit',
  jet: 'Mouse stick · A D rudder · W S throttle · Shift afterburner · LMB gun · RMB targeting pod (LMB designate) · R air-to-ground missile · G IR missile · Space flares · F leave',
  drone: 'Mouse pitch / yaw · A D roll · W S throttle · Space full power · Shift hover assist · LMB detonate · F abort',
  drone10: 'Heavy 10" FPV: slower, big charge, kills armour · Mouse pitch / yaw · A D roll · W S throttle · Shift hover · LMB detonate · F abort',
  recon: 'WASD fly · Space up · Shift down · Mouse yaw / camera tilt · RMB zoom · R thermal · LMB mark target · F land',
  aa: 'Mouse aim · LMB fire flak · RMB zoom · watch the heat · F exit',
  heli: 'Mouse aim · LMB 25 mm cannon (fires straight away) · RMB zoom · F leave the gun',
};
// the 5-inch FPV is left out on purpose: armour shrugs its small charge off
const EXPLOSIVE = new Set(['TOW', 'Konkurs', 'Frag', 'Airstrike', 'RPG-7', 'Stinger', 'Tank', 'Heavy FPV', 'Bomb', 'Flak', 'Jet', 'Barrel', 'Car', 'AGM-65', 'Kh-29', 'Kh-25', 'AIM-9', 'R-73']);
const AP = { 'M82A1': 0.3, '25mm': 0.35, '30mm': 0.38, 'M2 .50': 0.12, 'KPVT 14.5mm': 0.15, 'Jet Cannon': 0.25, 'GAU-8': 0.75, Chopper: 0.3, 'Tank MG': 0.06 };
export const VEHICLE_WEAPONS = new Set([...EXPLOSIVE, '25mm', '30mm', 'M2 .50', 'KPVT 14.5mm', 'FPV Drone', 'Jet Cannon', 'GAU-8', 'Chopper', 'Tank MG']);
export function armorMul(spec, weapon) { return EXPLOSIVE.has(weapon) ? 1 : Math.max(spec.armor, AP[weapon] || 0); }

export const PROJ = {
  rpg: { name: 'RPG-7', speed: 62, accel: 45, max: 120, grav: 1.5, radius: 4.5, dmg: 160, direct: 480, life: 4, trail: true, mesh: 'rocket' },
  stinger: { name: 'Stinger', speed: 40, accel: 80, max: 165, grav: 0, radius: 5, dmg: 100, direct: 480, life: 7, trail: true, homing: 2.2, prox: 4.5, mesh: 'missile' },
  shell: { name: 'Tank', speed: 230, grav: 4, radius: 5, dmg: 190, direct: 600, life: 3, mesh: 'shell' },
  bomb: { name: 'Bomb', speed: 0, grav: 14, radius: 9, dmg: 260, direct: 600, life: 14, mesh: 'bomb' },
  atgm: { name: 'TOW', speed: 30, accel: 60, max: 190, grav: 0, radius: 4, dmg: 160, direct: 1900, life: 12, trail: true, homing: 1.6, mesh: 'rocket', ground: true },
  agm: { name: 'AGM-65', speed: 0, accel: 70, max: 320, grav: 0, radius: 7, dmg: 260, direct: 2300, life: 40, trail: true, homing: 1.3, mesh: 'agm', ground: true },
  kh: { name: 'Kh-29', speed: 0, accel: 70, max: 330, grav: 0, radius: 8, dmg: 280, direct: 2400, life: 40, trail: true, homing: 1.3, mesh: 'agm', ground: true },
  aam: { name: 'AIM-9', speed: 0, accel: 200, max: 750, grav: 0, radius: 9, dmg: 220, direct: 1600, life: 14, trail: true, homing: 3.4, prox: 12, mesh: 'missile' },
  flak: { name: 'Flak', speed: 280, grav: 3, radius: 5.5, dmg: 45, direct: 90, life: 0.8, airburst: true, prox: 5, mesh: 'flak' },
};

// ---------- hit tests ----------
export function raySphere(o, d, c, r, maxT) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < maxT ? t : Infinity;
}

function slab(o, d, lo, hi, maxT) {
  let tmin = 0, tmax = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return Infinity; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function rayBox(o, d, x0, y0, z0, x1, y1, z1, maxT) {
  return slab([o.x, o.y, o.z], [d.x, d.y, d.z], [x0, y0, z0], [x1, y1, z1], maxT);
}

// box of half-size hx × hz, from y0 to y1 above p, turned by yaw
export function rayYawBox(o, d, p, yaw, hx, y0, y1, hz, maxT) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ox = o.x - p.x, oz = o.z - p.z;
  return slab([c * ox - s * oz, o.y - p.y, s * ox + c * oz], [c * d.x - s * d.z, d.y, s * d.x + c * d.z], [-hx, y0, -hz], [hx, y1, hz], maxT);
}

// Head sphere plus torso and leg boxes; a prone soldier is one long low box.
export function hitSoldier(e, o, d, maxT) {
  const p = e.pos;
  const prone = (e.proneAmt || 0) > 0.5;
  const head = e.aimPoint(_h1, true);
  let t = raySphere(o, d, head, prone ? 0.18 : 0.16, maxT), zone = 'head';
  if (prone) {
    const tb = rayYawBox(o, d, p, e.yaw, 0.32, 0, 0.45, 0.95, Math.min(t, maxT));
    if (tb < t) { t = tb; zone = 'torso'; }
    return t < maxT ? { t, zone } : null;
  }
  const c = Math.min(1, e.crouchAmt || 0);
  const L = (e.leanOff || 0) * 0.55, lx = p.x + Math.cos(e.yaw || 0) * L, lz = p.z - Math.sin(e.yaw || 0) * L;
  const tt = rayBox(o, d, lx - 0.25, p.y + 0.85 - 0.3 * c, lz - 0.25, lx + 0.25, p.y + 1.5 - 0.5 * c, lz + 0.25, Math.min(t, maxT));
  if (tt < t) { t = tt; zone = 'torso'; }
  const tl = rayBox(o, d, p.x - 0.2, p.y, p.z - 0.2, p.x + 0.2, p.y + 0.85 - 0.3 * c, p.z + 0.2, Math.min(t, maxT));
  if (tl < t) { t = tl; zone = 'legs'; }
  return t < maxT ? { t, zone } : null;
}

function hitKind(kind, v, o, d, maxT) {
  let t = Infinity;
  if (SPEC[kind]?.ground) t = rayYawBox(o, d, v.pos, v.yaw || 0, 1.75, 0.05, 2.4, 3.4, maxT);
  else if (kind === 'jet' || kind === 'attacker') {
    t = raySphere(o, d, v.pos, 2.2, maxT);
    fwdOf(v.quat, _h2);
    for (const k of [-4.2, 4]) t = Math.min(t, raySphere(o, d, _h1.copy(v.pos).addScaledVector(_h2, k), 1.5, maxT));
    _h2.copy(AX).applyQuaternion(v.quat);
    for (const k of [-3.4, 3.4]) t = Math.min(t, raySphere(o, d, _h1.copy(v.pos).addScaledVector(_h2, k), 1.4, maxT));
  } else if (SPEC[kind]?.drone) t = raySphere(o, d, v.pos, SPEC[kind].size + 0.05, maxT);
  else if (kind === 'aa') t = raySphere(o, d, _h1.set(v.pos.x, v.pos.y + 1.2, v.pos.z), 1.5, maxT);
  else if (kind === 'heli') return chopperHit(v.pos, o, d, maxT);
  return t < maxT ? { t, zone: 'body' } : null;
}

// Nearest thing a projectile or drone meets along a segment: world, enemy soldier or vehicle.
export function sweepHit(g, o, d, len, team, ignore) {
  const wh = raycastWorld(o, d, len);
  let t = wh ? wh.t : len, entity = null, normal = wh ? wh.normal : null;
  if (!wh && d.y < 0 && o.y + d.y * len < 0) { t = -o.y / d.y; normal = UP; }
  for (const s of g.soldiers) {
    if (!s.alive || s.team === team || s.inVehicle) continue;
    if (Math.abs(s.pos.x - o.x) > len + 3 || Math.abs(s.pos.z - o.z) > len + 3) continue;
    const h = hitSoldier(s, o, d, t);
    if (h) { t = h.t; entity = s; }
  }
  for (const v of g.vehicles) {
    if (!v.alive || v === ignore || v.team === team) continue;
    if (v.pos.distanceTo(o) > len + 12) continue;
    const h = v.hit(o, d, t);
    if (h) { t = h.t; entity = v; }
  }
  return entity || normal ? { t, entity, normal } : null;
}

// ---------- models ----------
const matCache = new Map();
function mats(team, ally) {
  const key = `${team}${ally ? 1 : 0}`;
  if (matCache.has(key)) return matCache.get(key);
  const std = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const M = {
    // painted steel: US desert tan, Russian three-tone green, with panel lines and grime
    body: new THREE.MeshStandardMaterial({ map: team ? paint('armorRU', ['#56613c', '#3f482b', '#6b6a44', '#2f3322'], 'blotch') : paint('armorUS', ['#b09c72', '#9c8a62'], 'twotone'), roughness: 0.75, metalness: 0.3 }),
    hull2: new THREE.MeshStandardMaterial({ map: team ? paint('armorRU2', ['#46502f', '#363e26'], 'twotone') : paint('armorUS2', ['#978660', '#877756'], 'twotone'), roughness: 0.78, metalness: 0.3 }),
    rubber: std(0x1e1f1c, 0.95, 0),
    dark: std(0x1d1e1f, 0.6, 0.5),
    track: std(0x161616, 0.95, 0.15),
    metal: std(0x3a3c3f, 0.38, 0.85),
    jet: std(team ? 0x93a8b8 : 0x858d95, 0.45, 0.45),
    jet2: std(team ? 0x6c8298 : 0x6c747c, 0.45, 0.45),
    olive: std(0x4a5231, 0.7, 0.1),
    sand: std(0x9a8a66, 0.95, 0),
    glass: new THREE.MeshStandardMaterial({ color: 0x1c2c3c, roughness: 0.05, metalness: 0.9 }),
    mark: new THREE.MeshBasicMaterial({ color: ally ? 0x3d7fe0 : 0xd0342a }),
    led: new THREE.MeshBasicMaterial({ color: ally ? new THREE.Color(0.4, 1.2, 3) : new THREE.Color(3, 0.4, 0.3) }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2, 1.6) }),
    prop: new THREE.MeshBasicMaterial({ color: 0x202020, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    flame: new THREE.MeshBasicMaterial({ map: flashTexture, color: new THREE.Color(3, 1.6, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  matCache.set(key, M);
  return M;
}

const G = {};
const rb = (w, h, d, r = 0.06) => (G[`r${w},${h},${d},${r}`] ||= new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)));
const cylZ = (r1, r2, l, s = 16) => (G[`z${r1},${r2},${l},${s}`] ||= new THREE.CylinderGeometry(r1, r2, l, s).rotateX(-Math.PI / 2));
const cylX = (r, l, s = 16) => (G[`x${r},${l},${s}`] ||= new THREE.CylinderGeometry(r, r, l, s).rotateZ(Math.PI / 2));
const cylY = (r, l, s = 16) => (G[`y${r},${l},${s}`] ||= new THREE.CylinderGeometry(r, r, l, s));
const coneZ = (r, l, s = 16) => (G[`n${r},${l},${s}`] ||= new THREE.ConeGeometry(r, l, s).rotateX(-Math.PI / 2));
const disc = (r) => (G[`d${r}`] ||= new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2));
const sphere = (r) => (G[`s${r}`] ||= new THREE.SphereGeometry(r, 14, 10));
function mk(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = true;
  parent.add(o);
  return o;
}

// flat shape in x/z (z forward is negative), extruded downward
function plate(pts, thick) {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
  return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }).rotateX(Math.PI / 2);
}

// Team 0 drives the M1 Abrams, team 1 the T-80. Both return the same parts, so the Tank
// class poses either one.
export function buildTank(team, ally) {
  return team ? buildT80(ally) : buildAbrams(ally);
}

function tracks(hull, M, n, r, len, x, skirt) {
  for (const s of [-1, 1]) {
    mk(hull, rb(0.62, 0.95, len, 0.3), M.track, x * s, 0.5, 0);
    for (let i = 0; i < n; i++) mk(hull, cylX(r, 0.22), M.dark, (x + 0.2) * s, 0.42, -len / 2 + 0.75 + i * (len - 1.5) / (n - 1));
    mk(hull, cylX(0.28, 0.2), M.metal, (x + 0.18) * s, 0.72, -len / 2 + 0.2);
    mk(hull, cylX(0.3, 0.2), M.dark, (x + 0.18) * s, 0.68, len / 2 - 0.25);
    if (skirt) skirt(s);
  }
}

function buildAbrams(ally) {
  const M = mats(0, ally), g = new THREE.Group();
  const hull = new THREE.Group(); g.add(hull);
  mk(hull, rb(2.6, 0.72, 6.9, 0.1), M.body, 0, 0.98, 0.05);
  mk(hull, rb(2.6, 0.42, 1.7, 0.06), M.body, 0, 1.12, -3.05, 0.95);
  mk(hull, rb(3.4, 0.08, 6.8, 0.03), M.hull2, 0, 1.36, 0.05);
  tracks(hull, M, 7, 0.33, 7.0, 1.35, (s) => {
    mk(hull, rb(0.1, 0.72, 5.0, 0.03), M.body, 1.74 * s, 0.98, 0.9);
    mk(hull, rb(0.14, 0.78, 1.9, 0.03), M.hull2, 1.75 * s, 0.98, -2.45);
    for (let i = 0; i < 5; i++) mk(hull, rb(0.03, 0.66, 0.05, 0.01), M.hull2, 1.8 * s, 0.98, -0.8 + i * 0.95);
    mk(hull, cylZ(0.1, 0.1, 0.08, 10), M.lamp, 1.05 * s, 1.3, -3.5);
    mk(hull, rb(0.3, 0.28, 0.3, 0.04), M.dark, 1.2 * s, 1.5, 3.2);
  });
  // turbine deck and grille
  mk(hull, rb(2.4, 0.22, 2.2, 0.05), M.hull2, 0, 1.48, 2.3);
  for (let i = 0; i < 7; i++) mk(hull, rb(2.1, 0.04, 0.1, 0.01), M.dark, 0, 1.6, 1.4 + i * 0.28);
  mk(hull, rb(2.2, 0.55, 0.12, 0.03), M.dark, 0, 1.1, 3.52);
  // angular turret: sloped cheeks, long bustle, sights and hatches
  const turret = new THREE.Group(); turret.position.set(0, 1.45, 0.25); g.add(turret);
  mk(turret, G.abramsT ||= plate([[-1.55, 1.3], [-1.6, -0.9], [-1.0, -2.0], [1.0, -2.0], [1.6, -0.9], [1.55, 1.3]], 0.72), M.body, 0, 0.74, 0);
  mk(turret, rb(2.8, 0.62, 1.6, 0.06), M.hull2, 0, 0.36, 2.0);
  for (const s of [-1, 1]) {
    mk(turret, rb(0.45, 0.5, 1.3, 0.05), M.hull2, 1.55 * s, 0.4, 2.0);
    for (let i = 0; i < 6; i++) mk(turret, cylZ(0.05, 0.05, 0.22, 6), M.dark, (1.2 + (i % 3) * 0.12) * s, 0.55 + Math.floor(i / 3) * 0.12, -1.1, -0.3);
  }
  mk(turret, rb(0.5, 0.42, 0.5, 0.05), M.hull2, 0.72, 0.95, -1.05);
  mk(turret, rb(0.38, 0.2, 0.06, 0.02), M.glass, 0.72, 1.0, -1.32);
  mk(turret, cylY(0.38, 0.28, 14), M.hull2, 0.65, 0.88, 0.45);
  mk(turret, cylY(0.3, 0.12, 12), M.hull2, -0.6, 0.8, 0.35);
  mk(turret, rb(0.34, 0.4, 0.34, 0.05), M.dark, -0.55, 1.05, -0.35);
  mk(turret, rb(0.07, 0.07, 1.05, 0.02), M.dark, 0.65, 1.2, 0.05);
  mk(turret, rb(0.06, 0.07, 0.8, 0.02), M.dark, -0.6, 1.02, 0.0);
  mk(turret, cylY(0.02, 1.0, 5), M.dark, 0.0, 1.2, 1.4);
  mk(turret, cylY(0.012, 2.4, 4), M.dark, -1.2, 1.9, 2.4);
  mk(turret, rb(0.7, 0.03, 0.7, 0.01), M.mark, 0, 0.745, 1.0);
  const gun = new THREE.Group(); gun.position.set(0, 0.38, -1.95); turret.add(gun);
  mk(gun, rb(1.0, 0.56, 0.5, 0.06), M.hull2, 0, 0, 0.1);
  mk(gun, cylZ(0.12, 0.12, 5.0, 16), M.metal, 0, 0, -2.5);
  mk(gun, cylZ(0.17, 0.16, 2.4, 16), M.body, 0, 0, -1.5);
  mk(gun, cylZ(0.14, 0.14, 0.35, 12), M.dark, 0, 0, -4.9);
  mk(gun, rb(0.14, 0.1, 0.16, 0.02), M.dark, 0, 0.16, -4.85);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -5.1); gun.add(muzzle);
  const coax = new THREE.Object3D(); coax.position.set(0.35, 0.05, -0.4); gun.add(coax);
  return { g, hull, turret, gun, muzzle, coax, gunZ: gun.position.z };
}

function buildT80(ally) {
  const M = mats(1, ally), g = new THREE.Group();
  const hull = new THREE.Group(); g.add(hull);
  mk(hull, rb(2.8, 0.7, 6.6, 0.12), M.body, 0, 0.98, 0);
  mk(hull, rb(2.7, 0.5, 1.6, 0.08), M.body, 0, 1.1, -2.95, 0.55);
  // Kontakt-5 wedges across the glacis
  for (let i = 0; i < 6; i++) mk(hull, rb(0.42, 0.14, 0.9, 0.02), M.hull2, -1.1 + i * 0.44, 1.38, -2.9, 0.55);
  mk(hull, rb(3.4, 0.07, 6.4, 0.03), M.hull2, 0, 1.36, 0);
  tracks(hull, M, 6, 0.38, 6.7, 1.3, (s) => {
    mk(hull, rb(0.08, 0.5, 6.0, 0.03), M.rubber, 1.7 * s, 1.08, -0.1);
    for (let i = 0; i < 4; i++) mk(hull, rb(0.14, 0.42, 0.62, 0.02), M.hull2, 1.72 * s, 1.1, -2.9 + i * 0.66);
    mk(hull, cylZ(0.1, 0.1, 0.08, 10), M.lamp, 1.1 * s, 1.34, -3.3);
    for (let i = 0; i < 3; i++) mk(hull, rb(0.4, 0.34, 0.9, 0.04), M.olive, 1.35 * s, 1.58, -1.2 + i * 1.0);
  });
  mk(hull, rb(2.4, 0.22, 1.9, 0.05), M.hull2, 0, 1.46, 2.2);
  for (let i = 0; i < 6; i++) mk(hull, rb(2.1, 0.04, 0.1, 0.01), M.dark, 0, 1.58, 1.4 + i * 0.28);
  // the long-range fuel drums on the back
  for (const s of [-1, 1]) {
    mk(hull, cylX(0.3, 1.0, 14), M.olive, 0.7 * s, 1.35, 3.45);
    for (const x of [0.3, 1.1]) mk(hull, cylX(0.31, 0.04, 14), M.dark, (x) * s, 1.35, 3.45);
  }
  // low, rounded turret with an ERA horseshoe
  const turret = new THREE.Group(); turret.position.set(0, 1.42, 0.05); g.add(turret);
  const dome = mk(turret, G.t80dome ||= new THREE.SphereGeometry(1.45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.body, 0, 0.02, 0.2);
  dome.scale.set(1, 0.5, 1.2);
  mk(turret, cylY(1.42, 0.12, 24), M.body, 0, 0.05, 0.2);
  for (let i = 0; i < 9; i++) {
    const a = -1.05 + i * 0.26;
    mk(turret, rb(0.5, 0.3, 0.55, 0.03), M.hull2, Math.sin(a) * 1.15, 0.45, 0.2 - Math.cos(a) * 1.35, -0.35, a, 0);
  }
  for (const s of [-1, 1]) {
    mk(turret, rb(0.55, 0.45, 1.0, 0.05), M.olive, 1.2 * s, 0.35, 1.25);
    for (let i = 0; i < 4; i++) mk(turret, cylZ(0.055, 0.055, 0.24, 6), M.dark, (1.15 + (i % 2) * 0.13) * s, 0.45 + Math.floor(i / 2) * 0.13, -0.6, -0.3);
  }
  mk(turret, rb(1.8, 0.36, 0.7, 0.05), M.olive, 0, 0.3, 1.85);
  mk(turret, cylY(0.36, 0.28, 14), M.hull2, -0.55, 0.78, 0.4);
  mk(turret, rb(0.07, 0.07, 0.95, 0.02), M.dark, -0.55, 1.02, 0.0);
  mk(turret, cylY(0.3, 0.2, 12), M.hull2, 0.55, 0.72, 0.5);
  mk(turret, rb(0.34, 0.36, 0.34, 0.04), M.hull2, 0.72, 0.8, -0.6);
  mk(turret, rb(0.26, 0.18, 0.05, 0.02), M.glass, 0.72, 0.84, -0.78);
  mk(turret, cylZ(0.22, 0.22, 0.35, 14), M.dark, -0.72, 0.62, -1.05);
  mk(turret, disc(0.18), M.lamp, -0.72, 0.62, -1.23).rotation.set(Math.PI / 2, 0, 0);
  mk(turret, cylZ(0.09, 0.09, 1.9, 8), M.dark, -1.05, 0.62, 2.1);
  mk(turret, cylY(0.012, 2.4, 4), M.dark, 1.0, 1.7, 1.6);
  mk(turret, rb(0.6, 0.03, 0.6, 0.01), M.mark, 0, 0.74, 0.7);
  const gun = new THREE.Group(); gun.position.set(0, 0.38, -1.55); turret.add(gun);
  mk(gun, rb(0.8, 0.5, 0.5, 0.1), M.hull2, 0, 0, 0.1);
  mk(gun, cylZ(0.11, 0.12, 5.1, 16), M.metal, 0, 0, -2.6);
  for (const z of [-0.9, -1.9, -3.9]) mk(gun, cylZ(0.155, 0.155, 0.9, 16), M.body, 0, 0, z);
  mk(gun, cylZ(0.2, 0.2, 0.7, 16), M.body, 0, 0, -2.9);
  mk(gun, cylZ(0.13, 0.13, 0.2, 12), M.dark, 0, 0, -5.1);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -5.25); gun.add(muzzle);
  const coax = new THREE.Object3D(); coax.position.set(0.32, 0.05, -0.4); gun.add(coax);
  return { g, hull, turret, gun, muzzle, coax, gunZ: gun.position.z };
}

// ---------- APCs, IFVs and late main battle tanks ----------
// shared return shape: { g, hull, turret, gun, muzzle, coax, gunZ }
function wheelsX(hull, M, xs, zs, r, w) {
  for (const x of xs) for (const z of zs) {
    mk(hull, cylX(r, w, 18), M.rubber, x, r, z);
    mk(hull, cylX(r * 0.55, w + 0.04, 12), M.hull2, x, r, z);
    mk(hull, cylX(r * 0.18, w + 0.08, 8), M.dark, x, r, z);
  }
}
function smallTurret(g, M, y, z, gunLen, gunR, opts = {}) {
  const turret = new THREE.Group(); turret.position.set(opts.x || 0, y, z); g.add(turret);
  const gun = new THREE.Group(); gun.position.set(0, opts.gy ?? 0.25, opts.gz ?? -0.6); turret.add(gun);
  mk(gun, cylZ(gunR, gunR, gunLen, 10), M.metal, 0, 0, -gunLen / 2);
  mk(gun, cylZ(gunR * 1.7, gunR * 1.7, 0.4, 10), M.dark, 0, 0, -0.1);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -gunLen - 0.05); gun.add(muzzle);
  const coax = new THREE.Object3D(); coax.position.set(0.2, 0.05, -0.3); gun.add(coax);
  return { turret, gun, muzzle, coax, gunZ: gun.position.z };
}

function buildM113(ally) {
  const M = mats(0, ally), g = new THREE.Group(), hull = new THREE.Group(); g.add(hull);
  // the aluminium box: sloped nose plate, flat sides, ramp at the back
  mk(hull, rb(2.68, 1.2, 4.3, 0.05), M.body, 0, 1.25, 0.25);
  mk(hull, rb(2.68, 0.1, 1.3, 0.03), M.body, 0, 1.6, -2.15, -0.6);
  mk(hull, rb(2.68, 0.7, 0.9, 0.04), M.body, 0, 0.85, -2.25, 0.5);
  mk(hull, rb(2.3, 0.9, 0.08, 0.02), M.hull2, 0, 1.25, 2.43);
  mk(hull, rb(2.0, 0.06, 1.1, 0.02), M.hull2, 0, 1.87, 0.9);
  mk(hull, rb(2.4, 0.5, 0.06, 0.02), M.hull2, 0, 1.45, -2.72, -0.3);
  tracks(hull, M, 5, 0.3, 4.8, 1.15, (s) => {
    mk(hull, rb(0.05, 0.4, 4.4, 0.01), M.rubber, 1.4 * s, 0.9, 0.2);
    mk(hull, cylZ(0.08, 0.08, 0.06, 10), M.lamp, 0.95 * s, 1.55, -2.62);
    mk(hull, rb(0.3, 0.45, 0.3, 0.03), M.dark, 1.15 * s, 1.95, 2.1);
  });
  mk(hull, cylZ(0.07, 0.07, 1.6, 8), M.dark, -1.0, 1.95, 0.2);
  const T = smallTurret(g, M, 1.9, -0.6, 1.6, 0.045, { x: 0.35, gy: 0.35, gz: -0.3 });
  mk(T.turret, cylY(0.42, 0.3, 14), M.hull2, 0, 0.1, 0);
  mk(T.turret, rb(0.9, 0.55, 0.06, 0.02), M.hull2, 0, 0.45, -0.45);
  mk(T.gun, rb(0.14, 0.2, 0.9, 0.02), M.dark, 0, 0, 0.1);
  return { g, hull, ...T };
}

function buildBTR80(ally) {
  const M = mats(1, ally), g = new THREE.Group(), hull = new THREE.Group(); g.add(hull);
  // long boat hull: sharp lower bow, sloped upper sides, eight big wheels
  mk(hull, rb(2.6, 1.05, 5.8, 0.08), M.body, 0, 1.45, 0.3);
  mk(hull, G.btrNose ||= plate([[-1.3, 0], [-0.4, -1.4], [0.4, -1.4], [1.3, 0]], 1.0), M.body, 0, 0.95, -2.55);
  mk(hull, rb(2.3, 0.1, 1.5, 0.03), M.body, 0, 2.05, -2.3, -0.45);
  for (const s of [-1, 1]) {
    mk(hull, rb(0.1, 0.62, 5.6, 0.03), M.hull2, 1.28 * s, 1.95, 0.35, 0, 0, 0.35 * s);
    mk(hull, rb(0.06, 0.55, 0.9, 0.02), M.hull2, 1.36 * s, 1.35, 0.1);
    for (const z of [-1.2, 1.6]) mk(hull, rb(0.08, 0.2, 0.2, 0.02), M.glass, 1.4 * s, 2.0, z);
    mk(hull, cylZ(0.09, 0.09, 0.06, 10), M.lamp, 0.9 * s, 1.7, -3.1);
  }
  mk(hull, rb(2.1, 0.12, 2.2, 0.03), M.hull2, 0, 2.28, 1.5);
  wheelsX(hull, M, [-1.35, 1.35], [-2.2, -0.9, 0.7, 2.0], 0.55, 0.36);
  for (const s of [-1, 1]) mk(hull, rb(0.3, 0.2, 5.4, 0.03), M.dark, 1.2 * s, 1.15, 0);
  const T = smallTurret(g, M, 2.3, -0.9, 2.2, 0.06, { gy: 0.35, gz: -0.4 });
  mk(T.turret, G.btrT ||= new THREE.ConeGeometry(0.62, 0.55, 12), M.body, 0, 0.3, 0);
  mk(T.gun, rb(0.2, 0.26, 0.6, 0.03), M.hull2, 0, 0, 0.15);
  mk(T.turret, rb(0.12, 0.1, 0.2, 0.02), M.glass, 0.3, 0.45, -0.3);
  return { g, hull, ...T };
}

function buildBradley(ally) {
  const M = mats(0, ally), g = new THREE.Group(), hull = new THREE.Group(); g.add(hull);
  mk(hull, rb(3.2, 1.25, 6.1, 0.08), M.body, 0, 1.25, 0.2);
  mk(hull, rb(3.2, 0.12, 1.9, 0.03), M.body, 0, 1.55, -2.55, -0.62);
  mk(hull, rb(3.2, 0.62, 0.7, 0.04), M.body, 0, 0.9, -3.0, 0.55);
  mk(hull, rb(2.6, 1.0, 0.1, 0.02), M.hull2, 0, 1.3, 3.27);
  // add-on armour tiles down the sides
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) mk(hull, rb(0.14, 0.6, 0.95, 0.02), M.hull2, 1.72 * s, 1.35, -2.3 + i * 0.98);
  tracks(hull, M, 6, 0.32, 6.3, 1.38, (s) => {
    mk(hull, rb(0.08, 0.5, 6.0, 0.02), M.rubber, 1.68 * s, 0.85, 0.2);
    mk(hull, cylZ(0.08, 0.08, 0.06, 10), M.lamp, 1.1 * s, 1.75, -3.3);
  });
  mk(hull, rb(2.6, 0.08, 2.4, 0.02), M.hull2, 0, 1.9, 1.7);
  // turret offset right: 25 mm Bushmaster, TOW launcher box on the left side
  const T = smallTurret(g, M, 1.95, -0.4, 2.5, 0.055, { x: 0.35, gy: 0.35, gz: -0.8 });
  mk(T.turret, G.bradT ||= plate([[-0.95, 1.0], [-1.05, -0.4], [-0.6, -1.0], [0.6, -1.0], [1.05, -0.4], [0.95, 1.0]], 0.72), M.body, 0, 0.36, 0);
  mk(T.turret, rb(1.8, 0.35, 0.6, 0.04), M.hull2, 0, 0.25, 1.1);
  mk(T.turret, rb(0.5, 0.45, 1.4, 0.04), M.olive, -1.25, 0.55, 0.2);
  for (const y of [0.42, 0.68]) mk(T.turret, disc(0.14), M.dark, -1.25, y, -0.51).rotation.set(Math.PI / 2, 0, 0);
  mk(T.turret, rb(0.4, 0.35, 0.4, 0.03), M.hull2, 0.55, 0.92, -0.35);
  mk(T.turret, rb(0.28, 0.16, 0.04, 0.01), M.glass, 0.55, 0.95, -0.56);
  mk(T.gun, rb(0.3, 0.28, 0.7, 0.03), M.hull2, 0, 0, 0.2);
  mk(T.gun, cylZ(0.08, 0.07, 0.35, 10), M.dark, 0, 0, -2.45);
  mk(T.turret, rb(0.7, 0.03, 0.7, 0.01), M.mark, 0, 0.73, 0.3);
  return { g, hull, ...T };
}

function buildBMP2(ally) {
  const M = mats(1, ally), g = new THREE.Group(), hull = new THREE.Group(); g.add(hull);
  // low hull with the ribbed, sharply pointed bow
  mk(hull, rb(3.0, 0.95, 4.6, 0.08), M.body, 0, 1.15, 0.8);
  mk(hull, G.bmpNose ||= plate([[-1.5, 0], [-0.3, -2.1], [0.3, -2.1], [1.5, 0]], 0.9), M.body, 0, 0.72, -1.5, -0.12);
  for (let i = 0; i < 5; i++) mk(hull, rb(2.6 - i * 0.45, 0.04, 0.05, 0.01), M.hull2, 0, 1.25 - i * 0.02, -1.65 - i * 0.35, -0.25);
  mk(hull, rb(2.8, 0.1, 1.5, 0.03), M.body, 0, 1.52, -1.2, -0.2);
  tracks(hull, M, 6, 0.36, 6.4, 1.35, (s) => {
    mk(hull, rb(0.06, 0.35, 5.8, 0.02), M.hull2, 1.66 * s, 1.1, 0.2);
    mk(hull, cylZ(0.08, 0.08, 0.06, 10), M.lamp, 1.1 * s, 1.5, -2.6);
    for (const z of [0.5, 1.6, 2.6]) mk(hull, rb(0.3, 0.12, 0.35, 0.02), M.hull2, 0.8 * s, 1.68, z);
  });
  const T = smallTurret(g, M, 1.6, -0.2, 2.9, 0.05, { gy: 0.35, gz: -0.6 });
  mk(T.turret, G.bmpT ||= new THREE.CylinderGeometry(0.75, 0.95, 0.55, 14), M.body, 0, 0.28, 0);
  mk(T.turret, cylZ(0.08, 0.08, 1.2, 8), M.olive, 0.15, 0.78, 0.1);
  mk(T.turret, rb(0.25, 0.25, 0.3, 0.03), M.hull2, -0.45, 0.65, -0.25);
  mk(T.gun, cylZ(0.08, 0.08, 0.8, 10), M.hull2, 0, 0, -0.3);
  mk(T.gun, cylZ(0.065, 0.065, 0.25, 10), M.dark, 0, 0, -2.85);
  mk(T.turret, rb(0.5, 0.03, 0.5, 0.01), M.mark, 0, 0.56, 0.3);
  return { g, hull, ...T };
}

// M1A2 SEPv3: the Abrams with the commander's independent viewer, TUSK tiles and a loader shield
function buildM1A2(ally) {
  const m = buildAbrams(ally), M = mats(0, ally);
  mk(m.turret, rb(0.45, 0.5, 0.45, 0.05), M.hull2, -0.35, 1.25, -0.2);
  mk(m.turret, rb(0.34, 0.22, 0.05, 0.02), M.glass, -0.35, 1.3, -0.43);
  mk(m.turret, rb(0.6, 0.45, 0.06, 0.02), M.hull2, -0.65, 1.2, 0.1);
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) mk(m.hull, rb(0.16, 0.42, 0.7, 0.02), M.hull2, 1.86 * s, 1.1, -2.6 + i * 0.78);
  for (let i = 0; i < 4; i++) mk(m.hull, rb(0.55, 0.28, 0.4, 0.03), M.olive, -0.8 + i * 0.55, 1.62, 3.3);
  return m;
}

// T-90M: T-80-style hull, Relikt wedges on the turret front and a slat cage round the bustle
function buildT90M(ally) {
  const m = buildT80(ally), M = mats(1, ally);
  for (const s of [-1, 1]) {
    mk(m.turret, G.relikt ||= plate([[-0.55, 0.6], [-0.55, -0.2], [0.55, -0.9], [0.55, 0.6]], 0.42), M.hull2, 0.72 * s, 0.4, -1.05, 0, s > 0 ? 0 : Math.PI, 0);
  }
  for (let i = 0; i < 9; i++) mk(m.turret, rb(0.03, 0.55, 0.03, 0.005), M.dark, -1.1 + i * 0.275, 0.4, 2.35);
  mk(m.turret, rb(2.3, 0.03, 0.03, 0.005), M.dark, 0, 0.66, 2.35);
  mk(m.turret, rb(0.5, 0.4, 0.5, 0.05), M.hull2, 0.4, 1.0, -0.2);
  return m;
}

// Team 0 flies the F-16, team 1 the Su-27.
export function buildJet(team, ally) {
  return team ? buildSu27(ally) : buildF16(ally);
}

function jetFlame(M) {
  const f = mk(new THREE.Group(), G.flame ||= new THREE.ConeGeometry(0.55, 3, 12, 1, true).rotateX(Math.PI / 2), M.flame, 0, 0, 0);
  f.castShadow = false;
  return f;
}

function jetBombs(g, M, xs, y, z) {
  const bombs = [];
  for (const x of xs) {
    const b = new THREE.Group(); b.position.set(x, y, z); g.add(b);
    mk(b, cylY(0.03, 0.3, 4), M.dark, 0, 0.2, 0);
    mk(b, cylZ(0.17, 0.17, 1.3, 10), M.dark, 0, 0, 0);
    mk(b, coneZ(0.17, 0.4, 10), M.dark, 0, 0, -0.85);
    bombs.push(b);
  }
  return bombs;
}

function missile(g, M, x, y, z) {
  mk(g, cylZ(0.07, 0.07, 2.6, 8), M.metal, x, y, z);
  mk(g, coneZ(0.07, 0.3, 8), M.dark, x, y, z - 1.45);
  for (const r of [0, Math.PI / 2]) mk(g, rb(0.36, 0.02, 0.25, 0.005), M.dark, x, y, z + 1.1, 0, 0, r);
}

function buildF16(ally) {
  const M = mats(0, ally), g = new THREE.Group();
  mk(g, cylZ(0.62, 0.58, 9.2, 18), M.jet, 0, 0, 0.6);
  mk(g, coneZ(0.62, 3.3, 18), M.jet, 0, 0.02, -5.6);
  mk(g, coneZ(0.14, 0.5, 8), M.dark, 0, 0.02, -7.4);
  mk(g, rb(1.1, 0.75, 2.4, 0.2), M.jet, 0, -0.62, -1.9);
  mk(g, rb(1.0, 0.62, 0.08, 0.1), M.dark, 0, -0.62, -3.12);
  mk(g, rb(0.8, 0.5, 5.2, 0.2), M.jet, 0, 0.42, 1.0);
  const canopy = mk(g, G.canopy ||= new THREE.SphereGeometry(0.6, 16, 10), M.glass, 0, 0.62, -3.5);
  canopy.scale.set(0.8, 0.75, 2.1);
  mk(g, G.f16w ||= plate([[-4.7, 2.0], [-4.7, 1.2], [-1.1, -2.2], [1.1, -2.2], [4.7, 1.2], [4.7, 2.0]], 0.12), M.jet, 0, 0.05, 0.9);
  mk(g, G.f16lerx ||= plate([[-1.1, -2.2], [-0.62, -4.3], [0.62, -4.3], [1.1, -2.2]], 0.08), M.jet, 0, 0.05, 0.9);
  mk(g, G.f16h ||= plate([[-2.7, 1.1], [-2.7, 0.55], [-0.6, -0.9], [0.6, -0.9], [2.7, 0.55], [2.7, 1.1]], 0.09), M.jet, 0, -0.05, 4.6);
  mk(g, rb(0.13, 2.4, 2.3, 0.04), M.jet2, 0, 1.55, 4.1, 0.42);
  for (const s of [-1, 1]) mk(g, rb(0.08, 0.6, 0.9, 0.02), M.jet2, 0.45 * s, -0.75, 4.2, 0.3, 0, 0.25 * s);
  mk(g, cylZ(0.5, 0.58, 1.0, 16), M.dark, 0, 0, 5.6);
  for (const s of [-1, 1]) { missile(g, M, 4.8 * s, 0, 1.4); missile(g, M, 3.6 * s, -0.3, 1.2); }
  const flame = jetFlame(M); flame.position.z = 6.9; g.add(flame);
  const bombs = jetBombs(g, M, [-2.6, -1.6, 1.6, 2.6], -0.45, 1.3);
  for (const s of [-1, 1]) {
    mk(g, disc(0.35), M.mark, 3.2 * s, 0.13, 1.6);
    mk(g, rb(0.08, 0.08, 0.2, 0.02), M.led, 4.75 * s, 0.1, 0.4);
  }
  return { g, flame, bombs };
}

function buildSu27(ally) {
  const M = mats(1, ally), g = new THREE.Group();
  mk(g, cylZ(0.55, 0.62, 5.0, 18), M.jet, 0, 0.1, -2.6);
  mk(g, coneZ(0.55, 3.0, 18), M.jet, 0, 0.1, -6.6);
  mk(g, coneZ(0.12, 0.5, 8), M.dark, 0, 0.1, -8.3);
  const canopy = mk(g, G.canopy ||= new THREE.SphereGeometry(0.6, 16, 10), M.glass, 0, 0.62, -4.4);
  canopy.scale.set(0.8, 0.75, 2.2);
  mk(g, rb(2.9, 0.55, 7.2, 0.25), M.jet, 0, 0, 1.4);
  for (const s of [-1, 1]) {
    mk(g, cylZ(0.56, 0.52, 6.6, 16), M.jet2, 1.05 * s, -0.3, 2.3);
    mk(g, rb(0.95, 0.9, 2.0, 0.08), M.jet2, 1.05 * s, -0.5, -1.1);
    mk(g, rb(0.85, 0.72, 0.08, 0.04), M.dark, 1.05 * s, -0.5, -2.12);
    mk(g, cylZ(0.46, 0.54, 0.9, 16), M.dark, 1.05 * s, -0.3, 5.9);
    mk(g, rb(0.13, 2.3, 2.1, 0.04), M.jet2, 1.35 * s, 1.35, 4.3, 0.35, 0, 0.12 * s);
    mk(g, disc(0.3), M.mark, 1.42 * s, 1.6, 4.4).rotation.set(0, 0, Math.PI / 2 * s);
    missile(g, M, 7.2 * s, 0.02, 1.6);
    missile(g, M, 5.2 * s, -0.3, 1.2);
  }
  mk(g, G.su27w ||= plate([[-7.2, 2.5], [-7.2, 1.7], [-1.5, -1.6], [1.5, -1.6], [7.2, 1.7], [7.2, 2.5]], 0.13), M.jet, 0, 0.1, 0.9);
  mk(g, G.su27lerx ||= plate([[-1.5, -1.6], [-0.55, -4.9], [0.55, -4.9], [1.5, -1.6]], 0.09), M.jet, 0, 0.12, 0.9);
  mk(g, G.su27h ||= plate([[-3.2, 1.3], [-3.2, 0.7], [-1.2, -0.9], [1.2, -0.9], [3.2, 0.7], [3.2, 1.3]], 0.09), M.jet, 0, -0.2, 5.1);
  mk(g, cylZ(0.26, 0.12, 2.2, 10), M.jet, 0, 0.05, 5.9);
  const flame = new THREE.Group(); flame.position.z = 6.9; g.add(flame);
  for (const s of [-1, 1]) { const f = jetFlame(M); f.position.set(1.05 * s, -0.3, 0); flame.add(f); }
  const bombs = jetBombs(g, M, [-3.4, -2.3, 2.3, 3.4], -0.4, 1.4);
  for (const s of [-1, 1]) mk(g, rb(0.08, 0.08, 0.2, 0.02), M.led, 7.2 * s, 0.05, 0.3);
  return { g, flame, bombs };
}

export function buildDrone(team, ally, scale = 1) {
  const M = mats(team, ally), g0 = new THREE.Group(), g = new THREE.Group();
  g.scale.setScalar(scale); g0.add(g);
  for (const a of [Math.PI / 4, -Math.PI / 4]) mk(g, rb(0.56, 0.02, 0.045, 0.008), M.dark, 0, 0, 0, 0, a, 0);
  mk(g, rb(0.1, 0.045, 0.16, 0.01), M.dark, 0, 0.03, 0);
  mk(g, rb(0.07, 0.035, 0.11, 0.01), M.olive, 0, 0.07, 0.01);
  mk(g, rb(0.035, 0.035, 0.035, 0.006), M.dark, 0, 0.035, -0.09);
  const props = [];
  for (const [x, z] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) {
    mk(g, cylY(0.022, 0.035, 10), M.metal, x, 0.02, z);
    props.push(mk(g, disc(0.13), M.prop, x, 0.045, z));
  }
  mk(g, cylZ(0.045, 0.045, 0.26, 12), M.olive, 0, -0.05, 0.02);
  mk(g, coneZ(0.045, 0.08, 12), M.olive, 0, -0.05, -0.15);
  mk(g, rb(0.02, 0.012, 0.02, 0.004), M.led, 0, 0.06, 0.1);
  if (scale > 1.5) { mk(g, cylZ(0.06, 0.06, 0.3, 12), M.olive, 0, -0.1, 0.02); mk(g, coneZ(0.06, 0.1, 12), M.olive, 0, -0.1, -0.18); }
  return { g: g0, props };
}

// DJI Mavic-style quad: grey folding-arm body, gimbal camera under the nose
export function buildRecon() {
  const M = mats(0, true), g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.55, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.5 });
  mk(g, rb(0.1, 0.055, 0.22, 0.02), grey, 0, 0, 0);
  mk(g, rb(0.085, 0.03, 0.12, 0.012), grey, 0, 0.035, 0.02);
  mk(g, rb(0.07, 0.02, 0.05, 0.008), dark, 0, 0.012, -0.11);
  const props = [];
  for (const [x, z, ry] of [[0.14, -0.1, 0.5], [-0.14, -0.1, -0.5], [0.13, 0.11, 2.6], [-0.13, 0.11, -2.6]]) {
    mk(g, rb(0.14, 0.018, 0.025, 0.006), grey, x / 2, 0.005, z / 2, 0, ry, 0);
    mk(g, cylY(0.018, 0.03, 10), dark, x, 0.015, z);
    props.push(mk(g, disc(0.1), M.prop, x, 0.035, z));
    mk(g, cylY(0.004, 0.05, 6), dark, x, -0.03, z);
  }
  mk(g, sphere(0.028), dark, 0, -0.03, -0.12);
  mk(g, cylZ(0.012, 0.012, 0.012, 12), M.metal, 0, -0.03, -0.147);
  mk(g, rb(0.012, 0.006, 0.006, 0.002), M.led, 0.04, -0.02, 0.1);
  mk(g, rb(0.012, 0.006, 0.006, 0.002), M.led, -0.04, -0.02, 0.1);
  return { g, props };
}

export function buildAA(team, ally) {
  const M = mats(team, ally), g = new THREE.Group();
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 14; i++) {
      if (i === 0 || i === 13) continue;
      const a = (i + layer * 0.5) / 14 * Math.PI * 2;
      mk(g, rb(0.75, 0.32, 0.42, 0.14), M.sand, Math.sin(a) * 1.75, 0.16 + layer * 0.3, Math.cos(a) * 1.75, 0, a, 0);
    }
  }
  mk(g, cylY(0.42, 0.9, 12), M.hull2, 0, 0.45, 0);
  const mount = new THREE.Group(); mount.position.y = 0.95; g.add(mount);
  mk(mount, rb(1.3, 0.16, 1.3, 0.05), M.hull2, 0, 0, 0);
  mk(mount, rb(0.5, 0.08, 0.5, 0.02), M.dark, 0, 0.35, 0.55);
  mk(mount, rb(0.08, 0.5, 0.08, 0.02), M.dark, 0, 0.12, 0.55);
  for (const s of [-1, 1]) mk(mount, rb(0.1, 0.8, 0.6, 0.03), M.hull2, 0.55 * s, 0.45, -0.1);
  mk(mount, rb(0.4, 0.03, 0.4, 0.01), M.mark, 0, 0.09, 0.3);
  const guns = new THREE.Group(); guns.position.set(0, 0.7, -0.1); mount.add(guns);
  mk(guns, rb(0.9, 0.36, 0.8, 0.06), M.body, 0, 0, 0);
  const muzzles = [];
  for (const s of [-1, 1]) {
    mk(guns, cylZ(0.05, 0.05, 2.3, 10), M.metal, 0.3 * s, 0.02, -1.5);
    mk(guns, cylZ(0.075, 0.075, 0.25, 10), M.dark, 0.3 * s, 0.02, -2.6);
    mk(guns, rb(0.25, 0.3, 0.45, 0.04), M.olive, 0.62 * s, -0.05, 0.05);
    const mz = new THREE.Object3D(); mz.position.set(0.3 * s, 0.02, -2.75); guns.add(mz); muzzles.push(mz);
  }
  return { g, mount, guns, muzzles };
}

const MODELS = { tank: buildTank, apc: (t, a) => t ? buildBTR80(a) : buildM113(a), ifv: (t, a) => t ? buildBMP2(a) : buildBradley(a), mbt: (t, a) => t ? buildT90M(a) : buildM1A2(a), jet: (t, a) => buildAircraft(airframeFor('jet', t), a), attacker: (t, a) => buildAircraft(airframeFor('attacker', t), a), drone: buildDrone, drone10: (t, a) => buildDrone(t, a, 1.9), recon: buildRecon, aa: buildAA, heli: (team) => buildChopper(team) };

function pose(kind, m, pos, quat, a, b, dt) {
  m.g.position.copy(pos);
  m.g.quaternion.copy(quat);
  if (SPEC[kind]?.ground) { m.turret.rotation.y = a; m.gun.rotation.x = b; }
  else if (kind === 'aa') { m.mount.rotation.y = a; m.guns.rotation.x = b; }
  else if (kind === 'heli') { m.rotor.rotation.y += dt * 28; m.tail.rotation.x += dt * 35; }
  else if (m.props) for (const p of m.props) p.material.opacity = 0.22 + Math.random() * 0.2;
}

// ---------- HUD helpers ----------
function text(ctx, s, x, y, align = 'left', color = '#e8f0e0', size = 17) {
  ctx.font = `600 ${size}px Rajdhani, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}

function ring(ctx, x, y, r, color = 'rgba(230,255,220,0.9)', w = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

function cross(ctx, x, y, s, gap, color = 'rgba(230,255,220,0.95)', w = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x - s, y); ctx.lineTo(x - gap, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s); ctx.lineTo(x, y - gap); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + s);
  ctx.stroke();
}

function box(ctx, x, y, s, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  const c = s * 0.35;
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(x + sx * s, y + sy * (s - c)); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * (s - c), y + sy * s);
  }
  ctx.stroke();
}

// Boxes on enemies (red) and allies (blue) the camera can see.
export function drawMarkers(ctx, game, P, { soldiers = true, vehicles = true, range = 400, los = true } = {}) {
  const cam = game.camera.position, me = game.player;
  const list = [];
  if (soldiers) for (const s of game.soldiers) if (s.alive && !s.inVehicle && s !== me) list.push(s);
  if (vehicles) for (const v of game.vehicles) if (v.alive && v !== me.vehicle) list.push(v);
  for (const e of list) {
    const p = e.aimPoint(_c, false);
    const d = p.distanceTo(cam);
    if (d > range) continue;
    const s = P(p);
    if (!s) continue;
    if (los && !e.isVehicle && !lineOfSight(cam, p)) continue;
    const ally = e.team === me.team;
    const size = e.isVehicle ? Math.max(9, 900 * (e.size || 1) / Math.max(1, d)) : Math.max(5, 500 / Math.max(1, d));
    box(ctx, s[0], s[1], size, ally ? 'rgba(111,176,255,0.9)' : 'rgba(255,80,60,0.95)');
    if (e.isVehicle && !ally) text(ctx, e.name.toUpperCase(), s[0], s[1] - size - 6, 'center', '#ff8a70', 13);
  }
}

function noise(ctx, W, H, amount) {
  if (amount <= 0.01) return;
  const n = Math.floor(amount * 500);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + amount * 0.5})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 40 * amount, 1 + Math.random() * 3);
  }
  if (amount > 0.6) { ctx.fillStyle = `rgba(20,20,20,${(amount - 0.6) * 1.8})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- base ----------
class Vehicle {
  constructor(game, kind, owner, id) {
    const s = SPEC[kind];
    Object.assign(this, { game, kind, owner, id, spec: s, name: vehicleName(kind, owner.team), team: owner.team, seat: s.seat, air: s.air, size: s.size, help: HELP[kind] });
    this.isVehicle = true; this.alive = true; this.local = true;
    this.maxHealth = s.hp; this.health = s.hp;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.quat = new THREE.Quaternion();
    this.a = 0; this.b = 0; this.t = 0; this.driver = null; this.yaw = 0;
    this.flareT = 0; this.missileWarn = 0;
    this.ai = !owner.isPlayer && !owner.isNet;
  }

  get controlled() { return !!this.driver?.isPlayer; }
  addModel() { this.m = MODELS[this.kind](this.team, this.team === this.game.player.team); this.game.scene.add(this.m.g); }
  aimPoint(out) { return out.set(this.pos.x, this.pos.y + (this.spec?.ground ? 1.3 : this.kind === 'aa' ? 1.2 : 0), this.pos.z); }
  hit(o, d, maxT) { return hitKind(this.kind, this, o, d, maxT); }
  control() {}
  grade() { return null; }
  drawHud() {}
  stats() { return ''; }

  applyDamage(amount, attacker, weapon) {
    if (!this.alive) return;
    this.health -= amount * armorMul(this.spec, weapon);
    if (this.controlled && amount > 1) this.game.hud.vehicleHit();
    if (this.health <= 0) { this.health = 0; this.destroy(attacker, weapon); }
  }

  destroy(attacker, weapon, fx = true) {
    if (!this.alive) return;
    this.alive = false;
    const g = this.game;
    if (fx) g.explodeFx(this.aimPoint(new THREE.Vector3()), this.spec.boom);
    g.emit({ k: 'vdead', id: this.id });
    if (attacker && !attacker.isVehicle && attacker.team !== this.team && attacker.score !== undefined) {
      attacker.score += this.spec.bounty;
      g.popupFor(attacker, [[`${this.name} destroyed`, this.spec.bounty]]);
    }
    if (this.spec.ground || this.spec.fixed) g.announce(this.team, `${this.name} destroyed`, `Enemy ${this.name} destroyed`);
    const d = this.driver;
    if (d) {
      g.leftVehicle(d, this);
      if (this.seat === 'inside' && d.alive && g.authority) { d.protect = 0; g.damage(d, 999, attacker, weapon || this.name, false, this.pos); }
    }
    this.cleanup();
  }

  // the host told a client that its own vehicle was destroyed
  destroyLocal() {
    const d = this.driver;
    if (d) this.game.leftVehicle(d, this);
    this.cleanup(false);
  }

  cleanup(tell = true) {
    const g = this.game;
    if (tell && g.role === 'client' && this.local) g.net?.send({ t: 'vx', id: this.id });
    this.alive = false;
    if (this.m) g.scene.remove(this.m.g);
    this.sound?.stop(); this.sound = null;
  }

  remove() {
    const d = this.driver;
    if (d) this.game.leftVehicle(d, this);
    this.cleanup();
    this.persistent = false;
  }

  netRow() {
    const p = this.pos, q = this.quat;
    return [this.id, this.kind, this.team, r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r2(this.a), r2(this.b),
      this.alive ? 1 : 0, this.driver ? this.driver.id : -1, Math.max(0, Math.round(this.health))];
  }
}

// ---------- tank ----------
export class Tank extends Vehicle {
  constructor(game, owner, id, x, z, yaw, kind = 'tank') {
    super(game, kind, owner, id);
    this.A = ARMOR[kind][this.team] || ARMOR.tank[0];
    this.name = this.A.name; this.maxHealth = this.health = this.A.hp;
    this.atgm = this.A.atgm?.n || 0; this.atgmWant = false;
    this.help = HELP.tank + (this.atgm ? ' · R guided missile' : '');
    this.addModel();
    this.pos.set(x, groundAt(x, z, 1.5, 1), z);
    this.yaw = yaw; this.speed = 0; this.aimYaw = yaw; this.aimPitch = 0; this.tYaw = yaw; this.tPitch = 0;
    this.throttle = 0; this.steer = 0; this.boost = false; this.fireWant = false; this.mgWant = false; this.zoomWant = false;
    this.reload = 1; this.mgT = 0; this.recoil = 0; this.zoom = 0; this.tiltX = 0; this.tiltZ = 0;
    this.scanT = 0; this.target = null; this.path = null; this.pathI = 0; this.goal = null; this.aiFire = 1;
    this.stuckT = 0; this.stuckPos = this.pos.clone(); this.reverseT = 0; this.crushT = 0;
    this.sound = game.audio.engine('tank');
    this.pose(0);
  }

  control(dt, inp) {
    const s = this.game.settings.sens * 0.0022 * (this.zoom > 0.5 ? 0.3 : 1);
    this.aimYaw -= inp.dx * s;
    this.aimPitch = clamp(this.aimPitch - inp.dy * s, -0.3, 0.45);
    this.throttle = inp.forward - inp.back; this.steer = inp.left - inp.right; this.boost = inp.sprint;
    this.fireWant = inp.fire; this.mgWant = inp.jump; this.zoomWant = inp.ads;
    if (inp.reload) this.atgmWant = true;
  }

  // drive straight through crates, fences, barrels, sandbags and thin walls
  crush(x, z, yaw) {
    this.crushT = 0.1;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), lo = this.pos.y + 0.8, hi = this.pos.y + 2.4;
    const hit = new Set();
    for (const k of [-1.9, 0, 1.9]) for (const o of objectsTouching(x + fx * k, z + fz * k, 1.5, lo, hi)) if (o.spec.crush) hit.add(o);
    for (const o of hit) {
      this.game.crushObject(o, this.driver || this.owner);
      if (this.controlled) this.game.shake = Math.max(this.game.shake, 0.04);
      this.speed *= 0.85;
    }
  }

  fits(x, z, yaw) {
    if (x < 2 || z < 2 || x > SIZE - 2 || z > SIZE - 2) return false;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), lo = this.pos.y + 0.8, hi = this.pos.y + 2.4;
    for (const k of [-1.9, 0, 1.9]) if (overlaps(x + fx * k, z + fz * k, 1.45, lo, hi)) return false;
    for (const v of this.game.vehicles) {
      if (v === this || !v.alive || !v.spec?.ground) continue;
      const nd = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (nd < 4.5 && nd < Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z)) return false;
    }
    return true;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (this.ai && !this.driver) this.think(dt);
    else if (!this.driver) { this.throttle = 0; this.steer = 0; this.fireWant = false; this.mgWant = false; }
    // tracks: accelerate to the throttle's speed, neutral steer on A/D
    const want = this.throttle > 0 ? (this.boost ? this.A.boost : this.A.speed) * this.throttle : this.throttle * 4.5;
    const acc = Math.abs(want) > Math.abs(this.speed) && want * this.speed >= 0 ? 3.2 : 7;
    this.speed += clamp(want - this.speed, -acc * dt, acc * dt);
    const turn = this.steer * this.A.turn * dt;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt, ny = this.yaw + turn;
    if (Math.abs(this.speed) > 1.2 && (this.crushT -= dt) <= 0) this.crush(nx + fx * Math.sign(this.speed) * 0.4, nz + fz * Math.sign(this.speed) * 0.4, ny);
    if (this.fits(nx, nz, ny)) { this.pos.x = nx; this.pos.z = nz; this.yaw = ny; }
    else if (this.fits(this.pos.x, this.pos.z, ny)) { this.yaw = ny; this.speed *= 0.5; }
    else if (this.fits(nx, nz, this.yaw)) { this.pos.x = nx; this.pos.z = nz; }
    else {
      if (Math.abs(this.speed) > 3 && this.controlled) g.shake = Math.max(g.shake, 0.03);
      this.speed *= -0.15;
    }
    // ride over kerbs and rubble; pitch and roll with the ground
    const top = this.pos.y + 0.8, rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const fy = groundAt(this.pos.x + fx * 2.4, this.pos.z + fz * 2.4, 1.2, top), by = groundAt(this.pos.x - fx * 2.4, this.pos.z - fz * 2.4, 1.2, top);
    const ly = groundAt(this.pos.x - rx * 1.3, this.pos.z - rz * 1.3, 0.8, top), ry = groundAt(this.pos.x + rx * 1.3, this.pos.z + rz * 1.3, 0.8, top);
    const gy = Math.max(fy, by, ly, ry) * 0.5 + (fy + by + ly + ry) / 8;
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 8);
    const k = Math.min(1, dt * 6);
    this.tiltX += (Math.atan2(fy - by, 4.8) - this.speed * 0.004 * (this.throttle ? 1 : 0) - this.tiltX) * k;
    this.tiltZ += (Math.atan2(ry - ly, 2.6) - this.tiltZ) * k;
    // turret chases the aim point, gun elevates within its limits
    const rel = wrap(this.tYaw - this.yaw);
    this.a += clamp(wrap(rel - this.a), -1.2 * dt, 1.2 * dt);
    const bw = clamp(this.tPitch - this.tiltX, -0.15, 0.4);
    this.b += clamp(bw - this.b, -0.6 * dt, 0.6 * dt);
    this.recoil = Math.max(0, this.recoil - dt * 2.5);
    this.reload = Math.max(0, this.reload - dt);
    this.pose(dt);
    if (this.fireWant && this.reload <= 0) this.fireMain();
    if (this.atgmWant) { this.atgmWant = false; this.fireAtgm(); }
    if (this.mgWant && (this.mgT -= dt) <= 0) this.fireMG();
    this.vel.set(fx * this.speed, 0, fz * this.speed);
    this.sound?.set(this.controlled ? null : this.pos, 0.25 + Math.min(1, Math.abs(this.speed) / 9) * 0.65 + (this.throttle ? 0.1 : 0));
  }

  pose() {
    const m = this.m;
    this.quat.setFromEuler(_e.set(this.tiltX, this.yaw, this.tiltZ, 'YXZ'));
    m.g.position.copy(this.pos); m.g.quaternion.copy(this.quat);
    m.turret.rotation.y = this.a; m.gun.rotation.x = this.b;
    m.gun.position.z = m.gunZ + Math.sin(Math.min(1, this.recoil) * Math.PI * 0.5) * 0.5 * (this.recoil > 0.8 ? 1 : this.recoil / 0.8);
    m.g.updateMatrixWorld(true);
  }

  gunRay(o, d) {
    this.m.muzzle.getWorldPosition(o);
    this.m.gun.getWorldQuaternion(_q2);
    return d.set(0, 0, -1).applyQuaternion(_q2);
  }

  fireMain() {
    const M = this.A.main;
    if (M.type === 'cannon') { this.fireCannon(); return; }
    const g = this.game, o = new THREE.Vector3(), d = new THREE.Vector3();
    this.gunRay(o, d);
    d.x += (Math.random() - 0.5) * 0.01; d.y += (Math.random() - 0.5) * 0.01; d.z += (Math.random() - 0.5) * 0.01;
    this.reload = M.rate; this.recoil = M.type === 'auto' ? 0.35 : 0.1;
    g.vehicleGun(this, o, d.normalize(), M.name, M.dmg, 0xffb070, M.type === 'auto' ? 'jetgun' : 'lmg', true);
    g.effects.flash(o, M.type === 'auto' ? 1.4 : 0.8);
    if (M.type === 'auto') g.explode(this.aimHit(o, d), this.driver || this.owner, 1.5, 30, M.name, { streak: true });
    g.noise(this, this.pos, 60);
  }

  // where the gun ray meets the world (autocannon HE splash lands there)
  aimHit(o, d) {
    const h = raycastWorld(o, d, 400);
    return o.clone().addScaledVector(d, h ? h.t : 400);
  }

  fireAtgm() {
    if (this.atgm <= 0) { if (this.controlled) this.game.hud.toast('No guided missiles left'); return; }
    this.atgm--;
    const g = this.game, o = new THREE.Vector3(), d = new THREE.Vector3();
    this.gunRay(o, d);
    o.addScaledVector(_u.set(0, 0.6, 0), 1);
    // guided onto whatever is under the sight, or the ground point there
    const hit = sweepHit(g, o, d, 1500, this.team, this);
    const p = o.clone().addScaledVector(d, hit ? hit.t : 1500);
    const tgt = hit?.entity || { alive: true, point: true, pos: p, vel: new THREE.Vector3() };
    g.fireProjectile('atgm', this.driver || this.owner, o, d.clone().multiplyScalar(30), tgt, this);
    g.audio.rpg?.(this.controlled ? null : o);
  }

  fireCannon() {
    const g = this.game, o = new THREE.Vector3(), d = new THREE.Vector3();
    this.gunRay(o, d);
    this.reload = this.A.main.reload; this.recoil = 1;
    g.fireProjectile('shell', this.driver || this.owner, o, d.clone().multiplyScalar(PROJ.shell.speed), null, this);
    g.effects.flash(o, 3.2);
    g.effects.cannonBlast(o, d);
    g.audio.cannon(this.controlled ? null : o);
    if (this.controlled) g.shake = Math.max(g.shake, 0.07);
    this.speed -= 0.8 * Math.cos(this.a);
    g.noise(this, this.pos, 80);
  }

  fireMG() {
    this.mgT = 0.09;
    const g = this.game, o = this.m.coax.getWorldPosition(new THREE.Vector3());
    this.m.gun.getWorldQuaternion(_q2);
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(_q2);
    d.x += (Math.random() - 0.5) * 0.024; d.y += (Math.random() - 0.5) * 0.024; d.z += (Math.random() - 0.5) * 0.024;
    g.vehicleGun(this, o, d.normalize(), 'Tank MG', 34, 0xffc080, 'lmg', Math.random() < 0.5);
  }

  think(dt) {
    const g = this.game;
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5; this.target = null;
      const eye = _v.set(this.pos.x, this.pos.y + 2.6, this.pos.z);
      let bd = 75;
      for (const e of g.targetsFor(this.team)) {
        if (e.kind === 'jet') continue;
        const p = e.aimPoint(_w, false), d = p.distanceTo(eye) - (e.isVehicle ? 20 : 0);
        if (d < bd && lineOfSight(eye, p)) { bd = d; this.target = e; }
      }
    }
    const t = this.target;
    this.fireWant = false; this.mgWant = false;
    if (t && t.alive) {
      const p = t.aimPoint(_w, false);
      this.m.gun.getWorldPosition(_v);
      const dx = p.x - _v.x, dz = p.z - _v.z, h = Math.hypot(dx, dz);
      const drop = this.A.main.type === 'cannon' ? 0.5 * PROJ.shell.grav * (h / PROJ.shell.speed) ** 2 : 0;
      if (t !== this.aimT) { this.aimT = t; this.aimOff = (Math.random() - 0.5) * 0.08; this.aimOffP = (Math.random() - 0.5) * 0.04; }
      this.tYaw = Math.atan2(-dx, -dz) + this.aimOff; this.tPitch = Math.atan2(p.y + drop - _v.y, h) + this.aimOffP;
      const err = Math.abs(wrap(this.yaw + this.a - this.tYaw)) + Math.abs(this.b + this.tiltX - this.tPitch);
      if (this.A.main.type !== 'cannon') { if (err < 0.06) this.fireWant = true; if (t.isVehicle && this.atgm > 0 && err < 0.03 && h > 60 && Math.random() < dt * 0.3) this.atgmWant = true; }
      else if (err < 0.05 && (this.aiFire -= dt) <= 0) {
        this.fireWant = true; this.aiFire = 2.5 + Math.random() * 3;
        // the gunner corrects after each shot, but never perfectly
        this.aimOff *= 0.4; this.aimOff += (Math.random() - 0.5) * 0.03; this.aimOffP = (Math.random() - 0.5) * 0.02;
      }
      if (!t.isVehicle && err < 0.12 && h < 45) this.mgWant = true;
      this.goal = h > 40 ? { x: t.pos.x, z: t.pos.z } : null;
    } else {
      this.tYaw = this.yaw; this.tPitch = 0;
      if (!this.goal) this.goal = this.game.mode.vehicleGoal(this.team) || (interest.length ? interest[Math.floor(Math.random() * interest.length)] : null);
    }
    this.drive(dt);
  }

  drive(dt) {
    const g = this.game;
    if (this.reverseT > 0) { this.reverseT -= dt; this.throttle = -1; this.steer = 0.8; return; }
    this.throttle = 0; this.steer = 0;
    if (!this.goal) return;
    if (!this.path || this.pathGoal !== this.goal) {
      if (g.pathBudget <= 0) return;
      g.pathBudget--;
      this.path = findPath(this.pos.x, this.pos.z, this.goal.x, this.goal.z) || [];
      this.pathI = 0; this.pathGoal = this.goal;
    }
    let wp = this.path[this.pathI];
    if (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 3) wp = this.path[++this.pathI];
    if (!wp) { this.goal = null; this.path = null; return; }
    const diff = wrap(Math.atan2(-(wp.x - this.pos.x), -(wp.z - this.pos.z)) - this.yaw);
    this.steer = clamp(diff * 2, -1, 1);
    this.throttle = Math.abs(diff) < 0.6 ? 0.8 : 0.1;
    if ((this.stuckT += dt) > 3) {
      if (this.pos.distanceTo(this.stuckPos) < 1.2) {
        this.reverseT = 1.6; this.path = null;
        this.goal = this.game.mode.vehicleGoal(this.team) || (interest.length ? interest[Math.floor(Math.random() * interest.length)] : null);
      }
      this.stuckT = 0; this.stuckPos.copy(this.pos);
    }
  }

  view(cam, dt) {
    this.zoom += ((this.zoomWant ? 1 : 0) - this.zoom) * Math.min(1, dt * 12);
    const dir = aimDir(this.aimYaw, this.aimPitch, _f);
    if (this.zoom > 0.5) {
      this.m.turret.getWorldPosition(_v);
      cam.position.set(_v.x, _v.y + 0.95, _v.z).addScaledVector(dir, 2.2);
    } else {
      const pivot = _v.set(this.pos.x, this.pos.y + 3.4, this.pos.z);
      const want = _w.copy(pivot).addScaledVector(dir, -10);
      want.y += 1.2;
      const back = _u.subVectors(want, pivot), len = back.length();
      back.divideScalar(len);
      const h = raycastWorld(pivot, back, len);
      if (h) want.copy(pivot).addScaledVector(back, Math.max(1, h.t - 0.4));
      want.y = Math.max(0.6, want.y);
      cam.position.copy(want);
    }
    cam.rotation.set(this.aimPitch, this.aimYaw, 0);
    // the turret turns toward whatever is under the crosshair
    const h = raycastWorld(cam.position, dir, 500);
    const T = _c.copy(cam.position).addScaledVector(dir, h ? h.t : 500);
    this.m.gun.getWorldPosition(_v);
    this.tYaw = Math.atan2(-(T.x - _v.x), -(T.z - _v.z));
    this.tPitch = Math.atan2(T.y - _v.y, Math.hypot(T.x - _v.x, T.z - _v.z));
    return this.zoom > 0.5 ? 20 : this.game.settings.fov;
  }

  grade() { return this.zoom > 0.5 ? { sat: 0.55, contrast: 1.15, tint: [0.95, 1.05, 0.95], vignette: 0.7, grain: 0.05 } : null; }

  drawHud(ctx, W, H, P) {
    const o = _h1, d = _h2;
    this.gunRay(o, d);
    const h = raycastWorld(o, d, 500);
    const s = P(_c.copy(o).addScaledVector(d, h ? h.t : 500));
    const cx = W / 2, cy = H / 2;
    if (this.zoom > 0.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cx - 40, cy); ctx.moveTo(cx + 40, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, cy + 40); ctx.lineTo(cx, H); ctx.stroke();
      for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(cx - 8, cy + i * 30); ctx.lineTo(cx + 8, cy + i * 30); ctx.stroke(); }
      const r = Math.min(W, H) * 0.46;
      const grd = ctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r * 1.25);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.95)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    } else cross(ctx, cx, cy, 9, 3, 'rgba(255,255,255,0.7)', 1.5);
    if (s) {
      ring(ctx, s[0], s[1], 13, this.reload > 0 ? 'rgba(255,190,90,0.9)' : 'rgba(150,255,150,0.95)');
      if (this.reload > 0) {
        ctx.strokeStyle = 'rgba(150,255,150,0.95)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s[0], s[1], 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - this.reload / (this.A.main.reload || this.A.main.rate))); ctx.stroke();
      }
    }
  }

  stats() {
    const M = this.A.main;
    return `<div>${this.A.name}</div><div>${M.type === 'cannon' ? 'CANNON' : M.name} <b>${M.type === 'cannon' ? (this.reload > 0 ? `${this.reload.toFixed(1)}s` : 'READY') : 'LMB'}</b>${this.A.atgm ? ` · ${this.A.atgm.name} <b>${this.atgm}</b>` : ''}</div><div>SPEED <b>${Math.round(Math.abs(this.speed) * 3.6)}</b> km/h</div>`;
  }
}

// ---------- jet ----------
// Fixed-wing: F-16 / Su-27 fighters and A-10 / Su-25 attack jets. The flight model is
// energy-based: thrust against drag (so each type tops out near its real speed), gravity
// trading speed for height, a stall speed below which the nose drops, and pitch authority
// limited by the airframe's G limit, so fast jets turn wide and slow ones mush. They arrive
// from about 6 km out. Weapons: gun, IR air-to-air missiles, and air-to-ground missiles
// guided onto a point or vehicle chosen through the targeting pod (no bombs).
const JET_RANGE = 7500;
export class FighterJet extends Vehicle {
  constructor(game, owner, id, kind = 'jet') {
    super(game, kind, owner, id);
    this.type = airframeFor(kind, this.team);
    this.af = AIRFRAMES[this.type];
    this.name = this.af.name;
    this.maxHealth = this.health = this.af.hp;
    this.m = buildAircraft(this.type, this.team === game.player.team);
    game.scene.add(this.m.g);
    const team0 = this.team === 0, a = (Math.random() - 0.5) * 0.8;
    const dist = 6000;
    this.pos.set(SIZE / 2 + Math.sin(a) * dist * (team0 ? 1 : -1), 700, SIZE / 2 + Math.cos(a) * dist * (team0 ? -1 : 1));
    const yaw = Math.atan2(-(SIZE / 2 - this.pos.x), -(SIZE / 2 - this.pos.z));
    this.quat.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
    this.speed = this.af.vmax * 0.8; this.throttle = 0.75; this.ab = false;
    this.stickP = 0; this.stickR = 0; this.yawIn = 0; this.gunWant = false; this.gunT = 0; this.shotN = 0;
    this.rounds = this.af.gun.rounds; this.agm = this.af.agm.n; this.aam = this.af.aam.n;
    this.flares = 30; this.flareCd = 0; this.fuel = 420;
    this.gLoad = 1; this.gStrain = 0; this.pod = false; this.podPoint = null; this.podTarget = null; this.podZoom = 1;
    this.aamLock = null; this.aamLockT = 0; this.stalled = false;
    this.camOff = new THREE.Vector3(); this.camInit = false;
    this.state = 'ingress'; this.stateT = 0; this.attackCd = 0; this.target = null; this.life = 150; this.fired = 0;
    this.sound = game.audio.engine('jet');
    this.help = HELP.jet;
    this.t = 3;
    this.pose();
  }

  control(dt, inp) {
    const s = this.game.settings.sens * 0.0022;
    if (inp.adsPressed) this.togglePod();
    if (this.pod) {
      // mouse slews the pod; the jet flies straight and level on autopilot
      this.slewPod(inp.dx * s, inp.dy * s);
      this.stickP *= 0.9; this.stickR = clamp(-this.roll() * 1.5, -1, 1);
      if (inp.firePressed) this.designate();
    } else {
      // the mouse moves the stick, which springs back to centre like a real one
      this.stickP = clamp(this.stickP - inp.dy * s * 1.4, -1, 1);
      this.stickR = clamp(this.stickR - inp.dx * s * 1.6, -1, 1);
      this.gunWant = inp.fire;
    }
    this.yawIn = inp.left - inp.right;
    this.throttle = clamp(this.throttle + (inp.forward - inp.back) * 0.5 * dt, 0, 1);
    this.ab = inp.sprint && this.af.ab > 0;
    if (inp.reload) this.fireAgm();
    if (inp.nadePressed) this.fireAam();
    if (inp.jumpPressed) this.dropFlares();
  }

  roll() { return Math.atan2(_u.set(1, 0, 0).applyQuaternion(this.quat).y, _w.set(0, 1, 0).applyQuaternion(this.quat).y); }

  update(dt) {
    const g = this.game, af = this.af;
    this.t += dt;
    this.flareT = Math.max(0, this.flareT - dt); this.flareCd -= dt; this.missileWarn = Math.max(0, this.missileWarn - dt);
    const dc = Math.hypot(this.pos.x - SIZE / 2, this.pos.z - SIZE / 2);
    if (this.driver) {
      this.fuel -= dt * (0.6 + this.throttle * 0.4 + (this.ab ? 1.5 : 0));
      this.outside = dc > JET_RANGE;
      if (this.fuel <= 0) { g.hud.toast('Bingo fuel: returning to base'); g.leftVehicle(this.driver, this); }
    } else if (this.ai) this.think(dt);
    else this.leave(dt);
    if (!this.alive) return;
    if (this.driver && this.outside) this.steerTo(_c.set(SIZE / 2, Math.max(400, this.pos.y), SIZE / 2), dt, 0.8);

    // pitch rate: what the stick asks for, capped by the G limit (g * 9.81 / v) and by
    // aerodynamic authority, which fades toward the stall
    const v = this.speed, auth = clamp((v - af.stall * 0.7) / af.stall, 0.15, 1);
    const qMax = Math.min(af.pitch * auth, af.g * 9.81 / Math.max(v, 30));
    const q = this.stickP * qMax, p = this.stickR * af.roll * clamp(v / af.stall, 0.3, 1);
    rotLocal(this.quat, AX, q * dt);
    rotLocal(this.quat, AZ, p * dt);
    rotLocal(this.quat, AY, this.yawIn * 0.25 * dt);
    if (!this.driver || this.pod) { this.stickP *= Math.exp(-dt * 2); this.stickR *= Math.exp(-dt * 2); }
    else { this.stickP *= Math.exp(-dt * 1.2); this.stickR *= Math.exp(-dt * 2.5); }
    const up = _w.set(0, 1, 0).applyQuaternion(this.quat), f = fwdOf(this.quat, _f);
    // banked, the lift vector pulls the nose round: turn rate g * tan(bank) / v
    rotWorld(this.quat, AY, clamp(_u.set(1, 0, 0).applyQuaternion(this.quat).y, -1, 1) * (9.81 / Math.max(v, 40)) * 1.5 * dt);
    this.gLoad = q * v / 9.81 + up.y;
    this.gStrain = clamp(this.gStrain + (Math.abs(this.gLoad) > 7.5 ? (Math.abs(this.gLoad) - 7.5) * 0.4 : -0.5) * dt, 0, 1);
    // energy: thrust - drag (quadratic, plus induced drag while pulling) - gravity along the path
    const thrust = this.throttle * af.mil + (this.ab ? af.ab : 0);
    const k = af.mil / (af.vmax * af.vmax), induced = Math.abs(q) * v * 0.012;
    // drag is set so full military power tops out at vmax, afterburner at vab
    const kd = this.ab ? (af.mil + af.ab) / (af.vab * af.vab) : k;
    this.speed += (thrust - kd * v * v - induced - 9.81 * f.y) * dt;
    this.speed = clamp(this.speed, 20, af.vab * 1.08);
    // stall: below stall speed the nose falls and the jet sinks
    this.stalled = this.speed < af.stall;
    if (this.stalled) { rotWorld(this.quat, _x.set(1, 0, 0).applyQuaternion(this.quat), -0.5 * dt * Math.max(0, f.y + 0.3)); }
    this.quat.normalize();
    fwdOf(this.quat, _f);
    this.vel.copy(_f).multiplyScalar(this.speed);
    if (this.stalled) this.vel.y -= (af.stall - this.speed) * 0.8;
    const step = this.vel.length() * dt, dir = _v.copy(this.vel).normalize();
    const hit = raycastWorld(this.pos, dir, step + 1);
    this.pos.addScaledVector(dir, step);
    const floor = floorAt(this.pos.x, this.pos.z, 1.5, this.pos.y + 1);
    if (hit || this.pos.y < floor + 1.5 || this.pos.y < terrainY(this.pos.x, this.pos.z) + 1.5) { this.crash(); return; }
    if (!this.controlled && this.missileWarn > 0 && this.flareT <= 0 && Math.random() < dt * 3) this.dropFlares();
    this.gunT -= dt;
    if (this.gunWant && this.gunT <= 0 && this.rounds > 0) this.fireGun();
    this.trackAam(dt);
    if (this.podTarget && !this.podTarget.alive) this.podTarget = null;
    if (this.podTarget) this.podPoint = this.podTarget.aimPoint(this.podPoint || new THREE.Vector3(), false).clone();
    this.pose();
    this.sound?.set(this.controlled ? null : this.pos, 0.35 + this.throttle * 0.5 + (this.ab ? 0.3 : 0));
    if (!this.driver && this.t > 10 && dc > JET_RANGE + 1500) this.cleanup();
  }

  pose() {
    const m = this.m;
    m.g.position.copy(this.pos); m.g.quaternion.copy(this.quat);
    const fl = 0.25 + this.throttle * 0.4 + (this.ab ? 1.2 : 0);
    m.flame.scale.set(this.ab ? 1.15 : 0.85, this.ab ? 1.15 : 0.85, fl * (0.9 + Math.random() * 0.2));
    m.aams.forEach((s, i) => { s.visible = i < this.aam; });
    m.agms.forEach((s, i) => { s.visible = i < this.agm; });
  }

  crash() {
    const g = this.game, p = this.pos.clone();
    this.destroy(null, 'Jet', false);
    if (g.authority) g.explode(p, this.owner, 10, 220, 'Jet', { streak: true });
    else { g.net?.send({ t: 'blast', w: 'Jet', p: [r2(p.x), r2(p.y), r2(p.z)], e: -1 }); g.predictBoom(p); }
  }

  fireGun() {
    const G = this.af.gun;
    this.gunT = G.rate; this.rounds--;
    const g = this.game, f = fwdOf(this.quat, new THREE.Vector3());
    const o = this.pos.clone().addScaledVector(f, 8).add(_u.set(0.4, -0.3, 0).applyQuaternion(this.quat));
    const d = f.clone();
    d.x += (Math.random() - 0.5) * 0.012; d.y += (Math.random() - 0.5) * 0.012; d.z += (Math.random() - 0.5) * 0.012;
    this.shotN++;
    g.vehicleGun(this, o, d.normalize(), G.name, G.dmg, 0xffb070, this.shotN % 3 === 0 ? 'jetgun' : null, this.shotN % 2 === 0);
    if (this.shotN % 2) g.effects.flash(o, 0.9);
  }

  // ---------- targeting pod and air-to-ground missiles ----------
  togglePod() {
    this.pod = !this.pod;
    if (this.pod && !this.podPoint) {
      const f = fwdOf(this.quat, _f);
      const d = _v.set(f.x, Math.min(-0.25, f.y - 0.2), f.z).normalize();
      const h = raycastWorld(this.pos, d, 9000);
      this.podPoint = this.pos.clone().addScaledVector(d, h ? h.t : Math.max(300, this.pos.y / Math.max(0.2, -d.y)));
      this.podPoint.y = terrainY(this.podPoint.x, this.podPoint.z);
    }
  }

  slewPod(dx, dy) {
    if (!this.podPoint) return;
    this.podTarget = null;
    const range = this.pos.distanceTo(this.podPoint), k = range * 0.9 / this.podZoom;
    const yaw = Math.atan2(this.podPoint.x - this.pos.x, this.podPoint.z - this.pos.z);
    // screen right / up in the pod view, on the ground
    this.podPoint.x += (Math.cos(yaw) * -dx + Math.sin(yaw) * dy) * k;
    this.podPoint.z += (-Math.sin(yaw) * -dx + Math.cos(yaw) * dy) * k;
    this.podPoint.y = terrainY(this.podPoint.x, this.podPoint.z);
  }

  // lock the vehicle or soldier under the crosshair, or the ground point
  designate() {
    if (!this.podPoint) return;
    let best = null, bd = 18;
    for (const e of this.game.targetsFor(this.team)) {
      if (e.air) continue;
      const d = e.pos.distanceTo(this.podPoint);
      if (d < bd) { bd = d; best = e; }
    }
    this.podTarget = best;
    this.game.hud.toast(best ? `Locked: ${best.name || 'target'}` : 'Point track');
  }

  fireAgm() {
    if (this.agm <= 0 || !this.podPoint) { if (this.controlled) this.game.hud.toast(this.agm <= 0 ? 'No air-to-ground missiles left' : 'No target: RMB for the pod, LMB to designate'); return; }
    const f = fwdOf(this.quat, _f), to = _v.subVectors(this.podPoint, this.pos);
    const range = to.length();
    if (range > 9000 || f.dot(to.normalize()) < 0.5) { if (this.controlled) this.game.hud.toast('Target out of the missile\'s field of view'); return; }
    this.agm--;
    const side = this.agm % 2 ? 1 : -1;
    const o = this.pos.clone().add(_u.set(2.5 * side, -1, 0).applyQuaternion(this.quat));
    const tgt = this.podTarget || { alive: true, pos: this.podPoint.clone(), vel: new THREE.Vector3(), point: true };
    this.game.fireProjectile(this.team ? 'kh' : 'agm', this.driver || this.owner, o, this.vel.clone().addScaledVector(f, 15), tgt, this);
    this.game.audio.rpg?.(this.controlled ? null : this.pos);
  }

  // ---------- IR missiles: the seeker looks ahead for a hot target and growls when locked ----------
  trackAam(dt) {
    if (this.aam <= 0) { this.aamLock = null; return; }
    const f = fwdOf(this.quat, _f);
    let best = null, bd = -1;
    for (const v of this.game.vehicles) {
      if (!v.alive || !v.air || v.team === this.team || v.spec?.drone) continue;
      const d = _v.subVectors(v.pos, this.pos), r = d.length();
      if (r > 4500) continue;
      const c = f.dot(d.divideScalar(r));
      if (c > Math.cos(18 * DEG) && c > bd) { bd = c; best = v; }
    }
    if (best && best === this.aamLock) this.aamLockT += dt; else { this.aamLock = best; this.aamLockT = 0; }
  }

  fireAam() {
    if (this.aam <= 0) return;
    const t = this.aamLock && this.aamLockT > 0.8 ? this.aamLock : null;
    if (!t) { if (this.controlled) this.game.hud.toast('No lock: keep the target in the seeker circle'); return; }
    this.aam--;
    const f = fwdOf(this.quat, _f), side = this.aam % 2 ? 1 : -1;
    const o = this.pos.clone().add(_u.set(4 * side, -0.5, 0).applyQuaternion(this.quat));
    this.game.fireProjectile('aam', this.driver || this.owner, o, this.vel.clone().addScaledVector(f, 20), t, this);
  }

  dropFlares() {
    if (this.flares <= 0 || this.flareCd > 0) return;
    this.flares -= 2; this.flareCd = 0.5; this.flareT = 2.5;
    const fx = this.game.effects, p = this.pos;
    for (let i = 0; i < 8; i++) {
      fx.glow.emit(p.x, p.y - 1, p.z, this.vel.x * 0.2 + (Math.random() - 0.5) * 30, -5 - Math.random() * 10, this.vel.z * 0.2 + (Math.random() - 0.5) * 30,
        2 + Math.random(), 1.1, 0.5, 4, 2.8, 1.4, 1, 4, 0.6, 0);
    }
    this.game.audio.flares(this.controlled ? null : p);
  }

  steerTo(p, dt, rate = 1.1) {
    const d = _v.subVectors(p, this.pos).normalize();
    const f = fwdOf(this.quat, _w);
    const turn = clamp(f.z * d.x - f.x * d.z, -1, 1);
    _m.lookAt(this.pos, _x.copy(this.pos).add(d), AY);
    _q2.setFromRotationMatrix(_m);
    _q2.multiply(_q.setFromAxisAngle(AZ, clamp(turn * 2.2, -1.2, 1.2)));
    // turn no faster than the G limit allows at this speed
    const maxRate = this.af.g * 9.81 / Math.max(this.speed, 40);
    this.quat.slerp(_q2, Math.min(1, Math.min(rate, maxRate) * dt));
  }

  // AI: ingress from ~6 km, fire missiles from stand-off range, gun runs for the attack jets,
  // shoot enemy aircraft that cross the nose, egress and come back until out of weapons
  think(dt) {
    const g = this.game, c = SIZE / 2, af = this.af;
    this.throttle = 0.8; this.gunWant = false; this.ab = false;
    if (this.t > this.life || (this.agm <= 0 && this.rounds < 50)) { this.leave(dt); return; }
    this.stateT -= dt;
    if (this.aamLock && this.aamLockT > 1 && Math.random() < dt) this.fireAam();
    const alt = Math.max(450, terrainY(this.pos.x, this.pos.z) + 400);
    if (this.state === 'ingress') {
      if (!this.target?.alive) {
        const list = g.targetsFor(this.team).filter(e => !e.air);
        const vehicles = list.filter(e => e.isVehicle);
        const pool = vehicles.length && Math.random() < 0.75 ? vehicles : list;
        this.target = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      }
      const t = this.target;
      const aim = t ? t.aimPoint(_c, false) : _c.set(c, 0, c);
      this.steerTo(_x.set(aim.x, alt, aim.z), dt, 0.9);
      const d = this.pos.distanceTo(aim);
      const f = fwdOf(this.quat, _f), dir = _z.subVectors(aim, this.pos).normalize();
      if (t && this.agm > 0 && d < 4500 && d > 1200 && f.dot(dir) > 0.85 && (this.attackCd -= dt) <= 0) {
        this.podPoint = aim.clone(); this.podTarget = t;
        this.fireAgm(); this.attackCd = 2.5; this.fired++;
        if (this.fired % 2 === 0 || this.agm <= 0) { this.state = af.role === 'attack' && this.rounds > 100 ? 'gunrun' : 'egress'; this.stateT = 12; }
      }
      if (d < 1100) { this.state = af.role === 'attack' && this.rounds > 100 ? 'gunrun' : 'egress'; this.stateT = 12; }
    } else if (this.state === 'gunrun') {
      const t = this.target;
      if (!t?.alive || this.stateT <= 0) { this.state = 'egress'; this.stateT = 10; return; }
      const p = t.aimPoint(_c, false), d = this.pos.distanceTo(p);
      this.steerTo(_x.set(p.x, p.y + 1, p.z), dt, 1.1);
      const f = fwdOf(this.quat, _f), dir = _z.subVectors(p, this.pos).normalize();
      if (f.dot(dir) > 0.998 && d < 1300) this.gunWant = true;
      if (d < 350 || this.pos.y - terrainY(this.pos.x, this.pos.z) < 90) { this.state = 'egress'; this.stateT = 12; }
    } else {
      const f = fwdOf(this.quat, _f);
      this.steerTo(_c.set(this.pos.x + f.x * 2000, alt + 300, this.pos.z + f.z * 2000), dt, 0.8);
      this.throttle = 1; this.ab = af.ab > 0 && this.stateT > 6;
      if (this.stateT <= 0 && Math.hypot(this.pos.x - c, this.pos.z - c) > 3500) { this.state = 'ingress'; this.target = null; }
      else if (this.stateT <= 0) this.steerTo(_c.set(this.pos.x + f.x * 2000 + f.z * 2500, alt, this.pos.z + f.z * 2000 - f.x * 2500), dt, 0.5);
    }
  }

  leave(dt) {
    const f = fwdOf(this.quat, _f);
    this.throttle = 1; this.ab = this.af.ab > 0;
    this.steerTo(_c.set(this.pos.x + f.x * 3000, 1200, this.pos.z + f.z * 3000), dt, 0.6);
  }

  view(cam, dt) {
    if (this.pod && this.podPoint) {
      // targeting pod: looking down at the designation point, zoomed
      cam.position.copy(this.pos).add(_u.set(0, -1.2, 0).applyQuaternion(this.quat));
      _m.lookAt(cam.position, this.podPoint, AY);
      cam.quaternion.setFromRotationMatrix(_m);
      const r = this.pos.distanceTo(this.podPoint);
      return clamp(2 * Math.atan(60 / r) / DEG, 1.5, 30);
    }
    const f = fwdOf(this.quat, _f), up = _u.set(0, 1, 0).applyQuaternion(this.quat);
    const want = _v.copy(f).multiplyScalar(-22).addScaledVector(up, 5.5);
    if (!this.camInit) { this.camOff.copy(want); this.camInit = true; }
    this.camOff.lerp(want, Math.min(1, dt * 6));
    cam.position.copy(this.pos).add(this.camOff);
    const upB = _w.copy(up).lerp(AY, 0.25).normalize();
    _m.lookAt(cam.position, _c.copy(this.pos).addScaledVector(f, 60), upB);
    cam.quaternion.setFromRotationMatrix(_m);
    return clamp(this.game.settings.fov - 5 + (this.speed - 150) * 0.05, 60, 100);
  }

  grade() {
    if (this.pod) return { sat: 0, contrast: 1.3, tint: [0.75, 0.9, 0.75], grain: 0.06, vignette: 0.5, fringe: 0 };
    // G-induced greyout and tunnel vision
    return this.gStrain > 0.05 ? { sat: 1 - this.gStrain * 0.9, vignette: 0.35 + this.gStrain * 1.4, contrast: 1, grain: 0.03, fringe: 0.0015 } : null;
  }

  drawHud(ctx, W, H, P, game) {
    const green = 'rgba(120,255,140,0.95)', cx = W / 2, cy = H / 2;
    const f = fwdOf(this.quat, _f), af = this.af;
    if (this.pod && this.podPoint) {
      cross(ctx, cx, cy, 40, 10, green, 1.5);
      ctx.strokeStyle = green; ctx.strokeRect(cx - 60, cy - 60, 120, 120);
      const r = this.pos.distanceTo(this.podPoint);
      text(ctx, `TGP  ${this.podTarget ? 'AREA TRACK: ' + (this.podTarget.name || 'TGT') : 'POINT'}`, 30, 40, 'left', green, 20);
      text(ctx, `SLANT ${(r / 1000).toFixed(1)} km   ${af.agm.name} x${this.agm}`, 30, 66, 'left', green, 18);
      text(ctx, 'LMB designate · R launch · RMB exit pod', cx, H - 30, 'center', green, 18);
      noise(ctx, W, H, 0.03);
      return;
    }
    drawMarkers(ctx, game, P, { range: 2500 });
    // pitch ladder around the flight-path marker
    const fpm = P(_c.copy(this.pos).addScaledVector(_v.copy(this.vel).normalize(), 500));
    const pitch = Math.asin(clamp(f.y, -1, 1)) / DEG, rollA = this.roll();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-rollA);
    ctx.strokeStyle = green; ctx.fillStyle = green; ctx.lineWidth = 1.6; ctx.font = '600 13px Rajdhani, sans-serif';
    const pxPerDeg = H / (this.game.camera?.fov || 70);
    for (let d = -90; d <= 90; d += 10) {
      const y = (pitch - d) * pxPerDeg;
      if (Math.abs(y) > H * 0.38) continue;
      ctx.setLineDash(d < 0 ? [8, 6] : []);
      ctx.beginPath(); ctx.moveTo(-140, y); ctx.lineTo(-45, y); ctx.moveTo(45, y); ctx.lineTo(140, y); ctx.stroke();
      if (d) { ctx.fillText(String(d), -165, y + 4); ctx.fillText(String(d), 150, y + 4); }
    }
    ctx.setLineDash([]); ctx.restore();
    if (fpm) { ring(ctx, fpm[0], fpm[1], 8, green); ctx.beginPath(); ctx.moveTo(fpm[0] - 20, fpm[1]); ctx.lineTo(fpm[0] - 8, fpm[1]); ctx.moveTo(fpm[0] + 8, fpm[1]); ctx.lineTo(fpm[0] + 20, fpm[1]); ctx.moveTo(fpm[0], fpm[1] - 8); ctx.lineTo(fpm[0], fpm[1] - 16); ctx.stroke(); }
    // gun pipper at 800 m
    const gun = P(_c.copy(this.pos).addScaledVector(f, 800));
    if (gun) { ring(ctx, gun[0], gun[1], 14, green); ctx.fillStyle = green; ctx.fillRect(gun[0] - 1.5, gun[1] - 1.5, 3, 3); }
    // heading tape
    const hdg = ((Math.atan2(f.x, -f.z) / DEG) + 360) % 360;
    text(ctx, String(Math.round(hdg)).padStart(3, '0'), cx, 40, 'center', green, 22);
    // speed (knots) and altitude (feet) boxes, G, Mach
    const kts = this.speed * 1.944, ft = this.pos.y * 3.281;
    ctx.strokeStyle = green; ctx.strokeRect(cx - 250, cy - 16, 90, 30); ctx.strokeRect(cx + 160, cy - 16, 100, 30);
    text(ctx, String(Math.round(kts)), cx - 170, cy + 7, 'right', green, 22);
    text(ctx, String(Math.round(ft / 10) * 10), cx + 250, cy + 7, 'right', green, 22);
    text(ctx, `G ${this.gLoad.toFixed(1)}   M ${(this.speed / 340).toFixed(2)}`, cx - 250, cy + 40, 'left', green, 17);
    text(ctx, `THR ${Math.round(this.throttle * 100)}%${this.ab ? ' AB' : ''}`, cx - 250, cy + 62, 'left', green, 17);
    // weapons
    text(ctx, `GUN ${this.rounds}   ${af.agm.name} x${this.agm}   ${af.aam.name} x${this.aam}   FLR ${this.flares}`, cx, H - 36, 'center', green, 18);
    // IR seeker: circle on the target, steady when locked
    if (this.aamLock) {
      const s = P(_c.copy(this.aamLock.pos));
      if (s) { const locked = this.aamLockT > 0.8; ring(ctx, s[0], s[1], locked ? 18 : 24 + Math.sin(game.time * 20) * 3, locked ? '#ffd24a' : green, 2); if (locked) text(ctx, 'LOCK · G FIRE', s[0], s[1] - 30, 'center', '#ffd24a', 16); }
    }
    if (this.podPoint) { const s = P(this.podPoint); if (s) { ctx.strokeStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(s[0], s[1] - 9); ctx.lineTo(s[0] + 9, s[1]); ctx.lineTo(s[0], s[1] + 9); ctx.lineTo(s[0] - 9, s[1]); ctx.closePath(); ctx.stroke(); } }
    let warn = '';
    if (this.missileWarn > 0) warn = 'MISSILE LAUNCH · SPACE FLARES';
    else if (this.stalled) warn = 'STALL';
    else if (this.outside) warn = 'RETURN TO THE AREA';
    else if (f.y < -0.15 && this.pos.y - terrainY(this.pos.x, this.pos.z) < 250) warn = 'PULL UP';
    if (warn && Math.floor(game.time * 4) % 2 === 0) text(ctx, warn, cx, H * 0.24, 'center', '#ff6a50', 26);
  }

  stats() {
    return `<div>${this.af.name}</div><div>FUEL <b>${Math.max(0, Math.ceil(this.fuel))}s</b> · GUN <b>${this.rounds}</b></div>`;
  }
}

// ---------- FPV drone ----------
export class Drone extends Vehicle {
  constructor(game, owner, id, pos, yaw, kind = 'drone') {
    super(game, kind, owner, id);
    this.tune = FPV[kind] || FPV.drone;
    this.addModel();
    this.pos.copy(pos);
    this.quat.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
    this.vel.set(-Math.sin(yaw) * 2.5, 3, -Math.cos(yaw) * 2.5);
    this.thrust = 0.4; this.boost = false; this.hover = false; this.battery = this.tune.battery; this.armT = 0.8; this.signal = 1; this.thr = 0.4;
    this.rollIn = 0; this.pitchIn = 0; this.yawIn = 0; this.aiThrust = 0.4; this.retarget = 0; this.target = null;
    this.t = 3;
    this.sound = game.audio.engine('drone');
  }

  control(dt, inp) {
    const s = this.game.settings.sens * 0.0022;
    this.pitchIn += -inp.dy * s;
    this.yawIn += -inp.dx * s;
    this.rollIn = inp.left - inp.right;
    this.thrust = clamp(this.thrust + (inp.forward - inp.back) * 0.8 * dt, 0, 1);
    this.boost = inp.jump; this.hover = inp.sprint;
    if (inp.firePressed) this.detonate(null);
  }

  update(dt) {
    const g = this.game;
    this.t += dt; this.battery -= dt; this.armT -= dt;
    if (this.ai) { this.think(dt); if (!this.alive) return; }
    else {
      rotLocal(this.quat, AX, this.pitchIn); rotLocal(this.quat, AY, this.yawIn);
      this.pitchIn = this.yawIn = 0;
      const right = _u.copy(AX).applyQuaternion(this.quat);
      if (this.rollIn) rotLocal(this.quat, AZ, this.rollIn * 3.4 * dt);
      else rotLocal(this.quat, AZ, -clamp(right.y, -1, 1) * 3 * dt);
      this.quat.normalize();
    }
    // radio link back to the operator weakens with range and height
    const op = this.owner;
    const dop = op?.pos ? Math.hypot(this.pos.x - op.pos.x, this.pos.z - op.pos.z) + Math.max(0, this.pos.y - 25) : 0;
    this.signal = this.ai ? 1 : clamp(1 - (dop - 200) / 100, 0, 1);
    const dead = this.battery <= 0 || this.signal <= 0 || (!this.ai && !this.driver);
    const up = _u.set(0, 1, 0).applyQuaternion(this.quat);
    let thr = this.boost ? 1 : this.thrust;
    if (this.hover && !this.ai) thr = clamp((9.81 - this.vel.y * 1.5) / (this.tune.thrust * Math.max(0.35, up.y)), 0, 1);
    if (this.ai) thr = this.aiThrust;
    if (dead) thr = 0;
    this.thr = thr;
    const sp = this.vel.length();
    this.vel.addScaledVector(up, thr * this.tune.thrust * dt);
    this.vel.y -= 9.81 * dt;
    this.vel.multiplyScalar(Math.max(0, 1 - (this.tune.drag + 0.018 * sp) * dt));
    const step = this.vel.length() * dt;
    if (step > 1e-4) {
      const d = _v.copy(this.vel).normalize();
      const h = sweepHit(g, this.pos, d, step + 0.2, this.team, this);
      if (h && (this.armT <= 0 || h.entity)) {
        this.pos.addScaledVector(d, Math.max(0, h.t - 0.1));
        this.detonate(h.entity);
        return;
      }
      if (h) this.vel.multiplyScalar(-0.3);
      else this.pos.addScaledVector(d, step);
    }
    const fl = floorAt(this.pos.x, this.pos.z, 0.1, this.pos.y + 0.3);
    if (this.pos.y < fl + 0.15) {
      this.pos.y = fl + 0.15;
      if (this.armT <= 0) { this.detonate(null); return; }
      this.vel.y = Math.abs(this.vel.y) * 0.3;
    }
    if (this.pos.y < 0.15) {
      this.pos.y = 0.15;
      if (this.armT <= 0) { this.detonate(null); return; }
      this.vel.y = Math.abs(this.vel.y) * 0.3;
    }
    pose(this.kind, this.m, this.pos, this.quat, 0, 0, dt);
    this.sound?.set(this.controlled ? null : this.pos, 0.3 + thr * 0.9);
  }

  detonate(entity) {
    if (!this.alive) return;
    const g = this.game, p = this.pos.clone(), who = this.owner, T = this.tune;
    this.destroy(null, T.weapon, false);
    if (g.authority) {
      if (entity) g.damage(entity, entity.isVehicle ? T.direct : 250, who, T.weapon, false, p, { streak: true });
      g.explode(p, who, T.radius, T.dmg, T.weapon, { streak: true });
    } else {
      g.net?.send({ t: 'blast', w: T.weapon, p: [r2(p.x), r2(p.y), r2(p.z)], e: entity ? entity.id : -1 });
      g.predictBoom(p);
    }
  }

  // shot down: the warhead cooks off with a smaller blast
  destroy(attacker, weapon, fx = true) {
    if (!this.alive) return;
    const p = this.pos.clone(), g = this.game;
    super.destroy(attacker, weapon, false);
    if (fx && g.authority) g.explode(p, this.owner, this.tune.radius * 0.6, this.tune.dmg * 0.45, this.tune.weapon, { streak: true });
  }

  think(dt) {
    const g = this.game;
    if ((this.retarget -= dt) <= 0 || !this.target?.alive) {
      this.retarget = 1.2; this.target = null;
      let bd = this.searchR || 120;
      for (const e of g.targetsFor(this.team)) {
        if (e.air) continue;
        if (this.needSight && !e.marked && !lineOfSight(this.pos, _c.copy(e.pos).setY(e.pos.y + 1))) continue;
        const d = e.pos.distanceTo(this.pos);
        if (d < bd) { bd = d; this.target = e; }
      }
    }
    const t = this.target, goal = _w;
    let close = false;
    if (t) {
      const p = t.aimPoint(_c, false), hd = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      close = hd < 14;
      if (!close) goal.set(p.x, p.y + 7 + hd * 0.08, p.z); else goal.copy(p);
      if (this.pos.distanceTo(p) < 1.6) { this.detonate(t.isVehicle ? t : null); return; }
    } else if (this.search) goal.set(this.search.x, floorAt(this.search.x, this.search.z, 1, 200) + 30, this.search.z);
    else goal.set(SIZE / 2, 14, SIZE / 2);
    const dv = _v.subVectors(goal, this.pos).normalize().multiplyScalar(close ? 14 : 13);
    if (this.vel.lengthSq() > 1 && raycastWorld(this.pos, _f.copy(this.vel).normalize(), 7)) dv.y += 9;
    const acc = _f.subVectors(dv, this.vel).multiplyScalar(2.2);
    acc.y += 9.81;
    acc.addScaledVector(this.vel, 0.22 + 0.018 * this.vel.length());
    const len = acc.length() || 1;
    const upAxis = _x.copy(acc).divideScalar(len);
    if (upAxis.y < 0.5) { const h = Math.hypot(upAxis.x, upAxis.z) || 1, k = Math.sqrt(0.75) / h; upAxis.set(upAxis.x * k, 0.5, upAxis.z * k); }
    this.aiThrust = clamp(len / 30, 0, 1);
    const fwd = _z.set(goal.x - this.pos.x, 0, goal.z - this.pos.z);
    if (fwd.lengthSq() < 0.01) fwd.set(0, 0, -1);
    const back = fwd.normalize().negate();
    back.addScaledVector(upAxis, -back.dot(upAxis)).normalize();
    const xAxis = _u.crossVectors(upAxis, back).normalize();
    _m.makeBasis(xAxis, upAxis, back);
    _q2.setFromRotationMatrix(_m);
    this.quat.slerp(_q2, Math.min(1, dt * 6));
  }

  view(cam) {
    cam.position.copy(this.pos);
    cam.quaternion.copy(this.quat);
    cam.quaternion.multiply(_q2.setFromAxisAngle(AX, 22 * DEG));
    return 108;
  }

  grade() { return { sat: 0.8, contrast: 1.12, tint: [1, 1.02, 1.05], grain: 0.08 + (1 - this.signal) * 0.4, vignette: 0.6, fringe: 0.008 }; }

  drawHud(ctx, W, H, P, game) {
    const cx = W / 2, cy = H / 2;
    // flight-path marker: where the drone is actually going
    if (this.vel.lengthSq() > 4) {
      const s = P(_c.copy(this.pos).addScaledVector(_v.copy(this.vel).normalize(), 20));
      if (s) { ring(ctx, s[0], s[1], 7, 'rgba(255,255,255,0.9)'); cross(ctx, s[0], s[1], 16, 8, 'rgba(255,255,255,0.9)'); }
    }
    cross(ctx, cx, cy, 12, 4, 'rgba(255,255,255,0.6)', 1.5);
    // artificial horizon
    const f = fwdOf(this.quat, _f); f.y = 0;
    if (f.lengthSq() > 1e-4) {
      f.normalize();
      const r = _u.set(-f.z, 0, f.x);
      const a = P(_c.copy(this.pos).addScaledVector(f, 50).addScaledVector(r, -30)), b = P(_w.copy(this.pos).addScaledVector(f, 50).addScaledVector(r, 30));
      if (a && b) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
    const alt = this.pos.y - (this.pos.x > 0 && this.pos.z > 0 && this.pos.x < SIZE && this.pos.z < SIZE ? groundAt(this.pos.x, this.pos.z, 0.2, this.pos.y) : 0);
    const bat = Math.max(0, this.battery / this.tune.battery);
    text(ctx, `${(14.8 + bat * 2).toFixed(1)}V  ${Math.round(bat * 100)}%`, 30, H - 60, 'left', bat < 0.25 ? '#ff6a50' : '#fff', 20);
    text(ctx, `THR ${Math.round(this.thr * 100)}%${this.hover ? ' HOLD' : ''}`, 30, H - 34, 'left', '#fff', 20);
    text(ctx, `ALT ${alt.toFixed(1)}m`, 30, 60, 'left', '#fff', 20);
    text(ctx, `${Math.round(this.vel.length() * 3.6)} km/h`, 30, 86, 'left', '#fff', 20);
    text(ctx, this.armT > 0 ? 'SAFE' : 'ARMED', W - 30, 60, 'right', this.armT > 0 ? '#ffd24a' : '#ff5a48', 22);
    const bars = Math.ceil(this.signal * 4);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < bars ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)';
      ctx.fillRect(W - 30 - (4 - i) * 9, 80 - i * 5, 6, 8 + i * 5);
    }
    noise(ctx, W, H, (1 - this.signal) + (Math.random() < 0.02 ? 0.15 : 0.02));
    if (this.signal <= 0) text(ctx, 'LINK LOST', cx, cy - 40, 'center', '#fff', 34);
    else if (this.signal < 0.4) text(ctx, 'WEAK SIGNAL', cx, cy - 40, 'center', '#ffd24a', 24);
    if (this.battery < 10 && Math.floor(game.time * 3) % 2 === 0) text(ctx, 'LOW BATTERY', cx, cy + 60, 'center', '#ff6a50', 22);
  }

  stats() { return `<div>BATTERY <b>${Math.max(0, Math.ceil(this.battery))}s</b></div><div>SIGNAL <b>${Math.round(this.signal * 100)}%</b></div>`; }
}

// ---------- recon drone (DJI-style) ----------
// Slow and steady: it holds position on its own, flies level in the direction you push, and
// carries a gimbal camera with zoom and a thermal view. It can't attack; LMB marks what the
// camera centre is on, which shows it to your team (and to your FPV drones).
export class ReconDrone extends Vehicle {
  constructor(game, owner, id, pos, yaw) {
    super(game, 'recon', owner, id);
    this.addModel();
    this.pos.copy(pos); this.home = pos.clone();
    this.yaw = yaw; this.gimbal = -0.35; this.zoom = 1; this.thermal = false;
    this.battery = 420; this.signal = 1; this.climb = 0; this.move = new THREE.Vector3();
    this.markCd = 0; this.lastMark = '';
    this.quat.setFromEuler(_e.set(0, yaw, 0, 'YXZ'));
    this.sound = game.audio.engine('drone');
    this.aiT = 0; this.aiA = Math.random() * 6;
  }

  control(dt, inp) {
    const s = this.game.settings.sens * 0.0022 / this.zoom;
    this.yaw -= (inp.dx || 0) * s;
    this.gimbal = clamp(this.gimbal - (inp.dy || 0) * s, -Math.PI / 2, 0.3);
    const f = (inp.forward || 0) - (inp.back || 0), r = (inp.right || 0) - (inp.left || 0);
    this.move.set(-Math.sin(this.yaw) * f + Math.cos(this.yaw) * r, 0, -Math.cos(this.yaw) * f - Math.sin(this.yaw) * r);
    this.climb = (inp.jump ? 1 : 0) - (inp.sprint ? 1 : 0);
    this.zoom = inp.ads ? Math.min(6, this.zoom + dt * 8) : Math.max(1, this.zoom - dt * 10);
    if (inp.reload) this.thermal = !this.thermal;
    if (inp.firePressed) this.mark();
  }

  // what the camera centre is on; a soldier there is marked for 20 s
  mark() {
    if (this.markCd > 0) return;
    this.markCd = 0.5;
    const g = this.game, o = this.pos.clone(), d = aimDir(this.yaw, this.gimbal, new THREE.Vector3());
    const h = sweepHit(g, o, d, 900, this.team, this);
    const e = h?.entity;
    if (e && e.team !== this.team) {
      e.marked = g.time + 20;
      this.lastMark = `${e.name || 'Target'} marked`;
      g.hud?.toast?.(this.lastMark);
    } else this.lastMark = 'Nothing there';
  }

  update(dt) {
    const g = this.game;
    this.t += dt; this.battery -= dt; this.markCd -= dt;
    if (this.ai) this.think(dt);
    const op = this.owner;
    const dop = op?.pos ? Math.hypot(this.pos.x - op.pos.x, this.pos.z - op.pos.z) : 0;
    this.signal = this.ai ? 1 : clamp(1 - (dop - 1500) / 300, 0, 1);
    const dead = this.battery <= 0 || this.signal <= 0 || (!this.ai && !this.driver);
    // GPS hold: velocity eases toward the stick; with the sticks centred it stops and hovers
    const want = _v.copy(this.move).multiplyScalar(11);
    want.y = this.climb * 4;
    if (dead) want.set(0, -3, 0);
    this.vel.lerp(want, 1 - Math.exp(-dt * 1.6));
    this.pos.addScaledVector(this.vel, dt);
    const fl = floorAt(this.pos.x, this.pos.z, 0.2, this.pos.y + 0.5);
    if (this.pos.y < fl + 0.3) { this.pos.y = fl + 0.3; this.vel.y = Math.max(0, this.vel.y); if (dead) { this.destroy(null, 'Recon Drone'); return; } }
    this.pos.y = Math.min(this.pos.y, 140);
    // body tilts into its motion like the real thing
    const lx = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw), lz = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    this.quat.setFromEuler(_e.set(clamp(lz * 0.025, -0.3, 0.3), this.yaw, clamp(-lx * 0.025, -0.3, 0.3), 'YXZ'));
    pose('recon', this.m, this.pos, this.quat, 0, 0, dt);
    this.m.g.visible = !this.controlled;
    this.sound?.set(this.controlled ? null : this.pos, 0.25 + this.vel.length() / 30);
  }

  // AI: circles the search area high up, marks anyone it sees there
  think(dt) {
    const g = this.game, c = this.search || { x: SIZE / 2, z: SIZE / 2 };
    this.aiA += dt * 0.12;
    const tx = c.x + Math.cos(this.aiA) * 55, tz = c.z + Math.sin(this.aiA) * 55;
    const d = Math.hypot(tx - this.pos.x, tz - this.pos.z) || 1;
    this.move.set((tx - this.pos.x) / d, 0, (tz - this.pos.z) / d).multiplyScalar(Math.min(1, d / 20));
    this.climb = clamp((60 - this.pos.y) / 10, -1, 1);
    this.yaw = Math.atan2(-(c.x - this.pos.x), -(c.z - this.pos.z));
    if ((this.aiT -= dt) <= 0) {
      this.aiT = 1;
      for (const e of g.targetsFor(this.team)) {
        if (e.isVehicle || !e.alive) continue;
        if (e.pos.distanceTo(this.pos) < 110 && lineOfSight(this.pos, _c.copy(e.pos).setY(e.pos.y + 1))) e.marked = g.time + 20;
      }
    }
  }

  view(cam) {
    cam.position.copy(this.pos); cam.position.y -= 0.05;
    cam.quaternion.setFromEuler(_e.set(this.gimbal, this.yaw, 0, 'YXZ'));
    return 72 / this.zoom;
  }

  grade() {
    return this.thermal
      ? { thermal: true, sat: 0, contrast: 1.35, tint: [0.62, 0.62, 0.62], grain: 0.05, vignette: 0.3, fringe: 0 }
      : { sat: 1.02, contrast: 1.04, grain: 0.02 + (1 - this.signal) * 0.3, vignette: 0.15, fringe: 0.001 };
  }

  drawHud(ctx, W, H, P, game) {
    const cx = W / 2, cy = H / 2, col = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 40, cy - 28, 80, 56);
    cross(ctx, cx, cy, 8, 3, col, 1.5);
    const alt = this.pos.y - floorAt(this.pos.x, this.pos.z, 0.2, this.pos.y);
    const dist = Math.hypot(this.pos.x - (this.owner?.pos?.x ?? this.home.x), this.pos.z - (this.owner?.pos?.z ?? this.home.z));
    const hs = Math.hypot(this.vel.x, this.vel.z);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H - 44, W, 44);
    text(ctx, `H ${alt.toFixed(1)} m`, 30, H - 16, 'left', '#fff', 18);
    text(ctx, `D ${Math.round(dist)} m`, 170, H - 16, 'left', '#fff', 18);
    text(ctx, `H.S ${hs.toFixed(1)} m/s`, 310, H - 16, 'left', '#fff', 18);
    text(ctx, `V.S ${this.vel.y.toFixed(1)} m/s`, 480, H - 16, 'left', '#fff', 18);
    const bat = Math.max(0, this.battery / 420);
    text(ctx, `${Math.round(bat * 100)}%`, W - 30, 40, 'right', bat < 0.2 ? '#ff6a50' : '#fff', 20);
    text(ctx, `GPS  ${this.thermal ? 'IR WHITE-HOT' : 'EO'}  ${this.zoom.toFixed(1)}x`, 30, 40, 'left', '#fff', 18);
    text(ctx, `GIMBAL ${Math.round(this.gimbal * 57.3)}°`, 30, 66, 'left', '#fff', 16);
    if (this.lastMark && this.markCd > -2) text(ctx, this.lastMark, cx, cy + 60, 'center', '#ffd24a', 20);
    // marked soldiers
    for (const e of game.targetsFor(this.team)) {
      if (!e.alive || !(e.marked > game.time)) continue;
      const s = P(_c.copy(e.pos).setY(e.pos.y + 1));
      if (s) box(ctx, s[0], s[1], 18, '#ff5a48');
    }
    if (this.signal < 0.4) text(ctx, 'WEAK SIGNAL', cx, cy - 60, 'center', '#ffd24a', 22);
  }

  stats() { return `<div>BATTERY <b>${Math.max(0, Math.ceil(this.battery))}s</b></div>`; }
}

// ---------- AA emplacement ----------
export class AAGun extends Vehicle {
  constructor(game, team, id, x, z, yaw) {
    super(game, 'aa', { team, isPlayer: false, isNet: true }, id);
    this.owner = null; this.ai = false; this.persistent = true;
    this.addModel();
    this.pos.set(x, groundAt(x, z, 1, 1), z);
    this.a = yaw; this.b = 0.5; this.aimYaw = yaw; this.aimPitch = 0.5;
    this.heat = 0; this.over = 0; this.gunT = 0; this.barrel = 0; this.zoom = 0; this.zoomWant = false;
    this.respawnT = 0; this.scanT = 0; this.target = null; this.fireWant = false; this.acquire = 0;
    this.t = 10;
    this.pose();
  }

  control(dt, inp) {
    const s = this.game.settings.sens * 0.0022 * (this.zoom > 0.5 ? 0.45 : 1);
    this.aimYaw -= inp.dx * s;
    this.aimPitch = clamp(this.aimPitch - inp.dy * s, -0.05, 1.45);
    this.fireWant = inp.fire; this.zoomWant = inp.ads;
  }

  update(dt) {
    const g = this.game;
    if (!this.alive) { if (g.authority && (this.respawnT -= dt) <= 0) this.revive(); return; }
    this.t += dt;
    this.heat = Math.max(0, this.heat - dt * 0.3);
    if (this.over > 0) this.over -= dt;
    if (!this.driver && g.authority) this.auto(dt);
    const rate = 2.2 * dt;
    this.a += clamp(wrap(this.aimYaw - this.a), -rate, rate);
    this.b += clamp(this.aimPitch - this.b, -rate * 0.7, rate * 0.7);
    this.pose();
    this.gunT -= dt;
    if (this.fireWant && this.gunT <= 0 && this.over <= 0) this.fireFlak();
  }

  // unmanned: track enemy aircraft on its own, less accurately than a gunner
  auto(dt) {
    const g = this.game;
    this.fireWant = false;
    const eye = _v.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.4; this.target = null;
      const prev = this.target;
      let bd = 150;
      this.target = null;
      for (const v of g.vehicles) {
        if (!v.alive || !v.air || v.team === this.team || v.spec?.drone) continue;
        const d = v.pos.distanceTo(eye);
        if (d < bd && v.pos.y > 10 && lineOfSight(eye, v.pos)) { bd = d; this.target = v; }
      }
      if (this.target !== prev) this.acquire = 2.2;
    }
    const t = this.target;
    if (!t || !t.alive) { this.aimPitch = 0.5; return; }
    if ((this.acquire -= dt) > 0) return;
    const tof = t.pos.distanceTo(eye) / PROJ.flak.speed;
    const p = _w.copy(t.pos).addScaledVector(t.vel, tof * 0.9);
    this.aimYaw = Math.atan2(-(p.x - eye.x), -(p.z - eye.z));
    this.aimPitch = Math.atan2(p.y - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z));
    if (Math.abs(wrap(this.aimYaw - this.a)) < 0.06 && Math.abs(this.aimPitch - this.b) < 0.06 && this.heat < 0.6) this.fireWant = true;
  }

  pose() {
    const m = this.m;
    m.g.position.copy(this.pos);
    m.mount.rotation.y = this.a; m.guns.rotation.x = this.b;
    m.g.updateMatrixWorld(true);
  }

  fireFlak() {
    this.gunT = this.driver ? 0.08 : 0.15;
    this.heat += this.driver ? 0.045 : 0.06;
    if (this.heat >= 1) { this.over = 2.5; this.heat = 1; }
    const g = this.game, mz = this.m.muzzles[this.barrel = 1 - this.barrel];
    const o = mz.getWorldPosition(new THREE.Vector3());
    this.m.guns.getWorldQuaternion(_q2);
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(_q2), s = this.driver ? 0.012 : 0.085;
    d.x += (Math.random() - 0.5) * s; d.y += (Math.random() - 0.5) * s; d.z += (Math.random() - 0.5) * s;
    g.fireProjectile('flak', this.driver || this, o, d.normalize().multiplyScalar(PROJ.flak.speed), null, this);
    g.effects.flash(o, 0.9);
    g.audio.shot('flak', this.controlled ? null : o);
    if (this.controlled) g.shake = Math.max(g.shake, 0.012);
  }

  destroy(attacker, weapon, fx = true) {
    if (!this.alive) return;
    super.destroy(attacker, weapon, fx);
    this.respawnT = 40; this.persistent = true;
  }

  revive() {
    this.alive = true; this.health = this.maxHealth; this.heat = 0; this.over = 0; this.driver = null;
    this.game.scene.add(this.m.g);
  }

  view(cam, dt) {
    this.zoom += ((this.zoomWant ? 1 : 0) - this.zoom) * Math.min(1, dt * 10);
    const dir = aimDir(this.aimYaw, this.aimPitch, _f);
    cam.position.set(this.pos.x, this.pos.y + 2.15, this.pos.z).addScaledVector(dir, -1.1);
    cam.rotation.set(this.aimPitch, this.aimYaw, 0);
    return this.zoom > 0.5 ? 30 : this.game.settings.fov;
  }

  drawHud(ctx, W, H, P, game) {
    const cx = W / 2, cy = H / 2;
    ring(ctx, cx, cy, 40, 'rgba(230,255,220,0.5)', 1.5);
    cross(ctx, cx, cy, 14, 4);
    const eye = _v.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    for (const v of game.vehicles) {
      if (!v.alive || !v.air || v.team === this.team) continue;
      const d = v.pos.distanceTo(eye);
      if (d > 400) continue;
      const s = P(v.pos);
      if (!s) continue;
      box(ctx, s[0], s[1], Math.max(10, 700 / d), 'rgba(255,80,60,0.95)');
      const lead = P(_c.copy(v.pos).addScaledVector(v.vel, d / PROJ.flak.speed));
      if (lead) {
        ctx.strokeStyle = 'rgba(255,210,90,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lead[0], lead[1] - 7); ctx.lineTo(lead[0] + 7, lead[1]); ctx.lineTo(lead[0], lead[1] + 7); ctx.lineTo(lead[0] - 7, lead[1]); ctx.closePath(); ctx.stroke();
      }
    }
  }

  stats() {
    return `<div>HEAT <b style="color:${this.over > 0 ? '#ff5a48' : this.heat > 0.7 ? '#ffb040' : '#9f9'}">${this.over > 0 ? 'OVERHEATED' : `${Math.round(this.heat * 100)}%`}</b></div>`;
  }
}

// ---------- attack chopper ----------
// Flies a fixed orbit. Its chin gun is AI-controlled unless its owner mans it.
export class Chopper extends Vehicle {
  constructor(game, owner, id) {
    super(game, 'heli', owner, id);
    this.addModel();
    this.ai = true;
    this.life = owner.isPlayer ? 50 : 45;
    this.angle = this.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    // orbit the fight: the map's middle on small maps, where the caller stood on the big ones
    const big = SIZE > 200;
    this.cx = big ? Math.max(60, Math.min(SIZE - 60, owner.pos.x)) : SIZE / 2;
    this.cz = big ? Math.max(60, Math.min(SIZE - 60, owner.pos.z + (this.team === 0 ? 40 : -40))) : SIZE / 2;
    this.orbit = SIZE < 100 ? 0.55 : 1;
    this.pos.set(this.cx, 35, this.team === 0 ? this.cz - 70 : this.cz + 70);
    this.heading = this.team === 0 ? Math.PI : 0;
    this.fireT = 0; this.burst = 0; this.scanT = 0; this.target = null;
    this.aimYaw = this.heading; this.aimPitch = -0.7; this.fireWant = false; this.zoomWant = false; this.zoom = 0; this.gunT = 0;
    this.sound = game.audio.rotor();
  }

  control(dt, inp) {
    const s = this.game.settings.sens * 0.0022 * (this.zoom > 0.5 ? 0.4 : 1);
    this.aimYaw -= inp.dx * s;
    this.aimPitch = clamp(this.aimPitch - inp.dy * s, -1.5, -0.05);
    this.fireWant = inp.fire; this.zoomWant = inp.ads;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const manned = !!this.driver;
    this.angle += dt * (manned ? 0.2 : 0.28);
    const r = (manned ? 42 : 34) * this.orbit, alt = (manned ? 34 : 28) * (0.6 + 0.4 * this.orbit);
    _c.set(this.cx + Math.cos(this.angle) * r, alt + Math.sin(this.t * 0.5) * 1.5, this.cz + Math.sin(this.angle) * r);
    if (this.t > this.life) _c.set(this.pos.x + (this.pos.x - this.cx) * 3, 60, this.pos.z + (this.pos.z - this.cz) * 3);
    const k = Math.min(1, dt * (this.t < 3 ? 0.9 : 1.6));
    this.vel.subVectors(_c, this.pos).multiplyScalar(k / Math.max(dt, 1e-4));
    this.pos.lerp(_c, k);
    let want;
    if (!manned && this.target && this.target.alive) want = Math.atan2(-(this.target.pos.x - this.pos.x), -(this.target.pos.z - this.pos.z));
    else want = Math.atan2(-this.vel.x, -this.vel.z);
    const d = wrap(want - this.heading);
    this.heading += d * Math.min(1, dt * 2);
    this.yaw = this.heading;
    this.quat.setFromEuler(_e.set(-0.08, this.heading, clamp(-d * 0.4, -0.3, 0.3), 'YXZ'));
    pose('heli', this.m, this.pos, this.quat, 0, 0, dt);
    // the gunner sits under the nose: hide our own airframe so it never blocks the view
    this.m.g.visible = !this.controlled;
    this.sound?.set(this.pos);
    if (this.t > this.life && manned) { g.hud.toast('Chopper leaving the area'); g.leftVehicle(this.driver, this); }
    if (this.t > this.life + 6) { this.cleanup(); return; }
    if (this.t > this.life) return;
    if (manned) {
      this.gunT -= dt;
      if (this.fireWant && this.gunT <= 0) this.fireCannon();
      return;
    }
    if (this.t < 5) return;
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5; this.target = null;
      let best = 75;
      const gun = _v.set(this.pos.x, this.pos.y - 1.2, this.pos.z);
      for (const s of g.soldiers) {
        if (!s.alive || s.team === this.team || s.inVehicle) continue;
        const p = s.aimPoint(_w, false), dist = p.distanceTo(gun);
        if (dist < best && lineOfSight(gun, p)) { best = dist; this.target = s; }
      }
    }
    if (this.target && this.target.alive) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        if (this.burst <= 0) { this.burst = 10; this.fireT = 0.9; }
        else {
          this.burst--; this.fireT = 0.085;
          const o = new THREE.Vector3(this.pos.x, this.pos.y - 1.3, this.pos.z);
          const p = this.target.aimPoint(_w, false);
          const dir = new THREE.Vector3(p.x + (Math.random() - 0.5) * 3.4, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 3.4).sub(o).normalize();
          g.vehicleGun(this, o, dir, 'Chopper', 24, 0xff9050, 'heli', true);
        }
      }
    }
  }

  fireCannon() {
    this.gunT = 0.12;
    const o = new THREE.Vector3(this.pos.x, this.pos.y - 1.6, this.pos.z);
    const d = aimDir(this.aimYaw, this.aimPitch, new THREE.Vector3());
    d.x += (Math.random() - 0.5) * 0.012; d.y += (Math.random() - 0.5) * 0.012; d.z += (Math.random() - 0.5) * 0.012;
    this.game.vehicleGun(this, o, d.normalize(), 'Chopper', 80, 0xff9050, 'heli', true, 2.6);
    this.game.shake = Math.max(this.game.shake, 0.012);
  }

  view(cam, dt) {
    this.zoom += ((this.zoomWant ? 1 : 0) - this.zoom) * Math.min(1, dt * 10);
    cam.position.set(this.pos.x, this.pos.y - 1.7, this.pos.z);
    cam.rotation.set(this.aimPitch, this.aimYaw, 0);
    return this.zoom > 0.5 ? 22 : 60;
  }

  grade() { return { sat: 0, contrast: 1.45, tint: [0.92, 1.04, 0.95], grain: 0.07, vignette: 0.5, fringe: 0.002 }; }

  drawHud(ctx, W, H, P, game) {
    drawMarkers(ctx, game, P, { range: 200 });
    const cx = W / 2, cy = H / 2, s = 34;
    ctx.strokeStyle = 'rgba(240,255,240,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(cx + sx * s, cy + sy * (s - 12)); ctx.lineTo(cx + sx * s, cy + sy * s); ctx.lineTo(cx + sx * (s - 12), cy + sy * s); }
    ctx.stroke();
    cross(ctx, cx, cy, 10, 3);
    text(ctx, 'THERMAL · 25MM HE', 30, 60, 'left', '#dfd', 20);
    text(ctx, `${Math.max(0, Math.ceil(this.life - this.t))}s`, W - 30, 60, 'right', '#dfd', 22);
  }

  stats() { return `<div>TIME <b>${Math.max(0, Math.ceil(this.life - this.t))}s</b></div>`; }
}

// ---------- projectiles ----------
export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    const std = (color, r, m) => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m });
    const olive = std(0x4a5231, 0.6, 0.2), white = std(0xc8c8c0, 0.5, 0.3), dark = std(0x2a2b2c, 0.5, 0.5);
    const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 1.4) });
    const flame = new THREE.SpriteMaterial({ map: flashTexture, color: new THREE.Color(3, 1.8, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const grp = (parts, glow) => () => {
      const g = new THREE.Group();
      for (const [geo, mat, z] of parts) { const m = new THREE.Mesh(geo, mat); m.position.z = z; g.add(m); }
      if (glow) { const s = new THREE.Sprite(flame); s.scale.setScalar(glow); s.position.z = 0.5; g.add(s); }
      return g;
    };
    this.make = {
      rocket: grp([[cylZ(0.04, 0.04, 0.6, 10), olive, 0], [coneZ(0.075, 0.35, 12), olive, -0.45]], 0.9),
      missile: grp([[cylZ(0.04, 0.04, 1.3, 10), white, 0], [coneZ(0.04, 0.2, 10), white, -0.75]], 1.1),
      shell: grp([[cylZ(0.07, 0.07, 1.4, 8), hot, 0]]),
      flak: grp([[cylZ(0.035, 0.035, 1.2, 6), hot, 0]]),
      agm: grp([[cylZ(0.15, 0.15, 2.5, 12), olive, 0], [coneZ(0.15, 0.3, 12), white, -1.4], [rb(0.9, 0.012, 0.6, 0.004), olive, 0.6]], 1.6),
      bomb: grp([[cylZ(0.17, 0.17, 1.3, 10), dark, 0], [coneZ(0.17, 0.4, 10), dark, -0.85], [rb(0.5, 0.02, 0.3, 0.005), dark, 0.6]]),
    };
  }

  // vis: drawn only (a client's copy); the host's copy does the damage
  spawn(kind, owner, pos, vel, target, src, vis) {
    const P = PROJ[kind];
    if (!P) return;
    const mesh = this.make[P.mesh]();
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.list.push({ kind, P, owner, team: owner?.team ?? -1, pos: pos.clone(), vel: vel.clone(), target, src, vis, t: 0, mesh, decoyed: false });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i], P = p.P;
      p.t += dt;
      if (P.accel) { const s = p.vel.length(); if (s < P.max) p.vel.multiplyScalar(Math.min(P.max, s + P.accel * dt) / Math.max(s, 1e-3)); }
      if (P.homing && p.target) {
        const t = p.target;
        if (!t.alive) p.target = null;
        else {
          if (t.flareT > 0 && !p.decoyed && !P.ground) { p.decoyed = true; if (Math.random() < (P.name === 'AIM-9' ? 0.55 : 0.85)) p.target = null; }
          if (p.target) {
            const s = p.vel.length(), cur = _v.copy(p.vel).divideScalar(s);
            const lead = t.pos.distanceTo(p.pos) / Math.max(60, s);
            const want = (t.point ? _w.copy(t.pos) : t.aimPoint && P.ground ? t.aimPoint(_w, false) : _w.copy(t.pos).addScaledVector(t.vel, lead * 0.6)).sub(p.pos).normalize();
            const ang = Math.acos(clamp(cur.dot(want), -1, 1));
            if (ang > 1e-3) p.vel.copy(cur.lerp(want, Math.min(1, P.homing * dt / ang)).normalize().multiplyScalar(s));
          }
        }
      }
      p.vel.y -= P.grav * dt;
      const len = p.vel.length() * dt, dir = _u.copy(p.vel).normalize();
      const hit = len > 0 ? sweepHit(g, p.pos, dir, len, p.team, p.src) : null;
      let done = false;
      if (hit) { p.pos.addScaledVector(dir, hit.t); this.detonate(p, hit.entity); done = true; }
      else {
        p.pos.addScaledVector(dir, len);
        if (P.prox && p.t > 0.15) {
          for (const v of g.vehicles) {
            if (!v.alive || !v.air || v.team === p.team || v === p.src) continue;
            if (v.pos.distanceTo(p.pos) < P.prox) { this.detonate(p, P.homing ? v : null); done = true; break; }
          }
        }
        if (!done && P.ground && p.target?.point && p.pos.distanceTo(p.target.pos) < 3) { this.detonate(p, null); done = true; }
        if (!done && (p.t > P.life || p.pos.y < -3 || Math.abs(p.pos.x - SIZE / 2) > SIZE / 2 + 9000 || Math.abs(p.pos.z - SIZE / 2) > SIZE / 2 + 9000)) {
          if (P.airburst) this.detonate(p, null);
          done = true;
        }
      }
      if (done) { g.scene.remove(p.mesh); this.list.splice(i, 1); continue; }
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(_c.copy(p.pos).add(dir));
      if (P.trail) g.effects.trail(_c.copy(p.pos).addScaledVector(dir, -0.5), dir);
    }
  }

  detonate(p, entity) {
    if (p.vis) return;
    const g = this.game, P = p.P, extra = { streak: !!p.src };
    if (entity) g.damage(entity, entity.isVehicle ? P.direct : Math.min(P.direct, 250), p.owner, P.name, false, p.pos, extra);
    g.explode(p.pos.clone(), p.owner, P.radius, P.dmg, P.name, { ...extra, air: !!P.airburst });
  }

  clear() {
    for (const p of this.list) this.game.scene.remove(p.mesh);
    this.list = [];
  }
}

// ---------- network copy of someone else's vehicle ----------
export class VehicleProxy {
  constructor(game, id, kind, team) {
    const k = SPEC[kind] ? kind : 'tank', s = SPEC[k];
    Object.assign(this, { game, id, kind: k, team, spec: s, name: vehicleName(k, team), seat: s.seat, air: s.air, size: s.size });
    this.isVehicle = true; this.isProxy = true; this.alive = true; this.local = false; this.persistent = k === 'aa';
    this.maxHealth = s.hp; this.health = s.hp; this.driver = null; this.owner = null; this.driverId = -1;
    this.pos = new THREE.Vector3(); this.tgt = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion(); this.tq = new THREE.Quaternion();
    this.a = 0; this.b = 0; this.ta = 0; this.tb = 0; this.t = 6; this.fresh = true; this.lastRx = game.time; this.yaw = 0; this.shown = true;
    this.m = MODELS[k](team, team === game.player.team);
    game.scene.add(this.m.g);
    this.sound = k === 'heli' ? game.audio.rotor() : k === 'aa' ? null : game.audio.engine(k);
  }

  // row: see Vehicle.netRow. fromHost: take health as well
  apply(row, fromHost) {
    const n = (i) => (typeof row[i] === 'number' && Number.isFinite(row[i]) ? row[i] : 0);
    this.tgt.set(n(3), n(4), n(5));
    this.tq.set(n(6), n(7), n(8), n(9));
    if (this.tq.lengthSq() < 0.5) this.tq.identity();
    this.tq.normalize();
    this.ta = n(10); this.tb = n(11);
    this.alive = row[12] !== 0;
    if (this.alive !== this.shown) { this.shown = this.alive; this.m.g.visible = this.alive; }
    this.driverId = n(13);
    if (fromHost) this.health = n(14);
    this.lastRx = this.game.time;
  }

  aimPoint(out) { return out.set(this.pos.x, this.pos.y + (this.spec?.ground ? 1.3 : this.kind === 'aa' ? 1.2 : 0), this.pos.z); }
  hit(o, d, maxT) { return hitKind(this.kind, this, o, d, maxT); }

  // host only: the client driving it is told its health; at zero it is destroyed here
  applyDamage(amount, attacker, weapon) {
    if (!this.alive) return;
    this.health -= amount * armorMul(this.spec, weapon);
    const g = this.game;
    if (this.owner) g.emit({ k: 'vdmg', to: this.owner.id, id: this.id, hp: Math.max(0, Math.round(this.health)) });
    if (this.health <= 0) this.destroy(attacker, weapon);
  }

  destroy(attacker, weapon) {
    if (!this.alive) return;
    const g = this.game;
    this.alive = false;
    g.explodeFx(this.aimPoint(new THREE.Vector3()), this.spec.boom);
    g.emit({ k: 'vdead', id: this.id });
    g.deadVehicles.add(this.id);
    if (attacker && !attacker.isVehicle && attacker.team !== this.team && attacker.score !== undefined) {
      attacker.score += this.spec.bounty;
      g.popupFor(attacker, [[`${this.name} destroyed`, this.spec.bounty]]);
    }
    const d = this.driver;
    if (d && this.seat === 'inside' && d.alive) { d.inVehicle = false; d.protect = 0; g.damage(d, 999, attacker, weapon || this.name, false, this.pos); }
    this.remove();
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (g.role === 'host' && g.time - this.lastRx > 2.5) { this.remove(); return; }
    if (this.fresh) { this.pos.copy(this.tgt); this.quat.copy(this.tq); this.a = this.ta; this.b = this.tb; this.fresh = false; }
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const k = 1 - Math.exp(-dt * 12);
    if (this.pos.distanceTo(this.tgt) > 40) this.pos.copy(this.tgt);
    else this.pos.lerp(this.tgt, k);
    this.quat.slerp(this.tq, k);
    this.a += wrap(this.ta - this.a) * k; this.b += (this.tb - this.b) * k;
    const idt = 1 / Math.max(dt, 1e-3);
    this.vel.lerp(_v.set((this.pos.x - px) * idt, (this.pos.y - py) * idt, (this.pos.z - pz) * idt), 0.2);
    this.yaw = _e.setFromQuaternion(this.quat, 'YXZ').y;
    pose(this.kind, this.m, this.pos, this.quat, this.a, this.b, dt);
    if (this.sound) {
      if (this.kind === 'heli') this.sound.set(this.pos);
      else this.sound.set(this.pos, 0.3 + Math.min(1, this.vel.length() / (this.spec.fixed ? 250 : this.spec.drone ? 20 : 10)) * 0.7);
    }
  }

  remove() {
    this.alive = false; this.persistent = false;
    this.game.scene.remove(this.m.g);
    this.sound?.stop(); this.sound = null;
  }
}

// ---------- placement ----------
// Two AA guns at each team's base, on open ground. Maps are mirrored, so team 1 mirrors team 0.
export function placeEmplacements(game) {
  const out = [];
  let id = 900;
  const bx = (SIZE - 160) / 2;
  for (const team of [0, 1]) {
    for (const xs0 of [[40, 44, 36, 48, 52, 30], [120, 116, 124, 112, 108, 130]]) {
      const xs = xs0.map(x => x + bx);
      let found = null;
      for (const zz of [19, 16, 21, 13, 10]) {
        for (const x of xs) {
          const z = team === 0 ? zz : SIZE - zz, wx = team === 0 ? x : SIZE - x;
          if (overlaps(wx, z, 2.0, 0.3, 3)) continue;
          if (spawns[team].some(s => Math.hypot(s.x - wx, s.z - z) < 3.5)) continue;
          found = [wx, z]; break;
        }
        if (found) break;
      }
      if (found) out.push(new AAGun(game, team, id++, found[0], found[1], team === 0 ? Math.PI : 0));
    }
  }
  return out;
}

// Open ground at a team's base with room for a tank, pointing at the enemy.
export function tankSpot(game, team) {
  const yaw = team === 0 ? Math.PI : 0;
  for (const zz of [18, 15, 21, 13, 23]) {
    for (const dx of [0, -6, 6, -12, 12, -18, 18, -24, 24, -30, 30]) {
      const x = SIZE / 2 + dx, z = team === 0 ? zz : SIZE - zz;
      if ([-1.9, 0, 1.9].some(k => overlaps(x, z + k, 1.5, 0.8, 2.4))) continue;
      if (game.vehicles.some(v => v.alive && (v.spec?.ground || v.kind === 'aa') && Math.hypot(v.pos.x - x, v.pos.z - z) < 6.5)) continue;
      return { x, z, yaw };
    }
  }
  return { x: SIZE / 2, z: team === 0 ? 18 : SIZE - 18, yaw };
}
