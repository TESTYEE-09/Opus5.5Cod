// Builds every procedural car into public/hz/cars/<id>.bin.
//
// A car def has a `shape` (lofted lower body + greenhouse, see horizon/src/cars/modeler.js)
// and optionally `parts(S)` returning small SDF parts (mirrors, wings, exhaust tips, ...),
// each polygonised inside its own bounds. Every mesh group is simplified to three LODs,
// gets per-vertex material ids, and is meshopt-compressed.
//   node tools/horizon/buildcars.mjs [ids...]
import { writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as S from '../../horizon/src/cars/sdf.js';
import { polygonize, shade, compact } from '../../horizon/src/cars/mesher.js';
import { buildBody, weld } from '../../horizon/src/cars/modeler.js';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const root = resolve(import.meta.dirname, '../..');
let ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!ids.length) ids = readdirSync(resolve(root, 'horizon/src/cars/defs')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.replace('.js', ''));
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;

// simplify an indexed mesh (with normals and material ids) to a triangle target
function simplify(m, target, err) {
  if (m.indices.length / 3 <= target) return m;
  const [ind] = MeshoptSimplifier.simplifyWithAttributes(m.indices, m.positions, 3, m.normals, 3, [0.5, 0.5, 0.5], null, target * 3, err, ['LockBorder']);
  const remap = new Int32Array(m.positions.length / 3).fill(-1);
  const pos = [], nrm = [], mat = [], idx = new Uint32Array(ind.length);
  for (let i = 0; i < ind.length; i++) {
    const v = ind[i];
    if (remap[v] < 0) {
      remap[v] = pos.length / 3;
      pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
      nrm.push(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]);
      mat.push(m.mats[v]);
    }
    idx[i] = remap[v];
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), mats: new Uint8Array(mat), indices: idx };
}

function encode(m, push) {
  const nv = m.positions.length / 3;
  // 12-byte vertex: int16 xyz (0.1 mm), int8 normal xyz, material id
  const vb = new ArrayBuffer(nv * 12), dv = new DataView(vb);
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) dv.setInt16(i * 12 + k * 2, Math.round(m.positions[i * 3 + k] * 10000), true);
    for (let k = 0; k < 3; k++) dv.setInt8(i * 12 + 8 + k, Math.round(Math.max(-1, Math.min(1, m.normals[i * 3 + k])) * 127));
    dv.setUint8(i * 12 + 11, m.mats[i]);
  }
  const venc = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(vb), nv, 12);
  const idx32 = new Uint32Array(m.indices);
  const ienc = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx32.buffer), idx32.length, 4);
  return { nv, ni: idx32.length, v: [push(venc), venc.byteLength], i: [push(ienc), ienc.byteLength] };
}

function sdfPart(p) {
  const h = p.h ?? 0.006;
  const m = polygonize(p.f, p.bounds, h);
  const c = compact(m.positions, MeshoptSimplifier.simplify(m.indices, m.positions, 3, Math.min(m.indices.length, (p.tris ?? 8000) * 3), 0.0005, [])[0]);
  const { normals, mats } = shade(p.f, c.positions, 0.001);
  return { positions: c.positions, normals, mats, indices: c.indices };
}

function merge(list) {
  let nv = 0, ni = 0;
  for (const m of list) { nv += m.positions.length / 3; ni += m.indices.length; }
  const out = { positions: new Float32Array(nv * 3), normals: new Float32Array(nv * 3), mats: new Uint8Array(nv), indices: new Uint32Array(ni) };
  let vo = 0, io = 0;
  for (const m of list) {
    out.positions.set(m.positions, vo * 3); out.normals.set(m.normals, vo * 3); out.mats.set(m.mats, vo);
    for (let i = 0; i < m.indices.length; i++) out.indices[io + i] = m.indices[i] + vo;
    vo += m.positions.length / 3; io += m.indices.length;
  }
  return out;
}

for (const id of ids) {
  const def = (await import(resolve(root, `horizon/src/cars/defs/${id}.js`))).default;
  if (!def.shape) continue;
  const t0 = performance.now();
  const groups = [];
  const { body, cabin } = buildBody(def.shape, { dz: 0.01, dv: 0.01 });
  groups.push(['body', weld(body), [60000, 15000, 3500]]);
  if (cabin) groups.push(['cabin', weld(cabin), [9000, 2500, 700]]);
  if (def.parts) {
    const parts = def.parts(S, def).map(sdfPart);
    if (parts.length) groups.push(['parts', merge(parts), [16000, 4000, 900]]);
  }
  const chunks = [], meta = { id, v: 2, meshes: [] };
  let off = 0;
  const push = (buf) => { chunks.push(buf); const o = off; off += buf.byteLength; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } return o; };
  const stats = [];
  for (const [name, mesh, targets] of groups) {
    const lods = targets.map((t, i) => encode(simplify(mesh, t, [0.0006, 0.003, 0.012][i]), push));
    meta.meshes.push({ name, lods });
    stats.push(`${name} ${mesh.indices.length / 3}→${lods.map((l) => l.ni / 3).join('/')}`);
  }
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const jpad = (4 - (json.byteLength % 4)) % 4;
  const out = new Uint8Array(8 + json.byteLength + jpad + off);
  out.set(new Uint8Array(new Uint32Array([0x4e5a4f48, json.byteLength]).buffer), 0); out.set(json, 8);
  let p = 8 + json.byteLength + jpad;
  for (const c of chunks) { out.set(new Uint8Array(c.buffer ?? c, c.byteOffset ?? 0, c.byteLength), p); p += c.byteLength; }
  writeFileSync(resolve(root, `public/hz/cars/${id}.bin`), out);
  console.log(id, stats.join(' | '), (out.byteLength / 1024).toFixed(0) + ' KB', ((performance.now() - t0) / 1000).toFixed(1) + ' s');
}
