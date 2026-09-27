// 2023 Chevrolet Corvette Z06 (C8). Published dimensions: 4685 L x 2025 W x 1225 H mm,
// 2723 mm wheelbase, 275/30R20 front and 345/25R21 rear tyres. Car origin: ground level
// under the middle of the wheelbase, +z forward, +x right.
//
// Lower body keypoints per station, floor centre to top centre:
//   0 floor centre, 1 floor edge, 2 rocker, 3 side max, 4 upper side, 5 fender crest (sharp),
//   6 hood/deck inside the crest, 7 top centre
import { MAT } from '../sdf.js';

export const C8_LOWER = {
  sharp: [5],
  stations: [
    { z: 2.372, p: [[0, 0.3], [0, 0.3], [0, 0.33], [0, 0.4], [0, 0.46], [0, 0.5], [0, 0.515], [0, 0.52]] },
    { z: 2.355, p: [[0, 0.2], [0.14, 0.19], [0.24, 0.23], [0.3, 0.35], [0.31, 0.45], [0.28, 0.515], [0.16, 0.54], [0, 0.545]] },
    { z: 2.31, p: [[0, 0.135], [0.42, 0.13], [0.56, 0.17], [0.65, 0.33], [0.66, 0.5], [0.6, 0.585], [0.3, 0.585], [0, 0.59]] },
    { z: 2.2, p: [[0, 0.115], [0.66, 0.11], [0.8, 0.15], [0.87, 0.33], [0.87, 0.53], [0.8, 0.64], [0.38, 0.625], [0, 0.628]] },
    { z: 1.98, p: [[0, 0.11], [0.78, 0.11], [0.915, 0.16], [0.955, 0.37], [0.955, 0.6], [0.885, 0.725], [0.4, 0.675], [0, 0.678]] },
    { z: 1.36, p: [[0, 0.11], [0.82, 0.11], [0.95, 0.18], [0.985, 0.42], [0.98, 0.68], [0.9, 0.835], [0.42, 0.748], [0, 0.752]] },
    { z: 0.92, p: [[0, 0.11], [0.82, 0.11], [0.935, 0.17], [0.958, 0.42], [0.955, 0.7], [0.885, 0.865], [0.42, 0.835], [0, 0.838]] },
    { z: 0.55, p: [[0, 0.11], [0.8, 0.11], [0.915, 0.16], [0.94, 0.4], [0.94, 0.7], [0.865, 0.895], [0.4, 0.895], [0, 0.895]] },
    { z: 0.0, p: [[0, 0.11], [0.78, 0.11], [0.895, 0.15], [0.928, 0.38], [0.932, 0.68], [0.862, 0.905], [0.4, 0.905], [0, 0.905]] },
    { z: -0.45, p: [[0, 0.11], [0.8, 0.11], [0.915, 0.15], [0.952, 0.38], [0.958, 0.72], [0.885, 0.955], [0.4, 0.975], [0, 0.98]] },
    { z: -0.82, p: [[0, 0.115], [0.82, 0.115], [0.945, 0.16], [0.992, 0.42], [0.995, 0.78], [0.905, 1.0], [0.42, 1.065], [0, 1.07]] },
    { z: -1.36, p: [[0, 0.12], [0.82, 0.12], [0.972, 0.18], [1.0125, 0.45], [1.006, 0.8], [0.905, 1.012], [0.42, 1.058], [0, 1.062]] },
    { z: -1.95, p: [[0, 0.16], [0.8, 0.16], [0.962, 0.21], [1.0, 0.45], [0.992, 0.82], [0.9, 1.022], [0.42, 1.045], [0, 1.05]] },
    { z: -2.22, p: [[0, 0.27], [0.75, 0.27], [0.905, 0.3], [0.952, 0.45], [0.952, 0.82], [0.882, 1.022], [0.42, 1.037], [0, 1.04]] },
    { z: -2.298, p: [[0, 0.33], [0.6, 0.33], [0.79, 0.35], [0.86, 0.45], [0.868, 0.8], [0.825, 0.985], [0.4, 1.0], [0, 1.0]] },
    { z: -2.316, p: [[0, 0.38], [0, 0.38], [0, 0.4], [0, 0.45], [0, 0.8], [0, 0.95], [0, 0.97], [0, 0.97]] },
  ],
};

