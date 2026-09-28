// 2026 Chevrolet Corvette ZR1X: the ZR1's 1,064 hp twin-turbo LT7 plus the E-Ray's front motor, 1,250 hp AWD. ZTK aero: big wing, dive planes, hood tunnel.
// Same C8 body tables as the Z06 with this car's aero, intakes, exhaust and wheels.
import z06, { c8Shape, C8_PARTS, C8_DECALS } from './c8z06.js';

const opts = { quadCentre: true, wing: 'ztk', bigIntake: true, hoodVent: true };
export default {
  ...z06,
  id: 'zr1x',
  wheels: { style: 'twin7', color: 0x1c1d20, finish: 'satin', caliper: 0xf0c000 },
  paint: { color: 0xd8561c, finish: 'tintcoat' },
  shape: c8Shape(z06.dims, opts),
  parts(S, def) { return C8_PARTS(S, def, opts); },
  decals: C8_DECALS,
};
