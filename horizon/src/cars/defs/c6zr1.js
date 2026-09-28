// 2009 Chevrolet Corvette ZR1 (C6). 4460 L x 1928 W x 1244 H mm, 2685 mm wheelbase,
// 285/30ZR19 front and 335/25ZR20 rear. Long hood with the raised centre section and its
// polycarbonate window over the supercharger, exposed headlamps, quad round tail lamps,
// carbon splitter, rockers and roof, and the raised spoiler.
import { MAT } from '../sdf.js';
import { shapeFrom, glassDecals } from './_gen.js';

export const dims = { len: 4.46, wid: 1.928, hgt: 1.244, wb: 2.685, trackF: 1.61, trackR: 1.588, rF: 0.327, rR: 0.338, wF: 0.285, wR: 0.335, belt: 0.86 };

export const C6 = (o = {}) => ({
  dims,
  nose: 2.2675, tail: -2.1925,
  tipNose: [0.24, 0.5], tipTail: [0.34, 0.9],
  noseRound: [[0, 2], [0.42, 2.4], [0.4, 2.6], [0.38, 2.6], [0.36, 2.5], [0.4, 2.4], [0.5, 2.2], [0.5, 2.1], [0.5, 2]],
  tailRound: [[0, 3], [0.2, 3.4], [0.22, 3.4], [0.24, 3.4], [0.26, 3.2], [0.28, 3], [0.3, 2.8], [0.3, 2.8], [0.3, 2.8]],
  floor: [[2.27, 0.26], [2.1, 0.14], [1.8, 0.125], [0, 0.12], [-1.7, 0.13], [-2.0, 0.2], [-2.19, 0.33]],
  rocker: [[2.27, 0.3], [2.0, 0.2], [0, 0.175], [-1.9, 0.2], [-2.19, 0.36]],
  side: [[2.27, 0.36], [1.9, 0.44], [1.3, 0.49], [0, 0.48], [-1.3, 0.52], [-2.19, 0.55]],
  upper: [[2.27, 0.44], [1.9, 0.56], [1.3, 0.66], [0, 0.66], [-1.3, 0.74], [-2.19, 0.76]],
  crest: [[2.27, 0.5], [2.1, 0.6], [1.8, 0.7], [1.35, 0.775], [0.9, 0.785], [0.3, 0.81], [-0.3, 0.855], [-0.9, 0.895], [-1.35, 0.93], [-1.9, 0.945], [-2.19, 0.905]],
  valley: [[2.27, 0.5], [2.1, 0.59], [1.8, 0.67], [1.35, 0.735], [0.9, 0.755], [0.3, 0.795], [-0.3, 0.85], [-1.35, 0.94], [-1.9, 0.955], [-2.19, 0.91]],
  top: [[2.27, 0.5], [2.1, 0.61], [1.8, 0.7], [1.35, 0.77], [0.9, 0.805], [0.3, 0.84], [0.1, 0.85], [-1.3, 0.94], [-1.9, 0.96], [-2.19, 0.91]],
  floorX: 0.68, sillX: [[2, 0.78], [0, 0.82], [-2, 0.8]], rockerX: [[2, 0.86], [1.3, 0.9], [0, 0.875], [-1.3, 0.91], [-2, 0.88]],
  sideX: [[2.2, 0.84], [1.8, 0.93], [1.34, 0.958], [0.8, 0.935], [0, 0.915], [-0.7, 0.935], [-1.34, 0.964], [-1.9, 0.95], [-2.19, 0.9]],
  upperX: [[2.2, 0.82], [1.8, 0.915], [1.34, 0.945], [0.8, 0.92], [0, 0.9], [-0.7, 0.92], [-1.34, 0.95], [-1.9, 0.935], [-2.19, 0.88]],
  crestX: [[2.2, 0.76], [1.34, 0.86], [0.6, 0.85], [0, 0.84], [-1.34, 0.885], [-2.19, 0.83]],
  valleyX: [[2.2, 0.55], [1.34, 0.6], [0.3, 0.58], [-1.34, 0.7], [-2.19, 0.66]],
  innerX: [[2.2, 0.3], [1.34, 0.28], [0.3, 0.3], [-1.34, 0.35], [-2.19, 0.3]],
  tub: [0.08, -1.3], tubFloor: 0.34, sillW: 0.1,
  extraZ: [1.3425, -1.3425],
  cabin: {
    z0: 0.16, z1: -2.06,
    roof: [[0.16, 0.84], [0.08, 0.875], [-0.2, 1.0], [-0.45, 1.13], [-0.62, 1.2], [-0.95, 1.244], [-1.2, 1.228], [-1.45, 1.165], [-1.7, 1.075], [-1.95, 0.99], [-2.06, 0.965]],
    roofX: [[0.16, 0.7], [-0.6, 0.6], [-1.0, 0.6], [-1.45, 0.63], [-2.06, 0.7]],
    glassX: [[0.16, 0.8], [-0.6, 0.75], [-1.0, 0.75], [-1.45, 0.76], [-2.06, 0.78]],
    lowX: [[0.16, 0.82], [-0.6, 0.81], [-1.45, 0.84], [-2.06, 0.8]],
    glass: { sideFront: 0.02, sideRear: -1.36, wsBase: 0.1, wsTop: -0.6, backTop: -1.24, backBase: -1.97, roofBlack: !!o.carbonRoof, cPillar: 0.12, aPillar: 0.14 },
  },
  features: [
    // lower mouth and brake ducts
    { p: 'front', g: [1.9, 2.5], pts: [[-0.1, 0.17], [0.52, 0.17], [0.6, 0.24], [0.54, 0.36], [-0.1, 0.37]], r: 0.03, depth: 0.08, soft: 0.012, mat: MAT.GRILLE },
    { p: 'front', g: [1.8, 2.5], pts: [[0.66, 0.2], [0.82, 0.2], [0.84, 0.3], [0.68, 0.3]], r: 0.02, depth: 0.06, soft: 0.01, mat: MAT.GRILLE },
    // front fender vents behind the wheels
    { p: 'side', g: [0.7, 1.2], pts: [[0.72, 0.52], [0.48, 0.52], [0.46, 0.66], [0.7, 0.68]], r: 0.015, depth: 0.03, soft: 0.01, mat: MAT.GRILLE },
    // hood: raised centre section (ZR1) with the window over the supercharger
    ...(o.hoodBulge ? [{ p: 'top', g: [0.6, 1.0], pts: [[1.75, -0.1], [1.75, 0.26], [0.35, 0.3], [0.35, -0.1]], r: 0.06, depth: -0.035, soft: 0.14 }] : []),
    // tail: lamp pockets and the diffuser
    { p: 'rear', g: [-2.5, -2.0], pts: [[-0.3, 0.3], [0.3, 0.3], [0.3, 0.2], [-0.3, 0.2]], r: 0.02, depth: 0.05, soft: 0.01, mat: MAT.GRILLE },
    { p: 'rear', g: [-2.5, -1.95], pts: [[-1, 0.0], [1, 0.0], [1, 0.34], [-1, 0.34]], r: 0, depth: 0, soft: 0.01, face: -1, mat: o.carbon ? MAT.CARBON : MAT.TRIM },
    { p: 'front', g: [1.9, 2.5], pts: [[-1, 0.05], [1, 0.05], [1, 0.15], [-1, 0.15]], r: 0, depth: 0, soft: 0.004, mat: o.carbon ? MAT.CARBON : MAT.TRIM },
    { p: 'side', g: [0.6, 1.2], pts: [[1.0, 0.1], [-1.0, 0.1], [-1.0, 0.19], [1.0, 0.2]], r: 0, depth: 0, soft: 0.006, mat: MAT.TRIM },
  ],
});

