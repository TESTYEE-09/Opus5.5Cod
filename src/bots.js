import * as THREE from 'three';
import { moveBody, findPath, lineWalkable, overlaps, interest, randomWalkable, lineOfSight, walkable, SIZE, STEP } from './world.js';
import { WEAPONS } from './weapons.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface, R } from './textures.js';

export const DIFFICULTY = {
  recruit: { name: 'Recruit', react: 1.0, err: 2.0, min: 0.6, learn: 0.5, turn: 3, dmg: 0.5, head: 0.02 },
  regular: { name: 'Regular', react: 0.68, err: 1.55, min: 0.4, learn: 0.75, turn: 4.5, dmg: 0.62, head: 0.06 },
  veteran: { name: 'Veteran', react: 0.42, err: 1.15, min: 0.22, learn: 1.1, turn: 6.5, dmg: 0.85, head: 0.15 },
};

const KITS = [['ar', 0.34], ['smg', 0.2], ['burst', 0.12], ['lmg', 0.07], ['shotgun', 0.09], ['dmr', 0.09], ['sniper', 0.09]];
function pickKit() {
  let r = Math.random();
  for (const [k, w] of KITS) if ((r -= w) <= 0) return k;
  return 'ar';
}

// US Army in OCP (tan and brown) with coyote kit; Russian Army in EMR green with ratnik kit
const TEAM_LOOK = [
  { camo: [0x8a7f5e, 0x6f6a4a, 0xa3946c, 0x4e4632], vest: 0x7a6c4e, helmet: 0x7d7052, accent: 0x3d7fe0, gear: 0x6a5e44 },
  { camo: [0x55603f, 0x3c4630, 0x6f7552, 0x2a2e22], vest: 0x46503a, helmet: 0x4a5438, accent: 0xd0342a, gear: 0x3a4230 },
];

const geoCache = {};
const accentGold = new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.4, metalness: 0.7 });
const box = (w, h, d) => (geoCache[`${w},${h},${d}`] ||= new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.25));
const helmetGeo = new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
const cupGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12).rotateZ(Math.PI / 2);

function mesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Rajdhani, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.4, 0.35, 1);
  s.renderOrder = 10;
  return s;
}

const teamMats = [null, null];
function matsFor(team) {
  if (teamMats[team]) return teamMats[team];
  const L = TEAM_LOOK[team];
  const camo = surface(`camo:${team}`, R.camo(...L.camo), { size: 256, seed: 60 + team, normal: 1.2 });
  const fab = surface('fabric:[]', R.fabric(), { size: 256, seed: 43, normal: 1.5 });
  const cloth = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) });
  teamMats[team] = {
    uni: new THREE.MeshStandardMaterial({ map: camo.map, normalMap: camo.normalMap, roughness: 0.9 }),
    vest: cloth(L.vest), gear: cloth(L.gear),
    helmet: new THREE.MeshStandardMaterial({ color: L.helmet, roughness: 0.6, metalness: 0.1 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.7 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.8 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x222324, roughness: 0.4, metalness: 0.7 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x2c2d2b, roughness: 0.6 }),
    mask: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.05, metalness: 0.8 }),
  };
  return teamMats[team];
}