// Greenhouse, from the windshield base back along the flying buttresses. Keypoints:
//   0 inside centre, 1 inside edge, 2 beltline, 3 roof edge (sharp), 4 roof centre
export const C8_CABIN = {
  sharp: [3],
  stations: [
    { z: 0.86, p: [[0, 0.8], [0, 0.8], [0, 0.88], [0, 0.888], [0, 0.89]] },
    { z: 0.8, p: [[0, 0.8], [0.6, 0.8], [0.745, 0.9], [0.63, 0.925], [0, 0.93]] },
    { z: 0.42, p: [[0, 0.8], [0.7, 0.8], [0.8, 0.915], [0.64, 1.065], [0, 1.08]] },
    { z: 0.0, p: [[0, 0.8], [0.72, 0.8], [0.82, 0.925], [0.615, 1.19], [0, 1.205]] },
    { z: -0.32, p: [[0, 0.8], [0.72, 0.8], [0.83, 0.955], [0.6, 1.212], [0, 1.225]] },
    { z: -0.62, p: [[0, 0.8], [0.74, 0.8], [0.84, 1.0], [0.66, 1.172], [0, 1.18]] },
    { z: -1.2, p: [[0, 0.8], [0.76, 0.8], [0.86, 1.02], [0.74, 1.105], [0, 1.1]] },
    { z: -1.9, p: [[0, 0.8], [0.74, 0.8], [0.84, 1.02], [0.76, 1.06], [0, 1.05]] },
    { z: -2.02, p: [[0, 0.8], [0, 0.8], [0, 1.0], [0, 1.03], [0, 1.03]] },
  ],
};

