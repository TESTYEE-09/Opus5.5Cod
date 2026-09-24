import * as THREE from 'three';
import { moveBody, findPath, lineWalkable, overlaps, interest, randomWalkable, lineOfSight, SIZE, STEP } from './world.js';
import { WEAPONS } from './weapons.js';

export const DIFFICULTY = {
  recruit: { name: 'Recruit', react: 0.8, err: 1.6, min: 0.45, learn: 0.6, turn: 3.5, dmg: 0.6, head: 0.03 },
  regular: { name: 'Regular', react: 0.5, err: 1.2, min: 0.28, learn: 0.9, turn: 5.5, dmg: 0.8, head: 0.1 },
  veteran: { name: 'Veteran', react: 0.3, err: 0.9, min: 0.14, learn: 1.4, turn: 8, dmg: 1, head: 0.25 },
};

const KITS = [['ar', 0.45], ['smg', 0.25], ['lmg', 0.08], ['shotgun', 0.1], ['sniper', 0.12]];
function pickKit() {
  let r = Math.random();
  for (const [k, w] of KITS) if ((r -= w) <= 0) return k;
  return 'ar';
}

const TEAM_LOOK = [
  { uni: 0x6b6a4a, vest: 0x4d5034, helmet: 0x5a5c3e, accent: 0x3d7fe0, pants: 0x5e5d44 },
  { uni: 0x505358, vest: 0x383a3e, helmet: 0x2c2e31, accent: 0xd0342a, pants: 0x45474c },
];

const geoCache = {};
const box = (w, h, d) => (geoCache[`${w},${h},${d}`] ||= new THREE.BoxGeometry(w, h, d));

function mesh(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
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

export function buildSoldier(team, name) {
  const L = TEAM_LOOK[team];
  const mat = (c, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const uni = mat(L.uni), vest = mat(L.vest), helmet = mat(L.helmet, 0.7), pants = mat(L.pants);
  const skin = mat(new THREE.Color().setHSL(0.07, 0.35, 0.35 + Math.random() * 0.25));
  const boot = mat(0x1c1a17), gun = mat(0x222324, 0.5);
  const accent = new THREE.MeshStandardMaterial({ color: L.accent, emissive: L.accent, emissiveIntensity: 0.35 });

  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.11 * side, 0, 0); hips.add(leg);
    mesh(leg, box(0.17, 0.48, 0.19), pants, 0, -0.23, 0);
    const shin = new THREE.Group(); shin.position.y = -0.46; leg.add(shin);
    mesh(shin, box(0.15, 0.44, 0.17), pants, 0, -0.2, 0);
    mesh(shin, box(0.16, 0.1, 0.28), boot, 0, -0.44, -0.04);
    legs.push({ leg, shin });
  }
  const torso = new THREE.Group(); hips.add(torso);
  mesh(torso, box(0.42, 0.56, 0.25), uni, 0, 0.3, 0);
  mesh(torso, box(0.46, 0.38, 0.3), vest, 0, 0.33, 0);
  mesh(torso, box(0.32, 0.36, 0.14), vest, 0, 0.33, 0.21);
  mesh(torso, box(0.3, 0.1, 0.06), vest, 0, 0.22, -0.17);
  const head = new THREE.Group(); head.position.y = 0.62; torso.add(head);
  mesh(head, box(0.2, 0.24, 0.22), team ? mat(0x151515) : skin, 0, 0.12, 0);
  if (team) mesh(head, box(0.16, 0.05, 0.02), skin, 0, 0.15, -0.105);
  mesh(head, box(0.26, 0.12, 0.28), helmet, 0, 0.27, 0);
  mesh(head, box(0.22, 0.04, 0.24), helmet, 0, 0.34, 0);
  if (!team) mesh(head, box(0.2, 0.05, 0.03), mat(0x111111, 0.3), 0, 0.2, -0.12);
  mesh(torso, box(0.24, 0.07, 0.24), accent, 0, 0.58, 0);

  const arms = new THREE.Group(); arms.position.set(0, 0.5, 0); torso.add(arms);
  const upR = mesh(arms, box(0.12, 0.12, 0.34), uni, 0.25, -0.06, -0.1); upR.rotation.x = 0.5;
  mesh(arms, box(0.13, 0.06, 0.13), accent, 0.25, 0.0, -0.02);
  mesh(arms, box(0.1, 0.1, 0.34), uni, 0.18, -0.18, -0.32);
  const upL = mesh(arms, box(0.12, 0.12, 0.36), uni, -0.22, -0.08, -0.2); upL.rotation.set(0.3, 0.45, 0);
  mesh(arms, box(0.1, 0.1, 0.34), uni, -0.07, -0.13, -0.45).rotation.y = 0.3;
  const rifle = new THREE.Group(); rifle.position.set(0.08, -0.14, -0.4); arms.add(rifle);
  mesh(rifle, box(0.07, 0.1, 0.6), gun, 0, 0, 0);
  mesh(rifle, box(0.04, 0.16, 0.07), gun, 0, -0.1, 0.05);
  mesh(rifle, box(0.04, 0.04, 0.3), gun, 0, 0.01, -0.42);
  mesh(rifle, box(0.06, 0.1, 0.22), gun, 0, -0.02, 0.38);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -0.6); rifle.add(muzzle);

  const tag = nameTag(name, '#7fb4ff');
  tag.position.y = 2.2;
  root.add(tag);
  return { root, hips, legs, torso, head, arms, muzzle, tag, accent };
}

