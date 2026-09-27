import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  console.log('##', f.split('/').pop());
  for (const m of doc.getRoot().listMaterials()) {
    const c = m.getBaseColorFactor().map((v) => v.toFixed(2)).join(',');
    console.log(`  ${m.getName().padEnd(30)} col=${c} met=${m.getMetallicFactor().toFixed(2)} rough=${m.getRoughnessFactor().toFixed(2)} alpha=${m.getAlphaMode()} tex=${m.getBaseColorTexture() ? 'Y' : '-'} emis=${m.getEmissiveFactor().map((v) => v.toFixed(1)).join(',')}${m.getEmissiveTexture() ? '+T' : ''}`);
  }
}
