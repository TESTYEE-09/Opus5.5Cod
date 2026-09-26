// Map layouts, lighting and sound for each battlefield. Every layout builds the south half
// with `B` and the north half again with `M`, a copy mirrored through the centre, so both
// teams get the same ground.
//
// The Ground War maps are 600 m square (14 times the area of the old 160 m maps): the
// hand-built 80 m town sits in the middle (built through shiftApi, in its own 0-80
// coordinates), with five capture points, walled villages around the outer flags, open
// country for the tanks, a base for each side and the hills beyond the fence. Shipment is the
// opposite: a 48 m ship's deck of container lanes, in the rain.
import { SIZE, shiftApi, terrainY } from './world.js';
import { mulberry } from './textures.js';

const DESTRUCTIBLE = new Set(['plaster', 'plaster2', 'brick', 'planks', 'corrugated']);

// ---------- shared building blocks ----------
// Walls of plaster, brick, planks or sheet metal are split into panels that explosives
// (and tanks) can knock out; concrete stays standing.
export function building(B, x0, z0, x1, z1, h, open, mat, o = {}) {
  const t = 0.5, trim = o.trim || 'trim';
  const destr = o.destr ?? DESTRUCTIBLE.has(mat);
  const one = (side, a, b, y0, y1, id) => {
    if (side === 's') B.box(a, y0, z0, b, y1, z0 + t, mat, true, id);
    else if (side === 'n') B.box(a, y0, z1 - t, b, y1, z1, mat, true, id);
    else if (side === 'w') B.box(x0, y0, a, x0 + t, y1, b, mat, true, id);
    else B.box(x1 - t, y0, a, x1, y1, b, mat, true, id);
  };
  const piece = (side, a, b, y0, y1) => {
    if (b - a <= 0) return -1;
    if (!destr) { one(side, a, b, y0, y1, -1); return -1; }
    const n = Math.max(1, Math.round((b - a) / 2.2));
    let id = -1;
    for (let i = 0; i < n; i++) { id = B.obj('wall'); one(side, a + (b - a) * i / n, a + (b - a) * (i + 1) / n, y0, y1, id); }
    return id;
  };
  let owner = -1;
  const deco = (side, a, b, y0, y1, p = 0.07) => {
    if (side === 's') B.box(a, y0, z0 - p, b, y1, z0 + t + p, trim, false, owner);
    else if (side === 'n') B.box(a, y0, z1 - t - p, b, y1, z1 + p, trim, false, owner);
    else if (side === 'w') B.box(x0 - p, y0, a, x0 + t + p, y1, b, trim, false, owner);
    else B.box(x1 - t - p, y0, a, x1 + p, y1, b, trim, false, owner);
  };
  for (const side of ['s', 'n', 'w', 'e']) {
    const horiz = side === 's' || side === 'n';
    let cur = horiz ? x0 : z0 + t;
    const end = horiz ? x1 : z1 - t;
    for (const op of open.filter(q => q.s === side).sort((p, q) => p.a - q.a)) {
      piece(side, cur, op.a, 0, h);
      const top = op.t === 'door' ? (op.h || 2.5) : 2.2;
      if (op.t === 'door') owner = piece(side, op.a, op.a + op.w, top, h);
      else { piece(side, op.a, op.a + op.w, 0, 1.0); owner = piece(side, op.a, op.a + op.w, top, h); }
      if (!o.bare) {
        deco(side, op.a - 0.12, op.a + op.w + 0.12, top, top + 0.14);
        deco(side, op.a - 0.14, op.a + 0.04, op.t === 'door' ? 0 : 1.0, top, 0.04);
        deco(side, op.a + op.w - 0.04, op.a + op.w + 0.14, op.t === 'door' ? 0 : 1.0, top, 0.04);
        if (op.t !== 'door') deco(side, op.a - 0.14, op.a + op.w + 0.14, 0.9, 1.03, 0.1);
      }
      cur = op.a + op.w;
      owner = -1;
    }
    piece(side, cur, end, 0, h);
  }
  B.box(x0, h, z0, x1, h + 0.3, z1, o.roof || 'roof');
  if (!o.bare) {
    const c = 0.12, y0 = h - 0.1, y1 = h + 0.42, cm = o.cornice || trim;
    B.box(x0 - c, y0, z0 - c, x1 + c, y1, z0 + 0.3, cm, false);
    B.box(x0 - c, y0, z1 - 0.3, x1 + c, y1, z1 + c, cm, false);
    B.box(x0 - c, y0, z0 + 0.3, x0 + 0.3, y1, z1 - 0.3, cm, false);
    B.box(x1 - 0.3, y0, z0 + 0.3, x1 + c, y1, z1 - 0.3, cm, false);
  }
  if (o.floor !== null) B.box(x0 + t, -0.02, z0 + t, x1 - t, 0.006, z1 - t, o.floor || 'floor', false);
}

export const crate = (B, x, z, stack) => {
  B.box(x, 0, z, x + 1.5, 1.3, z + 1.5, 'crate');
  if (stack) B.box(x, 1.3, z, x + 1.5, 2.6, z + 1.5, 'crate');
};

// Collision in the old two-box shape, drawn as a detailed vehicle.
// Intact cars can be shot up or blown up: they explode and stay as a burnt-out wreck.
export function car(B, x0, z0, x1, z1, o = {}) {
  const id = o.burnt ? -1 : B.obj('car');
  B.box(x0, 0, z0, x1, 1.1, z1, 'invis', true, id);
  const ns = z1 - z0 > x1 - x0;
  if (ns) B.box(x0 + 0.5, 1.1, z0 + 1, x1 - 0.5, 1.7, z1 - 1.5, 'invis', true, id);
  else B.box(x0 + 1, 1.1, z0 + 0.5, x1 - 1.5, 1.7, z1 - 0.5, 'invis', true, id);
  B.prop('car', (x0 + x1) / 2, (z0 + z1) / 2, { rot: (ns ? 0 : Math.PI / 2) + (o.flip ? Math.PI : 0), len: Math.max(x1 - x0, z1 - z0), wid: Math.min(x1 - x0, z1 - z0) - 0.1, ...o, obj: id });
}

// red fuel barrels explode when shot; other drums just burst
export function barrel(B, x, z, fuel = true, colors = null) {
  const id = B.obj(fuel ? 'barrel' : 'drum');
  B.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, 'invis', true, id);
  B.prop('barrel', x, z, { colors: fuel ? [0xa3261a] : colors || [0x2b4a7a, 0x3a6a3a, 0x5a5a3a], obj: id });
}

// a run of wooden fence in 2 m panels
export function fence(B, x0, z0, x1, z1, h = 1.3) {
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.round(len / 2));
  for (let i = 0; i < n; i++) {
    const id = B.obj('fence');
    const a = i / n, b = (i + 1) / n;
    if (along) B.box(x0 + (x1 - x0) * a, 0, z0 - 0.08, x0 + (x1 - x0) * b, h, z0 + 0.08, 'planks', true, id);
    else B.box(x0 - 0.08, 0, z0 + (z1 - z0) * a, x0 + 0.08, h, z0 + (z1 - z0) * b, 'planks', true, id);
  }
}

// 6.1 m shipping containers stacked one per material in mats; ns runs them along z.
// Each gets its frame, door hardware and (mostly) a company logo on both long sides.
const CCOL = { containerR: 0x7b3325, containerB: 0x2d5870, containerG: 0x3b6a3a, containerY: 0xb08a2a, containerW: 0x9a9ea0,
  containerO: 0xa8541e, containerT: 0x2f6a6a, containerN: 0x243452 };
const hash = (x, z) => { let h = Math.imul(Math.round(x * 10) ^ 0x2c1b3c6d, 0x85ebca6b) ^ Math.imul(Math.round(z * 10) + 0x297a2d39, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); return (h ^ (h >>> 15)) >>> 0; };
export function cstack(B, x, z, ns, mats, o = {}) {
  const x1 = ns ? x + 2.44 : x + 6.1, z1 = ns ? z + 6.1 : z + 2.44;
  const collide = o.collide ?? true, y0 = o.y || 0;
  mats.forEach((m, i) => B.box(x, y0 + i * 2.6, z, x1, y0 + (i + 1) * 2.6, z1, m, collide));
  const cx = (x + x1) / 2, cz = (z + z1) / 2, h = hash(cx, cz);
  B.prop('cframe', cx, cz, { y: y0, rot: (ns ? 0 : Math.PI / 2) + (h & 1 ? Math.PI : 0), cols: mats.map(m => CCOL[m] ?? 0x5a5e60) });
  if (o.plain) return;
  mats.forEach((m, lv) => {
    if (((h >> (8 + lv * 2)) & 3) === 0) return;
    const idx = (h >> (3 + lv * 3)) % 10, y = y0 + lv * 2.6 + 1.55, col = m === 'containerW' ? 0x2a3440 : 0xe8e6de;
    if (ns) { B.decal(x1, y, cz, 3.6, 0.45, Math.PI / 2, idx, { color: col }); B.decal(x, y, cz, 3.6, 0.45, -Math.PI / 2, idx, { color: col }); }
    else { B.decal(cx, y, z1, 3.6, 0.45, 0, idx, { color: col }); B.decal(cx, y, z, 3.6, 0.45, Math.PI, idx, { color: col }); }
    if ((h >> 20) & 1) {
      const code = 13 + ((h >> 21) & 1), cy = y0 + lv * 2.6 + 2.2;
      if (ns) B.decal(x1, cy, z1 - 1, 1.5, 0.19, Math.PI / 2, code, { color: col }); else B.decal(x1 - 1, cy, z1, 1.5, 0.19, 0, code, { color: col });
    }
  });
}
export function container(B, x, z, ns, mat, top = null) { cstack(B, x, z, ns, top ? [mat, top] : [mat]); }

