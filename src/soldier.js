// Rigged soldiers: the Mixamo-rigged "Vanguard" soldier (three.js example model) with its
// idle, walk and run clips blended by speed. On top of the clips: crouch, aim pitch through
// the spine, a real rifle at the shoulder, and two-bone IK that puts both hands on the gun.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { thirdPersonGun } from './weapons.js';

let src = null, scale = 1;
const teamMats = {};
// uniform tint per team: USA desert tan, Russia grey-green; the officer in dark service dress
const TINT = [[1.08, 0.96, 0.78], [0.74, 0.82, 0.7]];

export async function loadSoldierModel(loader) {
  src = await loader.loadAsync(`${import.meta.env.BASE_URL}models/soldier/Soldier.glb`);
  const box = new THREE.Box3().setFromObject(src.scene);
  scale = 1.8 / (box.max.y - box.min.y);
}
export const soldierReady = () => !!src;

// ---------- uniforms: camouflage printed over the suit's own shading ----------
function camoTexture(kind) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = kind === 'emr' ? 7 : 3;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (kind === 'emr') {
    // Russian EMR: small digital pixels in four greens and browns
    const cols = ['#5f6a45', '#3e4a2c', '#7a7a55', '#2a2d22', '#4f5b3a'];
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x += 4) {
      const n = Math.sin(x * 0.05 + seed) + Math.sin(y * 0.07) + Math.sin((x + y) * 0.03) + R() * 1.2;
      g.fillStyle = cols[Math.max(0, Math.min(4, Math.floor((n + 3) / 1.3)))];
      g.fillRect(x, y, 4, 4);
    }
  } else {
    // US OCP / MultiCam: tan base, soft brown and green blobs, thin dark branches
    g.fillStyle = kind === 'dark' ? '#3a3c40' : '#9c8e68'; g.fillRect(0, 0, S, S);
    const cols = kind === 'dark' ? ['#2a2c30', '#4a4c52'] : ['#7b6a48', '#6e7550', '#b3a47c', '#584c36'];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.75;
      g.beginPath(); g.ellipse(R() * S, R() * S, 8 + R() * 26, 5 + R() * 16, R() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1; g.strokeStyle = kind === 'dark' ? '#1a1b1e' : '#3e3526'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 30; y += R() * 20; g.lineTo(x, y); } g.stroke(); }
  }
  // woven fabric grain
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.08})`; g.fillRect(R() * S, R() * S, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const camoCache = {};
const camoFor = (k) => (camoCache[k] ||= camoTexture(k));

function bodyMat(team, officer) {
  const key = officer ? 'off' : team;
  if (teamMats[key]) return teamMats[key];
  let base = null;
  src.scene.traverse((o) => { if (o.isSkinnedMesh && !o.name.includes('visor')) base = o.material; });
  const m = base.clone();
  const camo = camoFor(officer ? 'dark' : team ? 'emr' : 'ocp');
  m.roughness = 0.9; m.metalness = 0.05;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCamo = { value: camo };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCamo;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        // print the pattern over the suit, keeping its shading and panel detail
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        vec3 camo = texture2D(uCamo, vMapUv * 3.0).rgb;
        diffuseColor.rgb = camo * (0.45 + lum * 1.25);`);
  };
  m.customProgramCacheKey = () => `camo${key}`;
  return (teamMats[key] = m);
}

