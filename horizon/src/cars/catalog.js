// Every car in the game: specs for the physics, audio and the Autoshow, plus the body def.
import c8z06 from './defs/c8z06.js';

export const CARS = [
  { id: 'c8z06', def: c8z06 },
  { id: 'c7', def: { id: 'c7', model: 'corvette_c7', paint: { color: 0x0b2a6b, finish: 'metallic' },
    materials: { paint: /^Car_Paint$/, glass: /^Windows$/, head: /Main_Headlight_Lens|Headlight_Cover/, drl: /Daylight_Cover/, tail: /Tail_Lights_Red_Cover$/, brake: /Tail_Lights_Red_Cover_2|Spoiler_Light_Cover/, reverse: /Tail_Lights_White_Cover/ } } },
  { id: 'gts992', def: { id: 'gts992', model: 'porsche_992', paint: { color: 0x2b4a2f, finish: 'metallic' }, materials: { paint: /^paint$/, head: /^lights$/ } } },
  { id: 'f458', def: { id: 'f458', model: 'ferrari_458', paint: { color: 0xa00808, finish: 'metallic' }, materials: { paint: /^Body_Color$/, head: /Projector_Glass/, tail: /Taillight_Glass/, drl: /Turn_Signal_LED/ } } },
  { id: 'huracangt3', def: { id: 'huracangt3', model: 'huracan_gt3', materials: { paint: /^$/, head: /Emissive_Light_Front|Glass_Emissive_Front/, tail: /Emissive_Light_Rear|Glass_Emissive_Rear/ } } },
  { id: 'urus', def: { id: 'urus', model: 'urus', paint: { color: 0xf0a800, finish: 'metallic' }, materials: { paint: /^WhiteCar$/, head: /LightsFrontLed|LightsGlassFront/, tail: /LightsGlassBack/, brake: /emitbrake/ } } },
  { id: 'jeep', def: { id: 'jeep', model: 'jeep_wrangler', paint: { color: 0x2e5a1c, finish: 'gloss' }, materials: { paint: /smallspecmap_PRIMARY/ } } },
  { id: 'mp45', def: { id: 'mp45', model: 'mclaren_mp45', materials: { paint: /^$/ } } },
  { id: 'supragt300', def: { id: 'supragt300', model: 'supra_gt300', materials: { paint: /^$/ } } },
  { id: 'laferrari', def: { id: 'laferrari', model: 'laferrari', paint: { color: 0xb00000, finish: 'metallic' }, materials: { paint: /smallspecmap_PRIMARY/ } } },
];