function stairs(B, x0, x1, zStart, dir, steps, rise, mat) {
  for (let i = 0; i < steps; i++) {
    const za = zStart + dir * 0.5 * i, zb = za + dir * 0.5;
    B.box(x0, 0, Math.min(za, zb), x1, rise * (i + 1), Math.max(za, zb), mat);
  }
}

// ---------- Crossroads: a desert town at a road junction, afternoon ----------
function crossHalf(B, team) {
  building(B, 6, 12, 22, 26, 4, [
    { s: 's', a: 18, w: 2, t: 'door' }, { s: 's', a: 9, w: 2, t: 'win' },
    { s: 'n', a: 16, w: 2, t: 'door' }, { s: 'n', a: 8, w: 2, t: 'win' },
    { s: 'e', a: 17, w: 2, t: 'door' }, { s: 'e', a: 21.5, w: 2, t: 'win' },
    { s: 'w', a: 15, w: 2, t: 'win' },
  ], team ? 'plaster2' : 'plaster');
  B.box(14, 0, 12.5, 14.5, 4, 18, 'plaster'); B.box(14, 0, 20, 14.5, 4, 25.5, 'plaster'); B.box(14, 2.5, 18, 14.5, 4, 20, 'plaster');
  crate(B, 7, 23, false); crate(B, 19.5, 13, true);

  building(B, 52, 10, 72, 24, 5, [
    { s: 'w', a: 15, w: 4, t: 'door', h: 3.2 }, { s: 'n', a: 60, w: 2, t: 'door' }, { s: 's', a: 64, w: 2, t: 'door' },
    { s: 'n', a: 54, w: 2, t: 'win' }, { s: 'n', a: 67, w: 2, t: 'win' }, { s: 'e', a: 16, w: 2, t: 'win' },
  ], 'concrete', { floor: 'concrete' });
  B.box(55, 0, 13, 61, 2.6, 15.5, team ? 'containerB' : 'containerR');
  crate(B, 64, 18, true); crate(B, 65.5, 18, false); crate(B, 68, 13, false);

  building(B, 26, 24, 32, 30, 3.6, [
    { s: 'n', a: 28, w: 2, t: 'door' }, { s: 'w', a: 26, w: 2, t: 'win' }, { s: 's', a: 28, w: 2, t: 'win' },
  ], 'brick');
  stairs(B, 32, 33.5, 23, 1, 13, 0.3, 'concrete');
  B.box(26, 3.9, 24, 32, 4.9, 24.5, 'brick'); B.box(26, 3.9, 29.5, 32, 4.9, 30, 'brick');
  B.box(26, 3.9, 24.5, 26.5, 4.9, 29.5, 'brick'); B.box(31.5, 3.9, 24.5, 32, 4.9, 27, 'brick');

  B.box(2, 0, 30, 10, 2.2, 30.5, 'brick'); B.box(13, 0, 30, 22, 2.2, 30.5, 'brick');
  B.box(1, 0, 33, 3.5, 2.6, 39, team ? 'containerR' : 'containerB');
  B.box(33, 0, 20, 33.5, 1.0, 24, 'sandbag'); B.box(46.5, 0, 26, 47, 1.0, 30, 'sandbag');
  B.box(33, 0, 37.5, 34, 1.0, 42.5, 'sandbag');
  B.box(22, 0, 38.5, 31, 2.8, 41.5, 'invis');
  B.prop('bus', 26.5, 40, { rot: Math.PI / 2, len: 9, wid: 3, burnt: true });
  B.box(22, 0, 32, 26, 1.1, 32.5, 'concrete');
  B.box(36.5, 0, 30, 39, 1.0, 30.5, 'concrete');
  B.box(16, 0, 9, 20, 1.0, 9.5, 'sandbag'); B.box(56, 0, 6, 60, 1.0, 6.5, 'sandbag');
  car(B, 37, 16, 39, 20.5, { burnt: team === 1 });
  car(B, 41, 27, 43, 31.5, { flip: true });
  car(B, 10, 41, 14.5, 43, { burnt: team === 0 });
  crate(B, 28, 12, true); crate(B, 29.5, 12, false); crate(B, 46, 12, false); crate(B, 46, 13.5, true);
  crate(B, 24, 34, false); crate(B, 16, 34, false); crate(B, 62, 31, true); crate(B, 63.5, 31, false);
  crate(B, 70, 33, false); crate(B, 49, 33, false); crate(B, 10, 5, false); crate(B, 66, 4, false); crate(B, 24, 8, false);

  // set dressing
  const trunk = (x, z) => B.box(x - 0.25, 0, z - 0.25, x + 0.25, 3.5, z + 0.25, 'invis');
  B.prop('palm', 34.8, 2.6); trunk(34.8, 2.6);
  B.prop('olive', 3.5, 24); trunk(3.5, 24);
  B.prop('olive', 74.5, 30); trunk(74.5, 30);
  B.prop('palm', 45.6, 2.4); trunk(45.6, 2.4);
  for (const [x, z, r] of [[35.3, 12, -Math.PI / 2], [44.7, 24, Math.PI / 2], [8, 35.3, Math.PI], [58, 35.3, Math.PI], [72, 35.3, Math.PI]]) {
    B.prop('lamp', x, z, { rot: r }); B.box(x - 0.15, 0, z - 0.15, x + 0.15, 6, z + 0.15, 'invis');
  }
  for (const [x, z] of [[49.5, 6], [49.5, 20], [49.5, 31]]) { B.prop('pole', x, z, { rot: Math.PI / 2 }); B.box(x - 0.2, 0, z - 0.2, x + 0.2, 8, z + 0.2, 'invis'); }
  B.prop('wire', 49.5, 6, { dx: 0, dz: 14 }); B.prop('wire', 49.5, 20, { dx: 0, dz: 11 });
  for (const [x, z] of [[35, 32], [3.2, 12.5], [3.6, 11.6], [68.2, 28], [20.6, 27.6]]) barrel(B, x, z);
  B.prop('tires', 74.5, 14); B.box(74.1, 0, 13.6, 74.9, 0.8, 14.4, 'invis');
  B.prop('ac', 12, 11.75, { y: 2.9 }); B.prop('ac', 51.75, 12.5, { y: 3.6, rot: Math.PI / 2 });
  B.prop('awning', 19, 12, { y: 2.9, w: 2.6, d: 1.1, colors: team ? [0x2a6a8a, 0xe6ddc8] : [0xb03a2e, 0xe6ddc8] });
  B.prop('awning', 29, 30, { y: 2.8, w: 2.4, d: 1.0, rot: Math.PI, colors: [0x3a6a3a, 0xe6ddc8] });
  B.prop('dish', 18, 21, { y: 4.3 }); B.prop('dish', 68, 20, { y: 5.3 });
  B.prop('rubble', 25.5, 20.5); B.prop('rubble', 60, 28, { r: 1 }); B.prop('rubble', 12, 29, { r: 0.8, n: 8 });
}