// opts.officer: the Undercover target, in a peaked cap and no body armour
export function buildSoldier(team, name, opts = {}) {
  const L = TEAM_LOOK[team], T = matsFor(team);
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.07, 0.35, 0.3 + Math.random() * 0.25), roughness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: L.accent, emissive: L.accent, emissiveIntensity: 0.45 });

  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  mesh(hips, box(0.36, 0.14, 0.22), T.uni, 0, 0.02, 0);
  mesh(hips, box(0.4, 0.05, 0.25), T.gear, 0, 0.07, 0);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.11 * side, 0, 0); hips.add(leg);
    mesh(leg, box(0.17, 0.48, 0.19), T.uni, 0, -0.23, 0);
    mesh(leg, box(0.09, 0.14, 0.05), T.gear, 0.08 * side, -0.22, 0.02);
    const shin = new THREE.Group(); shin.position.y = -0.46; leg.add(shin);
    mesh(shin, box(0.15, 0.44, 0.17), T.uni, 0, -0.2, 0);
    mesh(shin, box(0.13, 0.12, 0.06), T.vest, 0, -0.02, -0.08);
    mesh(shin, box(0.16, 0.12, 0.29), T.boot, 0, -0.43, -0.04);
    legs.push({ leg, shin });
  }
  const torso = new THREE.Group(); hips.add(torso);
  const off = !!opts.officer;
  mesh(torso, box(0.42, 0.56, 0.25), off ? T.helmet : T.uni, 0, 0.3, 0);
  if (off) {
    for (const x of [-0.17, 0.17]) mesh(torso, box(0.1, 0.03, 0.16), accentGold, x, 0.575, 0);
    mesh(torso, box(0.44, 0.06, 0.27), T.boot, 0, 0.08, 0);
  } else {
    mesh(torso, box(0.46, 0.4, 0.31), T.vest, 0, 0.34, 0);
    for (const x of [-0.12, 0, 0.12]) mesh(torso, box(0.1, 0.13, 0.07), T.gear, x, 0.25, -0.18);
    mesh(torso, box(0.13, 0.1, 0.06), T.gear, 0.14, 0.42, -0.17);
    mesh(torso, box(0.3, 0.36, 0.14), T.gear, 0, 0.34, 0.21);
    mesh(torso, box(0.08, 0.3, 0.06), T.gear, -0.2, 0.38, 0.14);
  }
  mesh(torso, box(0.3, 0.08, 0.3), T.uni, 0, 0.56, 0);
  const head = new THREE.Group(); head.position.y = 0.62; torso.add(head);
  mesh(head, box(0.19, 0.24, 0.21), team && !off ? T.mask : skin, 0, 0.11, 0);
  if (off) {
    mesh(head, box(0.26, 0.07, 0.27), T.boot, 0, 0.25, 0);
    mesh(head, box(0.24, 0.02, 0.12), T.boot, 0, 0.215, -0.15);
    mesh(head, box(0.08, 0.06, 0.02), accentGold, 0, 0.26, -0.135);
  } else {
    if (team) mesh(head, box(0.15, 0.045, 0.02), skin, 0, 0.15, -0.1);
    else mesh(head, box(0.17, 0.05, 0.03), T.lens, 0, 0.16, -0.105);
    mesh(head, helmetGeo, T.helmet, 0, 0.19, 0.005);
    mesh(head, box(0.28, 0.035, 0.3), T.helmet, 0, 0.2, 0.01);
    for (const x of [-0.105, 0.105]) mesh(head, cupGeo, T.gear, x, 0.13, 0.01);
    mesh(head, box(0.05, 0.04, 0.03), T.gun, 0, 0.27, -0.14);
  }
  mesh(torso, box(0.24, 0.06, 0.24), accent, 0, 0.6, 0);

  const arms = new THREE.Group(); arms.position.set(0, 0.5, 0); torso.add(arms);
  mesh(arms, box(0.13, 0.13, 0.34), T.uni, 0.25, -0.06, -0.1, 0.5);
  mesh(arms, box(0.14, 0.06, 0.14), accent, 0.25, 0.0, -0.02);
  mesh(arms, box(0.11, 0.11, 0.34), T.uni, 0.18, -0.18, -0.32);
  mesh(arms, box(0.1, 0.1, 0.09), T.glove, 0.14, -0.2, -0.5);
  mesh(arms, box(0.13, 0.13, 0.36), T.uni, -0.22, -0.08, -0.2, 0.3, 0.45);
  mesh(arms, box(0.11, 0.11, 0.34), T.uni, -0.07, -0.13, -0.45, 0, 0.3);
  mesh(arms, box(0.1, 0.1, 0.09), T.glove, 0.02, -0.13, -0.62);
  const rifle = new THREE.Group(); rifle.position.set(0.08, -0.14, -0.4); arms.add(rifle);
  mesh(rifle, box(0.065, 0.1, 0.46), T.gun, 0, 0, -0.05);
  mesh(rifle, box(0.07, 0.08, 0.26), T.poly, 0, 0.0, -0.32);
  mesh(rifle, box(0.035, 0.16, 0.07), T.poly, 0, -0.11, 0.0, 0.2);
  mesh(rifle, box(0.03, 0.03, 0.2), T.gun, 0, 0.01, -0.52);
  mesh(rifle, box(0.05, 0.1, 0.2), T.poly, 0, -0.02, 0.33);
  mesh(rifle, box(0.04, 0.05, 0.08), T.gun, 0, 0.075, -0.05);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -0.63); rifle.add(muzzle);

  for (const gr of [hips, ...legs.flatMap(l => [l.leg, l.shin]), torso, head, arms, rifle]) mergeParts(gr);
  const tag = nameTag(name, '#7fb4ff');
  tag.position.y = 2.2;
  root.add(tag);
  return { root, hips, legs, torso, head, arms, muzzle, tag, accent };
}

