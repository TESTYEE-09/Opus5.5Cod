// Real scanned PBR props (CC0, Poly Haven) baked into small meshopt GLBs by
// tools/build-models.mjs. Every file is flattened into a list of {geometry, material} parts
// in a shared space: centred on x/z, sitting on y = 0, scaled so the model is the height the
// game expects. The map builder then stamps them out as InstancedMesh, so a hundred barrels
// still cost one draw call each.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// name → the size the game wants the model to be: a height in metres, or ['x'|'y'|'z', size]
// when some other axis is the one that should match (a sprawling shrub is sized by its spread,
// not its height). null keeps the model at the size it was scanned.
export const MODELS = {
  barrel_03: 0.92,
  concrete_road_barrier: 0.82,
  concrete_road_barrier_02: 0.9,
  old_tyre: null,
  ammo_box: 0.34,
  medical_box: ['x', 0.42],
  wooden_military_crate: 0.45,
  wooden_crate_02: 0.5,
  plastic_crate_01: 0.42,
  plastic_crate_02: 0.4,
  cardboard_box_01: 0.42,
  metal_jerrycan_green: 0.46,
  metal_jerrycan: 0.46,
  cement_bag: null,
  fire_hydrant: ['y', 0.78],
  metal_trash_can: ['z', 0.58],
  street_lamp_01: null,
  utility_box_01: 1.1,
  propane_tank: 1.25,
  small_lpg_tank: 0.62,
  ladder_sectioned_01: null,
  shrub_03: ['x', 1.4],
  tree_stump_01: ['x', 1.5],
  stone_01: ['x', 0.7],
};

const parts = new Map();
const sizes = new Map();

export const modelParts = (name) => parts.get(name);
export const modelSize = (name) => sizes.get(name);
export const modelsReady = () => parts.size > 0;

const _m = new THREE.Matrix4();

// Pull every mesh out of the loaded scene, bake the node transforms into the geometry and
// normalise the result so the prop stands on the origin at the height the game asked for.
function flatten(root, fit) {
  const raw = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'tangent'].includes(k)) g.deleteAttribute(k);
    raw.push({ geometry: g, material: o.material });
  });
  if (!raw.length) return null;
  const box = new THREE.Box3();
  for (const p of raw) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const size = box.getSize(new THREE.Vector3());
  const [axis, want] = Array.isArray(fit) ? fit : ['y', fit];
  const s = want ? want / Math.max(size[axis], 1e-4) : 1;
  const c = box.getCenter(new THREE.Vector3());
  _m.makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  for (const p of raw) { p.geometry.applyMatrix4(_m); p.geometry.computeBoundingSphere(); }
  return { raw, size: size.multiplyScalar(s) };
}

function dressMaterial(mat, anisotropy) {
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
    const t = mat[key];
    if (t) { t.anisotropy = anisotropy; t.needsUpdate = true; }
  }
  mat.envMapIntensity = 1;
  // scans are exported double-sided out of caution; single-sided halves the fragment work
  if (mat.alphaTest === 0 && !mat.transparent) mat.side = THREE.FrontSide;
  return mat;
}

let pending = null;

// Resolves once every prop model is in memory. Failures are non-fatal: a model that does not
// load simply has no parts, and the caller falls back to its built-from-boxes version.
export function loadModels(base, anisotropy = 8) {
  if (pending) return pending;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  pending = Promise.all(Object.entries(MODELS).map(([name, fit]) => new Promise((done) => {
    loader.load(`${base}models/${name}.glb`, (gltf) => {
      const out = flatten(gltf.scene, fit);
      if (out) {
        for (const p of out.raw) dressMaterial(p.material, anisotropy);
        parts.set(name, out.raw);
        sizes.set(name, out.size);
      }
      done();
    }, undefined, () => { console.warn('model missing:', name); done(); });
  })));
  return pending;
}
