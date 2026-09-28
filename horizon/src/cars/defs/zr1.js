// 2025 Chevrolet Corvette ZR1: twin-turbo flat-plane LT7, 1,064 hp, the hood tunnel and the carbon wing.
// Same C8 body tables as the Z06 with this car's aero, intakes, exhaust and wheels.
import z06, { c8Shape, C8_PARTS, C8_DECALS } from './c8z06.js';

const opts = { quadCentre: true, wing: 'z07', bigIntake: true, hoodVent: true };
export default {
  ...z06,
  id: 'zr1',
  wheels: { style: 'twin7', color: 0x2a2c30, finish: 'satin', caliper: 0xd81818 },
  paint: { color: 0x9e0d14, finish: 'tintcoat' },
  shape: c8Shape(z06.dims, opts),
  parts(S, def) { return C8_PARTS(S, def, opts); },
  decals: C8_DECALS,
};