// Bakes a body part's pieces into one mesh per look: the camo cloth, the glowing team accent,
// and everything else in a single vertex-coloured mesh. About 17 draw calls a soldier, not 45.
const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12 });
function mergeParts(group) {
  const buckets = new Map();
  for (const c of group.children.slice()) {
    if (!c.isMesh) continue;
    const m = c.material, key = m.map || m.emissiveIntensity > 0 ? m : solidMat;
    c.updateMatrix();
    const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(c.matrix);
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
    if (key === solidMat) {
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    (buckets.get(key) || buckets.set(key, []).get(key)).push(g);
    group.remove(c);
  }
  for (const [mat, geos] of buckets) {
    const mm = new THREE.Mesh(mergeGeometries(geos), mat);
    mm.castShadow = true;
    group.add(mm);
    for (const g of geos) g.dispose();
  }
}

// Accent colour and name tag depend on which side the local player is on.
export function setRelation(m, ally) {
  const c = ally ? 0x3d7fe0 : 0xd0342a;
  m.accent.color.setHex(c);
  m.accent.emissive.setHex(c);
  m.tag.visible = ally;
}

// crouchAmt runs 0..1 for crouching and on to 2 for prone
export function animateSoldier(m, s, dt) {
  const p = Math.max(0, Math.min(1, s.crouchAmt - 1)), c = Math.min(1, s.crouchAmt) * (1 - p);
  m.root.rotation.order = 'YXZ';
  m.root.position.copy(s.pos);
  if (p > 0) {
    m.root.position.x += Math.sin(s.yaw) * 0.95 * p;
    m.root.position.z += Math.cos(s.yaw) * 0.95 * p;
    m.root.position.y += 0.18 * p;
  }
  m.root.rotation.set(-p * Math.PI / 2, s.yaw, 0);
  const sp = Math.hypot(s.vel.x, s.vel.z);
  s.walkPhase += sp * dt * (p > 0.5 ? 5 : 2.6);
  const amp = Math.min(1, sp / 4) * (1 - c * 0.6) * (1 - p * 0.6);
  m.hips.position.y = 0.95 - 0.38 * c;
  m.torso.rotation.z = -(s.leanOff || 0) * 0.7;
  for (let i = 0; i < 2; i++) {
    const w = Math.sin(s.walkPhase + i * Math.PI);
    const crouchLeg = i === 0 ? [1.2, -1.7] : [0.3, -1.9];
    m.legs[i].leg.rotation.x = w * 0.7 * amp + crouchLeg[0] * c;
    m.legs[i].shin.rotation.x = -Math.max(0, -Math.cos(s.walkPhase + i * Math.PI)) * 0.9 * amp + crouchLeg[1] * c;
  }
  m.torso.rotation.x = (s.pitch * 0.8 + 0.08 * c) * (1 - p) + p * 0.45;
  m.hips.position.y += Math.abs(Math.sin(s.walkPhase)) * 0.04 * amp;
  m.tag.position.y = 2.2 - 0.5 * c - 1.2 * p;
}

export function animateDeath(m, s, dt) {
  s.deathT += dt;
  const f = Math.min(1, s.deathT / 0.5);
  m.root.rotation.x = -f * f * 1.45 * s.fallDir;
  m.root.position.y = s.pos.y + 0.1 * f;
  const keep = s.bodyTime ?? 3.5;
  if (s.deathT > keep) m.root.position.y = s.pos.y - (s.deathT - keep) * 0.4;
  if (s.deathT > keep + 1) m.root.visible = false;
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();
// the nearest open, walkable spot within a few metres of (x, z)
function openSpot(x, z) {
  for (let r = 0; r < 12; r += 1.5) for (let n = 0; n < (r ? 8 : 1); n++) {
    const a = n / 8 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (walkable(Math.floor(px), Math.floor(pz)) && !overlaps(px, pz, 0.4, STEP, 1.8)) return { x: px, z: pz };
  }
  return null;
}
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Bot {
  constructor(game, team, name, opts = {}) {
    this.game = game;
    this.team = team;
    this.name = name;
    this.role = null; this.hostile = false; this.far = false; this.camD = 0;
    this.isPlayer = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.body = { pos: this.pos, vel: this.vel, r: 0.35, h: 1.75, onGround: true };
    this.model = buildSoldier(game.mode ? game.mode.lookFor(this) : team, name, opts);
    game.scene.add(this.model.root);
    this.damagers = new Map();
    this.lastKnown = new THREE.Vector3();
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.firedT = -99;
    this.alive = false;
    this.model.root.visible = false;
  }

  spawn(p, yaw) {
    this.kit = pickKit();
    this.def = WEAPONS[this.kit];
    this.mag = this.def.mag;
    this.pos.set(p.x, 0, p.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.health = 100; this.alive = true; this.protect = 1.5;
    this.crouched = false; this.crouchAmt = 0;
    this.target = null; this.visible = false; this.lastSeenT = -99;
    this.reactT = 0; this.err = 1; this.fireT = 0; this.burst = 0; this.reloadT = 0;
    this.strafeDir = 0; this.strafeT = 0;
    this.path = null; this.pathIdx = 0; this.goal = null; this.goalKey = null; this.repathT = 0; this.leg = null; this.waitT = 0;
    this.senseT = Math.random() * 0.2;
    this.stuckT = 0; this.stuckPos = new THREE.Vector3().copy(this.pos);
    this.grenades = 1; this.nadeCool = 3;
    // about a third of bots carry a launcher for vehicles
    const lr = Math.random();
    this.launcher = lr < 0.17 ? 'rpg' : lr < 0.25 ? 'stinger' : null;
    this.rockets = this.launcher === 'rpg' ? 2 : this.launcher ? 1 : 0; this.rocketCd = 2;
    this.walkPhase = 0; this.flashT = 0;
    this.deathT = 0;
    this.damagers.clear();
    this.streak = 0;
    const r = this.model.root;
    r.visible = true; r.rotation.set(0, yaw, 0); r.position.copy(this.pos);
    setRelation(this.model, this.team === this.game.player.team);
    this.model.torso.rotation.set(0, 0, 0);
  }

  aimPoint(out, head) {
    return out.set(this.pos.x, this.pos.y + (head ? 1.62 - 0.5 * this.crouchAmt : 1.2 - 0.35 * this.crouchAmt), this.pos.z);
  }

  eye(out) { return out.set(this.pos.x, this.pos.y + 1.6 - 0.5 * this.crouchAmt, this.pos.z); }

  hurtBy(attacker) {
    if (this.game.mode.kind === 'uc' && this.team === 1 && !this.hostile && attacker) this.game.mode.alert(this, attacker, attacker.pos);
    if (attacker?.vehicle?.alive) attacker = attacker.vehicle;
    if (!attacker || attacker === this || !attacker.alive || (attacker.isVehicle && (attacker.air || (attacker.kind === 'aa' && !attacker.driver)))) return;
    if (!this.visible || this.target !== attacker) {
      this.target = attacker;
      this.lastKnown.copy(attacker.pos);
      this.lastSeenT = this.game.time - 0.5;
      this.reactT = Math.max(this.reactT, 0.25);
    }
    this.strafeT = 0;
  }

  hear(source, pos) {
    if (this.visible || !this.alive) return;
    if (this.target && this.target !== source && this.game.time - this.lastSeenT < 3) return;
    this.target = source;
    this.lastKnown.copy(pos);
    this.lastSeenT = this.game.time - 1.5;
  }

  die() {
    this.alive = false;
    this.deathT = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    const g = this.game;
    this.respawnT = g.mode.respawnDelay(this);
    // Undercover keeps the bodies where they fell, for the guards to find
    this.bodyTime = g.mode.kind === 'uc' ? 90 : 3.5;
  }

  sense() {
    const g = this.game;
    const eye = this.eye(_a);
    let best = null, bestScore = Infinity;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const e of g.targetsFor(this.team, this)) {
      const p = e.aimPoint(_b, false);
      const dx = p.x - eye.x, dz = p.z - eye.z;
      const dist = Math.hypot(dx, dz, p.y - eye.y);
      if (dist > (e.isVehicle ? (e.kind === 'drone' ? (e === this.target ? 45 : 28) : e.air && this.launcher === 'stinger' && this.rockets > 0 ? 220 : 70) : 85)) continue;
      const hd = Math.hypot(dx, dz) || 1;
      const dot = (dx * fx + dz * fz) / hd;
      if (e !== this.target && dot < 0.2 && dist > 6) continue;
      if (!lineOfSight(eye, p) && !lineOfSight(eye, e.aimPoint(_b, true))) continue;
      let score = dist * (e === this.target ? 0.6 : 1);
      if (e.isVehicle) score += 40;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) {
      if (best !== this.target || !this.visible) {
        const dist = this.pos.distanceTo(best.pos);
        if (best !== this.target || g.time - this.lastSeenT > 1.5) {
          this.reactT = g.diff.react * (0.7 + Math.random() * 0.6) + (dist > 40 ? 0.25 : 0) + (this.kit === 'sniper' ? 0.3 : 0);
          this.err = g.diff.err * (1 + dist / 45);
          // a small, fast FPV drone takes a moment to pick out and is hard to track
          if (best.kind === 'drone') { this.reactT += 0.5 + Math.random() * 0.5; this.err *= 3; }
        }
      }
      this.target = best;
      this.visible = true;
      this.lastKnown.copy(best.pos);
      this.lastSeenT = g.time;
      g.reportIntel(this.team, best.pos);
    } else {
      this.visible = false;
      if (this.target && !this.target.alive) this.target = null;
    }
  }

  update(dt) {
    const g = this.game;
    const m = this.model;
    if (!this.alive) {
      animateDeath(m, this, dt);
      if ((this.respawnT -= dt) <= 0) g.respawn(this);
      return;
    }
    if (this.protect > 0) this.protect -= dt;
    if ((this.senseT -= dt) <= 0) { this.senseT = 0.1 + Math.random() * 0.08; this.sense(); }
    if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) this.mag = this.def.mag;
    if (this.nadeCool > 0) this.nadeCool -= dt;
    if (this.rocketCd > 0) this.rocketCd -= dt;

    this.wish = this.wish || new THREE.Vector3();
    this.wish.set(0, 0, 0);
    let speed = 4.6 * this.def.speed;
    let crouch = false;

    const danger = g.dangerNear(this, 6);
    const calm = this.role && g.mode.kind === 'uc' && !g.mode.hostileTo(this);
    if (calm && !danger) {
      this.calm(dt);
      speed = 4.6;
    } else if (danger) {
      _v.subVectors(this.pos, danger.pos).setY(0).normalize();
      this.wish.copy(_v);
      speed = 6;
      this.faceToward(this.pos.x + _v.x, this.pos.z + _v.z, dt, 6);
    } else if (this.target && this.target.alive && this.visible) {
      crouch = this.engage(dt);
      speed = this.kit === 'shotgun' ? 4.8 : 3;
    } else if (this.target && this.target.alive && g.time - this.lastSeenT < 8) {
      this.hunt(dt);
    } else {
      this.target = null;
      this.roam(dt);
    }

    // separation from nearby teammates
    for (const o of g.bots) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.2 && d2 > 1e-4) { const d = Math.sqrt(d2); this.wish.x += dx / d * 0.8; this.wish.z += dz / d * 0.8; }
    }

    const wl = this.wish.length();
    if (wl > 1) this.wish.divideScalar(wl);
    this.crouched = crouch && wl < 0.1;
    if (this.crouched === false && this.crouchAmt > 0.5 && overlaps(this.pos.x, this.pos.z, 0.35, this.pos.y + STEP, this.pos.y + 1.75)) this.crouched = true;
    const cs = this.crouched ? 0.5 : 1;
    const k = Math.min(1, dt * 10);
    this.vel.x += (this.wish.x * speed * cs - this.vel.x) * k;
    this.vel.z += (this.wish.z * speed * cs - this.vel.z) * k;
    this.crouchAmt += ((this.crouched ? 1 : 0) - this.crouchAmt) * Math.min(1, dt * 8);
    this.body.h = 1.75 - 0.6 * this.crouchAmt;
    moveBody(this.body, dt);
    this.footsteps(dt);

    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      if (wl > 0.3 && this.pos.distanceTo(this.stuckPos) < 0.6) { this.path = null; this.goal = null; this.strafeDir = -this.strafeDir; }
      this.stuckT = 0; this.stuckPos.copy(this.pos);
    }

    this.animate(dt);
  }

  // Undercover: a calm soldier strolls his post or patrol route, stops, looks about
  calm(dt) {
    const g = this.game;
    this.target = null; this.visible = false;
    if (this.waitT > 0) {
      this.waitT -= dt;
      if ((this.lookT = (this.lookT || 0) - dt) <= 0) { this.lookT = 2 + Math.random() * 4; this.lookYaw = this.yaw + (Math.random() - 0.5) * 2.4; }
      this.faceToward(this.pos.x - Math.sin(this.lookYaw), this.pos.z - Math.cos(this.lookYaw), dt, 1.1);
      this.pitch *= 0.9;
      return;
    }
    if (!this.goal) { this.goal = g.mode.botGoal(this); this.path = null; if (!this.goal) { this.waitT = 3; return; } }
    this.goTo(this.goal.x, this.goal.z, dt, this.goal.pace || 0.35, true);
    if (this.goal && Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 1.2) { this.waitT = this.goal.wait || 4; this.goal = null; }
  }

  footsteps(dt) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (!this.body.onGround || sp < 1.5) return;
    this.stepAcc = (this.stepAcc || 0) + sp * dt;
    if (this.stepAcc > 2.2) { this.stepAcc = 0; this.game.audio.step(this.pos, this.crouched ? 0.35 : sp > 5 ? 1.3 : 1); }
  }

  faceToward(x, z, dt, rate) {
    const want = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    const d = wrap(want - this.yaw);
    const step = rate * dt;
    this.yaw = wrap(this.yaw + Math.max(-step, Math.min(step, d)));
    return Math.abs(d);
  }

  engage(dt) {
    const g = this.game, D = g.diff, t = this.target;
    const head = !t.isVehicle && Math.random() < D.head;
    const aim = t.aimPoint(_b, head);
    const eye = this.eye(_a);
    const dist = eye.distanceTo(aim);
    const facing = this.faceToward(aim.x, aim.z, dt, D.turn);
    this.pitch = Math.atan2(aim.y - eye.y, Math.hypot(aim.x - eye.x, aim.z - eye.z));

    this.err = Math.max(D.min * (t.kind === 'drone' ? 3.5 : 1), this.err * Math.exp(-D.learn * (t.kind === 'drone' ? 0.35 : 1) * dt));
    this.reactT -= dt;

    // launchers against vehicles: RPG at anything slow, Stinger at aircraft
    if (t.isVehicle && this.rockets > 0 && this.rocketCd <= 0 && this.reactT <= 0 && facing < 0.2 &&
        ((this.launcher === 'stinger' && t.air && t.kind !== 'drone' && Math.random() < 0.5) || (this.launcher === 'rpg' && (t.kind === 'tank' || t.kind === 'aa' || t.kind === 'heli') && dist < 90))) {
      this.rockets--; this.rocketCd = this.launcher === 'stinger' ? 14 : 5;
      g.botLaunch(this, t, this.launcher);
      return false;
    }
    if (this.mag <= 0 && this.reloadT <= 0) this.reloadT = this.def.reload * 1.15;
    if (this.reloadT <= 0 && this.reactT <= 0 && facing < 0.25) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        if (this.burst <= 0) {
          const d = this.def;
          this.burst = d.auto ? 3 + Math.floor(Math.random() * (dist < 15 ? 8 : 4)) : d.burst || 1;
          this.fireT = d.scope ? 1.1 + Math.random() * 1.2 : d.auto ? 0.15 + Math.random() * 0.45 : 0.25 + Math.random() * 0.5;
          if (d.model === 'pistol' || d.model === 'shotgun') this.fireT = 60 / d.rpm + Math.random() * 0.4;
        } else {
          this.shoot(aim, dist);
          this.burst--;
          this.fireT = 60 / (this.def.burstRpm || this.def.rpm);
        }
      }
    }

    // movement while fighting
    const pref = this.def.pref;
    let crouch = false;
    if (dist > pref * 1.5 && !this.def.scope) {
      this.goTo(this.target.pos.x, this.target.pos.z, dt, 1.0, false);
    } else if (this.def.scope) {
      crouch = true;
    } else {
      if ((this.strafeT -= dt) <= 0) {
        this.strafeT = 0.5 + Math.random() * 1.1;
        const r = Math.random();
        this.strafeDir = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
        if (this.kit === 'shotgun' || dist > pref) this.strafeDir *= 0.7;
      }
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      this.wish.set(rx * this.strafeDir, 0, rz * this.strafeDir);
      if (this.kit === 'shotgun' || dist > pref) { this.wish.x += -Math.sin(this.yaw) * 0.8; this.wish.z += -Math.cos(this.yaw) * 0.8; }
      if (this.strafeDir !== 0 && overlaps(this.pos.x + this.wish.x * 0.6, this.pos.z + this.wish.z * 0.6, 0.35, this.pos.y + STEP, this.pos.y + 1.7)) {
        this.strafeDir = -this.strafeDir; this.wish.set(0, 0, 0);
      }
      crouch = this.strafeDir === 0 && dist > 18;
    }
    return crouch;
  }

  shoot(aim, dist) {
    const g = this.game, d = this.def;
    this.mag--;
    this.firedT = g.time;
    const muzzle = this.model.muzzle.getWorldPosition(_v);
    const o = this.eye(new THREE.Vector3());
    const tvel = this.target.vel ? Math.hypot(this.target.vel.x, this.target.vel.z) : 0;
    const slide = this.target.isPlayer && this.target.slideT > 0 ? 0.5 : 0;
    const e = (this.err + tvel * 0.07 + slide) * (0.35 + dist / 28);
    const pellets = d.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      _dir.set(aim.x + (Math.random() - 0.5) * 2 * e, aim.y + (Math.random() - 0.5) * 1.6 * e, aim.z + (Math.random() - 0.5) * 2 * e).sub(o);
      if (pellets > 1) {
        _dir.normalize();
        _dir.x += (Math.random() - 0.5) * d.hip * 0.017; _dir.y += (Math.random() - 0.5) * d.hip * 0.017; _dir.z += (Math.random() - 0.5) * d.hip * 0.017;
      }
      _dir.normalize();
      g.botShot(this, o, _dir.clone(), muzzle, i === 0);
    }
    this.flashT = 0.05;
    g.effects.flash(muzzle, 0.5);
    g.audio.shot(d.model, this.pos);
    g.noise(this, this.pos, 45);
  }

  hunt(dt) {
    const g = this.game, lk = this.lastKnown;
    const dist = Math.hypot(lk.x - this.pos.x, lk.z - this.pos.z);
    if (dist < 1.5) { this.target = null; this.path = null; return; }
    if (this.grenades > 0 && this.nadeCool <= 0 && dist > 9 && dist < 26 && g.time - this.lastSeenT > 1.2 && Math.random() < 0.02) {
      this.grenades--; this.nadeCool = 8;
      g.botThrow(this, lk);
    }
    this.goTo(lk.x, lk.z, dt, 1, true);
  }

  roam(dt) {
    const g = this.game;
    if (!this.goal) this.pickGoal();
    this.goTo(this.goal.x, this.goal.z, dt, 0.85, true);
    if (this.goal && Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 1.5) this.goal = null;
    if (g.uav[this.team] > 0 && Math.random() < dt * 0.5) {
      const e = g.nearestEnemy(this);
      if (e) this.hear(e, e.pos);
    }
  }

  pickGoal() {
    const g = this.game, intel = g.intel[this.team];
    const mg = g.mode.botGoal(this);
    if (mg) { this.goal = mg; this.path = null; return; }
    const r = Math.random();
    if (intel.length && r < 0.45) {
      const i = intel[Math.floor(Math.random() * intel.length)];
      this.goal = { x: i.x + (Math.random() - 0.5) * 6, z: i.z + (Math.random() - 0.5) * 6 };
    } else if (r < 0.8) {
      this.goal = interest[Math.floor(Math.random() * interest.length)];
    } else {
      this.goal = this.team === 0 ? randomWalkable(SIZE * 0.36, SIZE - 4) : randomWalkable(4, SIZE * 0.64);
    }
    this.path = null;
  }

  goTo(x, z, dt, speedMul, look) {
    const g = this.game;
    // far goals (the big maps): walk there in legs of about 80 m, each one path-found on its own
    const fx = x - this.pos.x, fz = z - this.pos.z, fd = Math.hypot(fx, fz);
    if (fd > 110) {
      const key = `${x | 0},${z | 0}`;
      if (!this.leg || this.legFor !== key || Math.hypot(this.leg.x - this.pos.x, this.leg.z - this.pos.z) < 4) {
        this.legFor = key;
        this.leg = openSpot(this.pos.x + fx * 80 / fd, this.pos.z + fz * 80 / fd) || { x: this.pos.x + fx * 80 / fd, z: this.pos.z + fz * 80 / fd };
      }
      x = this.leg.x; z = this.leg.z;
    } else this.leg = null;
    if (this.goalKey !== `${x | 0},${z | 0}` || (!this.path && (this.repathT -= dt) <= 0)) {
      this.goalKey = `${x | 0},${z | 0}`;
      if (lineWalkable(this.pos.x, this.pos.z, x, z)) { this.path = [{ x, z }]; this.pathIdx = 0; }
      else if (g.pathBudget > 0) {
        g.pathBudget--;
        this.path = findPath(this.pos.x, this.pos.z, x, z);
        this.pathIdx = 0;
        if (!this.path) { this.goal = null; this.repathT = 1; }
      } else { this.goalKey = null; return; }
    }
    if (!this.path) return;
    let wp = this.path[this.pathIdx];
    let dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.5) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; return; }
      wp = this.path[this.pathIdx];
      dx = wp.x - this.pos.x; dz = wp.z - this.pos.z; d = Math.hypot(dx, dz) || 1;
    }
    this.wish.set(dx / d * speedMul, 0, dz / d * speedMul);
    if (look) {
      if (this.target && this.game.time - this.lastSeenT < 8 && Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) < 12) this.faceToward(this.lastKnown.x, this.lastKnown.z, dt, 5);
      else this.faceToward(wp.x, wp.z, dt, 5);
      this.pitch *= 0.9;
    }
  }

  animate(dt) {
    // past the fog there is no point posing (or drawing) a soldier
    this.model.root.visible = this.camD < 330;
    if (this.model.root.visible) animateSoldier(this.model, this, dt);
  }

  remove() { this.game.scene.remove(this.model.root); }
}