export const C6_DECALS = (P, o = {}) => [
  ...glassDecals(P),
  ...(o.hoodBulge ? [{ p: 'top', l: 'smoke', g: [0.75, 1.0], pts: [[1.45, -1], [1.45, 0.14], [0.95, 0.15], [0.95, -1]], r: 0.03 }] : []),
  // exposed headlamps: swept teardrops on the fender tops
  { p: 'top', l: 'head', e: 'head', g: [0.45, 0.72], pts: [[2.22, 0.5], [2.16, 0.78], [1.86, 0.88], [1.8, 0.8], [1.95, 0.56]], r: 0.01 },
  { p: 'top', l: 'led', e: 'drl', g: [0.45, 0.72], pts: [[2.18, 0.6], [1.9, 0.82]], r: 0.005, line: true },
  { p: 'front', l: 'amber', g: [2.0, 2.4], pts: [[0.62, 0.36], [0.8, 0.38]], r: 0.008, line: true },
  { p: 'front', l: 'badge', g: [2.1, 2.4], pts: [[0, 0.45]], r: 0.035 },
  // quad round tail lamps and the centre plate recess
  { p: 'rear', l: 'tail', e: 'tail', g: [-2.5, -2.05], pts: [[0.52, 0.78]], r: 0.075 },
  { p: 'rear', l: 'tail', e: 'brake', g: [-2.5, -2.05], pts: [[0.74, 0.77]], r: 0.075 },
  { p: 'rear', l: 'reverse', e: 'reverse', g: [-2.5, -2.05], pts: [[0.63, 0.66], [0.66, 0.66]], r: 0.015, line: true },
  { p: 'rear', l: 'trim', g: [-2.5, -2.05], pts: [[-0.26, 0.5], [0.26, 0.5], [0.26, 0.66], [-0.26, 0.66]], r: 0.012 },
  { p: 'rear', l: 'badge', g: [-2.5, -2.05], pts: [[0, 0.8]], r: 0.03 },
  // panel gaps
  { p: 'side', l: 'gap', g: [0.8, 1.2], pts: [[0.05, 0.2], [0.02, 0.84], [-1.28, 0.9], [-1.24, 0.2]], r: 0.002, line: true },
  { p: 'top', l: 'gap', g: [0.55, 1.0], pts: [[2.2, 0.62], [1.4, 0.72], [0.16, 0.7]], r: 0.002, line: true },
];