export function c8Body(S, dims, o = {}) {
  const { kloft, smin, ssub, sub, prism, box, ellipsoid, capsule, cyl, wing, arch, union, offset } = S;
  let b = smin(kloft(o.lower ?? C8_LOWER), kloft(o.cabin ?? C8_CABIN), 0.012);

  // engine-bay glass sits in a valley between the buttresses
  b = ssub(b, prism('zx', [[-0.66, -0.1], [-0.66, 0.4], [-1.86, 0.46], [-1.98, 0.36], [-1.98, -0.1]], 1.035, 1.4, 0.02, MAT.GLOSS), 0.02, MAT.GLOSS);
  // side intake: a scoop that deepens toward the rear wheel
  b = ssub(b, prism('zx', [[-0.3, 1.2], [-0.3, 0.935], [-0.9, 0.76], [-1.0, 0.8], [-1.0, 1.2]], 0.44, o.bigIntake ? 0.9 : 0.86, 0.035, MAT.GRILLE), 0.035, MAT.GRILLE);
  // door scallop leading into the intake
  b = ssub(b, prism('zx', [[0.35, 1.2], [0.2, 0.93], [-0.3, 0.9], [-0.3, 1.2]], 0.3, 0.62, 0.05, MAT.PAINT), 0.08, MAT.PAINT);
  // front: centre grille and the corner intakes under the headlights
  b = ssub(b, prism('xy', [[-0.1, 0.15], [0.44, 0.15], [0.5, 0.2], [0.44, 0.36], [-0.1, 0.375]], 2.25, 3, 0.02, MAT.GRILLE), 0.01, MAT.GRILLE);
  b = ssub(b, prism('xy', [[0.56, 0.16], [0.84, 0.16], [0.9, 0.3], [0.8, 0.45], [0.6, 0.36]], 2.1, 3, 0.02, MAT.GRILLE), 0.01, MAT.GRILLE);
  if (o.hoodVent) b = ssub(b, prism('zx', [[1.5, -0.1], [1.5, 0.34], [2.05, 0.28], [2.05, -0.1]], 0.66, 1.2, 0.03, MAT.GRILLE), 0.012, MAT.GRILLE);
  // rear: exhaust housing and diffuser
  b = ssub(b, prism('xy', [[-0.1, 0.22], [o.quadCentre ? 0.19 : 0.9, 0.22], [o.quadCentre ? 0.21 : 0.9, 0.52], [-0.1, 0.52]], -3, -2.24, 0.03, MAT.TRIM), 0.01, MAT.TRIM);
  b = ssub(b, prism('zy', [[-2.5, 0.05], [-1.75, 0.05], [-2.5, 0.37]], 0, 0.85, 0.01, MAT.CARBON), 0.02, MAT.CARBON);
  // front splitter lip and rocker extensions
  b = smin(b, prism('zx', [[1.95, -0.1], [1.95, 0.82], [2.2, 0.86], [2.33, 0.6], [2.34, -0.1]], 0.095, 0.112, 0.004, MAT.CARBON), 0.01);
  b = smin(b, box([0.9, 0.12, 0], [0.03, 0.015, 0.95], 0.008, MAT.CARBON), 0.01);
  for (const fx of [0.3, 0.52, 0.72]) b = union(b, prism('zy', [[-2.33, 0.1], [-1.85, 0.1], [-2.33, 0.35]], fx - 0.006, fx + 0.006, 0.002, MAT.CARBON));

  // mirrors on short stalks from the door top
  const mirror = smin(ellipsoid([0.965, 0.975, 0.66], [0.075, 0.048, 0.06], MAT.PAINT, [0, 0, 0.1]), capsule([0.83, 0.92, 0.67], [0.94, 0.965, 0.665], 0.014, MAT.TRIM), 0.015);
  b = smin(b, mirror, 0.01);

  // wheel arches
  b = arch(b, dims.wb / 2, dims.rF, dims.rF + 0.045, 0.58, 0.012);
  b = arch(b, -dims.wb / 2, dims.rR, dims.rR + 0.048, 0.58, 0.012);

  // hollow cockpit (walls ~3.5 cm) so the windows can be cut open
  const cav = union(offset(kloft({ ...C8_CABIN, stations: C8_CABIN.stations.filter((s) => s.z > -0.7) }), -0.035), box([0, 0.6, 0.15], [0.7, 0.33, 0.58], 0.08));
  b = sub(b, cav, MAT.TRIM);

  // exhaust tips
  const tips = o.quadCentre ? [[0.07, 0.44], [0.07, 0.3]] : [[0.7, 0.38], [0.84, 0.38]];
  for (const [ex, ey] of tips) {
    const tip = cyl([ex, ey, -2.36], [ex, ey, -2.2], 0.05, MAT.CHROME);
    b = union(b, sub(tip, cyl([ex, ey, -2.5], [ex, ey, -2.25], 0.042, MAT.TRIM), MAT.TRIM));
  }
  if (o.wing === 'z07') {
    const w = wing([0, 1.3, -1.78], 0.3, 0.1, 0, 0.86, -0.07, 0.05, MAT.CARBON);
    const plates = prism('zy', [[-1.74, 1.2], [-2.12, 1.22], [-2.14, 1.37], [-1.76, 1.36]], 0.86, 0.872, 0.004, MAT.CARBON);
    const posts = box([0.34, 1.17, -1.95], [0.009, 0.12, 0.07], 0.004, MAT.CARBON);
    b = union(b, w, plates, posts);
  } else if (o.wing === 'ztk') {
    const w = wing([0, 1.36, -1.72], 0.36, 0.11, 0, 0.9, -0.08, 0.06, MAT.CARBON);
    const plates = prism('zy', [[-1.66, 1.24], [-2.14, 1.26], [-2.16, 1.44], [-1.7, 1.43]], 0.9, 0.912, 0.004, MAT.CARBON);
    const posts = box([0.3, 1.2, -1.93], [0.01, 0.16, 0.08], 0.004, MAT.CARBON);
    b = union(b, w, plates, posts);
  } else {
    // Stingray: ducktail lip
    b = smin(b, prism('zy', [[-2.05, 1.02], [-2.3, 1.02], [-2.31, 1.075], [-2.2, 1.06]], 0, 0.8, 0.006, MAT.PAINT), 0.02);
  }
  return b;
}

