// Loads a prebuilt car body (public/hz/cars/<id>.bin, see tools/horizon/buildcars.mjs)
// into BufferGeometries, one per level of detail.
import * as THREE from 'three';
import { MeshoptDecoder } from 'meshoptimizer';

const pending = new Map();

export function loadBody(id, base = '../hz/cars/') {
  if (pending.has(id)) return pending.get(id);
  const p = (async () => {
    const [buf] = await Promise.all([fetch(`${base}${id}.bin`).then((r) => { if (!r.ok) throw new Error(`car ${id}: ${r.status}`); return r.arrayBuffer(); }), MeshoptDecoder.ready]);
    const head = new Uint32Array(buf, 0, 2);
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, head[1])));
    const dataStart = 8 + head[1] + ((4 - (head[1] % 4)) % 4);
    const lods = meta.lods.map((l) => {
      const vb = new Uint8Array(l.nv * 12);
      MeshoptDecoder.decodeVertexBuffer(vb, l.nv, 12, new Uint8Array(buf, dataStart + l.v[0], l.v[1]));
      const ib = new Uint32Array(l.ni);
      MeshoptDecoder.decodeIndexBuffer(new Uint8Array(ib.buffer), l.ni, 4, new Uint8Array(buf, dataStart + l.i[0], l.i[1]));
      const dv = new DataView(vb.buffer);
      const pos = new Float32Array(l.nv * 3), nrm = new Int8Array(l.nv * 3), mat = new Uint8Array(l.nv);
      for (let i = 0; i < l.nv; i++) {
        for (let k = 0; k < 3; k++) { pos[i * 3 + k] = dv.getInt16(i * 12 + k * 2, true) * 1e-4; nrm[i * 3 + k] = dv.getInt8(i * 12 + 8 + k); }
        mat[i] = vb[i * 12 + 11];
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
      g.setAttribute('matId', new THREE.BufferAttribute(mat, 1));
      g.setIndex(new THREE.BufferAttribute(l.nv < 65536 ? new Uint16Array(ib) : ib, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    });
    return { meta, lods };
  })();
  pending.set(id, p);
  return p;
}
