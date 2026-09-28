// 1992 Honda NSX-R (NA1): lighter, stiffer, Championship White with the red badge.
import base, { NSX, NSX_DECALS, NSX_PARTS, dims } from './nsx.js';
import { shapeFrom } from './_gen.js';

const P = NSX({ typeR: true });
export default {
  ...base,
  id: 'nsxr',
  wheels: { style: 'spoke5', color: 0xf2f2ee, finish: 'painted', caliper: 0x2a2a2a },
  paint: { color: 0xf4f3ee, finish: 'gloss', color2: 0x111111 },
  shape: shapeFrom(P),
  parts(S) { return NSX_PARTS(S, { typeR: true }); },
  decals: [...NSX_DECALS(P, { typeR: true }), { p: 'front', l: 'tail', g: [2.0, 2.3], pts: [[0, 0.42]], r: 0.028 }],
  dims,
};
