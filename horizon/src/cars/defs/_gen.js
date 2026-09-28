// Station generator for the parametric modeler. Rather than typing every cross-section, a car
// is described by side-view height profiles and plan-view half widths for each keypoint,
// how the plan outline rounds off at the nose and tail, where the cockpit tub is, and the
// greenhouse (windscreen base, roof, backlight). This returns the lower and cabin lofts
// plus matching glass decals, in the same format as the hand-built C8 tables.
//
// Lower keypoints (floor centre to top centre):
//   0 floor centre  1 floor edge  2 sill corner  3 rocker  4 side max  5 upper side
//   6 fender crest / belt  7 hood valley  8 inner top  9 top centre
// Cabin keypoints: 0 belt (pinned to lower 6)  1 glass low  2 glass high  3 roof edge  4 roof centre
import { curve } from '../sdf.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fn = (v) => (typeof v === 'number' ? () => v : typeof v === 'function' ? v : curve(v));
const lerp = (a, b, t) => a + (b - a) * t;

// plan-view rounding: 1 in the body, falling to 0 at the tip with a superellipse of exponent p
function roundK(z, tip, len, p) {
  const u = clamp((z - (tip - len * Math.sign(tip))) / (len * Math.sign(tip)), 0, 1);
  return Math.pow(Math.max(0, 1 - Math.pow(u, p)), 1 / p);
}

export function lowerStations(P) {
  const Y = {
    f: fn(P.floor), r: fn(P.rocker), s: fn(P.side), u: fn(P.upper), c: fn(P.crest), v: fn(P.valley), t: fn(P.top),
  };
  const X = {
    f: fn(P.floorX), si: fn(P.sillX), r: fn(P.rockerX), s: fn(P.sideX), u: fn(P.upperX), c: fn(P.crestX), v: fn(P.valleyX), i: fn(P.innerX ?? ((z) => X.v(z) * 0.45)),
  };
  const nose = P.nose, tail = P.tail;
  const NR = P.noseRound, TR = P.tailRound;
  // per-keypoint rounding: [length, exponent] for the nose and tail
  const tipT = [0, 0, 0, 0.06, 0.4, 0.66, 0.84, 0.93, 0.97, 1];
  const zs = new Set([nose, nose - 0.012, tail, tail + 0.012]);
  for (const d of [0.04, 0.09, 0.16, 0.26, 0.4, 0.58]) { zs.add(nose - d); zs.add(tail + d); }
  for (let z = nose - 0.8; z > tail + 0.75; z -= P.step ?? 0.22) zs.add(+z.toFixed(4));
  for (const z of P.extraZ ?? []) zs.add(z);
  const tub = P.tub;
  if (tub) { zs.add(tub[0] + 0.03); zs.add(tub[0] - 0.02); zs.add(tub[1] - 0.03); zs.add(tub[1] + 0.02); }
  const list = [...zs].filter((z) => z <= nose && z >= tail).sort((a, b) => b - a);
  const stations = list.map((z) => {
    const ys = [Y.f(z), Y.f(z), Y.f(z) + 0.003, Y.r(z), Y.s(z), Y.u(z), Y.c(z), Y.v(z), 0, Y.t(z)];
    ys[8] = lerp(ys[7], ys[9], 0.72) + (P.crown ?? 0.004);
    const xs = [0, X.f(z), X.si(z), X.r(z), X.s(z), X.u(z), X.c(z), X.v(z), X.i(z), 0];
    // plan rounding and the tip blend
    const front = z > 0;
    const R = front ? NR : TR, tip = front ? nose : tail;
    for (let j = 1; j < 9; j++) {
      const [len, p] = R[j] ?? R.at(-1);
      xs[j] *= roundK(z, tip, len, p);
    }
    const u = clamp(1 - Math.abs(tip - z) / (R.blend ?? 0.12), 0, 1);
    if (u > 0) {
      const lo = front ? P.tipNose[0] : P.tipTail[0], hi = front ? P.tipNose[1] : P.tipTail[1];
      const w = Math.pow(u, 2.2);
      for (let j = 0; j < 10; j++) ys[j] = lerp(ys[j], lerp(lo, hi, tipT[j]), w);
    }
    if (Math.abs(z - tip) < 1e-6) for (let j = 0; j < 10; j++) xs[j] = 0;
    // cockpit tub: the top dives to a floor between the sills
    if (tub && z < tub[0] && z > tub[1]) {
      xs[7] = xs[6] - (P.sillW ?? 0.11); ys[7] = ys[6] - 0.02;
      xs[8] = xs[7] - 0.06; ys[8] = P.tubFloor ?? 0.32;
      xs[9] = 0; ys[9] = (P.tubFloor ?? 0.32) - 0.02;
    }
    // keep the section ordered (no fold-backs)
    for (let j = 1; j < 10; j++) if (j <= 6) ys[j] = Math.max(ys[j], ys[j - 1] + (j === 2 ? 0.001 : 0.0005));
    return { z, p: xs.map((x, j) => [Math.max(0, x), ys[j]]) };
  });
  return { sharp: P.sharp ?? [2, 3, 6], arch: { floorEdge: 1, wellTop: 2, last: 5 }, blur: P.blur ?? 0.02, stations };
}

