# Prop models

Every model here comes from [Poly Haven](https://polyhaven.com/models) and is
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain, no attribution
required. The credit below is courtesy, not obligation.

Scanned and modelled by the Poly Haven team and contributors:

barrel_03 · concrete_road_barrier · concrete_road_barrier_02 · old_tyre · ammo_box ·
medical_box · wooden_military_crate · wooden_crate_02 · plastic_crate_01 · plastic_crate_02 ·
cardboard_box_01 · metal_jerrycan · metal_jerrycan_green · cement_bag · fire_hydrant ·
metal_trash_can · street_lamp_01 · utility_box_01 · propane_tank · small_lpg_tank ·
ladder_sectioned_01 · shrub_03 · tree_stump_01 · stone_01

The `.glb` files are not the originals: `tools/build-models.mjs` refetches them at 1K,
decimates each mesh to its silhouette, drops the textures to 512 px WebP and meshopt-compresses
the result. Run `node tools/build-models.mjs` to rebuild.
