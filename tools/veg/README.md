# Vegetation pipeline

How public/models/veg and public/tex/foliage.png were made from Poly Haven (CC0) scans.
Blender 5.2, run headless: `Blender -b --python <script> -- <args>`.

- `dl.py <outdir> <ids...>`: download the 1k glTF of each asset.
- `tree.py <src.gltf> <dst.glb> <woodTris> <leafTris> [keep]`: island_tree_01/02 (3500, 9000),
  and rocks/deadwood with one budget (`<tris> 99999 1`). Leaves are thinned to a `keep` fraction
  of whole leaves, each enlarged, then decimated; textures are cut to 512 px.
- `bake.py <src.gltf> <dst.png> top|side [object|all]`: renders a scan orthographically with a
  transparent background. fir_sapling (top view, right half) became the conifer branch card;
  grass_medium_01 large_a/c, shrub_02_a and fern_02_b became the foliage atlas cells.
- `conifer.py <card.png> <bark_diff> <bark_nor> <dst.glb>`: builds three conifers (10, 13.5,
  17 m) from the branch card and fir_tree_01 bark.
