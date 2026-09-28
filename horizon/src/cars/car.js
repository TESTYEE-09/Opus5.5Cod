// The visual car: body LODs (opaque + glass), wheels, cabin, contact shadow and lights.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadBody } from './bodymesh.js';
import { createBodyMaterials, setPaint } from './paint.js';
import { buildWheel } from './wheels.js';

let carbonTex = null, shadowTex = null;
export function carTextures(loader) {
  if (!carbonTex) {
    carbonTex = loader.load('../hz/tex/carbon.png');
    carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping;
    carbonTex.anisotropy = 8;
  }
  return carbonTex;
}

function contactShadow() {
  if (shadowTex) return shadowTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // rounded-rectangle falloff
    const u = Math.abs(x / S * 2 - 1), v = Math.abs(y / S * 2 - 1);
    const d = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25);
    const a = Math.max(0, Math.min(1, (1 - d) / 0.45));
    img.data[(y * S + x) * 4 + 3] = Math.round(255 * Math.pow(a, 1.6) * 0.92);
  }
  g.putImageData(img, 0, 0);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

const interiorMats = {};
const imat = (k, color, rough = 0.7, metal = 0) => (interiorMats[k] ??= new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));

function buildCabin(def) {
  const d = def.dims, I = def.interior ?? {};
  const g = new THREE.Group();
  const seatZ = I.seatZ ?? -0.1, seatX = I.seatX ?? 0.36, hip = I.hip ?? 0.28, dashZ = I.dashZ ?? seatZ + 0.95;
  const leather = imat(`seat${I.seatColor ?? 0x1a1a1c}`, I.seatColor ?? 0x1a1a1c, 0.6);
  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.12, 0.5, 2, 0.04), leather);
    base.position.set(side * seatX, hip + 0.02, seatZ + 0.05);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.62, 0.12, 2, 0.05), leather);
    back.position.set(side * seatX, hip + 0.32, seatZ - 0.22); back.rotation.x = -0.28;
    g.add(base, back);
  }
  const dash = new THREE.Mesh(new RoundedBoxGeometry(d.wid * 0.78, 0.2, 0.42, 2, 0.06), imat('dash', 0x141416, 0.8));
  dash.position.set(0, (def.dims.belt ?? 0.85) - 0.08, dashZ);
  g.add(dash);
  const console_ = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.22, 0.9, 2, 0.04), imat('dash', 0x141416, 0.8));
  console_.position.set(0, hip + 0.02, seatZ + 0.35);
  g.add(console_);
  // steering wheel (left-hand drive unless the car says otherwise)
  const sx = (I.rhd ? -1 : 1) * seatX;
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 32), imat('wheel', 0x0c0c0c, 0.5));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), imat('wheel', 0x0c0c0c, 0.5));
  hub.rotation.x = Math.PI / 2;
  wheel.add(rim, hub);
  wheel.position.set(sx, (def.dims.belt ?? 0.85) - 0.1, dashZ - 0.3);
  wheel.rotation.x = -0.45 + Math.PI;
  g.add(wheel);
  // driver: helmet, torso, arms
  const suit = imat('suit', I.suit ?? 0x1c2330, 0.8);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), suit);
  torso.position.set(sx, hip + 0.38, seatZ - 0.1); torso.rotation.x = -0.25;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), new THREE.MeshPhysicalMaterial({ color: I.helmet ?? 0xf2f2f2, roughness: 0.25, clearcoat: 1 }));
  helmet.position.set(sx, hip + 0.72, seatZ - 0.04);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.137, 20, 10, -0.9, 1.8, 1.1, 0.7), imat('visor', 0x050505, 0.05, 0.6));
  visor.position.copy(helmet.position); visor.rotation.y = Math.PI / 2 + Math.PI / 2;
  g.add(torso, helmet, visor);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.42, 4, 8), suit);
    arm.position.set(sx + s * 0.16, hip + 0.45, seatZ + 0.2);
    arm.rotation.x = Math.PI / 2 - 0.5; arm.rotation.z = -s * 0.2;
    g.add(arm);
  }
  g.userData.steer = wheel;
  return g;
}

export class CarVisual {
  constructor(def, opts = {}) {
    this.def = def;
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.name = def.id;
    this.wheels = [];
    this.ready = this.load();
  }

