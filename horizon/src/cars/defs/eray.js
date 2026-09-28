// 2024 Chevrolet Corvette E-Ray: the wide body, an LT2 V8 in the middle and an electric motor on the front axle.
// Same C8 body tables as the Z06 with this car's aero, intakes, exhaust and wheels.
import z06, { c8Shape, C8_PARTS, C8_DECALS } from './c8z06.js';

const opts = { quadCentre: false, wing: 'lip', bigIntake: false };
export default {
  ...z06,
  id: 'eray',
  wheels: { style: 'spoke10', color: 0x9aa0a8, finish: 'painted', caliper: 0x2a5ad8 },
  paint: { color: 0x2f5f86, finish: 'metallic' },
  shape: c8Shape(z06.dims, opts),
  parts(S, def) { return C8_PARTS(S, def, opts); },
  decals: C8_DECALS,
};
