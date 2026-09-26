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
};
