// Summarise a model: every mesh primitive with node/mesh/material names, triangle count and world bounds.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
await doc.transform(flatten());
const seen = new Set();
for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; if (seen.has(m)) n.setMesh(m.clone()); seen.add(n.getMesh()); }
for (const n of root.listNodes()) if (n.getMesh()) clearNodeTransform(n);
const all = getBounds(root.listScenes()[0]);
console.log('scene bounds', all.min.map((v) => v.toFixed(2)).join(','), '|', all.max.map((v) => v.toFixed(2)).join(','));
const rows = [];
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'); const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
    const tris = (p.getIndices()?.getCount() ?? pos.getCount()) / 3;
    rows.push(`${(n.getName() || '-').slice(0, 28).padEnd(28)} ${(m.getName() || '-').slice(0, 22).padEnd(22)} ${(p.getMaterial()?.getName() || '-').slice(0, 26).padEnd(26)} ${String(tris | 0).padStart(7)}  ${mn.map((x) => x.toFixed(2)).join(',')} .. ${mx.map((x) => x.toFixed(2)).join(',')}`);
  }
}
console.log(rows.join('\n'));