// greenhouse: roof(z) side profile from the screen base to the backlight base, widths
export function cabinStations(P, lower) {
  const C = P.cabin;
  const roof = fn(C.roof), roofX = fn(C.roofX), glassX = fn(C.glassX ?? ((z) => roofX(z) + 0.1)), lowX = fn(C.lowX ?? ((z) => glassX(z) + 0.04));
  const belt = fn(P.crest);
  const zs = [];
  for (let z = C.z0; z >= C.z1 - 1e-6; z -= 0.06) zs.push(+z.toFixed(4));
  if (zs.at(-1) !== C.z1) zs.push(C.z1);
  const stations = zs.map((z) => {
    const b = belt(z), r = Math.max(roof(z), b + 0.012);
    const h = r - b;
    const k = clamp(h / 0.3, 0, 1); // flattens where the cabin meets the body
    const rx = roofX(z), gx = glassX(z), lx = lowX(z);
    const edge = rx + (gx - rx) * 0.1;
    const xs = [lx + 0.05, lerp(rx * 0.7, lx, k), lerp(rx * 0.6, gx, k), lerp(rx * 0.45, edge, k), 0];
    const ys = [b, b + h * 0.12, b + h * 0.72, r - h * 0.04 - (C.crown ?? 0.02) * k, r];
    return { z, p: xs.map((x, j) => [x, ys[j]]) };
  });
  return { sharp: [3], attachTo: 6, blur: C.blur ?? 0.025, stations };
}

// side window, screen and backlight decals from the same numbers
export function glassDecals(P) {
  const C = P.cabin, roof = fn(C.roof), belt = fn(P.crest), roofX = fn(C.roofX);
  const G = C.glass;
  const side = [];
  // bottom edge along the belt, back up the C-pillar, along the roof edge, down the A-pillar
  for (let z = G.sideFront; z >= G.sideRear; z -= 0.05) side.push([z, belt(z) + (G.beltGap ?? 0.03)]);
  const top = [];
  for (let z = G.sideRear + (G.cPillar ?? 0.08); z <= G.sideFront - (G.aPillar ?? 0.1); z += 0.05) top.push([z, roof(z) - (G.roofGap ?? 0.05)]);
  side.push(...top);
  const out = [{ p: 'side', l: 'glass', g: [0.35, 1.3], pts: side.map(([z, y]) => [+z.toFixed(3), +y.toFixed(3)]), r: 0.012 }];
  // screen: top view from the screen base to the roof front
  const ws = [[G.wsBase, -1], [G.wsBase, roofX(G.wsBase) + 0.08], [G.wsTop, roofX(G.wsTop) - 0.02], [G.wsTop, -1]];
  out.push({ p: 'top', l: 'glass', g: [0.7, 1.5], pts: ws, r: 0.02 });
  if (G.backTop !== undefined) out.push({ p: 'top', l: 'glass', g: [0.7, 1.5], pts: [[G.backTop, -1], [G.backTop, roofX(G.backTop) - 0.03], [G.backBase, roofX(G.backBase) - 0.02], [G.backBase, -1]], r: 0.03 });
  if (G.roofBlack) out.push({ p: 'top', l: 'gloss', g: [1.0, 1.5], pts: [[G.wsTop, -1], [G.wsTop, roofX(G.wsTop) - 0.02], [G.backTop ?? G.sideRear, roofX(G.backTop ?? G.sideRear) - 0.02], [G.backTop ?? G.sideRear, -1]], r: 0.02 });
  return out;
}

export function shapeFrom(P) {
  const lower = lowerStations(P);
  return {
    lower,
    cabin: P.cabin ? cabinStations(P, lower) : null,
    arches: [
      { z: P.dims.wb / 2, y: P.dims.rF, r: P.dims.rF + (P.archGap ?? 0.045), xin: P.archIn ?? 0.6 },
      { z: -P.dims.wb / 2, y: P.dims.rR, r: P.dims.rR + (P.archGap ?? 0.048), xin: P.archIn ?? 0.6 },
    ],
    features: P.features ?? [],
  };
}

// common small parts (SDF): door mirror, exhaust tips, lip spoiler, splitter
export function mirror(S, [x, y, z], mat = 0) {
  const { smin, ellipsoid, capsule } = S;
  return { f: smin(ellipsoid([x, y, z], [0.07, 0.048, 0.07], mat), capsule([x - 0.13, y - 0.03, z + 0.03], [x - 0.02, y - 0.01, z], 0.014, 1), 0.015), bounds: [[x - 0.17, y - 0.08, z - 0.1], [x + 0.1, y + 0.07, z + 0.12]] };
}
export function tips(S, list, z0, z1, r = 0.045, oval = 1) {
  const { cyl, sub, union, ellipsoid } = S;
  const f = union(...list.map(([x, y]) => sub(cyl([x, y, z0], [x, y, z1], r, 3), cyl([x, y, z0 - 0.1], [x, y, z1 - 0.03], r * 0.82, 1), 1)));
  const xs = list.map((p) => p[0]), ys = list.map((p) => p[1]);
  return { f, bounds: [[Math.min(...xs) - r - 0.02, Math.min(...ys) - r - 0.02, z0 - 0.03], [Math.max(...xs) + r + 0.02, Math.max(...ys) + r + 0.02, z1 + 0.03]] };
}
export function lip(S, zFront, zBack, yBase, height, halfW, mat = 0) {
  return { f: S.prism('zy', [[zFront, yBase], [zBack, yBase - 0.02], [zBack - 0.01, yBase + height], [zFront - 0.06, yBase + height * 0.35]], 0, halfW, 0.006, mat), bounds: [[-0.02, yBase - 0.05, zBack - 0.04], [halfW + 0.04, yBase + height + 0.04, zFront + 0.02]] };
}
export function splitter(S, zBack, zFront, y, halfW, mat = 1) {
  return { f: S.prism('zx', [[zBack, -0.1], [zBack, halfW], [zFront - 0.12, halfW + 0.02], [zFront, halfW * 0.6], [zFront + 0.02, -0.1]], y - 0.012, y + 0.012, 0.004, mat), bounds: [[-0.02, y - 0.03, zBack - 0.02], [halfW + 0.05, y + 0.03, zFront + 0.05]] };
}