// ---------- kit: helmet, plate carrier, pouches, pack, armband ----------
// built in the root's frame (metres, facing -z) and re-parented onto the bones
const kitMats = {};
function kitMat(team) {
  if (kitMats[team]) return kitMats[team];
  const cover = camoFor(team ? 'emr' : 'ocp');
  return (kitMats[team] = {
    cover: new THREE.MeshStandardMaterial({ map: cover, roughness: 0.92 }),
    nylon: new THREE.MeshStandardMaterial({ color: team ? 0x4a5236 : 0x8a7a58, roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1e1f, roughness: 0.6, metalness: 0.3 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.8 }),
  });
}
const rbox = (w, h, d, r = 0.015) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
function kitPart(list, bone, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true;
  list.push([bone, m]);
  return m;
}
function dressKit(m, team, officer) {
  const K = kitMat(team), b = m.bones, L = [];
  // helmet: shell, cover, rim, NVG shroud, side rails, counterweight
  const shell = new THREE.SphereGeometry(0.145, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  if (!officer) {
    const h = kitPart(L, b.Head, shell, K.cover, 0, 1.655, 0.035); h.scale.set(1.02, 0.95, 1.12);
    kitPart(L, b.Head, new THREE.TorusGeometry(0.142, 0.012, 6, 24), K.nylon, 0, 1.66, 0.035, Math.PI / 2).scale.set(1.02, 1.12, 1);
    kitPart(L, b.Head, rbox(0.05, 0.04, 0.03), K.dark, 0, 1.72, -0.115);
    for (const s of [-1, 1]) kitPart(L, b.Head, rbox(0.012, 0.03, 0.12), K.dark, 0.14 * s, 1.68, 0.03);
    kitPart(L, b.Head, rbox(0.07, 0.05, 0.03), K.nylon, 0, 1.69, 0.17);
    kitPart(L, b.Head, rbox(0.1, 0.03, 0.01), K.lens, 0, 1.6, -0.115);
  } else {
    kitPart(L, b.Head, new THREE.CylinderGeometry(0.15, 0.13, 0.08, 18), K.dark, 0, 1.73, 0.03).scale.set(1, 1, 1.15);
  }
  // plate carrier: front and back plates, cummerbund, triple mag pouch, radio, admin pouch
  if (!officer) {
    kitPart(L, b.Spine2, rbox(0.3, 0.34, 0.05), K.cover, 0, 1.33, -0.145);
    kitPart(L, b.Spine2, rbox(0.3, 0.36, 0.05), K.cover, 0, 1.34, 0.19);
    for (const s of [-1, 1]) kitPart(L, b.Spine2, rbox(0.05, 0.2, 0.3), K.nylon, 0.17 * s, 1.24, 0.02);
    for (let i = 0; i < 3; i++) kitPart(L, b.Spine2, rbox(0.075, 0.12, 0.06), K.nylon, -0.09 + i * 0.09, 1.2, -0.19);
    kitPart(L, b.Spine2, rbox(0.14, 0.08, 0.045), K.nylon, 0.04, 1.39, -0.18);
    kitPart(L, b.Spine2, rbox(0.07, 0.15, 0.05), K.nylon, -0.12, 1.34, -0.185);
    kitPart(L, b.Spine2, new THREE.CylinderGeometry(0.005, 0.005, 0.3, 4), K.dark, -0.13, 1.6, 0.2);
    // assault pack on the back
    kitPart(L, b.Spine2, rbox(0.28, 0.34, 0.14, 0.03), K.nylon, 0, 1.3, 0.28);
    kitPart(L, b.Spine2, rbox(0.22, 0.1, 0.08, 0.02), K.cover, 0, 1.2, 0.36);
  }
  // team armband (the accent material, recoloured by setRelation)
  const arm = kitPart(L, b.LeftArm, new THREE.CylinderGeometry(0.058, 0.058, 0.06, 14, 1, true), m.accent, -0.3, 1.43, 0.05, 0, 0, Math.PI / 2);
  arm.material.side = THREE.DoubleSide;
  // re-parent onto the bones, keeping each part where it was placed in the rest pose
  m.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4();
  for (const [bone, part] of L) {
    part.updateMatrix();
    inv.copy(bone.matrixWorld).invert().multiply(m.root.matrixWorld);
    part.matrix.premultiply(inv);
    part.matrix.decompose(part.position, part.quaternion, part.scale);
    bone.add(part);
  }
}

export function buildRigged(team, opts, tag) {
  const root = new THREE.Group();
  const body = SkeletonUtils.clone(src.scene);
  body.scale.setScalar(scale);
  root.add(body);
  const accent = new THREE.MeshStandardMaterial({ color: 0x3d7fe0, emissive: 0x3d7fe0, emissiveIntensity: 0.5, roughness: 0.6 });
  const K = kitMat(team);
  const bones = {};
  body.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
    if (o.isSkinnedMesh) {
      o.material = o.name.includes('visor') ? K.lens : bodyMat(team, !!opts.officer);
      o.castShadow = true; o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(body);
  const act = {};
  for (const clip of src.animations) {
    if (clip.name === 'TPose') continue;
    const a = mixer.clipAction(clip);
    a.play(); a.setEffectiveWeight(clip.name === 'Idle' ? 1 : 0);
    act[clip.name] = a;
  }
  const gun = new THREE.Group(), muzzle = new THREE.Object3D();
  gun.add(muzzle);
  root.add(gun);
  tag.position.y = 2.2;
  root.add(tag);
  const m = { rig: true, root, body, bones, mixer, act, gun, gunModel: null, muzzle, tag, accent, torso: new THREE.Object3D(), animT: 0 };
  setGun(m, 'ar');
  dressKit(m, team, !!opts.officer);
  return m;
}

function setGun(m, model) {
  if (m.gunModel === model) return;
  m.gunModel = model;
  for (const c of m.gun.children.slice()) if (c.isMesh) m.gun.remove(c);
  const g = thirdPersonGun(model);
  for (const p of g.parts) { const mesh = new THREE.Mesh(p.geometry, p.material); mesh.castShadow = true; m.gun.add(mesh); }
  m.muzzle.position.copy(g.muzzle);
  m.grip = g.grip; m.fore = g.fore;
}

// ---------- pose helpers (world space, so they work whatever the bone axes are) ----------
const _q = new THREE.Quaternion(), _w = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), E = new THREE.Vector3(), P = new THREE.Vector3(), T = new THREE.Vector3();
function applyWorld(bone, q) {
  bone.getWorldQuaternion(_w);
  bone.parent.getWorldQuaternion(_pq);
  _w.premultiply(q);
  bone.quaternion.copy(_pq.invert().multiply(_w));
  bone.updateMatrixWorld(true);
}
function turnBone(bone, axis, angle) { applyWorld(bone, _q.setFromAxisAngle(axis, angle)); }
// rotate `bone` (pivot at its origin) so the point `tip` moves toward `want`
function aimBone(bone, tip, want) {
  bone.getWorldPosition(A);
  D.subVectors(tip, A).normalize(); E.subVectors(want, A).normalize();
  applyWorld(bone, _q.setFromUnitVectors(D, E));
}
// two-bone IK: shoulder-elbow-hand to reach `target`, elbow bending toward `pole`
function ik(upper, lower, end, target, pole) {
  upper.getWorldPosition(A); lower.getWorldPosition(B); end.getWorldPosition(C);
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  const d = Math.min(A.distanceTo(target), (l1 + l2) * 0.999), dir = T.subVectors(target, A).normalize();
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))), sinA = Math.sqrt(1 - cosA * cosA);
  P.subVectors(pole, A); P.addScaledVector(dir, -P.dot(dir)).normalize();
  const elbow = E.copy(A).addScaledVector(dir, cosA * l1).addScaledVector(P, sinA * l1).clone();
  const reach = A.clone().addScaledVector(dir, d);
  aimBone(upper, B.clone(), elbow);
  lower.getWorldPosition(B); end.getWorldPosition(C);
  aimBone(lower, C.clone(), reach);
}