// ---------- Harbor: container docks at sunset ----------
function harborHalf(B, team) {
  building(B, 5, 10, 23, 24, 7, [
    { s: 's', a: 9, w: 4, t: 'door', h: 4 }, { s: 'n', a: 15, w: 4, t: 'door', h: 4 },
    { s: 'e', a: 15, w: 3, t: 'door', h: 3 }, { s: 'w', a: 14, w: 2.5, t: 'win' },
    { s: 'n', a: 7, w: 2, t: 'win' },
  ], 'corrugated', { floor: 'concrete', cornice: 'concrete' });
  container(B, 8, 13, false, team ? 'containerW' : 'containerB');
  crate(B, 18, 19, true); crate(B, 19.5, 19, false); crate(B, 6, 20.5, false);
  B.prop('pallets', 11, 21, { n: 5 }); B.box(10.4, 0, 20.5, 11.6, 0.9, 21.5, 'invis');

  container(B, 27, 9, false, 'containerR', 'containerG');
  container(B, 27, 15, false, 'containerY');
  container(B, 37, 12, true, 'containerB');
  container(B, 44, 9, false, 'containerW', 'containerR');
  container(B, 44, 18, false, 'containerG');
  container(B, 29, 25, false, 'containerR');
  container(B, 47, 28, false, 'containerB', 'containerY');
  container(B, 22, 36.5, false, team ? 'containerY' : 'containerG');

  building(B, 58, 10, 70, 20, 3.6, [
    { s: 's', a: 62, w: 2, t: 'door' }, { s: 'n', a: 66, w: 2, t: 'door' }, { s: 'w', a: 14, w: 2, t: 'door' },
    { s: 's', a: 59, w: 2, t: 'win' }, { s: 's', a: 66.5, w: 2, t: 'win' }, { s: 'n', a: 60, w: 2, t: 'win' }, { s: 'e', a: 16.5, w: 2, t: 'win' },
  ], 'plaster', { floor: 'floor' });
  crate(B, 59, 17.8, false); crate(B, 67.8, 11, false);
  stairs(B, 70, 71.5, 7.5, 1, 13, 0.3, 'metal');
  B.box(58, 3.9, 10, 70, 4.9, 10.5, 'concrete'); B.box(58, 3.9, 19.5, 70, 4.9, 20, 'concrete');
  B.box(58, 3.9, 10.5, 58.5, 4.9, 19.5, 'concrete'); B.box(69.5, 3.9, 14.5, 70, 4.9, 19.5, 'concrete');

  B.prop('tank', 74.5, 29.5, { r: 1.7, h: 5.5 }); B.box(72.8, 0, 27.8, 76.2, 6, 31.2, 'invis');
  B.prop('tank', 74.5, 35.5, { r: 1.7, h: 4.5, color: 0xc8c2b0 }); B.box(72.8, 0, 33.8, 76.2, 5, 37.2, 'invis');
  B.prop('forklift', 22, 30.5, { rot: 0.4 }); B.box(21, 0, 29.3, 23, 2.4, 31.7, 'invis');
  B.box(10, 0, 6, 14, 0.9, 6.6, 'invis'); B.prop('jersey', 12, 6.3, { rot: Math.PI / 2, len: 4 });
  B.box(60, 0, 6, 64, 0.9, 6.6, 'invis'); B.prop('jersey', 62, 6.3, { rot: Math.PI / 2, len: 4 });
  B.box(52.5, 0, 22, 53.1, 0.9, 25, 'invis'); B.prop('jersey', 52.8, 23.5, { len: 3 });
  crate(B, 8, 30, true); crate(B, 9.5, 30, false); crate(B, 36, 27, false); crate(B, 62, 27, true);
  for (const [x, z, f] of [[40, 25.5, 1], [40.7, 26.1, 0], [55, 26, 1], [3, 20, 0], [3.6, 20.7, 1]]) barrel(B, x, z, !!f);
  B.prop('reel', 16, 31); B.box(15.1, 0, 30.3, 16.9, 1.6, 31.7, 'invis');
  // crane legs; the gantry itself is built once from the centre
  B.box(33.4, 0, 34.4, 34.6, 14, 35.6, 'invis'); B.box(45.4, 0, 34.4, 46.6, 14, 35.6, 'invis');
  for (const z of [6, 14, 22, 30]) { B.prop('bollard', 1.7, z); B.prop('bollard', 1.7, z + 4); }
  for (const [x, z, r] of [[26, 34.8, Math.PI], [54, 34.8, Math.PI], [2.2, 12, -Math.PI / 2], [2.2, 28, -Math.PI / 2], [72, 24.5, 0]]) {
    B.prop('lamp', x, z, { rot: r, h: 7, glow: [0xffb060, 5] }); B.box(x - 0.15, 0, z - 0.15, x + 0.15, 7, z + 0.15, 'invis');
  }
}

// ---------- Outpost: a snowed-in mountain base, overcast ----------
function outpostHalf(B, team) {
  building(B, 6, 12, 18, 20, 2.8, [
    { s: 'n', a: 12, w: 2, t: 'door' }, { s: 'e', a: 15, w: 2, t: 'door' },
    { s: 's', a: 8, w: 1.5, t: 'win' }, { s: 's', a: 14, w: 1.5, t: 'win' }, { s: 'w', a: 15, w: 1.5, t: 'win' },
  ], 'concrete', { roof: 'concrete', floor: 'concrete', trim: 'concrete' });
  B.prop('sandbagsRoof', 12, 12.2, { y: 3.1, w: 11.6 }); B.prop('sandbagsRoof', 12, 19.8, { y: 3.1, w: 11.6 });
  crate(B, 7, 18, false); crate(B, 16, 13, false);

  building(B, 50, 10, 66, 18, 3, [
    { s: 'w', a: 13, w: 2, t: 'door' }, { s: 'e', a: 13, w: 2, t: 'door' },
    { s: 's', a: 54, w: 2, t: 'win' }, { s: 's', a: 60, w: 2, t: 'win' }, { s: 'n', a: 57, w: 2, t: 'win' },
  ], 'planks', { floor: 'deck', bare: true, roof: 'metal' });
  B.prop('quonset', 58, 14, { y: 3.05, w: 8.4, l: 16.4, rot: Math.PI / 2, snow: true });
  crate(B, 51, 16, false); crate(B, 63.5, 11, true);

  // watchtower: legs, platform, railings and stairs
  for (const [x, z] of [[30, 24], [33.6, 24], [30, 27.6], [33.6, 27.6]]) B.box(x, 0, z, x + 0.4, 4, z + 0.4, 'deck');
  B.box(29.8, 4, 23.8, 34.2, 4.2, 28.2, 'deck');
  B.box(29.8, 4.2, 23.8, 34.2, 5.2, 24.1, 'planks'); B.box(29.8, 4.2, 27.9, 34.2, 5.2, 28.2, 'planks');
  B.box(29.8, 4.2, 24.1, 30.1, 5.2, 27.9, 'planks'); B.box(33.9, 4.2, 24.1, 34.2, 5.2, 26, 'planks');
  stairs(B, 34.2, 35.7, 21, 1, 14, 0.3, 'deck');
  B.prop('towerRoof', 32, 26, { y: 5.2, w: 4.4, snow: true });

  for (const [x0, z0, x1, z1] of [[22, 8, 26, 9.2], [12, 26, 13.2, 31], [44, 24, 48, 25.2], [58, 24, 59.2, 30], [68, 6, 72, 7.2], [24, 32, 28, 33.2]]) B.box(x0, 0, z0, x1, 1.4, z1, 'hesco');
  B.box(33, 0, 33.5, 36.4, 1.0, 34.1, 'sandbag');
  B.box(36.5, 0, 36.5, 39, 1.1, 37.1, 'sandbag'); B.box(41, 0, 36.5, 43.5, 1.1, 37.1, 'sandbag');
  B.box(36.5, 0, 37.1, 37.1, 1.1, 39, 'sandbag'); B.box(42.9, 0, 37.1, 43.5, 1.1, 39, 'sandbag');

  B.prop('truck', 46, 14, { rot: team ? 0.05 : -0.05 }); B.box(44.8, 0, 10.8, 47.2, 2.9, 17.2, 'invis');
  for (const [x, z, r] of [[20, 34, 2], [70, 26.5, 1.6], [5, 38, 1.8]]) { B.prop('rock', x, z, { r, snow: true }); B.box(x - r * 0.7, 0, z - r * 0.7, x + r * 0.7, r * 0.9, z + r * 0.7, 'invis'); }
  for (const [x, z] of [[3, 24], [3.5, 31], [76.5, 19], [76, 27.5], [64.5, 35], [16.5, 37.5], [51, 33]]) {
    B.prop('pine', x, z, { snow: true }); B.box(x - 0.3, 0, z - 0.3, x + 0.3, 4, z + 0.3, 'invis');
  }
  crate(B, 24, 16, true); crate(B, 25.5, 16, false); crate(B, 8, 24, false); crate(B, 62, 28, false); crate(B, 40.5, 21, false);
  for (const [x, z, f] of [[20, 7, 1], [20.7, 7.6, 0], [66, 22, 1]]) barrel(B, x, z, !!f, [0x4a5234, 0x5a5a3a]);
  B.prop('flood', 29.2, 29, { rot: Math.PI * 0.8 }); B.box(29.05, 0, 28.85, 29.35, 7, 29.15, 'invis');
}

// ---------- outskirts ----------
// Seeded filler for the ring around the town: houses, walled compounds, ruins, groves, cover,
// wrecks, fences, rocks, and for the docks warehouses and container stacks. Everything is placed
// in the south half (plus the south halves of the side strips) and replayed mirrored.
const THEMES = {
  desert: {
    walls: ['plaster', 'plaster2', 'brick'], trees: ['palm', 'olive'], rockCol: 0x9a8466,
    weights: { house: 4, compound: 3, ruin: 2, grove: 2, cover: 3, wreck: 2, fence: 1, rocks: 1, market: 1 },
    village: { house: 5, compound: 4, ruin: 2, market: 2, cover: 2, wreck: 2, grove: 1 },
    country: { grove: 4, rocks: 3, cover: 3, wreck: 3, fence: 3, ruin: 2, house: 2, compound: 1 },
  },
  harbor: {
    walls: ['corrugated', 'brick', 'plaster'], trees: [], rockCol: 0x7a7a74,
    weights: { warehouse: 3, stack: 5, house: 1, cover: 3, wreck: 2, fence: 1, yard: 2 },
    village: { warehouse: 4, stack: 6, yard: 3, cover: 2, wreck: 1 },
    country: { stack: 6, warehouse: 2, yard: 3, cover: 3, wreck: 2, fence: 1 },
  },
  snow: {
    walls: ['planks', 'planks', 'brick'], trees: ['pine'], rockCol: 0x6e6a64, snow: true,
    weights: { house: 3, grove: 6, rocks: 3, cover: 3, fence: 2, ruin: 1, wreck: 1, compound: 1 },
    village: { house: 5, compound: 2, ruin: 1, grove: 2, cover: 2, fence: 2 },
    country: { grove: 9, rocks: 4, cover: 2, fence: 2, ruin: 1, house: 1, wreck: 1 },
  },
};

