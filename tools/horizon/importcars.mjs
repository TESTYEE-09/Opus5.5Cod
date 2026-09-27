// Imports licensed car models (Sketchfab exports and the like) into game-ready GLBs.
//
//   cd tools/horizon && npm i && node importcars.mjs [ids...]
//
// For each model: bake every node transform into world space, turn it so +z is forward and
// +y up, scale it to the real car's length, split the wheel parts into four spinning groups
// (wheel_fl, wheel_fr, wheel_rl, wheel_rr) pivoted on their axle centres and the calipers into
// four fixed ones, drop the car onto y = 0 centred on the wheelbase, decimate each part to a
// budget, shrink textures to WebP and meshopt-compress the result. A small JSON sidecar
// records wheel centres and radii for the physics.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, transformPrimitive, weldPrimitive, simplifyPrimitive, compactPrimitive, dedup, prune, textureCompress, meshopt, join, getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODELS } from './models.mjs';

const OUT = resolve(import.meta.dirname, '../../public/hz/models');
mkdirSync(OUT, { recursive: true });
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});

const QUADS = ['fl', 'fr', 'rl', 'rr'];

function primTris(prim) {
  if (!prim.getIndices()) weldPrimitive(prim, {});
  return prim.getIndices().getCount() / 3;
}

// rotation that maps the model's forward/up axes to +z/+y
function basis(forward, up) {
  const ax = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
  const f = ax[forward], u = ax[up];
  const r = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]]; // up x forward = +x (left)
  // rows: new x = r, new y = u, new z = f  -> column-major mat4
  return [r[0], u[0], f[0], 0, r[1], u[1], f[1], 0, r[2], u[2], f[2], 0, 0, 0, 0, 1];
}
const scaleM = (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
const transM = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

function primBounds(prim) {
  const p = prim.getAttribute('POSITION');
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], v = [0, 0, 0];
  for (let i = 0; i < p.getCount(); i++) { p.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
  return { mn, mx };
}

// split a primitive's triangles into the four wheel quadrants by centroid
function splitQuadrants(doc, prim, cz) {
  primTris(prim);
  const idx = prim.getIndices().getArray(), pos = prim.getAttribute('POSITION');
  const buckets = [[], [], [], []], a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    pos.getElement(idx[t], a); pos.getElement(idx[t + 1], b); pos.getElement(idx[t + 2], c);
    const x = (a[0] + b[0] + c[0]) / 3, z = (a[2] + b[2] + c[2]) / 3;
    // +x is the car's left
    const q = (z > cz ? 0 : 2) + (x > 0 ? 0 : 1);
    buckets[q].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const out = [];
  buckets.forEach((tri, q) => {
    if (!tri.length) return;
    const p2 = prim.clone();
    const acc = doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(tri)).setBuffer(prim.getIndices().getBuffer());
    p2.setIndices(acc);
    compactPrimitive(p2);
    out.push([q, p2]);
  });
  return out;
}

