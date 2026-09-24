// Map layouts, lighting and sound for each battlefield. Every layout builds the south half
// with `B` and the north half again with `M`, a copy mirrored through the centre, so both
// teams get the same ground. Coordinates are metres on an 80 x 80 grid.
import { SIZE } from './world.js';

// ---------- shared building blocks ----------
export function building(B, x0, z0, x1, z1, h, open, mat, o = {}) {
  const t = 0.5, trim = o.trim || 'trim';
  const piece = (side, a, b, y0, y1) => {
    if (b - a <= 0) return;
    if (side === 's') B.box(a, y0, z0, b, y1, z0 + t, mat);
    else if (side === 'n') B.box(a, y0, z1 - t, b, y1, z1, mat);
    else if (side === 'w') B.box(x0, y0, a, x0 + t, y1, b, mat);
    else B.box(x1 - t, y0, a, x1, y1, b, mat);
  };
  const deco = (side, a, b, y0, y1, p = 0.07) => {
    if (side === 's') B.box(a, y0, z0 - p, b, y1, z0 + t + p, trim, false);
    else if (side === 'n') B.box(a, y0, z1 - t - p, b, y1, z1 + p, trim, false);
    else if (side === 'w') B.box(x0 - p, y0, a, x0 + t + p, y1, b, trim, false);
    else B.box(x1 - t - p, y0, a, x1 + p, y1, b, trim, false);
  };
  for (const side of ['s', 'n', 'w', 'e']) {
    const horiz = side === 's' || side === 'n';
    let cur = horiz ? x0 : z0 + t;
    const end = horiz ? x1 : z1 - t;
    for (const op of open.filter(q => q.s === side).sort((p, q) => p.a - q.a)) {
      piece(side, cur, op.a, 0, h);
      const top = op.t === 'door' ? (op.h || 2.5) : 2.2;
      if (op.t === 'door') piece(side, op.a, op.a + op.w, top, h);
      else { piece(side, op.a, op.a + op.w, 0, 1.0); piece(side, op.a, op.a + op.w, top, h); }
      if (!o.bare) {
        deco(side, op.a - 0.12, op.a + op.w + 0.12, top, top + 0.14);
        deco(side, op.a - 0.14, op.a + 0.04, op.t === 'door' ? 0 : 1.0, top, 0.04);
        deco(side, op.a + op.w - 0.04, op.a + op.w + 0.14, op.t === 'door' ? 0 : 1.0, top, 0.04);
        if (op.t !== 'door') deco(side, op.a - 0.14, op.a + op.w + 0.14, 0.9, 1.03, 0.1);
      }
      cur = op.a + op.w;
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
export function car(B, x0, z0, x1, z1, o = {}) {
  B.box(x0, 0, z0, x1, 1.1, z1, 'invis');
  const ns = z1 - z0 > x1 - x0;
  if (ns) B.box(x0 + 0.5, 1.1, z0 + 1, x1 - 0.5, 1.7, z1 - 1.5, 'invis');
  else B.box(x0 + 1, 1.1, z0 + 0.5, x1 - 1.5, 1.7, z1 - 0.5, 'invis');
  B.prop('car', (x0 + x1) / 2, (z0 + z1) / 2, { rot: (ns ? 0 : Math.PI / 2) + (o.flip ? Math.PI : 0), len: Math.max(x1 - x0, z1 - z0), wid: Math.min(x1 - x0, z1 - z0) - 0.1, ...o });
}

// 6.1 m shipping container; ns runs it along z
export function container(B, x, z, ns, mat, top = null) {
  const x1 = ns ? x + 2.44 : x + 6.1, z1 = ns ? z + 6.1 : z + 2.44;
  B.box(x, 0, z, x1, 2.6, z1, mat);
  if (top) B.box(x, 2.6, z, x1, 5.2, z1, top);
}

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
  for (const [x, z] of [[35, 32], [3.2, 12.5], [3.6, 11.6], [68.2, 28], [20.6, 27.6]]) { B.prop('barrel', x, z); B.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, 'invis'); }
  B.prop('tires', 74.5, 14); B.box(74.1, 0, 13.6, 74.9, 0.8, 14.4, 'invis');
  B.prop('ac', 12, 11.75, { y: 2.9 }); B.prop('ac', 51.75, 12.5, { y: 3.6, rot: Math.PI / 2 });
  B.prop('awning', 19, 12, { y: 2.9, w: 2.6, d: 1.1, colors: team ? [0x2a6a8a, 0xe6ddc8] : [0xb03a2e, 0xe6ddc8] });
  B.prop('awning', 29, 30, { y: 2.8, w: 2.4, d: 1.0, rot: Math.PI, colors: [0x3a6a3a, 0xe6ddc8] });
  B.prop('dish', 18, 21, { y: 4.3 }); B.prop('dish', 68, 20, { y: 5.3 });
  B.prop('rubble', 25.5, 20.5); B.prop('rubble', 60, 28, { r: 1 }); B.prop('rubble', 12, 29, { r: 0.8, n: 8 });
}

function crossBackdrop(api, rnd) {
  for (let n = 0; n < 70; n++) {
    const side = n % 4, along = -30 + rnd() * 140, dist = 6 + rnd() * 30;
    const w = 6 + rnd() * 12, d = 6 + rnd() * 12, h = 8 + rnd() * 22;
    let x, z;
    if (side === 0) { x = along; z = -dist - d; }
    else if (side === 1) { x = along; z = SIZE + dist; }
    else if (side === 2) { x = -dist - w; z = along; }
    else { x = SIZE + dist; z = along; }
    api.box(x, 0, z, x + w, h, z + d, 'backdrop', false);
    if (rnd() < 0.5) api.box(x + 0.5, h, z + 0.5, x + w - 0.5, h + 0.4, z + d - 0.5, 'roof', false);
  }
  for (let n = 0; n < 14; n++) api.prop('palm', rnd() < 0.5 ? -3 - rnd() * 4 : 83 + rnd() * 4, rnd() * 80, { h: 7 + rnd() * 3 });
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
  for (const [x, z] of [[40, 25.5], [40.7, 26.1], [55, 26], [3, 20], [3.6, 20.7]]) { B.prop('barrel', x, z, { colors: [0x2b4a7a, 0x3a6a3a, 0x8a2a1a] }); B.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, 'invis'); }
  B.prop('reel', 16, 31); B.box(15.1, 0, 30.3, 16.9, 1.6, 31.7, 'invis');
  // crane legs; the gantry itself is built once from the centre
  B.box(33.4, 0, 34.4, 34.6, 14, 35.6, 'invis'); B.box(45.4, 0, 34.4, 46.6, 14, 35.6, 'invis');
  for (const z of [6, 14, 22, 30]) { B.prop('bollard', 1.7, z); B.prop('bollard', 1.7, z + 4); }
  for (const [x, z, r] of [[26, 34.8, Math.PI], [54, 34.8, Math.PI], [2.2, 12, -Math.PI / 2], [2.2, 28, -Math.PI / 2], [72, 24.5, 0]]) {
    B.prop('lamp', x, z, { rot: r, h: 7, glow: [0xffb060, 5] }); B.box(x - 0.15, 0, z - 0.15, x + 0.15, 7, z + 0.15, 'invis');
  }
}