const SIZES = {
  house: () => [7, 11, 6, 9], compound: () => [17, 22, 15, 19], ruin: () => [7, 11, 6, 9], grove: () => [8, 16, 8, 16],
  cover: () => [5, 8, 4, 6], wreck: () => [5, 9, 4, 8], fence: () => [8, 16, 1, 1], rocks: () => [5, 10, 5, 10], market: () => [8, 12, 5, 7],
  warehouse: () => [14, 20, 10, 14], stack: () => [7, 14, 6, 14], yard: () => [10, 16, 8, 12],
};

// Places up to `count` features of the theme inside region [x0, z0, x1, z1] (south half only,
// so the mirrored copies never overlap), avoiding every rect in `taken`. The builders are
// queued in ops and later replayed on both halves.
function scatter(ops, T, rnd, region, count, taken, weights = T.weights) {
  const [rx0, rz0, rx1, rz1] = region;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const rr = (a, b) => a + rnd() * (b - a);
  const clear = (x0, z0, x1, z1, pad) => x0 >= rx0 && z0 >= rz0 && x1 <= rx1 && z1 <= rz1 &&
    !taken.some(r => x0 - pad < r[2] && x1 + pad > r[0] && z0 - pad < r[3] && z1 + pad > r[1]);
  const types = Object.entries(weights), total = types.reduce((a, [, w]) => a + w, 0);
  let placed = 0;
  for (let n = 0; n < count * 40 && placed < count; n++) {
    let r = rnd() * total, type = types[0][0];
    for (const [k, w] of types) if ((r -= w) <= 0) { type = k; break; }
    const [w0, w1, d0, d1] = SIZES[type]();
    let w = Math.round(rr(w0, w1)), d = Math.round(rr(d0, d1));
    if (type === 'fence' && rnd() < 0.5) [w, d] = [d, w];
    if (rx1 - rx0 < w + 2 || rz1 - rz0 < d + 2) continue;
    const x0 = Math.round(rr(rx0, rx1 - w)), z0 = Math.round(rr(rz0, rz1 - d));
    const x1 = x0 + w, z1 = z0 + d;
    if (!clear(x0, z0, x1, z1, type === 'fence' ? 2 : 3.5)) continue;
    taken.push([x0, z0, x1, z1]);
    placed++;
    const v = { x0, z0, x1, z1, w, d, mat: pick(T.walls), r: [] };
    for (let i = 0; i < 12; i++) v.r.push(rnd());
    ops.push((S) => FEATURE[type](S, v, T));
    ops.push((S) => S.interest((x0 + x1) / 2, (z0 + z1) / 2));
  }
}

// doors and windows for a small building; r are that building's random numbers
function openings(v, x0, z0, x1, z1, r) {
  const sides = ['s', 'n', 'w', 'e'], out = [];
  const d1 = sides[Math.floor(r[0] * 4)], d2 = sides[(sides.indexOf(d1) + 1 + Math.floor(r[1] * 3)) % 4];
  for (const sd of sides) {
    const horiz = sd === 's' || sd === 'n', a = horiz ? x0 : z0, b = horiz ? x1 : z1, len = b - a;
    if (sd === d1 || sd === d2) out.push({ s: sd, a: a + Math.max(1, Math.round(len * (0.2 + r[2] * 0.25))), w: 2, t: 'door' });
    else if (len > 5) {
      out.push({ s: sd, a: a + Math.round(len * 0.3) - 0.5, w: 1.8, t: 'win' });
      if (len > 8) out.push({ s: sd, a: b - 2.8, w: 1.6, t: 'win' });
    }
  }
  return out;
}

function trees(S, v, T, n) {
  for (let i = 0; i < n; i++) {
    const x = v.x0 + 1 + v.r[i % 12] * (v.w - 2), z = v.z0 + 1 + v.r[(i * 5 + 3) % 12] * (v.d - 2);
    const type = T.trees[i % T.trees.length];
    S.prop(type, x, z, { snow: T.snow, h: type === 'pine' ? 6 + v.r[i % 12] * 5 : undefined });
    S.box(x - 0.3, 0, z - 0.3, x + 0.3, 4, z + 0.3, 'invis');
  }
}

const FEATURE = {
  house(S, v, T) {
    const h = 3 + v.r[3] * 0.8;
    building(S, v.x0, v.z0, v.x1, v.z1, h, openings(v, v.x0, v.z0, v.x1, v.z1, v.r), v.mat, { floor: T.snow ? 'deck' : 'floor', bare: v.mat === 'planks' || v.mat === 'corrugated' });
    crate(S, v.x0 + 0.7, v.z0 + 0.7, v.r[4] < 0.4);
    if (v.r[5] < 0.5) barrel(S, v.x1 - 1.2, v.z1 + 1.2, v.r[6] < 0.6);
  },
  compound(S, v, T) {
    const { x0, z0, x1, z1 } = v, wm = T.snow ? 'planks' : v.mat === 'brick' ? 'brick' : 'plaster';
    const gate = ['s', 'n', 'w', 'e'][Math.floor(v.r[0] * 4)];
    const run = (sd, a, b) => {
      const n = Math.max(1, Math.round((b - a) / 2.2));
      for (let i = 0; i < n; i++) {
        const id = S.obj('wall'), p = a + (b - a) * i / n, q = a + (b - a) * (i + 1) / n;
        if (sd === 's') S.box(p, 0, z0, q, 2.3, z0 + 0.4, wm, true, id);
        else if (sd === 'n') S.box(p, 0, z1 - 0.4, q, 2.3, z1, wm, true, id);
        else if (sd === 'w') S.box(x0, 0, p, x0 + 0.4, 2.3, q, wm, true, id);
        else S.box(x1 - 0.4, 0, p, x1, 2.3, q, wm, true, id);
      }
    };
    for (const sd of ['s', 'n', 'w', 'e']) {
      const horiz = sd === 's' || sd === 'n', a = horiz ? x0 : z0 + 0.4, b = horiz ? x1 : z1 - 0.4, mid = (a + b) / 2;
      if (sd === gate) { run(sd, a, mid - 2); run(sd, mid + 2, b); } else if (v.r[1] < 0.5 && sd !== gate) { run(sd, a, a + 3); run(sd, a + 4.2, b); } else run(sd, a, b);
    }
    const hw = 6 + Math.round(v.r[2] * 2), hd = 5 + Math.round(v.r[3] * 2);
    const hx = v.r[4] < 0.5 ? x0 + 1.5 : x1 - 1.5 - hw, hz = v.r[5] < 0.5 ? z0 + 1.5 : z1 - 1.5 - hd;
    building(S, hx, hz, hx + hw, hz + hd, 3.2, openings(v, hx, hz, hx + hw, hz + hd, v.r.slice(6)), v.mat, { floor: 'floor', bare: v.mat === 'planks' });
    const cx = hx < (x0 + x1) / 2 ? x1 - 3 : x0 + 1.5, cz = (z0 + z1) / 2;
    crate(S, cx, cz, true); crate(S, cx, cz + 1.5, false);
    barrel(S, cx + 0.8, cz - 1.2, true);
    if (T.trees.length) { S.prop(T.trees[0], cx - 3, cz + 3, { snow: T.snow }); S.box(cx - 3.3, 0, cz + 2.7, cx - 2.7, 4, cz + 3.3, 'invis'); }
  },
  ruin(S, v) {
    const { x0, z0, x1, z1 } = v;
    const segs = [['s', x0, x1], ['n', x0, x1], ['w', z0 + 0.5, z1 - 0.5], ['e', z0 + 0.5, z1 - 0.5]];
    segs.forEach(([sd, a, b], j) => {
      const n = Math.max(1, Math.round((b - a) / 2.2));
      for (let i = 0; i < n; i++) {
        if (v.r[(i + j * 3) % 12] < 0.28) continue;
        const h = 1.1 + v.r[(i * 7 + j) % 12] * 2.6, id = S.obj('wall'), p = a + (b - a) * i / n, q = a + (b - a) * (i + 1) / n;
        if (sd === 's') S.box(p, 0, z0, q, h, z0 + 0.5, v.mat, true, id);
        else if (sd === 'n') S.box(p, 0, z1 - 0.5, q, h, z1, v.mat, true, id);
        else if (sd === 'w') S.box(x0, 0, p, x0 + 0.5, h, q, v.mat, true, id);
        else S.box(x1 - 0.5, 0, p, x1, h, q, v.mat, true, id);
      }
    });
    S.prop('rubble', (x0 + x1) / 2, (z0 + z1) / 2, { r: 2, n: 16 });
  },
  grove(S, v, T) {
    if (!T.trees.length) return;
    trees(S, v, T, 3 + Math.floor(v.r[0] * 5));
    if (v.r[1] < 0.4) S.prop('rock', v.x0 + v.w / 2, v.z0 + v.d / 2, { r: 1.2, snow: T.snow, color: T.rockCol });
  },
  cover(S, v) {
    const { x0, z0, x1, z1 } = v;
    S.box(x0, 0, z1 - 0.6, x1, 1.0, z1, 'sandbag');
    if (v.r[0] < 0.6) S.box(x0, 0, z0 + 1, x0 + 0.6, 1.0, z1 - 0.6, 'sandbag');
    if (v.r[1] < 0.6) S.box(x1 - 0.6, 0, z0 + 1, x1, 1.0, z1 - 0.6, 'sandbag');
    crate(S, x0 + 1, z0, v.r[2] < 0.3);
    barrel(S, x1 - 1, z0 + 0.6, v.r[3] < 0.7);
  },
  wreck(S, v) {
    const ns = v.d > v.w;
    if (ns) car(S, v.x0 + 1, v.z0, v.x0 + 3, v.z0 + 4.5, { burnt: v.r[0] < 0.4 });
    else car(S, v.x0, v.z0 + 1, v.x0 + 4.5, v.z0 + 3, { burnt: v.r[0] < 0.4, flip: v.r[1] < 0.5 });
    if (v.r[2] < 0.5) S.prop('tires', v.x1 - 1, v.z1 - 1);
    if (v.r[3] < 0.6) barrel(S, v.x1 - 0.8, v.z0 + 0.6, true);
  },
  fence(S, v) {
    if (v.w > v.d) fence(S, v.x0, v.z0 + 0.5, v.x1, v.z0 + 0.5);
    else fence(S, v.x0 + 0.5, v.z0, v.x0 + 0.5, v.z1);
  },
  rocks(S, v, T) {
    for (let i = 0; i < 3; i++) {
      const r = 0.9 + v.r[i] * 1.3, x = v.x0 + 1.5 + v.r[i + 3] * (v.w - 3), z = v.z0 + 1.5 + v.r[i + 6] * (v.d - 3);
      S.prop('rock', x, z, { r, snow: T.snow, color: T.rockCol });
      S.box(x - r * 0.7, 0, z - r * 0.7, x + r * 0.7, r * 0.9, z + r * 0.7, 'invis');
    }
  },
  market(S, v) {
    for (let i = 0; i < 3; i++) {
      const x = v.x0 + 1.5 + i * (v.w - 3) / 2;
      S.prop('awning', x, v.z0 + 1.2, { y: 2.3, w: 2.6, d: 1.4, colors: [[0xb03a2e, 0x2a6a8a, 0x3a6a3a][i], 0xe6ddc8] });
      for (const dx of [-1.2, 1.2]) S.box(x + dx - 0.06, 0, v.z0 - 0.2, x + dx + 0.06, 2.3, v.z0 - 0.08, 'invis');
      crate(S, x - 0.75, v.z0 + 0.3, false);
    }
    barrel(S, v.x1 - 0.5, v.z1 - 0.5, false);
  },
  warehouse(S, v) {
    const { x0, z0, x1, z1 } = v;
    building(S, x0, z0, x1, z1, 6, [
      { s: 's', a: x0 + v.w / 2 - 2, w: 4, t: 'door', h: 4 }, { s: 'n', a: x0 + 2, w: 2, t: 'door' },
      { s: 'w', a: z0 + v.d / 2 - 1, w: 2, t: 'win' }, { s: 'e', a: z0 + v.d / 2 - 1.5, w: 3, t: 'door', h: 3 },
    ], 'corrugated', { floor: 'concrete', cornice: 'concrete', bare: true });
    crate(S, x0 + 1, z0 + 1, true); crate(S, x1 - 2.5, z1 - 2.5, false); crate(S, x1 - 2.5, z1 - 4, true);
    S.prop('pallets', x0 + v.w / 2, z1 - 2, { n: 4 });
  },
  stack(S, v) {
    const cols = ['containerR', 'containerB', 'containerG', 'containerY', 'containerW'];
    const ns = v.d > v.w, n = Math.max(1, Math.floor((ns ? v.w : v.d) / 3));
    for (let i = 0; i < n; i++) {
      const c1 = cols[Math.floor(v.r[i % 12] * 5)], c2 = v.r[(i + 4) % 12] < 0.45 ? cols[Math.floor(v.r[(i + 7) % 12] * 5)] : null;
      if (ns) container(S, v.x0 + i * 3, v.z0, true, c1, c2);
      else container(S, v.x0, v.z0 + i * 3, false, c1, c2);
    }
  },
  yard(S, v) {
    const { x0, z0, x1, z1 } = v;
    S.prop('forklift', x0 + 3, z0 + 3, { rot: v.r[0] * 3 }); S.box(x0 + 2, 0, z0 + 1.8, x0 + 4, 2.4, z0 + 4.2, 'invis');
    for (let i = 0; i < 4; i++) crate(S, x1 - 2 - (i % 2) * 1.6, z0 + 1 + Math.floor(i / 2) * 1.6, v.r[i] < 0.4);
    barrel(S, x0 + 1, z1 - 1, true); barrel(S, x0 + 1.7, z1 - 1.3, false); barrel(S, x0 + 1.2, z1 - 2, true);
    S.box(x0 + 5, 0, z1 - 0.6, x1 - 1, 0.9, z1, 'invis'); S.prop('jersey', (x0 + 5 + x1 - 1) / 2, z1 - 0.3, { rot: Math.PI / 2, len: x1 - x0 - 6 });
  },
};

