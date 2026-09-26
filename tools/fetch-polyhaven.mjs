// Downloads the CC0 Poly Haven textures and models the game uses into public/.
// Run once: node tools/fetch-polyhaven.mjs (files already present are skipped).
import { mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { TEXTURES, MODELS } from '../src/assetlist.js';

const api = (id) => JSON.parse(execFileSync('curl', ['-sfL', '--http1.1', '--retry', '5', '--retry-all-errors', `https://api.polyhaven.com/files/${id}`]));
async function get(url, path) {
  try { await access(path); return; } catch { /* not downloaded yet */ }
  await mkdir(dirname(path), { recursive: true });
  // curl retries dropped connections, which fetch does not
  try {
    execFileSync('curl', ['-sfL', '--http1.1', '--retry', '5', '--retry-all-errors', '-o', `${path}.part`, url]);
    execFileSync('mv', [`${path}.part`, path]);
  } catch { console.warn('FAILED', url); }
  console.log('got', path);
}

for (const id of new Set(Object.values(TEXTURES).map(t => t.id))) {
  const f = await api(id);
  await get(f.Diffuse['1k'].jpg.url, `public/tex/${id}_diff.jpg`);
  await get(f.nor_gl['1k'].jpg.url, `public/tex/${id}_nor.jpg`);
  await get(f.arm['1k'].jpg.url, `public/tex/${id}_arm.jpg`);
}
for (const m of new Set(Object.values(MODELS).map(m => m.id))) {
  const g = (await api(m)).gltf['1k'].gltf;
  await get(g.url, `public/models/${m}/${m}.gltf`);
  for (const [rel, v] of Object.entries(g.include)) await get(v.url, `public/models/${m}/${rel}`);
}