function harborBackdrop(api, rnd) {
  api.prop('ship', 125, 45, { rot: 0.05 });
  api.prop('ship', -60, 20, { rot: Math.PI + 0.1 });
  for (let n = 0; n < 40; n++) {
    const north = n % 2, x = -20 + rnd() * 120, dist = 4 + rnd() * 30;
    const w = 10 + rnd() * 20, d = 8 + rnd() * 14, h = 6 + rnd() * 14;
    const z = north ? SIZE + dist : -dist - d;
    api.box(x, 0, z, x + w, h, z + d, rnd() < 0.5 ? 'corrugated' : 'backdrop', false);
  }
  for (let n = 0; n < 12; n++) {
    const north = n % 2, x = -10 + rnd() * 100, z = north ? SIZE + 8 + rnd() * 20 : -10 - rnd() * 20;
    const col = ['containerR', 'containerB', 'containerG', 'containerY', 'containerW'][Math.floor(rnd() * 5)];
    const hgt = 2.6 * (1 + Math.floor(rnd() * 3));
    api.box(x, 0, z, x + 6.1, hgt, z + 2.44, col, false);
  }
  // quay walls dropping into the water
  api.box(-1, -3, -80, 0, 0, 160, 'concrete', false); api.box(80, -3, -80, 81, 0, 160, 'concrete', false);
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
  for (const [x, z] of [[20, 7], [20.7, 7.6], [66, 22]]) { B.prop('barrel', x, z, { colors: [0x4a5234, 0x5a5a3a] }); B.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, 'invis'); }
  B.prop('flood', 29.2, 29, { rot: Math.PI * 0.8 }); B.box(29.05, 0, 28.85, 29.35, 7, 29.15, 'invis');
}