// Each side's rear base: spawn rows, a sandbag and HESCO front line and two tents.
// Laid out for a 160 m map; shiftApi centres it on bigger ones.
function base(B, T, nation) {
  for (const z of [7, 11]) for (let x = 46; x <= 114; x += 13.6) B.spawn(0, Math.round(x), z, Math.PI);
  for (const [a, b] of [[30, 44], [52, 70], [90, 108], [116, 130]]) B.box(a, 0, 25, b, 1.0, 25.6, 'sandbag');
  for (const x of [46, 111]) B.box(x, 0, 23.6, x + 3, 1.4, 24.8, 'hesco');
  for (const x of [32, 124]) {
    B.prop('quonset', x + 2.5, 11, { w: 5, l: 8, snow: T.snow, color: 0x5b5a42 });
    B.box(x, 0, 7, x + 5, 2.5, 15, 'invis');
    crate(B, x + 0.2, 16, true); crate(B, x + 1.7, 16, false);
    barrel(B, x + 4.5, 16.5, false);
  }
  for (const x of [72, 88]) { B.prop('flag', x, 4, { nation, rot: Math.PI / 2 }); B.box(x - 0.15, 0, 3.85, x + 0.15, 9, 4.15, 'invis'); }
}

// ---------- scenery beyond the fence ----------
function townRing(api, rnd, n, mats, rise = 22) {
  for (let i = 0; i < n; i++) {
    const side = i % 4, along = -30 + rnd() * (SIZE + 60), dist = 6 + rnd() * 34;
    const w = 6 + rnd() * 12, d = 6 + rnd() * 12, h = 4 + rnd() * rise;
    let x, z;
    if (side === 0) { x = along; z = -dist - d; } else if (side === 1) { x = along; z = SIZE + dist; } else if (side === 2) { x = -dist - w; z = along; } else { x = SIZE + dist; z = along; }
    api.box(x, 0, z, x + w, h, z + d, mats[Math.floor(rnd() * mats.length)], false);
    if (rnd() < 0.5) api.box(x + 0.5, h, z + 0.5, x + w - 0.5, h + 0.4, z + d - 0.5, 'roof', false);
  }
}

// villages scattered over the hills, seen mostly from the air
function villages(api, rnd, n, mats, tree) {
  for (let v = 0; v < n; v++) {
    const a = rnd() * Math.PI * 2, dist = SIZE * 0.72 + 120 + rnd() * 800;
    const cx = SIZE / 2 + Math.cos(a) * dist, cz = SIZE / 2 + Math.sin(a) * dist;
    const k = 4 + Math.floor(rnd() * 8);
    for (let i = 0; i < k; i++) {
      const x = cx + (rnd() - 0.5) * 50, z = cz + (rnd() - 0.5) * 50, w = 5 + rnd() * 7, d = 5 + rnd() * 7, h = 3 + rnd() * 5;
      const y = terrainY(x + w / 2, z + d / 2) - 1.5;
      api.box(x, y, z, x + w, y + h + 1.5, z + d, mats[Math.floor(rnd() * mats.length)], false);
      api.box(x - 0.3, y + h + 1.5, z - 0.3, x + w + 0.3, y + h + 1.9, z + d + 0.3, 'roof', false);
    }
    if (tree) for (let i = 0; i < 6; i++) { const x = cx + (rnd() - 0.5) * 70, z = cz + (rnd() - 0.5) * 70; api.prop(tree, x, z, { y: terrainY(x, z) - 0.2, snow: tree === 'pine' }); }
  }
}

function forest(api, rnd, n, r0, r1, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = r0 + rnd() * (r1 - r0);
    const x = SIZE / 2 + Math.cos(a) * d, z = SIZE / 2 + Math.sin(a) * d;
    api.prop('farTree', x, z, { ...o, y: terrainY(x, z) - 0.3 });
  }
}

const perSide = (n) => Math.round(n * SIZE / 160);

function crossBackdrop(api, rnd) {
  townRing(api, rnd, perSide(40), ['backdrop', 'plaster', 'plaster2'], 6);
  for (let n = 0; n < perSide(24); n++) api.prop('palm', rnd() < 0.5 ? -3 - rnd() * 4 : SIZE + 3 + rnd() * 4, rnd() * SIZE, { h: 7 + rnd() * 3 });
  villages(api, rnd, 26, ['plaster', 'plaster2', 'backdrop'], 'olive');
  for (let n = 0; n < 16; n++) {
    const a = n / 16 * Math.PI * 2 + rnd() * 0.3, d = 1300 + rnd() * 400;
    api.prop('mountain', SIZE / 2 + Math.cos(a) * d, SIZE / 2 + Math.sin(a) * d, { r: 160 + rnd() * 120, h: 140 + rnd() * 120 });
  }
}

