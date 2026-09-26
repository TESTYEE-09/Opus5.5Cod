// Loads the Poly Haven scans listed in assetlist.js: PBR texture sets for world materials
// and glTF props. Anything that fails to load is skipped and the procedural version is used.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEXTURES, MODELS } from './assetlist.js';

const base = import.meta.env.BASE_URL;
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
let anisotropy = 8;
export const setAssetAnisotropy = (a) => { anisotropy = a; };

function tex(url, srgb) {
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

// the scanned texture set for a material name (or 'ground:<recipe>'), or null
export function pbrSet(name) {
  const d = TEXTURES[name];
  if (!d || !ready.tex.has(d.id)) return null;
  if (!texCache.has(d.id)) {
    const p = `${base}tex/${d.id}`;
    texCache.set(d.id, { map: tex(`${p}_diff.jpg`, true), normalMap: tex(`${p}_nor.jpg`, false), arm: tex(`${p}_arm.jpg`, false) });
  }
  return texCache.get(d.id);
}

// Applies a scanned set to a standard material: colour, normal, and the ARM map as
// ambient occlusion + roughness (+ metalness when the material is metallic).
export function applyPbr(mat, set, { metal = 0 } = {}) {
  mat.map = set.map; mat.normalMap = set.normalMap;
  mat.aoMap = set.arm; mat.aoMapIntensity = 0.8;
  mat.roughnessMap = set.arm; mat.roughness = 1;
  if (metal > 0) { mat.metalnessMap = set.arm; mat.metalness = 1; }
  mat.needsUpdate = true;
  return mat;
}

// type -> { parts: [{ geometry, material }], size }, sitting on y = 0 and centred
export const models = {};
const ready = { tex: new Set() };

async function loadModel(type, d, loader) {
  const gltf = await loader.loadAsync(`${base}models/${d.id}/${d.id}.gltf`);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'tangent'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const parts = [], box = new THREE.Box3();
  for (const [mat, geos] of byMat) {
    const g = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    if (!g) continue;
    if (d.lay) g.rotateX(-Math.PI / 2);
    g.computeBoundingBox();
    box.union(g.boundingBox);
    for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap]) if (t) t.anisotropy = anisotropy;
    parts.push({ geometry: g, material: mat });
  }
  // sit on y = 0, centred in x and z
  const c = box.getCenter(new THREE.Vector3());
  for (const p of parts) p.geometry.translate(-c.x, -box.min.y, -c.z);
  models[type] = { parts, size: box.getSize(new THREE.Vector3()) };
}

async function probe(id) {
  const r = await fetch(`${base}tex/${id}_diff.jpg`, { method: 'HEAD' }).catch(() => null);
  if (r?.ok) ready.tex.add(id);
}

// Loads everything; onProgress(0..1). Never rejects.
export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  const jobs = [
    ...[...new Set(Object.values(TEXTURES).map(t => t.id))].map(id => () => probe(id)),
    ...Object.entries(MODELS).map(([type, d]) => () => loadModel(type, d, loader)),
  ];
  let done = 0;
  await Promise.all(jobs.map(j => j().catch((e) => console.warn('asset failed', e)).finally(() => onProgress(++done / jobs.length))));
}

// Places scanned props: one InstancedMesh per model part for a list of placements
// { type, x, y, z, rot, s }. Returns the meshes.
export function instanceProps(list) {
  const byType = {};
  for (const p of list) (byType[p.type] ||= []).push(p);
  const out = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [type, ps] of Object.entries(byType)) {
    const md = models[type];
    for (const part of md.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, ps.length);
      ps.forEach((p, i) => {
        const s = p.s || 1;
        m.compose(v.set(p.x, p.y || 0, p.z), q.setFromEuler(e.set(p.tilt || 0, p.rot || 0, 0, 'YXZ')), sc.set(p.sx || s, s, p.sz || s));
        im.setMatrixAt(i, m);
      });
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      out.push(im);
    }
  }
  return out;
}