// Accent colour and name tag depend on which side the local player is on.
export function setRelation(m, ally) {
  const c = ally ? 0x3d7fe0 : 0xd0342a;
  m.accent.color.setHex(c);
  m.accent.emissive.setHex(c);
  m.tag.visible = ally;
}

export function animateSoldier(m, s, dt) {
  m.root.position.copy(s.pos);
  m.root.rotation.set(0, s.yaw, 0);
  const sp = Math.hypot(s.vel.x, s.vel.z);
  s.walkPhase += sp * dt * 2.6;
  const amp = Math.min(1, sp / 4) * (1 - s.crouchAmt * 0.6);
  const c = s.crouchAmt;
  m.hips.position.y = 0.95 - 0.38 * c;
  for (let i = 0; i < 2; i++) {
    const w = Math.sin(s.walkPhase + i * Math.PI);
    const crouchLeg = i === 0 ? [1.2, -1.7] : [0.3, -1.9];
    m.legs[i].leg.rotation.x = w * 0.7 * amp + crouchLeg[0] * c;
    m.legs[i].shin.rotation.x = -Math.max(0, -Math.cos(s.walkPhase + i * Math.PI)) * 0.9 * amp + crouchLeg[1] * c;
  }
  m.torso.rotation.x = s.pitch * 0.8 + 0.08 * c;
  m.hips.position.y += Math.abs(Math.sin(s.walkPhase)) * 0.04 * amp;
  m.tag.position.y = 2.2 - 0.5 * c;
}

export function animateDeath(m, s, dt) {
  s.deathT += dt;
  const f = Math.min(1, s.deathT / 0.5);
  m.root.rotation.x = -f * f * 1.45 * s.fallDir;
  m.root.position.y = s.pos.y + 0.1 * f;
  if (s.deathT > 3.5) m.root.position.y = s.pos.y - (s.deathT - 3.5) * 0.4;
  if (s.deathT > 4.5) m.root.visible = false;
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Bot {
  constructor(game, team, name) {
    this.game = game;
    this.team = team;
    this.name = name;
    this.isPlayer = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.body = { pos: this.pos, vel: this.vel, r: 0.35, h: 1.75, onGround: true };
    this.model = buildSoldier(team, name);
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
    this.path = null; this.pathIdx = 0; this.goal = null; this.goalKey = null; this.repathT = 0;
    this.senseT = Math.random() * 0.2;
    this.stuckT = 0; this.stuckPos = new THREE.Vector3().copy(this.pos);
    this.grenades = 1; this.nadeCool = 3;
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
    if (!attacker || attacker === this || !attacker.alive || attacker.isVehicle) return;
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
    this.respawnT = 4 + Math.random() * 1.5;
  }

  sense() {
    const g = this.game;
    const eye = this.eye(_a);
    let best = null, bestScore = Infinity;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    for (const e of g.targetsFor(this.team)) {
      const p = e.aimPoint(_b, false);
      const dx = p.x - eye.x, dz = p.z - eye.z;
      const dist = Math.hypot(dx, dz, p.y - eye.y);
      if (dist > (e.isVehicle ? 70 : 85)) continue;
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

    this.wish = this.wish || new THREE.Vector3();
    this.wish.set(0, 0, 0);
    let speed = 4.6 * this.def.speed;
    let crouch = false;

    const danger = g.dangerNear(this, 6);
    if (danger) {
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

    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      if (wl > 0.3 && this.pos.distanceTo(this.stuckPos) < 0.6) { this.path = null; this.goal = null; this.strafeDir = -this.strafeDir; }
      this.stuckT = 0; this.stuckPos.copy(this.pos);
    }

    this.animate(dt);
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

    this.err = Math.max(D.min, this.err * Math.exp(-D.learn * dt));
    this.reactT -= dt;

    if (this.mag <= 0 && this.reloadT <= 0) this.reloadT = this.def.reload * 1.15;
    if (this.reloadT <= 0 && this.reactT <= 0 && facing < 0.25) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        if (this.burst <= 0) {
          const d = this.def;
          this.burst = d.auto ? 3 + Math.floor(Math.random() * (dist < 15 ? 8 : 4)) : 1;
          this.fireT = d.scope ? 1.1 + Math.random() * 1.2 : d.auto ? 0.15 + Math.random() * 0.45 : 0.25 + Math.random() * 0.5;
          if (d.model === 'pistol' || d.model === 'shotgun') this.fireT = 60 / d.rpm + Math.random() * 0.4;
        } else {
          this.shoot(aim, dist);
          this.burst--;
          this.fireT = 60 / this.def.rpm;
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
    if (Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 1.5) this.goal = null;
    if (g.uav[this.team] > 0 && Math.random() < dt * 0.5) {
      const e = g.nearestEnemy(this);
      if (e) this.hear(e, e.pos);
    }
  }

  pickGoal() {
    const g = this.game, intel = g.intel[this.team];
    const r = Math.random();
    if (intel.length && r < 0.45) {
      const i = intel[Math.floor(Math.random() * intel.length)];
      this.goal = { x: i.x + (Math.random() - 0.5) * 6, z: i.z + (Math.random() - 0.5) * 6 };
    } else if (r < 0.8) {
      this.goal = interest[Math.floor(Math.random() * interest.length)];
    } else {
      this.goal = this.team === 0 ? randomWalkable(30, SIZE - 4) : randomWalkable(4, 50);
    }
    this.path = null;
  }

  goTo(x, z, dt, speedMul, look) {
    const g = this.game;
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

  animate(dt) { animateSoldier(this.model, this, dt); }

  remove() { this.game.scene.remove(this.model.root); }
}

