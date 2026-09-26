// Fetches the CC0 prop models the maps scatter from Poly Haven and bakes each one into a
// small meshopt-compressed GLB with WebP textures, written to public/models/.
// Run with `node tools/build-models.mjs` — only needed when the list below changes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// name → [texture size, simplify error]. Scanned props carry their detail in the normal map,
// so the silhouette is all the triangles have to hold: barriers and crates go very low,
// foliage and thin metal (ladders, lamp posts) need more to keep their shape.
const ASSETS = {
  barrel_03: [512, 0.004],
  concrete_road_barrier: [512, 0.006],
  concrete_road_barrier_02: [512, 0.006],
  old_tyre: [512, 0.004],
  ammo_box: [512, 0.003],
  medical_box: [512, 0.003],
  wooden_military_crate: [512, 0.004],
  wooden_crate_02: [512, 0.004],
  plastic_crate_01: [512, 0.004],
  plastic_crate_02: [512, 0.004],
  cardboard_box_01: [512, 0.004],
  metal_jerrycan_green: [512, 0.003],
  metal_jerrycan: [512, 0.003],
  cement_bag: [512, 0.004],
  fire_hydrant: [512, 0.002],
  metal_trash_can: [512, 0.003],
  street_lamp_01: [512, 0.0015],
  utility_box_01: [512, 0.003],
  propane_tank: [512, 0.003],
  small_lpg_tank: [512, 0.003],
  ladder_sectioned_01: [512, 0.0015],
  shrub_03: [512, 0.004],
  tree_stump_01: [512, 0.005],
  stone_01: [512, 0.006],
};

const UA = { 'User-Agent': 'frontline-asset-build' };
const OUT = 'public/models';
const TMP = '.model-cache';

const get = async (url) => Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());

mkdirSync(OUT, { recursive: true });
for (const [name, [size, error]] of Object.entries(ASSETS)) {
  const dir = join(TMP, name);
  if (!existsSync(dir)) {
    const files = (await (await fetch(`https://api.polyhaven.com/files/${name}`, { headers: UA })).json());
    const gltf = files.gltf?.['1k']?.gltf;
    if (!gltf) { console.error('no 1k gltf for', name); continue; }
    mkdirSync(join(dir, 'textures'), { recursive: true });
    writeFileSync(join(dir, `${name}.gltf`), await get(gltf.url));
    for (const [rel, info] of Object.entries(gltf.include || {})) writeFileSync(join(dir, rel), await get(info.url));
  }
  execFileSync('npx', ['--yes', '@gltf-transform/cli@4', 'optimize', join(dir, `${name}.gltf`), join(OUT, `${name}.glb`),
    '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(size), '--simplify-error', String(error)],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('built', name);
}
rmSync(TMP, { recursive: true, force: true });
