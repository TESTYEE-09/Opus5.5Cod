// Maps made from a whole mesh scene: the downloaded Bistro, and Downtown built from Poly Haven kits. Collision is a small JSON file loaded
// up front with the other assets, so a match can always start; the GLB (tens of MB) is fetched
// the first time the map is picked and dropped into the world when it arrives.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const base = import.meta.env.BASE_URL;
export const SCENES = {
  bistro: { glb: 'models/bistro/bistro.glb', collision: 'models/bistro/collision.json' },
  downtown: { glb: 'models/downtown/downtown.glb', collision: 'models/downtown/collision.json' },
};
const data = {}, models = {}, waits = {};
let loader = null;

export async function loadSceneData() {
  await Promise.all(Object.entries(SCENES).map(async ([id, s]) => {
    try { data[id] = await (await fetch(base + s.collision)).json(); } catch { data[id] = null; }
  }));
}
export const sceneData = (id) => data[id];
export const sceneModel = (id) => models[id] || null;

// resolves with the scene's root; onProgress(fraction) while it downloads
export function loadSceneModel(id, onProgress = () => {}) {
  if (models[id]) return Promise.resolve(models[id]);
  if (waits[id]) return waits[id];
  loader ||= new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(`${base}draco/`));
  waits[id] = loader.loadAsync(base + SCENES[id].glb, (e) => { if (e.total) onProgress(e.loaded / e.total); })
    .then((g) => { prep(g.scene); models[id] = g.scene; return g.scene; })
    .catch((e) => { delete waits[id]; throw e; });
  return waits[id];
}

// Leaves and hedges are alpha-tested cards, glass is see-through, everything else casts and
// takes shadows. The scene never moves, so matrices are baked once.
function prep(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material, n = (m.name || '').toLowerCase();
    if (/foliage|leaves|ivy|hedge|doublesided/.test(n)) {
      Object.assign(m, { alphaTest: 0.45, transparent: false, depthWrite: true, side: THREE.DoubleSide });
    } else if (/glass/.test(n)) {
      Object.assign(m, { transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.06, metalness: 0.3 });
      o.castShadow = false;
    } else if (m.transparent) {
      Object.assign(m, { transparent: false, alphaTest: 0.4 });
    }
    m.envMapIntensity = 0.9;
    m.needsUpdate = true;
  });
  root.updateMatrixWorld(true);
  root.traverse((o) => { o.matrixAutoUpdate = false; });
}