export const C6_PARTS = (S, o = {}) => {
  const { smin, ellipsoid, capsule, cyl, sub, union, prism, wing, box } = S;
  const parts = [];
  parts.push({ f: smin(ellipsoid([0.93, 0.93, 0.02], [0.07, 0.05, 0.075], MAT.PAINT), capsule([0.8, 0.9, 0.04], [0.9, 0.92, 0.02], 0.014, MAT.TRIM), 0.015), bounds: [[0.76, 0.84, -0.1], [1.03, 1.0, 0.12]] });
  // quad exhaust tips in two pairs
  const tips = [[0.22, 0.26], [0.36, 0.26]];
  parts.push({ f: union(...tips.map(([ex, ey]) => sub(cyl([ex, ey, -2.23], [ex, ey, -2.05], 0.048, MAT.CHROME), cyl([ex, ey, -2.3], [ex, ey, -2.1], 0.04, MAT.TRIM), MAT.TRIM))), bounds: [[0.15, 0.2, -2.26], [0.43, 0.33, -2.03]] });
  // splitter
  parts.push({ f: prism('zx', [[1.95, -0.1], [1.95, 0.84], [2.1, 0.86], [2.26, 0.5], [2.3, -0.1]], 0.1, 0.12, 0.004, o.carbon ? MAT.CARBON : MAT.TRIM), bounds: [[-0.02, 0.09, 1.9], [0.9, 0.13, 2.34]] });
  if (o.spoiler === 'zr1') {
    parts.push({ f: union(wing([0, 1.035, -1.98], 0.2, 0.08, 0, 0.72, -0.05, 0.03, MAT.PAINT), box([0.6, 0.99, -2.06], [0.012, 0.05, 0.05], 0.004, MAT.PAINT)), bounds: [[-0.02, 0.92, -2.22], [0.76, 1.1, -1.94]], tris: 4000 });
  } else {
    parts.push({ f: prism('zy', [[-2.02, 0.955], [-2.2, 0.915], [-2.21, 0.955], [-2.12, 0.975]], 0, 0.72, 0.006, MAT.PAINT), bounds: [[-0.02, 0.9, -2.24], [0.76, 0.99, -1.98]] });
  }
  return parts;
};

const opts = { carbon: true, carbonRoof: true, hoodBulge: true, spoiler: 'lip' };
const P = C6(opts);

export default {
  id: 'c6zr1',
  dims,
  interior: { seatZ: -0.75, seatX: 0.34, hip: 0.28, dashZ: -0.05 },
  wheels: { style: 'spoke10', color: 0x9aa0a8, finish: 'chrome', caliper: 0x1c4fd8 },
  paint: { color: 0x0e2a78, finish: 'metallic' },
  shape: shapeFrom(P),
  parts(S) { return C6_PARTS(S, opts); },
  decals: C6_DECALS(P, opts),
};
