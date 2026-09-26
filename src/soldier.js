// Rigged soldiers: the Mixamo-rigged "Vanguard" soldier (three.js example model) with its
// idle, walk and run clips blended by speed. On top of the clips: crouch, aim pitch through
// the spine, a real rifle at the shoulder, and two-bone IK that puts both hands on the gun.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
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

function bodyMat(team, officer) {
  const key = officer ? 'off' : team;
  if (teamMats[key]) return teamMats[key];
  let base = null;
  src.scene.traverse((o) => { if (o.isSkinnedMesh && !o.name.includes('visor')) base = o.material; });
  const m = base.clone();
  m.color.setRGB(...(officer ? [0.5, 0.5, 0.56] : TINT[team] || TINT[0]));
  return (teamMats[key] = m);
}

export function buildRigged(team, opts, tag) {
  const root = new THREE.Group();
  const body = SkeletonUtils.clone(src.scene);
  body.scale.setScalar(scale);
  root.add(body);
  const accent = new THREE.MeshStandardMaterial({ color: 0x3d7fe0, emissive: 0x3d7fe0, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.4 });
  const bones = {};
  body.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
    if (o.isSkinnedMesh) {
      o.material = o.name.includes('visor') ? accent : bodyMat(team, !!opts.officer);
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
  m.act.Walk?.setEffectiveWeight(ww); m.act.Walk?.setEffectiveTimeScale(Math.min(1.6, Math.max(0.5, sp / 1.5)));
  m.act.Run?.setEffectiveWeight(wr); m.act.Run?.setEffectiveTimeScale(Math.min(1.4, Math.max(0.7, sp / 5)));
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