  async load() {
    const def = this.def, d = def.dims, o = this.opts;
    const body = await loadBody(def.id);
    this.mats = createBodyMaterials(def, { carbonTex: o.carbonTex });
    const P = def.paint ?? {};
    setPaint(this.mats.uniforms, o.color ?? P.color ?? 0xb00000, o.finish ?? P.finish ?? 'metallic', o.color2 ?? P.color2 ?? 0x111111);
    const lod = new THREE.LOD();
    const dists = o.lodDistances ?? [0, 30, 90];
    const M = body.meshes;
    for (let i = 0; i < M.body.length; i++) {
      const grp = new THREE.Group();
      const add = (geo, glass, cabin) => {
        const m = new THREE.Mesh(geo, cabin ? this.mats.cabin : this.mats.opaque);
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
        if (glass) { const g = new THREE.Mesh(geo, this.mats.glass); g.renderOrder = 2; grp.add(g); }
      };
      add(M.body[i], !M.cabin, false);
      if (M.cabin) add(M.cabin[i], true, true);
      if (M.parts) add(M.parts[i], false, false);
      lod.addLevel(grp, dists[i]);
    }
    this.lod = lod;
    this.group.add(lod);
    // wheels
    const W = def.wheels ?? {};
    const rimF = W.rimF ?? d.rF * 0.74, rimR = W.rimR ?? d.rR * 0.74;
    const place = [
      [d.trackF / 2, d.rF, d.wb / 2, d.rF, d.wF, rimF, true],
      [-d.trackF / 2, d.rF, d.wb / 2, d.rF, d.wF, rimF, true],
      [d.trackR / 2, d.rR, -d.wb / 2, d.rR, d.wR, rimR, false],
      [-d.trackR / 2, d.rR, -d.wb / 2, d.rR, d.wR, rimR, false],
    ];
    for (const [x, y, z, r, w, rim, front] of place) {
      const wh = buildWheel({ r, w, rim, style: o.rim ?? W.style ?? 'spoke5', color: o.rimColor ?? W.color ?? 0xb8bcc2, finish: W.finish, caliper: o.caliper ?? W.caliper ?? 0xcc1010, lip: W.lip });
      const holder = new THREE.Group();
      holder.position.set(x, y, z);
      if (x < 0) wh.scale.x = -1;
      holder.add(wh);
      holder.userData = { base: new THREE.Vector3(x, y, z), front, wheel: wh };
      this.group.add(holder);
      this.wheels.push(holder);
    }
    // cabin
    this.cabin = buildCabin(def);
    this.group.add(this.cabin);
    // contact shadow
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(d.wid * 1.25, d.len * 1.12), new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.85 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012; sh.renderOrder = 1;
    this.shadow = sh;
    this.group.add(sh);
    return this;
  }

  setPaint(color, finish, color2) { setPaint(this.mats.uniforms, color, finish, color2); }

  setLights({ head = 0, tail = 0, brake = 0, reverse = 0 }) {
    this.mats.uniforms.uLights.value.set(head, tail, brake, reverse);
  }

  // real headlight beams for the player's car
  addHeadlights(shadows = false) {
    const d = this.def.dims;
    this.beams = [];
    for (const s of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff4e6, 0, 120, 0.42, 0.55, 1.4);
      l.position.set(s * d.wid * 0.36, 0.62, d.len / 2 - 0.15);
      l.target.position.set(s * d.wid * 0.3, 0.0, d.len / 2 + 25);
      l.castShadow = shadows && s === 1;
      this.group.add(l, l.target);
      this.beams.push(l);
    }
  }

  // wheel state: spin angle per wheel, steer angle (front), suspension offsets
  updateWheels(spin, steer, susp) {
    for (let i = 0; i < 4; i++) {
      const h = this.wheels[i];
      const u = h.userData;
      h.position.y = u.base.y + (susp ? susp[i] : 0);
      h.rotation.y = u.front ? steer : 0;
      u.wheel.userData.spin.rotation.x = (u.base.x < 0 ? -1 : 1) * 0 + spin[i];
    }
    if (this.cabin?.userData.steer) this.cabin.userData.steer.rotation.z = -steer * 8;
  }
}