const RIGHT = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(), _v = new THREE.Vector3(), _pole = new THREE.Vector3();
// crouchAmt runs 0..1 for crouching and on to 2 for prone
export function animateRigged(m, s, dt) {
  if (s.def?.model) setGun(m, s.def.model);
  m.mixer.timeScale = 1;
  const p = Math.max(0, Math.min(1, s.crouchAmt - 1)), c = Math.min(1, s.crouchAmt) * (1 - p);
  const r = m.root;
  r.rotation.order = 'YXZ';
  r.position.copy(s.pos);
  if (p > 0) { r.position.x += Math.sin(s.yaw) * 0.95 * p; r.position.z += Math.cos(s.yaw) * 0.95 * p; r.position.y += 0.18 * p; }
  r.rotation.set(-p * Math.PI / 2, s.yaw, 0);

  // locomotion: idle / walk / run weights and playback speed from ground speed
  const sp = Math.hypot(s.vel.x, s.vel.z);
  const wi = Math.max(0, 1 - sp / 1.1), wr = Math.min(1, Math.max(0, (sp - 2.4) / 2.2)) * (1 - wi), ww = 1 - wi - wr;
  m.act.Idle?.setEffectiveWeight(wi);
  // clip playback matched to ground speed (walk cycle ~1.6 m/s, run ~5.2 m/s) so feet don't slide
  m.act.Walk?.setEffectiveWeight(ww); m.act.Walk?.setEffectiveTimeScale(Math.min(1.8, Math.max(0.5, sp / 1.6)));
  m.act.Run?.setEffectiveWeight(wr); m.act.Run?.setEffectiveTimeScale(Math.min(1.5, Math.max(0.6, sp / 5.2)));
  m.mixer.update(dt * (1 - 0.35 * c));

  m.body.position.y = -0.42 * c;
  r.updateMatrixWorld(true);
  RIGHT.set(1, 0, 0).applyQuaternion(r.quaternion);
  FWD.set(0, 0, -1).applyQuaternion(r.quaternion);
  const b = m.bones;
  // crouch: fold hips and knees
  if (c > 0.01) for (const side of ['Left', 'Right']) {
    turnBone(b[`${side}UpLeg`], RIGHT, 1.25 * c);
    turnBone(b[`${side}Leg`], RIGHT, -2.1 * c);
    turnBone(b[`${side}Foot`], RIGHT, 0.8 * c);
  }
  // aim: spread the pitch over the spine, a little into the head; lean rolls the chest
  const pitch = (s.pitch || 0) * (1 - p) + 0.05;
  turnBone(b.Spine, RIGHT, pitch * 0.3 + 0.12 * c);
  turnBone(b.Spine1, RIGHT, pitch * 0.35);
  turnBone(b.Spine2, RIGHT, pitch * 0.35);
  if (s.leanOff) turnBone(b.Spine1, FWD, -s.leanOff * 0.8);
  turnBone(b.Head, RIGHT, -pitch * 0.15);

  // rifle: stock in the right shoulder, pointing where the chest points
  b.RightShoulder.getWorldPosition(_v);
  r.worldToLocal(_v);
  m.gun.position.set(_v.x - 0.02, _v.y - 0.06, _v.z - 0.02);
  m.gun.rotation.set(pitch, 0, 0, 'YXZ');
  m.gun.rotation.z = -(s.leanOff || 0) * 0.8;
  m.gun.translateZ(-0.2);
  m.gun.updateMatrixWorld(true);
  // hands on the gun
  const grip = _v.copy(m.grip).applyMatrix4(m.gun.matrixWorld).clone(), fore = D.copy(m.fore).applyMatrix4(m.gun.matrixWorld).clone();
  b.RightArm.getWorldPosition(_pole); _pole.addScaledVector(UP, -1).addScaledVector(RIGHT, 0.6).addScaledVector(FWD, -0.3);
  ik(b.RightArm, b.RightForeArm, b.RightHand, grip, _pole.clone());
  b.LeftArm.getWorldPosition(_pole); _pole.addScaledVector(UP, -1).addScaledVector(RIGHT, -0.5);
  ik(b.LeftArm, b.LeftForeArm, b.LeftHand, fore, _pole.clone());
  m.tag.position.y = 2.2 - 0.5 * c - 1.2 * p;
}

// thermal camera: every soldier's suit glows white-hot while it is on
let thermalOn = false;
export function setThermal(on) {
  if (on === thermalOn) return;
  thermalOn = on;
  for (const m of Object.values(teamMats)) { m.emissive.set(on ? 0xffffff : 0x000000); m.emissiveIntensity = on ? 1.6 : 1; }
}