function harborBackdrop(api, rnd) {
  api.prop('ship', SIZE + 60, SIZE / 2 + 20, { rot: 0.05 });
  api.prop('ship', -70, SIZE / 2 - 30, { rot: Math.PI + 0.1 });
  api.prop('ship', SIZE + 70, SIZE / 2 - 190, { rot: 0.02 });
  api.prop('ship', -75, SIZE / 2 + 170, { rot: Math.PI - 0.05 });
  api.prop('ship', SIZE + 380, -240, { rot: 0.6 });
  api.prop('ship', -420, SIZE + 300, { rot: 2.2 });
  // the docks run on beyond the fence both ways
  for (let n = 0; n < perSide(60); n++) {
    const north = n % 2, x = 4 + rnd() * (SIZE - 24), dist = 4 + rnd() * 700;
    const w = 10 + rnd() * 20, d = 8 + rnd() * 16, h = 6 + rnd() * (dist > 200 ? 34 : 14);
    const z = north ? SIZE + dist : -dist - d;
    api.box(x, 0, z, x + w, h, z + d, rnd() < 0.5 ? 'corrugated' : 'backdrop', false);
  }
  for (let n = 0; n < perSide(24); n++) {
    const north = n % 2, x = 4 + rnd() * (SIZE - 12), z = north ? SIZE + 8 + rnd() * 300 : -10 - rnd() * 300;
    const col = ['containerR', 'containerB', 'containerG', 'containerY', 'containerW'][Math.floor(rnd() * 5)];
    const hgt = 2.6 * (1 + Math.floor(rnd() * 3));
    api.box(x, 0, z, x + 6.1, hgt, z + 2.44, col, false);
  }
  // quay walls dropping into the water, and the far shores
  api.box(-1, -3, -2100, 0, 0, SIZE + 2100, 'concrete', false); api.box(SIZE, -3, -2100, SIZE + 1, 0, SIZE + 2100, 'concrete', false);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -1500 : SIZE + 900;
    api.box(x0, -2, -2000, x0 + 600, 4, SIZE + 2000, 'concrete', false);
    for (let n = 0; n < 40; n++) {
      const x = x0 + rnd() * 500, z = -1500 + rnd() * 3200, w = 15 + rnd() * 40, h = 10 + rnd() * 60;
      api.box(x, 4, z, x + w, 4 + h, z + w, 'backdrop', false);
    }
  }
}

function outpostBackdrop(api, rnd) {
  for (let n = 0; n < 30; n++) {
    const a = n / 30 * Math.PI * 2 + rnd() * 0.2, d = 1050 + rnd() * 450;
    api.prop('mountain', SIZE / 2 + Math.cos(a) * d, SIZE / 2 + Math.sin(a) * d, { r: 140 + rnd() * 120, h: 150 + rnd() * 170 });
  }
  forest(api, rnd, 1100, SIZE * 0.72 + 12, SIZE / 2 + 700, { snow: true });
  villages(api, rnd, 10, ['planks', 'concrete'], 'pine');
  for (let n = 0; n < perSide(60); n++) {
    const side = n % 4, along = -5 + rnd() * (SIZE + 10), off = 3 + rnd() * 8;
    const x = side === 0 ? along : side === 1 ? along : side === 2 ? -off : SIZE + off;
    const z = side === 0 ? -off : side === 1 ? SIZE + off : along;
    api.prop('pine', x, z, { snow: true, h: 8 + rnd() * 6 });
  }
}

// ---------- Ground War: the 600 m maps ----------
const BIG = 600, BC = BIG / 2;
// capture points, south to north. A and B are USA's side, D and E Russia's (mirrored).
export const FLAG_POS = { A: [BC + 110, 130], B: [BC - 115, 210], C: [BC, BC], D: [BC + 115, BIG - 210], E: [BC - 110, BIG - 130] };
// Undercover mission places (north half, not mirrored)
const SITE = { intel: [BC + 144, BIG - 199], hvt: [BC - 84, BIG - 112], sam1: [BC - 215, BC + 140], sam2: [BC + 220, BC + 60], lz: [BC + 245, BIG - 55], insert: [95, 110] };

// dirt tracks from the main roads out to the villages at A, B, D and E
function gwRoads(main, track) {
  const F = FLAG_POS, r = [];
  if (main) r.push({ x0: BC - 4, z0: 1, x1: BC + 4, z1: BIG - 1, kind: main }, { x0: 1, z0: BC - 4, x1: BIG - 1, z1: BC + 4, kind: main });
  const t = (x0, x1, z) => r.push({ x0: Math.min(x0, x1), z0: z - 3, x1: Math.max(x0, x1), z1: z + 3, kind: track });
  t(BC + 4, F.A[0] - 6, F.A[1]); t(F.B[0] + 6, BC - 4, F.B[1]);
  t(BC + 4, F.D[0] - 6, F.D[1]); t(F.E[0] + 6, BC - 4, F.E[1]);
  // and north-south tracks from each village to the base road
  r.push({ x0: F.A[0] - 3, z0: 36, x1: F.A[0] + 3, z1: F.A[1] - 6, kind: track }, { x0: F.E[0] - 3, z0: F.E[1] + 6, x1: F.E[0] + 3, z1: BIG - 36, kind: track });
  return r;
}

// the one-off buildings the Undercover missions use: a command post with the intel laptop,
// the officer's walled compound, two SAM launchers and the exfil helipad
function missionSites(B, T) {
  const rects = [];
  const [ix, iz] = SITE.intel;
  building(B, ix - 7, iz - 5, ix + 7, iz + 5, 3.4, [
    { s: 's', a: ix - 1, w: 2, t: 'door' }, { s: 'n', a: ix + 3, w: 2, t: 'door' },
    { s: 'w', a: iz - 1, w: 1.8, t: 'win' }, { s: 'e', a: iz - 1, w: 1.8, t: 'win' }, { s: 's', a: ix - 5, w: 1.8, t: 'win' },
  ], 'concrete', { floor: 'floor', roof: 'concrete' });
  B.prop('laptop', ix + 2.5, iz + 1.5, { rot: Math.PI }); B.box(ix + 1.8, 0, iz + 1.15, ix + 3.2, 0.8, iz + 1.85, 'invis');
  B.prop('antenna', ix + 4, iz + 3, { y: 3.7, h: 5 });
  for (const [x, z] of [[ix - 6, iz - 8], [ix + 9, iz - 7]]) B.box(x, 0, z, x + 3, 1.0, z + 0.6, 'sandbag');
  B.site('intel', ix + 2.5, iz + 0.6, { r: 1.8 });
  rects.push([ix - 12, iz - 12, ix + 12, iz + 10]);

  const [hx, hz] = SITE.hvt;
  FEATURE.compound(B, { x0: hx - 11, z0: hz - 9, x1: hx + 11, z1: hz + 9, w: 22, d: 18, mat: T.walls[0], r: [0.1, 0.9, 0.5, 0.5, 0.2, 0.8, 0.3, 0.6, 0.7, 0.2, 0.4, 0.9] }, T);
  B.site('hvt', hx - 2, hz + 4);
  rects.push([hx - 15, hz - 13, hx + 15, hz + 13]);

  for (const k of ['sam1', 'sam2']) {
    const [x, z] = SITE[k], id = B.obj('sam');
    B.box(x - 1.5, 0, z - 4.2, x + 1.5, 3.4, z + 4.2, 'invis', true, id);
    B.prop('sam', x, z, { obj: id, color: T.snow ? 0xd0d4d8 : 0x4a5234 });
    for (const [a, b2, c, d] of [[x - 8, z - 8, x - 1.5, z - 7.4], [x + 1.5, z - 8, x + 8, z - 7.4], [x - 8, z + 7.4, x + 8, z + 8], [x - 8, z - 7.4, x - 7.4, z + 2], [x + 7.4, z - 2, x + 8, z + 7.4]]) B.box(a, 0, b2, c, 1.1, d, 'sandbag');
    crate(B, x + 4, z + 4, true); barrel(B, x - 5, z + 5);
    B.site(k, x, z, { obj: id, r: 3 });
    rects.push([x - 11, z - 11, x + 11, z + 11]);
  }
  const [lx, lz] = SITE.lz;
  B.prop('helipad', lx, lz);
  B.site('lz', lx, lz, { r: 10 });
  rects.push([lx - 12, lz - 12, lx + 12, lz + 12]);
  const [sx, sz] = SITE.insert;
  B.prop('truck', sx + 6, sz + 2, { rot: 0.4, burnt: true }); B.box(sx + 4.8, 0, sz - 1.2, sx + 7.2, 2.9, sz + 5.2, 'invis');
  crate(B, sx - 5, sz + 3, false);
  B.site('insert', sx, sz);
  rects.push([sx - 10, sz - 10, sx + 12, sz + 10]);
  return rects;
}