export const C8_DECALS = [
  // side window, windshield, rear quarter
  { p: 'side', l: 'glass', g: [0.55, 1.2], pts: [[0.8, 0.905], [0.58, 0.915], [-0.3, 0.935], [-0.56, 1.02], [-0.52, 1.13], [-0.3, 1.19], [0.05, 1.18], [0.45, 1.06]], r: 0.012 },
  { p: 'top', l: 'glass', g: [0.9, 1.4], pts: [[0.84, -1], [0.84, 0.63], [0.72, 0.7], [0.03, 0.62], [0.0, -1]], r: 0.02 },
  { p: 'top', l: 'glass', g: [1.0, 1.4], pts: [[-0.7, -1], [-0.7, 0.36], [-1.82, 0.42], [-1.93, 0.33], [-1.93, -1]], r: 0.03 },
  // black A-pillars / roof panel
  { p: 'top', l: 'gloss', g: [1.12, 1.4], pts: [[0.0, -1], [0.0, 0.64], [-0.62, 0.64], [-0.64, -1]], r: 0.03 },
  { p: 'side', l: 'gloss', g: [0.5, 1.2], pts: [[0.5, 1.06], [0.02, 1.2], [-0.35, 1.215], [-0.66, 1.17], [-0.6, 1.14], [-0.3, 1.19], [0.05, 1.18], [0.45, 1.05]], r: 0.004 },
  // engine glass louvres
  { p: 'top', l: 'vent', g: [1.0, 1.4], pts: [[-0.95, -1], [-0.95, 0.12], [-1.6, 0.12], [-1.6, -1]], r: 0.01 },
  // headlights: slim swept units on the fender fronts, LED signature along the top edge
  { p: 'top', l: 'head', e: 'head', g: [0.5, 0.78], pts: [[2.22, 0.56], [2.27, 0.52], [2.19, 0.86], [1.96, 0.948], [1.94, 0.91]], r: 0.008 },
  { p: 'top', l: 'led', e: 'drl', g: [0.5, 0.78], pts: [[2.2, 0.84], [1.97, 0.93]], r: 0.007, line: true },
  { p: 'front', l: 'head', e: 'head', g: [2.1, 2.5], pts: [[0.54, 0.57], [0.66, 0.5], [0.86, 0.53], [0.92, 0.57], [0.6, 0.6]], r: 0.006 },
  { p: 'front', l: 'amber', g: [2.1, 2.5], pts: [[0.62, 0.47], [0.84, 0.49]], r: 0.006, line: true },
  // front emblem
  { p: 'top', l: 'badge', g: [0.45, 0.65], pts: [[2.33, -0.1], [2.33, 0.05], [2.29, 0.05], [2.29, -0.1]], r: 0.004 },
  // tail lights: two angular blades meeting at the outer corner
  { p: 'rear', l: 'tail', e: 'tail', g: [-2.5, -2.05], pts: [[0.42, 0.955], [0.9, 0.955], [0.95, 0.9], [0.82, 0.89], [0.45, 0.915]], r: 0.006 },
  { p: 'rear', l: 'tail', e: 'brake', g: [-2.5, -2.05], pts: [[0.5, 0.83], [0.8, 0.84], [0.95, 0.88], [0.93, 0.8], [0.78, 0.8], [0.52, 0.8]], r: 0.006 },
  { p: 'side', l: 'tail', e: 'tail', g: [0.8, 1.2], pts: [[-2.16, 0.9], [-2.3, 0.905], [-2.3, 0.8], [-2.2, 0.82]], r: 0.006 },
  { p: 'rear', l: 'reverse', e: 'reverse', g: [-2.5, -2.05], pts: [[0.3, 0.93], [0.4, 0.93]], r: 0.012, line: true },
  // rear centre panel with plate
  { p: 'rear', l: 'gloss', g: [-2.5, -2.05], pts: [[-0.4, 0.86], [0.4, 0.86], [0.42, 0.95], [-0.42, 0.95]], r: 0.01 },
  { p: 'rear', l: 'trim', g: [-2.5, -2.1], pts: [[-0.27, 0.6], [0.27, 0.6], [0.27, 0.74], [-0.27, 0.74]], r: 0.015 },
  // panel gaps: door, front trunk lid, rear hatch
  { p: 'side', l: 'gap', g: [0.8, 1.2], pts: [[0.82, 0.2], [0.8, 0.88], [-0.34, 0.9], [-0.3, 0.2]], r: 0.002, line: true },
  { p: 'top', l: 'gap', g: [0.6, 1.0], pts: [[2.27, -0.1], [2.22, 0.52], [1.02, 0.68], [0.9, 0.62], [0.9, -0.1]], r: 0.002, line: true },
  { p: 'top', l: 'gap', g: [0.95, 1.2], pts: [[-0.68, 0.5], [-2.2, 0.55], [-2.26, -0.1]], r: 0.002, line: true },
];

export default {
  id: 'c8z06',
  dims: { len: 4.685, wid: 2.025, hgt: 1.225, wb: 2.723, trackF: 1.69, trackR: 1.67, rF: 0.3365, rR: 0.353, wF: 0.275, wR: 0.345, belt: 0.9 },
  interior: { seatZ: -0.2, seatX: 0.34, hip: 0.24, dashZ: 0.48 },
  wheels: { style: 'z06', color: 0x2a2c30, finish: 'satin', caliper: 0xd81818 },
  paint: { color: 0xc8a415, finish: 'tintcoat' },
  body(S) { return c8Body(S, this.dims, { quadCentre: true, wing: 'z07', bigIntake: true }); },
  decals: C8_DECALS,
};