async function importModel(cfg) {
  const t0 = performance.now();
  const doc = await io.read(cfg.src);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  for (const b of root.listBuffers().slice(1)) b.dispose();
  for (const acc of root.listAccessors()) acc.setBuffer(buffer);
  await doc.transform(flatten());
  // give every node its own mesh, then bake transforms
  const seen = new Set();
  for (const node of root.listNodes()) {
    const m = node.getMesh(); if (!m) continue;
    if (seen.has(m)) node.setMesh(m.clone()); seen.add(node.getMesh());
  }
  for (const node of root.listNodes()) if (node.getMesh()) clearNodeTransform(node);
  // collect primitives with their names
  let parts = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const name = `${node.getName()} ${mesh.getName()} ${prim.getMaterial()?.getName() ?? ''}`;
      if (cfg.drop && cfg.drop.test(name)) continue;
      parts.push({ prim, name, mat: prim.getMaterial() });
    }
  }
  // orientation
  const R = basis(cfg.forward ?? '+z', cfg.up ?? '+y');
  for (const p of parts) transformPrimitive(p.prim, R);
  // scale to real length
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) { const b = primBounds(p.prim); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.mn[k]); mx[k] = Math.max(mx[k], b.mx[k]); } }
  const s = cfg.length / (mx[2] - mn[2]);
  for (const p of parts) transformPrimitive(p.prim, scaleM(s));
  const cx = ((mn[0] + mx[0]) / 2) * s, cz0 = ((mn[2] + mx[2]) / 2) * s;
  for (const p of parts) transformPrimitive(p.prim, transM(-cx, 0, -cz0));
  // wheels and calipers
  const wheelParts = [], calParts = [], body = [];
  for (const p of parts) {
    if (cfg.caliper && cfg.caliper.test(p.name)) calParts.push(p);
    else if (cfg.wheel.test(p.name)) wheelParts.push(p);
    else body.push(p);
  }
  const wq = [[], [], [], []], cq = [[], [], [], []];
  for (const p of wheelParts) for (const [q, prim] of splitQuadrants(doc, p.prim, 0)) wq[q].push({ ...p, prim });
  for (const p of calParts) for (const [q, prim] of splitQuadrants(doc, p.prim, 0)) cq[q].push({ ...p, prim });
  const centres = wq.map((list) => {
    const b = { mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] };
    for (const p of list) {
      if (cfg.tyre && !cfg.tyre.test(p.name)) continue;
      const pb = primBounds(p.prim); for (let k = 0; k < 3; k++) { b.mn[k] = Math.min(b.mn[k], pb.mn[k]); b.mx[k] = Math.max(b.mx[k], pb.mx[k]); }
    }
    return { c: b.mn.map((v, k) => (v + b.mx[k]) / 2), r: (b.mx[1] - b.mn[1]) / 2, w: b.mx[0] - b.mn[0], bottom: b.mn[1] };
  });
  // ground at the tyres' contact patch, origin at the middle of the wheelbase
  const ground = Math.min(...centres.map((w) => w.bottom));
  const zf = (centres[0].c[2] + centres[1].c[2]) / 2, zr = (centres[2].c[2] + centres[3].c[2]) / 2;
  const zmid = (zf + zr) / 2;
  for (const p of [...body, ...wq.flat(), ...cq.flat()]) transformPrimitive(p.prim, transM(0, -ground, -zmid));
  for (const w of centres) { w.c[1] -= ground; w.c[2] -= zmid; }
  // rebuild the scene
  const scene = root.listScenes()[0];
  for (const n of root.listNodes()) n.dispose();
  const carNode = doc.createNode(cfg.id);
  scene.addChild(carNode);
  const decimate = (p, ratio) => {
    const r = cfg.ratio?.find(([re]) => re.test(p.name))?.[1] ?? ratio;
    if (r >= 1) return;
    weldPrimitive(p.prim, {});
    simplifyPrimitive(p.prim, { simplifier: MeshoptSimplifier, ratio: r, error: cfg.error ?? 0.0015, lockBorder: true });
  };
  const bodyMesh = doc.createMesh('body');
  for (const p of body) { decimate(p, cfg.bodyRatio ?? 0.5); bodyMesh.addPrimitive(p.prim); }
  carNode.addChild(doc.createNode('body').setMesh(bodyMesh));
  QUADS.forEach((q, i) => {
    const c = centres[i].c;
    const wm = doc.createMesh(`wheel_${q}`);
    for (const p of wq[i]) { decimate(p, cfg.wheelRatio ?? 0.35); transformPrimitive(p.prim, transM(-c[0], -c[1], -c[2])); wm.addPrimitive(p.prim); }
    carNode.addChild(doc.createNode(`wheel_${q}`).setMesh(wm).setTranslation(c));
    if (cq[i].length) {
      const cm = doc.createMesh(`caliper_${q}`);
      for (const p of cq[i]) { decimate(p, 0.3); transformPrimitive(p.prim, transM(-c[0], -c[1], -c[2])); cm.addPrimitive(p.prim); }
      carNode.addChild(doc.createNode(`caliper_${q}`).setMesh(cm).setTranslation(c));
    }
  });
  for (const m of root.listMeshes()) if (!m.listParents().some((p) => p.propertyType === 'Node')) m.dispose();
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  await doc.transform(
    dedup(), join({ keepNamed: true }), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cfg.tex ?? 1024, cfg.tex ?? 1024], quality: 88 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices() ? p.getIndices().getCount() / 3 : 0;
  const glb = await io.writeBinary(doc);
  writeFileSync(resolve(OUT, `${cfg.id}.glb`), glb);
  const d = getBounds(scene);
  const meta = {
    id: cfg.id, dims: { len: +(d.max[2] - d.min[2]).toFixed(3), wid: +(d.max[0] - d.min[0]).toFixed(3), hgt: +(d.max[1] - d.min[1]).toFixed(3) },
    wheels: centres.map((w) => ({ c: w.c.map((v) => +v.toFixed(4)), r: +w.r.toFixed(4), w: +w.w.toFixed(4) })),
    materials: root.listMaterials().map((m) => m.getName()),
  };
  writeFileSync(resolve(OUT, `${cfg.id}.json`), JSON.stringify(meta));
  console.log(cfg.id, 'tris', tris | 0, (glb.byteLength / 1048576).toFixed(2) + ' MB', 'dims', JSON.stringify(meta.dims), 'wheels', meta.wheels.map((w) => w.c.map((v) => v.toFixed(2)).join(',') + ' r' + w.r.toFixed(3)).join(' | '), ((performance.now() - t0) / 1000).toFixed(1) + 's');
}

const want = process.argv.slice(2);
for (const cfg of MODELS) if (!want.length || want.includes(cfg.id)) {
  try {
    await importModel(cfg);
    // low-detail copy for AI and traffic
    const lod = { ...cfg, id: `${cfg.id}_lod`, tex: 256, bodyRatio: (cfg.bodyRatio ?? 0.5) * 0.18, wheelRatio: 0.06, error: 0.01,
      ratio: (cfg.ratio ?? []).map(([re, r]) => [re, r * 0.18]), drop: new RegExp(`${cfg.drop?.source ?? '^$'}|Interior|INT_|interior|leather|Leather|seat|Carpet|steering|dash|int_`) };
    await importModel(lod);
  } catch (e) { console.error(cfg.id, 'FAILED', e); }
}