// The shared Ground War layout. o: { theme, seed, town(S, team), centre(S), townInterest, country }
function groundWar(B, M, o) {
  const C = SIZE / 2, T = THEMES[o.theme], rnd = mulberry(o.seed * 7919 + 13);
  const b = shiftApi(B, C - 40), m = shiftApi(M, C - 40);
  o.town(b, 0); o.town(m, 1);
  o.centre?.(b);
  for (const S of [b, m]) for (const [x, z] of o.townInterest) S.interest(x, z);
  base(shiftApi(B, C - 80, 0), T, 'us'); base(shiftApi(M, C - 80, 0), T, 'ru');

  const taken = [[C - 44, C - 44, C + 44, C + 44], [C - 92, 0, C + 92, 36]];
  for (const r of o.roads) taken.push([r.x0, r.z0, r.x1, r.z1]);
  for (const [id, [x, z]] of Object.entries(FLAG_POS)) {
    B.flag(id, x, z);
    if (id !== 'C') { B.prop('cappole', x + 3, z + 3); B.box(x + 2.9, 0, z + 2.9, x + 3.1, 6, z + 3.1, 'invis'); }
    taken.push([x - 10, z - 10, x + 10, z + 10]);
  }
  for (const [x0, z0, x1, z1] of missionSites(B, T)) taken.push([x0, z0, x1, z1], [SIZE - x1, SIZE - z1, SIZE - x0, SIZE - z0]);

  const ops = [];
  scatter(ops, T, rnd, [C - 100, C - 100, C + 100, C - 1], 26, taken);
  for (const k of ['A', 'B']) {
    const [x, z] = FLAG_POS[k];
    scatter(ops, T, rnd, [x - 55, z - 50, x + 55, Math.min(z + 50, C - 1)], 18, taken, T.village);
  }
  scatter(ops, T, rnd, [8, 38, SIZE - 8, C - 1], o.country ?? 120, taken, T.country);
  for (const S of [B, M]) for (const f of ops) f(S);
}

// ---------- Shipment: a cargo ship's deck, 48 m square ----------
const SHIP_COLS = ['containerB', 'containerR', 'containerN', 'containerT', 'containerW', 'containerO', 'containerG', 'containerY'];
function shipHalf(B) {
  const c = (i) => SHIP_COLS[i % 8];
  // the walls: stacks two and three high all the way round
  for (let i = 0; i < 8; i++) cstack(B, i * 6, 0, false, i % 3 === 1 ? [c(i), c(i + 3), c(i + 5)] : [c(i), c(i + 3)]);
  [2.44, 8.54, 14.64, 20.9].forEach((z, i) => cstack(B, 0, z, true, i === 2 ? [c(i + 1), c(i + 4), c(i + 6)] : [c(i + 1), c(i + 4)]));
  [2.44, 8.54, 14.64].forEach((z, i) => cstack(B, 45.56, z, true, i === 1 ? [c(i + 2), c(i + 5), c(i + 7)] : [c(i + 2), c(i + 5)]));
  // the lanes
  cstack(B, 9.8, 10.4, true, ['containerB', 'containerR']);
  cstack(B, 20.95, 12.2, false, ['containerO']);
  cstack(B, 35.8, 10.4, true, ['containerT']);
  cstack(B, 6.5, 22.76, false, ['containerN', 'containerW']);
  crate(B, 15.2, 17.6, true); crate(B, 16.7, 17.6, false); crate(B, 30.5, 21.2, false);
  B.prop('cases', 28.9, 13.4, { n: 3, rot: 0.1 }); B.box(28.25, 0, 12.95, 29.55, 1.9, 13.85, 'invis');
  B.prop('cases', 5.2, 16.6, { n: 2 }); B.box(4.55, 0, 16.15, 5.85, 1.3, 17.05, 'invis');
  B.prop('bluecrates', 41.3, 19.5, { n: 4 }); B.box(40.7, 0, 19.0, 41.9, 1.06, 20.0, 'invis');
  B.prop('bluecrates', 19.2, 6.8, { n: 2, rot: Math.PI / 2 }); B.box(18.7, 0, 6.2, 19.7, 0.6, 7.4, 'invis');
  barrel(B, 13.3, 19.2); barrel(B, 26.2, 17.6, false, [0xd8dcd8, 0x9aa0a0]); barrel(B, 4.3, 9.2); barrel(B, 34.9, 9.7, false, [0xd8dcd8]);
  B.prop('pallets', 43.9, 17.5, { n: 3 }); B.box(43.3, 0, 17.0, 44.5, 0.5, 18.0, 'invis');
  for (const x of [7, 13, 19, 29, 35, 41]) B.spawn(0, x, 5.8, Math.PI);
  for (const [x, z] of [[17, 11], [31, 11], [5, 19.5], [16, 21], [33, 18.8], [24, 18.5], [12, 8.5], [42, 12]]) B.interest(x, z);
  // light masts in the corners, aimed at the middle
  B.prop('mast', -2.5, -2.5, { rot: -Math.PI * 0.75, h: 15, beam: { pitch: 0.38, len: 44, angle: 0.3, intensity: 0.2, power: 900 } });
  B.prop('mast', 50.5, -2.5, { rot: Math.PI * 0.75, h: 15, beam: { pitch: 0.38, len: 44, angle: 0.3, intensity: 0.2, power: 900 } });
}

// walk-through container in the middle: open at both ends
function shipCentre(B) {
  B.box(22.55, 0, 20.95, 23.0, 2.6, 27.05, 'containerY'); B.box(25.0, 0, 20.95, 25.45, 2.6, 27.05, 'containerY');
  B.box(22.55, 2.6, 20.95, 25.45, 2.9, 27.05, 'containerY');
  B.prop('cframe', 24, 24, { cols: [CCOL.containerY], wid: 2.9, open: true });
  B.decal(25.45, 1.55, 24, 3.6, 0.45, Math.PI / 2, 0, { color: 0xe8e6de });
  B.decal(22.55, 1.55, 24, 3.6, 0.45, -Math.PI / 2, 0, { color: 0xe8e6de });
}

function shipBackdrop(api, rnd) {
  // hull, bow and stern
  api.box(-8.6, -9, -46, -8, 0.4, 106, 'hull', false); api.box(56, -9, -46, 56.6, 0.4, 106, 'hull', false);
  api.box(-8.6, -9, -46.6, 56.6, 0.4, -46, 'hull', false); api.box(-8.6, -9, 106, 56.6, 0.4, 106.6, 'hull', false);
  api.box(-8.64, -9, -46, -8.58, -6.5, 106, 'hullRed', false); api.box(56.58, -9, -46, 56.64, -6.5, 106, 'hullRed', false);
  for (let z = -40; z < 101; z += 10) { api.prop('railing', -7.9, z + 5, { rot: Math.PI / 2, len: 10 }); api.prop('railing', 55.9, z + 5, { rot: Math.PI / 2, len: 10 }); }
  for (const z of [-30, 4, 44, 80]) { api.prop('bollard', -6.5, z); api.prop('bollard', 54.5, z); }
  // deck cargo fore and aft of the play area
  for (let row = 0; row < 5; row++) for (let x = -6; x < 50; x += 6.3) {
    if (rnd() < 0.12) continue;
    const n = 3 + Math.floor(rnd() * 3), mats = [];
    for (let i = 0; i < n; i++) mats.push(SHIP_COLS[Math.floor(rnd() * 8)]);
    cstack(api, x, -6 - row * 7, false, mats, { collide: false, plain: rnd() < 0.4 });
  }
  // the superstructure astern, with the floodlights that light the deck
  api.box(4, 0, 57, 44, 21, 76, 'superstructure', false);
  api.box(8, 21, 59, 40, 26, 72, 'superstructure', false);
  api.box(2, 24.5, 58, 46, 25, 62, 'steel', false);
  api.box(19, 26, 66, 29, 36, 72, 'hullRed', false); api.box(18.6, 34, 65.6, 29.4, 36.4, 72.4, 'hull', false);
  api.box(4, 21, 57, 44, 21.3, 58, 'steel', false);
  api.prop('antenna', 24, 64, { y: 26, h: 12 });
  for (const x of [11, 24, 37]) api.prop('flood', x, 56.6, { y: 12, h: 7, beam: { pitch: 0.34, len: 58, angle: 0.24, intensity: 0.26, power: 1400, h: 7 } });
  for (let y = 3; y < 20; y += 4) api.prop('railing', 24, 56.8, { y, len: 40 });
  // deck cranes swung out over the containers
  api.prop('shipcrane', -5, 16, { rot: -Math.PI / 2, pitch: 0.5, len: 24 });
  api.prop('shipcrane', 53, 34, { rot: Math.PI / 2, pitch: 0.62, len: 22, color: 0xd0a428 });
  api.prop('reel', -4, 40); api.prop('reel', 52, 8);
  // other ships riding out the storm
  api.prop('ship', 420, -300, { rot: 0.4 }); api.prop('ship', -520, 160, { rot: 2.6 }); api.prop('ship', 260, 820, { rot: 1.2 });
}