function outpostBackdrop(api, rnd) {
  for (let n = 0; n < 26; n++) {
    const a = n / 26 * Math.PI * 2 + rnd() * 0.2, d = 170 + rnd() * 70;
    api.prop('mountain', 40 + Math.cos(a) * d, 40 + Math.sin(a) * d, { r: 50 + rnd() * 45, h: 45 + rnd() * 55 });
  }
  for (let n = 0; n < 160; n++) {
    const a = rnd() * Math.PI * 2, d = 62 + rnd() * 60;
    api.prop('farTree', 40 + Math.cos(a) * d, 40 + Math.sin(a) * d, { snow: true });
  }
  for (let n = 0; n < 30; n++) {
    const side = n % 4, along = -5 + rnd() * 90, off = 3 + rnd() * 6;
    const x = side === 0 ? along : side === 1 ? along : side === 2 ? -off : SIZE + off;
    const z = side === 0 ? -off : side === 1 ? SIZE + off : along;
    api.prop('pine', x, z, { snow: true, h: 8 + rnd() * 6 });
  }
}

// ---------- definitions ----------
const spawnRow = (B, pts) => { for (const [x, z] of pts) B.spawn(0, x, z, Math.PI); };

export const MAPS = {
  crossroads: {
    name: 'Crossroads', desc: 'Desert town at a road junction. Mixed ranges, rooftop tower.', seed: 7,
    layout(B, M) {
      crossHalf(B, 0); crossHalf(M, 1);
      B.box(38, 0, 38, 42, 1.2, 42, 'concrete'); B.box(39.5, 1.2, 39.5, 40.5, 5.5, 40.5, 'concrete');
      B.prop('wire', 49.5, 31, { dx: -19, dz: 18 });
      for (const S of [B, M]) spawnRow(S, [[8, 4], [18, 4], [28, 4], [40, 4], [50, 4], [62, 4], [72, 4], [31, 8], [48, 8], [4, 10], [76, 10]]);
      for (const S of [B, M]) for (const [x, z] of [[40, 34], [18, 20], [62, 17], [29, 27], [35, 26], [20, 36], [6, 36], [50, 30], [40, 22], [60, 36], [28, 45], [12, 46], [8, 20], [70, 28]]) S.interest(x, z);
    },
    backdrop: crossBackdrop,
    ground: { recipe: 'dirt', ts: 8 },
    roads: [{ x0: 36, z0: 1, x1: 44, z1: 79 }, { x0: 1, z0: 36, x1: 79, z1: 44 }],
    patches: [{ x0: 36, z0: 36, x1: 44, z1: 44 }],
    minimap: { ground: [96, 86, 70], road: [70, 70, 68] },
    look: {
      sunDir: [0.45, 0.55, 0.7], sunColor: 0xffe4c0, sunIntensity: 3.2,
      hemiSky: 0xcfdcf0, hemiGround: 0x7a6448, hemiIntensity: 0.5, envIntensity: 0.55,
      zenith: 0x3f6fae, horizon: 0xdccfb2, groundColor: 0x6a5a45, cloudCover: 0.32, cloudColor: 0xf6f0e6, sunGlow: 0xffd9a0,
      fog: 0xd8cbb0, fogNear: 45, fogFar: 280, exposure: 1.0, shadowSoft: 2,
      grade: { sat: 1.08, contrast: 1.07, tint: [1.03, 1.0, 0.95] }, particles: 'dust', groundDust: [0.64, 0.55, 0.42],
    },
    audio: { decay: 1.3, wet: 0.22, tone: 5200, amb: 'wind' },
  },
  harbor: {
    name: 'Harbor', desc: 'Container docks at sunset. Tight lanes, a gantry crane and an office roof.', seed: 21,
    layout(B, M) {
      harborHalf(B, 0); harborHalf(M, 1);
      B.prop('crane', 40, 40);
      container(B, 37, 38.78, false, 'containerR', 'containerW');
      for (const S of [B, M]) spawnRow(S, [[8, 4], [18, 4], [26, 4], [35, 4], [42, 5], [50, 4], [56, 4], [66, 4], [74, 5], [30, 7], [52, 7]]);
      for (const S of [B, M]) for (const [x, z] of [[40, 32], [15, 17], [30, 20], [41, 20], [47, 14], [64, 15], [64, 24], [71, 26], [24, 33], [10, 27], [55, 32], [35, 29]]) S.interest(x, z);
    },
    backdrop: harborBackdrop,
    perimeter: { quay: true },
    ground: { recipe: 'slab', args: [0x9a9082], ts: 6, w: 80, l: 260 },
    water: { y: -1.1, color: 0x183640 },
    roads: [{ x0: 1, z0: 36, x1: 79, z1: 44 }],
    minimap: { ground: [92, 90, 86], road: [66, 66, 66] },
    mats: { plaster: { args: [0xa9b4b8, 0x8a969a] }, trim: { args: [0xd8d4ca, 0xbab5a8] } },
    look: {
      sunDir: [-0.78, 0.2, 0.3], sunColor: 0xffa868, sunIntensity: 3,
      hemiSky: 0x9ea2b8, hemiGround: 0x54443a, hemiIntensity: 0.5, envIntensity: 0.75,
      zenith: 0x2c3c70, horizon: 0xf2a066, groundColor: 0x3a3230, cloudCover: 0.45, cloudColor: 0xd89078, sunGlow: 0xffa860,
      fog: 0xc09080, fogNear: 40, fogFar: 260, exposure: 1.12, pools: 0.45, poolColor: 0xffa050, shadowSoft: 2.5,
      grade: { sat: 1.12, contrast: 1.08, tint: [1.05, 0.98, 0.95] }, particles: 'dust', groundDust: [0.56, 0.55, 0.52],
    },
    audio: { decay: 1.9, wet: 0.3, tone: 4200, amb: 'harbor' },
  },
  outpost: {
    name: 'Outpost', desc: 'Snowbound mountain base. Bunker, barracks and a watchtower.', seed: 33,
    layout(B, M) {
      outpostHalf(B, 0); outpostHalf(M, 1);
      B.prop('antenna', 40, 40, { h: 15 }); B.box(39.6, 0, 39.6, 40.4, 15, 40.4, 'invis'); B.box(39.3, 0, 40.8, 40.7, 1, 41.6, 'invis');
      for (const S of [B, M]) spawnRow(S, [[8, 4], [16, 4], [26, 4], [34, 4], [46, 4], [54, 4], [62, 4], [74, 4], [30, 8], [50, 8], [4, 8]]);
      for (const S of [B, M]) for (const [x, z] of [[40, 32], [12, 16], [32, 26], [58, 14], [46, 21], [22, 28], [66, 26], [8, 30], [52, 32], [30, 16]]) S.interest(x, z);
    },
    backdrop: outpostBackdrop,
    perimeter: { mat: 'concrete', h: 4.5 },
    ground: { recipe: 'snow', ts: 7, normal: 1.2, rough: 0.8 },
    roads: [{ x0: 37, z0: 1, x1: 43, z1: 79, kind: 'mud' }],
    minimap: { ground: [150, 158, 168], road: [96, 90, 84], low: [110, 110, 104], high: [200, 204, 210] },
    snowCaps: true,
    mats: { concrete: { args: [0x9ea3a6, 0x81868a] }, trim: { args: [0x9ea3a6, 0x81868a] } },
    look: {
      sunDir: [0.3, 0.45, -0.6], sunColor: 0xe4ecff, sunIntensity: 1.5,
      hemiSky: 0xc8d6ea, hemiGround: 0xa8b0bc, hemiIntensity: 0.75, envIntensity: 0.85,
      zenith: 0x7a8ca4, horizon: 0xcdd5de, groundColor: 0xb8c0ca, cloudCover: 0.8, cloudColor: 0xc8d0da, sunGlow: 0xe8eeff,
      fog: 0xc3ccd6, fogNear: 25, fogFar: 230, exposure: 1.05, shadowSoft: 4,
      grade: { sat: 0.9, contrast: 1.05, tint: [0.97, 1.0, 1.05] }, particles: 'snow', groundDust: [0.92, 0.94, 0.97],
    },
    audio: { decay: 0.9, wet: 0.16, tone: 3000, amb: 'snow' },
  },
};
