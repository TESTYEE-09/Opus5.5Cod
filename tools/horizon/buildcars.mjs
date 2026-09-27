// Builds every procedural car body into public/hz/cars/<id>.bin:
// SDF -> surface nets -> meshopt simplification to three LODs -> gradient normals and
// per-vertex material ids -> meshopt vertex/index compression.
//   node tools/horizon/buildcars.mjs [ids...] [--h=0.015]
import { writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as S from '../../horizon/src/cars/sdf.js';
import { polygonize, shade, compact } from '../../horizon/src/cars/mesher.js';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const h = +(args.find((a) => a.startsWith('--h='))?.slice(4) ?? 0.014);
let ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) ids = readdirSync(resolve(root, 'horizon/src/cars/defs')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.replace('.js', ''));
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const LODS = [[70000, 0.0012], [16000, 0.004], [4000, 0.015]];

for (const id of ids) {
  const def = (await import(resolve(root, `horizon/src/cars/defs/${id}.js`))).default;
  if (!def.body) continue;
  const t0 = performance.now();
  const f = def.body(S);
  const d = def.dims;
  const bounds = [[-d.wid / 2 - 0.06, -0.02, -d.len / 2 - 0.12], [d.wid / 2 + 0.06, d.hgt + 0.25, d.len / 2 + 0.12]];
  const m = polygonize(f, bounds, h);
  const chunks = [], meta = { id, lods: [] };
  let off = 0;
  const push = (buf) => { chunks.push(buf); const o = off; off += buf.byteLength; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); off += pad; } return o; };
  for (const [target, err] of LODS) {
    const [ind] = MeshoptSimplifier.simplify(m.indices, m.positions, 3, Math.min(target * 3, m.indices.length), err, []);
    const c = compact(m.positions, ind);
    const nv = c.positions.length / 3;
    const { normals, mats } = shade(f, c.positions);
    // 12-byte vertex: int16 xyz (0.1 mm) + pad, int8 normal xyz + material id
    const vb = new ArrayBuffer(nv * 12), dv = new DataView(vb);
    for (let i = 0; i < nv; i++) {
      for (let k = 0; k < 3; k++) dv.setInt16(i * 12 + k * 2, Math.round(c.positions[i * 3 + k] * 10000), true);
      for (let k = 0; k < 3; k++) dv.setInt8(i * 12 + 8 + k, Math.round(normals[i * 3 + k] * 127));
      dv.setUint8(i * 12 + 11, mats[i]);
    }
    const venc = MeshoptEncoder.encodeVertexBuffer(new Uint8Array(vb), nv, 12);
    const idx32 = new Uint32Array(c.indices);
    const ienc = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(idx32.buffer), idx32.length, 4);
    meta.lods.push({ nv, ni: idx32.length, v: [push(venc), venc.byteLength], i: [push(ienc), ienc.byteLength] });
  }
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const head = new Uint32Array([0x4e5a4f48, json.byteLength]);
  const jpad = (4 - (json.byteLength % 4)) % 4;
  const total = 8 + json.byteLength + jpad + off;
  const out = new Uint8Array(total);
  out.set(new Uint8Array(head.buffer), 0); out.set(json, 8);
  let p = 8 + json.byteLength + jpad;
  for (const c of chunks) { out.set(new Uint8Array(c.buffer ?? c, c.byteOffset ?? 0, c.byteLength), p); p += c.byteLength; }
  writeFileSync(resolve(root, `public/hz/cars/${id}.bin`), out);
  console.log(id, 'raw tris', m.indices.length / 3, 'lods', meta.lods.map((l) => l.ni / 3).join('/'), (total / 1024).toFixed(0) + ' KB', ((performance.now() - t0) / 1000).toFixed(1) + ' s');
}