// ---------- definitions ----------
export const MAPS = {
  shipment: {
    name: 'Shipment', desc: 'A 48 m cargo deck of container lanes in a storm at sea. 6 v 6 and pure chaos.', seed: 5, size: 48, teamSize: 6,
    modes: ['tdm'], small: true, noVehicles: true,
    layout(B, M) { shipHalf(B); shipHalf(M); shipCentre(B); },
    backdrop: shipBackdrop,
    perimeter: { mat: 'invis', h: 12 },
    ground: { recipe: 'shipdeck', ts: 6, w: 65.2, l: 152.6, dz: 6, rough: 0.5, metal: 0.25, normal: 1.3 },
    water: { y: -9, color: 0x0e1a20, size: 4000, rough: 0.12 },
    wet: { y: 0, base: 0.45, vary: 0.6, ripple: 1.2, strength: 0.95 },
    roads: [
      { x0: 16.2, z0: 2.6, x1: 19.2, z1: 45.4, kind: 'walkway' }, { x0: 28.8, z0: 2.6, x1: 31.8, z1: 45.4, kind: 'walkway' },
      { x0: 2.6, z0: 8.9, x1: 45.4, z1: 9.2, kind: 'stripe' }, { x0: 2.6, z0: 38.8, x1: 45.4, z1: 39.1, kind: 'stripe' },
    ],
    minimap: { ground: [58, 78, 74], road: [40, 52, 76], low: [150, 150, 140], high: [196, 200, 204] },
    look: {
      sunDir: [-0.35, 0.72, 0.6], sunColor: 0xd6e2ff, sunIntensity: 1.6,
      hemiSky: 0x5a6878, hemiGround: 0x2a3030, hemiIntensity: 0.55, envIntensity: 0.6,
      zenith: 0x1a222c, horizon: 0x4a5560, groundColor: 0x1e2426, cloudCover: 0.97, cloudColor: 0x3c4550, sunGlow: 0x8a9aaa,
      fog: 0x39424c, fogNear: 14, fogFar: 170, exposure: 1.35, pools: 0.5, poolColor: 0xdfe8ff, shadowSoft: 3,
      grade: { sat: 0.9, contrast: 1.12, tint: [0.96, 1.0, 1.05] }, particles: 'rain', lightning: true, spots: 4, sunDisk: 0, rays: 0,
    },
    audio: { decay: 1.1, wet: 0.24, tone: 3800, amb: 'rain' },
  },
  crossroads: {
    name: 'Crossroads', desc: '600 m of desert: the town at the junction, walled villages, farmland, five flags.', seed: 7, hills: 48, size: BIG, teamSize: 12, land: 'desert', relief: 11, ramp: 18,
    modes: ['gw', 'uc'],
    layout(B, M) {
      groundWar(B, M, {
        theme: 'desert', seed: 7, roads: this.roads,
        town: crossHalf,
        centre(b) { b.box(38, 0, 38, 42, 1.2, 42, 'concrete'); b.box(39.5, 1.2, 39.5, 40.5, 5.5, 40.5, 'concrete'); b.prop('wire', 49.5, 31, { dx: -19, dz: 18 }); },
        townInterest: [[40, 34], [18, 20], [62, 17], [29, 27], [35, 26], [20, 36], [6, 36], [50, 30], [40, 22], [60, 36], [28, 45], [12, 46], [8, 20], [70, 28]],
      });
    },
    backdrop: crossBackdrop,
    ground: { recipe: 'dirt', ts: 8 },
    roads: gwRoads('road', 'track'),
    patches: [{ x0: BC - 4, z0: BC - 4, x1: BC + 4, z1: BC + 4 }],
    minimap: { ground: [96, 86, 70], road: [70, 70, 68] },
    look: {
      sunDir: [0.45, 0.55, 0.7], sunColor: 0xffe4c0, sunIntensity: 3.2,
      hemiSky: 0xcfdcf0, hemiGround: 0x7a6448, hemiIntensity: 0.5, envIntensity: 0.55,
      zenith: 0x3f6fae, horizon: 0xdccfb2, groundColor: 0x6a5a45, cloudCover: 0.32, cloudColor: 0xf6f0e6, sunGlow: 0xffd9a0,
      fog: 0xd8cbb0, fogNear: 90, fogFar: 520, exposure: 0.92, shadowSoft: 2, rays: 0.25,
      grade: { sat: 1.08, contrast: 1.07, tint: [1.03, 1.0, 0.95] }, particles: 'dust', groundDust: [0.64, 0.55, 0.42],
    },
    audio: { decay: 1.3, wet: 0.22, tone: 5200, amb: 'wind' },
  },
  harbor: {
    name: 'Harbor', desc: 'A 600 m port at sunset: container yards, warehouses, gantry cranes, five flags.', seed: 21, size: BIG, teamSize: 12, land: 'port', relief: 4, ramp: 14,
    modes: ['gw', 'uc'],
    layout(B, M) {
      groundWar(B, M, {
        theme: 'harbor', seed: 21, roads: this.roads,
        town: harborHalf,
        centre(b) { b.prop('crane', 40, 40); container(b, 37, 38.78, false, 'containerR', 'containerW'); },
        townInterest: [[40, 32], [15, 17], [30, 20], [41, 20], [47, 14], [64, 15], [64, 24], [71, 26], [24, 33], [10, 27], [55, 32], [35, 29]],
        country: 110,
      });
    },
    backdrop: harborBackdrop,
    perimeter: { quay: true },
    ground: { recipe: 'slab', args: [0x9a9082], ts: 6, w: BIG, l: BIG + 4200 },
    water: { y: -1.1, color: 0x183640 },
    roads: gwRoads('road', 'road'),
    minimap: { ground: [92, 90, 86], road: [66, 66, 66] },
    mats: { plaster: { args: [0xa9b4b8, 0x8a969a] }, trim: { args: [0xd8d4ca, 0xbab5a8] } },
    look: {
      sunDir: [-0.78, 0.2, 0.3], sunColor: 0xffa868, sunIntensity: 3,
      hemiSky: 0x9ea2b8, hemiGround: 0x54443a, hemiIntensity: 0.5, envIntensity: 0.75,
      zenith: 0x2c3c70, horizon: 0xf2a066, groundColor: 0x3a3230, cloudCover: 0.45, cloudColor: 0xd89078, sunGlow: 0xffa860,
      fog: 0xc09080, fogNear: 80, fogFar: 480, exposure: 1.12, pools: 0.45, poolColor: 0xffa050, shadowSoft: 2.5, rays: 0.35,
      grade: { sat: 1.12, contrast: 1.08, tint: [1.05, 0.98, 0.95] }, particles: 'dust', groundDust: [0.56, 0.55, 0.52],
    },
    audio: { decay: 1.9, wet: 0.3, tone: 4200, amb: 'harbor' },
  },
  outpost: {
    name: 'Outpost', desc: 'A 600 m snowbound valley: the mountain base, cabins, pine forest, five flags.', seed: 33, hills: 75, size: BIG, teamSize: 12, land: 'snow', relief: 16, ridges: true, ramp: 20,
    modes: ['gw', 'uc'],
    layout(B, M) {
      groundWar(B, M, {
        theme: 'snow', seed: 33, roads: this.roads,
        town: outpostHalf,
        centre(b) { b.prop('antenna', 40, 40, { h: 15 }); b.box(39.6, 0, 39.6, 40.4, 15, 40.4, 'invis'); b.box(39.3, 0, 40.8, 40.7, 1, 41.6, 'invis'); },
        townInterest: [[40, 32], [12, 16], [32, 26], [58, 14], [46, 21], [22, 28], [66, 26], [8, 30], [52, 32], [30, 16]],
        country: 130,
      });
    },
    backdrop: outpostBackdrop,
    perimeter: { mat: 'concrete', h: 4.5 },
    ground: { recipe: 'snow', ts: 7, normal: 1.2, rough: 0.8 },
    roads: gwRoads('mud', 'mud'),
    minimap: { ground: [150, 158, 168], road: [96, 90, 84], low: [110, 110, 104], high: [200, 204, 210] },
    snowCaps: true,
    mats: { concrete: { args: [0x9ea3a6, 0x81868a] }, trim: { args: [0x9ea3a6, 0x81868a] } },
    look: {
      sunDir: [0.3, 0.45, -0.6], sunColor: 0xe4ecff, sunIntensity: 1.5,
      hemiSky: 0xc8d6ea, hemiGround: 0xa8b0bc, hemiIntensity: 0.75, envIntensity: 0.85,
      zenith: 0x7a8ca4, horizon: 0xcdd5de, groundColor: 0xb8c0ca, cloudCover: 0.8, cloudColor: 0xc8d0da, sunGlow: 0xe8eeff,
      fog: 0xc3ccd6, fogNear: 50, fogFar: 400, exposure: 1.05, shadowSoft: 4, rays: 0.15,
      grade: { sat: 0.9, contrast: 1.05, tint: [0.97, 1.0, 1.05] }, particles: 'snow', groundDust: [0.92, 0.94, 0.97],
    },
    audio: { decay: 0.9, wet: 0.16, tone: 3000, amb: 'snow' },
  },
};

export const MODES = {
  tdm: { name: 'Team Deathmatch', short: 'TDM', desc: 'First team to 75 kills.', scoreLimit: 75, timeLimit: 600 },
  gw: { name: 'Ground War', short: 'GROUND WAR', desc: 'Hold the five flags. Spawn on any flag your team owns. Tanks, jets and drones.', scoreLimit: 400, timeLimit: 1200 },
  uc: { name: 'Undercover', short: 'UNDERCOVER', desc: 'Co-op. You wear their uniform: move quietly, finish the mission chain, get out.', scoreLimit: 9999, timeLimit: 1800, coop: true },
};
