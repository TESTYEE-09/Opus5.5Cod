// CC0 scanned assets from Poly Haven (polyhaven.com), fetched by tools/fetch-polyhaven.mjs.
// TEXTURES: world material or ground recipe -> texture set. MODELS: prop type -> model
// (already in metres; `lay` turns it onto its side).
export const TEXTURES = {
  plaster: { id: 'plastered_wall_02' },
  plaster2: { id: 'white_plaster_rough_01' },
  concrete: { id: 'concrete_wall_008' },
  trim: { id: 'concrete_floor_02' },
  brick: { id: 'red_brick_03' },
  wall: { id: 'concrete_block_wall' },
  crate: { id: 'old_planks_02' },
  planks: { id: 'old_planks_02' },
  deck: { id: 'wood_floor_deck' },
  floor: { id: 'floor_tiles_06' },
  roof: { id: 'grey_roof_01' },
  corrugated: { id: 'corrugated_iron' },
  container: { id: 'corrugated_iron_02' },
  metal: { id: 'metal_plate' },
  steel: { id: 'metal_plate' },
  snowcap: { id: 'snow_02' },
  // ground recipes
  'ground:dirt': { id: 'dry_ground_01' },
  'ground:slab': { id: 'concrete_floor_worn_001' },
  'ground:snow': { id: 'snow_02' },
  // steep slopes, per land
  'rock:desert': { id: 'rocks_ground_06' },
  'rock:snow': { id: 'snow_field_aerial' },
  'rock:port': { id: 'rocky_trail' },
};

export const MODELS = {
  barrel: { id: 'Barrel_01' },
  tires: { id: 'old_tyre', lay: true },
  jersey: { id: 'concrete_road_barrier' },
  rock: { id: 'boulder_01' },
  pallets: { id: 'wooden_military_crate' },
  crate: { id: 'wooden_crate_01' },
  jerrycan: { id: 'metal_jerrycan' },
  ammo: { id: 'ammo_box' },
  cardboard: { id: 'cardboard_box_01' },
  trashbag: { id: 'trashbag' },
  cement: { id: 'cement_bag' },
  // vegetation and rocks: Poly Haven scans cut down to game budgets in Blender
  // (tools/veg/*.py): trees thinned and decimated, conifers rebuilt from baked branch cards
  conifer: { file: 'veg/conifer.glb', variants: true, wind: 0.0016, windFrom: 2 },
  olive1: { file: 'veg/island_tree_01.glb', wind: 0.004, windFrom: 1.5 },
  olive2: { file: 'veg/island_tree_02.glb', wind: 0.004, windFrom: 1.5 },
  boulderA: { file: 'veg/namaqualand_boulder_02.glb' },
  boulderB: { file: 'veg/namaqualand_boulder_04.glb' },
  mossrock: { file: 'veg/rock_moss_set_01.glb', variants: true },
  deadtrunk: { file: 'veg/dead_tree_trunk.glb' },
  stump: { file: 'veg/tree_stump_01.glb' },
  branches: { file: 'veg/dry_branches_medium_01.glb' },
};
