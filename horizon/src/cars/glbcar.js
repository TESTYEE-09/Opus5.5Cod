// Cars built from imported models (public/hz/models/<id>.glb, made by tools/horizon/importcars.mjs).
// The GLB holds a body node plus wheel_xx / caliper_xx nodes pivoted on the axle centres.
// Paint materials are swapped for a clearcoat material the player can recolour; lamp
// materials are hooked up to the light state.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function loadModel(id, base = '../hz/models/') {
  if (!cache.has(id)) {
    cache.set(id, Promise.all([
      loader.loadAsync(`${base}${id}.glb`),
      fetch(`${base}${id}.json`).then((r) => r.json()),
    ]));
  }
  return cache.get(id);
}

const QUADS = ['fl', 'fr', 'rl', 'rr'];

export class GlbCar {
  constructor(def, opts = {}) {
    this.def = def;
    this.opts = opts;
    this.group = new THREE.Group();
    this.wheels = [];
    this.lamps = { head: [], tail: [], brake: [], reverse: [], drl: [] };
    this.ready = this.load();
  }

  async load() {
    const def = this.def, o = this.opts;
    // opponents and traffic use the lighter LOD model
    const [gltf, meta] = await loadModel(o.lod ? `${def.model}_lod` : def.model);
    this.meta = meta;
    const src = gltf.scene.clone(true);
    const m = def.materials ?? {};
    const paintRe = m.paint ?? /paint/i;
    const paintMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03 });
    this.paint = paintMat;
    const matCache = new Map();
    src.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const out = mats.map((mat) => {
        const name = mat.name ?? '';
        if (matCache.has(mat)) return matCache.get(mat);
        let r = mat;
        if (paintRe.test(name) && !(m.notPaint && m.notPaint.test(name))) {
          r = paintMat;
        } else {
          r = mat.clone();
          if (m.glass && m.glass.test(name)) {
            r = new THREE.MeshPhysicalMaterial({ color: 0x0a0c0e, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.55, envMapIntensity: 1.4, depthWrite: false });
            obj.renderOrder = 2;
          }
          for (const k of Object.keys(this.lamps)) {
            if (m[k] && m[k].test(name)) {
              r = mat.clone();
              r.emissive = new THREE.Color(k === 'tail' || k === 'brake' ? 0xff1a0a : 0xfff4e8);
              r.emissiveIntensity = 0;
              if (r.transparent) { r.opacity = Math.max(r.opacity, 0.6); }
              this.lamps[k].push(r);
            }
          }
          const tw = def.tweak?.[name];
          if (tw) { if (tw.color !== undefined) r.color = new THREE.Color(tw.color); if (tw.metalness !== undefined) r.metalness = tw.metalness; if (tw.roughness !== undefined) r.roughness = tw.roughness; }
          if (r.isMeshStandardMaterial && r.envMapIntensity !== undefined) r.envMapIntensity = 1.0;
        }
        matCache.set(mat, r);
        return r;
      });
      obj.material = Array.isArray(obj.material) ? out : out[0];
    });
    // find body and wheel nodes
    const root = src.getObjectByName(def.model) ?? src;
    this.group.add(root);
    QUADS.forEach((q) => {
      const w = root.getObjectByName(`wheel_${q}`);
      const c = root.getObjectByName(`caliper_${q}`);
      if (!w) return;
      // holder at the axle centre: steering yaw on the holder, spin on the wheel inside it
      const holder = new THREE.Group();
      holder.position.copy(w.position);
      w.position.set(0, 0, 0);
      root.add(holder);
      holder.add(w);
      if (c) { c.position.set(0, 0, 0); holder.add(c); }
      holder.userData = { base: holder.position.clone(), front: q[0] === 'f', wheel: w };
      this.wheels.push(holder);
    });
    this.setPaint(o.color ?? def.paint?.color ?? 0xb00000, o.finish ?? def.paint?.finish ?? 'metallic');
    return this;
  }

  setPaint(color, finish = 'metallic') {
    const p = this.paint;
    p.color.set(color);
    const F = { gloss: [0, 0.28], metallic: [0.55, 0.3], pearl: [0.35, 0.26], matte: [0.25, 0.55], chrome: [1, 0.05], tintcoat: [0.45, 0.25] }[finish] ?? [0.5, 0.3];
    p.metalness = F[0]; p.roughness = F[1];
    p.clearcoat = finish === 'matte' ? 0 : 1;
  }

  setLights({ head = 0, tail = 0, brake = 0, reverse = 0 }) {
    for (const m of this.lamps.head) m.emissiveIntensity = head * 6;
    for (const m of this.lamps.drl) m.emissiveIntensity = 3;
    for (const m of this.lamps.tail) m.emissiveIntensity = tail * 2.5 + brake * 6;
    for (const m of this.lamps.brake) m.emissiveIntensity = brake * 8 + tail * 1.2;
    for (const m of this.lamps.reverse) m.emissiveIntensity = reverse * 5;
  }

  updateWheels(spin, steer, susp) {
    for (let i = 0; i < this.wheels.length; i++) {
      const h = this.wheels[i], u = h.userData;
      h.position.y = u.base.y + (susp ? susp[i] : 0);
      h.rotation.y = u.front ? steer : 0;
      u.wheel.rotation.x = spin[i];
    }
  }
}
