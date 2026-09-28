// Every car in the game: specs for the physics, audio and the Autoshow, plus the body.
// Numbers come from the manufacturers' published figures where they exist.
//
// sound: engine sample bank (Stunt Rally engine-sim recordings at fixed rpm) and a ratio from
// real rpm to bank rpm, chosen so the firing frequency matches (a V10 on the V12 bank plays at
// 5/6 of its rpm, a V10 on a V8 bank at 5/4).
import c8z06 from './defs/c8z06.js';
import c6zr1 from './defs/c6zr1.js';
import c5z06 from './defs/c5z06.js';
import zr1x from './defs/zr1x.js';
import zr1 from './defs/zr1.js';
import eray from './defs/eray.js';
import nsx from './defs/nsx.js';
import nsxr from './defs/nsxr.js';
import vipergts from './defs/vipergts.js';

// A plausible full-load torque curve from peak torque and peak power.
export function torqueCurve({ nm, nmRpm, hp, hpRpm, idle = 900, redline, flat = 0 }) {
  const pNm = (hp * 745.7) / ((hpRpm * 2 * Math.PI) / 60);
  const pts = [
    [idle, nm * 0.58], [idle + (nmRpm - idle) * 0.45, nm * 0.84], [nmRpm, nm],
  ];
  if (flat) pts.push([nmRpm + flat, nm]);
  pts.push([(Math.max(nmRpm + flat, nmRpm) + hpRpm) / 2, (nm + pNm) / 2 + nm * 0.02], [hpRpm, pNm], [redline, pNm * 0.9], [redline + 400, pNm * 0.6]);
  return pts.sort((a, b) => a[0] - b[0]);
}

const hpToW = 745.7;

export const CLASSES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X'];

// Performance index (100-999) from power to weight, grip and aero, FH-style.
export function perfIndex(c) {
  const P = c.phys;
  const pw = (c.hp * hpToW) / P.mass; // W/kg
  const aero = (P.aero?.clF ?? 0) + (P.aero?.clR ?? 0);
  // log fit through reference cars: Wrangler ~560, C7 ~770, Z06 ~860, LaFerrari ~950
  const raw = -600 + 250 * Math.log(pw) + ((P.grip ?? 1.1) - 1.1) * 150 + aero * 8 + (P.drive === 'AWD' ? 15 : 0);
  return Math.max(100, Math.min(999, Math.round(raw)));
}
export function classOf(pi) {
  return pi <= 500 ? 'D' : pi <= 600 ? 'C' : pi <= 700 ? 'B' : pi <= 800 ? 'A' : pi <= 900 ? 'S1' : pi <= 998 ? 'S2' : 'X';
}

const std = (o) => ({ susp: { freqF: 1.9, freqR: 2.1, damp: 0.32, arbF: 0.5, arbR: 0.35, rest: 0.22, travel: 0.1, droop: 0.08 }, steer: 0.62, eff: 0.9, lsd: 0.35, slide: 0.78, ...o });

export const CARS = [
  {
    id: 'c8z06', make: 'Chevrolet', model: 'Corvette Z06', year: 2023, country: 'USA', price: 115000, rarity: 'Legendary', group: 'Corvette',
    hp: 670, def: c8z06, desc: 'The flat-plane-crank LT6 screams to 8,600 rpm. The most powerful naturally aspirated V8 ever put in a production car.',
    engine: '5.5L LT6 flat-plane V8', sound: { bank: 'v8f', ratio: 1.0 },
    phys: std({
      mass: 1561, cgH: 0.44, wf: 0.4, drive: 'RWD', grip: 1.22,
      engine: { idle: 950, redline: 8600, limiter: 8650, inertia: 0.16, revRate: 14000, launch: 3200, curve: torqueCurve({ nm: 623, nmRpm: 6300, hp: 670, hpRpm: 8400, idle: 950, redline: 8600 }) },
      gears: [2.91, 1.76, 1.22, 0.96, 0.78, 0.65, 0.55, 0.46], final: 5.56, reverse: 2.9, shift: 0.09, lsd: 0.5,
      brake: { torque: 5200, bias: 0.6 }, aero: { cd: 0.39, area: 2.05, clF: 0.55, clR: 0.95 },
      susp: { freqF: 2.3, freqR: 2.5, damp: 0.34, arbF: 0.6, arbR: 0.4, rest: 0.2, travel: 0.09, droop: 0.07 },
    }),
  },
  {
    id: 'zr1x', make: 'Chevrolet', model: 'Corvette ZR1X', year: 2026, country: 'USA', price: 207400, rarity: 'Forza Edition', group: 'Corvette',
    hp: 1250, def: zr1x, desc: 'The most powerful Corvette ever: the ZR1\'s twin-turbo LT7 plus an electric front axle. 1,250 hp, all-wheel drive, under two seconds to 60 and over 230 mph.',
    engine: '5.5L twin-turbo LT7 V8 + front e-motor', sound: { bank: 'v8f', ratio: 1.0, turbo: 1.1 },
    phys: std({
      mass: 1790, cgH: 0.43, wf: 0.42, drive: 'RWD', grip: 1.3,
      engine: { idle: 1000, redline: 7500, limiter: 7550, inertia: 0.17, revRate: 13000, launch: 3600, turbo: 1, boostRpm: 2600, curve: torqueCurve({ nm: 1123, nmRpm: 6000, hp: 1064, hpRpm: 7000, idle: 1000, redline: 7500 }) },
      emotor: { axle: 'front', torque: 2600, vBase: 18, vMax: 70 },
      gears: [2.91, 1.76, 1.22, 0.96, 0.78, 0.65, 0.55, 0.46], final: 5.0, reverse: 2.9, shift: 0.07, lsd: 0.55,
      brake: { torque: 6400, bias: 0.6 }, aero: { cd: 0.42, area: 2.05, clF: 0.8, clR: 1.3 },
      susp: { freqF: 2.4, freqR: 2.6, damp: 0.35, arbF: 0.62, arbR: 0.42, rest: 0.2, travel: 0.09, droop: 0.07 },
    }),
  },
  {
    id: 'zr1', make: 'Chevrolet', model: 'Corvette ZR1', year: 2025, country: 'USA', price: 175000, rarity: 'Legendary', group: 'Corvette',
    hp: 1064, def: zr1, desc: 'A 5.5-litre twin-turbo flat-plane V8 making 1,064 hp, a tunnel through the hood and a 233 mph top speed.',
    engine: '5.5L twin-turbo LT7 V8', sound: { bank: 'v8f', ratio: 1.0, turbo: 1.1 },
    phys: std({
      mass: 1670, cgH: 0.43, wf: 0.4, drive: 'RWD', grip: 1.27,
      engine: { idle: 1000, redline: 7500, limiter: 7550, inertia: 0.17, revRate: 13000, launch: 3200, turbo: 1, boostRpm: 2600, curve: torqueCurve({ nm: 1123, nmRpm: 6000, hp: 1064, hpRpm: 7000, idle: 1000, redline: 7500 }) },
      gears: [2.91, 1.76, 1.22, 0.96, 0.78, 0.65, 0.55, 0.46], final: 5.0, reverse: 2.9, shift: 0.07, lsd: 0.55,
      brake: { torque: 6200, bias: 0.6 }, aero: { cd: 0.4, area: 2.05, clF: 0.7, clR: 1.1 },
      susp: { freqF: 2.4, freqR: 2.6, damp: 0.35, arbF: 0.62, arbR: 0.42, rest: 0.2, travel: 0.09, droop: 0.07 },
    }),
  },
  {
    id: 'eray', make: 'Chevrolet', model: 'Corvette E-Ray', year: 2024, country: 'USA', price: 104900, rarity: 'Epic', group: 'Corvette',
    hp: 655, def: eray, desc: 'The first all-wheel-drive Corvette: a 6.2-litre LT2 behind you and an electric motor driving the front wheels.',
    engine: '6.2L LT2 V8 + front e-motor', sound: { bank: 'b-v8', ratio: 1.0 },
    phys: std({
      mass: 1717, cgH: 0.44, wf: 0.42, drive: 'RWD', grip: 1.15,
      engine: { idle: 800, redline: 6600, limiter: 6650, inertia: 0.19, revRate: 11000, curve: torqueCurve({ nm: 637, nmRpm: 5150, hp: 495, hpRpm: 6450, idle: 800, redline: 6600 }) },
      emotor: { axle: 'front', torque: 2200, vBase: 18, vMax: 67 },
      gears: [2.91, 1.76, 1.22, 0.96, 0.78, 0.65, 0.55, 0.46], final: 5.17, reverse: 2.9, shift: 0.1, lsd: 0.45,
      brake: { torque: 5000, bias: 0.6 }, aero: { cd: 0.33, area: 2.05, clF: 0.2, clR: 0.3 },
    }),
  },
  {
    id: 'c5z06', make: 'Chevrolet', model: 'Corvette Z06', year: 2002, country: 'USA', price: 42000, rarity: 'Rare', group: 'Corvette',
    hp: 405, def: c5z06, desc: 'The C5 Z06 fixed-roof coupe: a hand-built 5.7-litre LS6, titanium exhaust and the lightest, stiffest Corvette of its day.',
    engine: '5.7L LS6 V8', sound: { bank: 'b-v8', ratio: 1.0 },
    phys: std({
      mass: 1414, cgH: 0.46, wf: 0.51, drive: 'RWD', grip: 1.08,
      engine: { idle: 750, redline: 6500, limiter: 6600, inertia: 0.2, revRate: 10500, curve: torqueCurve({ nm: 542, nmRpm: 4800, hp: 405, hpRpm: 6000, idle: 750, redline: 6500 }) },
      gears: [2.97, 2.07, 1.43, 1.0, 0.84, 0.56], final: 3.42, reverse: 3.28, shift: 0.22, lsd: 0.4,
      brake: { torque: 4200, bias: 0.62 }, aero: { cd: 0.31, area: 1.95, clF: 0.05, clR: 0.1 },
    }),
  },
  {
    id: 'nsx', make: 'Honda', model: 'NSX', year: 1991, country: 'Japan', price: 120000, rarity: 'Legendary', group: 'JDM',
    hp: 270, def: nsx, desc: 'The everyday supercar, tuned with Ayrton Senna: an all-aluminium monocoque, a titanium-rod VTEC V6 to 8,000 rpm and a canopy inspired by a fighter jet.',
    engine: '3.0L C30A VTEC V6', sound: { bank: 'su-oe', ratio: 1.0 },
    phys: std({
      mass: 1365, cgH: 0.44, wf: 0.42, drive: 'RWD', grip: 1.05,
      engine: { idle: 800, redline: 8000, limiter: 8100, inertia: 0.14, revRate: 13500, curve: torqueCurve({ nm: 284, nmRpm: 5400, hp: 270, hpRpm: 7100, idle: 800, redline: 8000 }) },
      gears: [3.07, 1.96, 1.43, 1.13, 0.91], final: 4.06, reverse: 3.0, shift: 0.18, lsd: 0.35,
      brake: { torque: 3600, bias: 0.62 }, aero: { cd: 0.32, area: 1.8, clF: 0.05, clR: 0.12 },
      susp: { freqF: 1.9, freqR: 2.1, damp: 0.32, arbF: 0.5, arbR: 0.3, rest: 0.22, travel: 0.1, droop: 0.08 },
    }),
  },
  {
    id: 'nsxr', make: 'Honda', model: 'NSX-R', year: 1992, country: 'Japan', price: 250000, rarity: 'Legendary', group: 'JDM',
    hp: 280, def: nsxr, desc: 'Type R: 120 kg lighter, carbon Recaros, a blueprinted engine and a stiffer chassis honed at Suzuka. Championship White, of course.',
    engine: '3.0L C30A VTEC V6 (blueprinted)', sound: { bank: 'su-oe', ratio: 1.0 },
    phys: std({
      mass: 1230, cgH: 0.43, wf: 0.42, drive: 'RWD', grip: 1.1,
      engine: { idle: 900, redline: 8000, limiter: 8100, inertia: 0.12, revRate: 15000, curve: torqueCurve({ nm: 294, nmRpm: 5400, hp: 280, hpRpm: 7300, idle: 900, redline: 8000 }) },
      gears: [3.07, 2.05, 1.52, 1.19, 0.97], final: 4.24, reverse: 3.0, shift: 0.15, lsd: 0.5,
      brake: { torque: 3700, bias: 0.62 }, aero: { cd: 0.32, area: 1.8, clF: 0.08, clR: 0.15 },
      susp: { freqF: 2.2, freqR: 2.4, damp: 0.34, arbF: 0.6, arbR: 0.35, rest: 0.2, travel: 0.09, droop: 0.07 },
    }),
  },
  {
    id: 'vipergts', make: 'Dodge', model: 'Viper GTS', year: 1996, country: 'USA', price: 95000, rarity: 'Legendary', group: 'Muscle',
    hp: 450, def: vipergts, desc: 'An 8.0-litre V10, no traction control, no ABS and no apologies. Viper Blue with Stone White stripes.',
    engine: '8.0L V10', sound: { bank: 'b-v8', ratio: 1.25 },
    phys: std({
      mass: 1535, cgH: 0.45, wf: 0.5, drive: 'RWD', grip: 1.08,
      engine: { idle: 700, redline: 6000, limiter: 6100, inertia: 0.28, revRate: 8000, curve: torqueCurve({ nm: 664, nmRpm: 3700, hp: 450, hpRpm: 5200, idle: 700, redline: 6000, flat: 600 }) },
      gears: [2.66, 1.78, 1.3, 1.0, 0.74, 0.5], final: 3.07, reverse: 2.9, shift: 0.25, lsd: 0.45,
      brake: { torque: 4400, bias: 0.64 }, aero: { cd: 0.35, area: 2.0, clF: 0.02, clR: 0.06 },
    }),
  },
  {
    id: 'c6zr1', make: 'Chevrolet', model: 'Corvette ZR1', year: 2009, country: 'USA', price: 105000, rarity: 'Epic', group: 'Corvette',
    hp: 638, def: c6zr1, desc: 'The "Blue Devil": a supercharged 6.2-litre LS9, carbon fibre everywhere, and a little window in the hood so you can admire the blower.',
    engine: '6.2L supercharged LS9 V8', sound: { bank: 'b-v8', ratio: 1.0, whine: 1 },
    phys: std({
      mass: 1506, cgH: 0.45, wf: 0.52, drive: 'RWD', grip: 1.2,
      engine: { idle: 750, redline: 6600, limiter: 6700, inertia: 0.2, revRate: 11000, launch: 2800, curve: torqueCurve({ nm: 819, nmRpm: 3800, hp: 638, hpRpm: 6500, idle: 750, redline: 6600 }) },
      gears: [2.29, 1.61, 1.21, 1.0, 0.81, 0.67], final: 3.42, reverse: 2.9, shift: 0.2, lsd: 0.45,
      brake: { torque: 5200, bias: 0.62 }, aero: { cd: 0.36, area: 2.0, clF: 0.18, clR: 0.3 },
    }),
  },
  {
    id: 'c7', make: 'Chevrolet', model: 'Corvette Stingray', year: 2014, country: 'USA', price: 62000, rarity: 'Epic', group: 'Corvette',
    hp: 460, desc: 'The C7 brought the Stingray name back with a 6.2-litre LT1 small block and a seven-speed manual that rev-matches for you.',
    engine: '6.2L LT1 V8', sound: { bank: 'b-v8', ratio: 1.0 },
    def: { id: 'c7', model: 'corvette_c7', paint: { color: 0x0b2a6b, finish: 'metallic' },
      materials: { paint: /^Car_Paint$/, glass: /^Windows$/, head: /Main_Headlight_Lens|Headlight_Cover/, drl: /Daylight_Cover/, tail: /Tail_Lights_Red_Cover$/, brake: /Tail_Lights_Red_Cover_2|Spoiler_Light_Cover/, reverse: /Tail_Lights_White_Cover/ } },
    phys: std({
      mass: 1496, cgH: 0.45, wf: 0.5, drive: 'RWD', grip: 1.12,
      engine: { idle: 700, redline: 6500, limiter: 6600, inertia: 0.22, curve: torqueCurve({ nm: 630, nmRpm: 4600, hp: 460, hpRpm: 6000, idle: 700, redline: 6500 }) },
      gears: [2.29, 1.61, 1.21, 1.0, 0.81, 0.67, 0.49], final: 3.73, reverse: 2.9, shift: 0.22,
      brake: { torque: 4400, bias: 0.6 }, aero: { cd: 0.29, area: 2.0, clF: 0.1, clR: 0.15 },
    }),
  },
  {
    id: 'gts992', make: 'Porsche', model: '911 Carrera 4 GTS', year: 2022, country: 'Germany', price: 165000, rarity: 'Epic', group: 'Porsche',
    hp: 473, desc: 'The driver\'s 911: a twin-turbo flat six with the Turbo\'s chassis bits, all-wheel drive and black trim everywhere.',
    engine: '3.0L twin-turbo flat-6', sound: { bank: 'tsp', ratio: 1.0, turbo: 0.8 },
    def: { id: 'gts992', model: 'porsche_992', paint: { color: 0x2b3a2f, finish: 'metallic' }, materials: { paint: /^paint$/, head: /^lights$/ } },
    phys: std({
      mass: 1570, cgH: 0.46, wf: 0.39, drive: 'AWD', awdFront: 0.25, grip: 1.16,
      engine: { idle: 800, redline: 7500, limiter: 7600, inertia: 0.18, turbo: 1, boostRpm: 1900, curve: torqueCurve({ nm: 570, nmRpm: 2300, flat: 2700, hp: 473, hpRpm: 6500, idle: 800, redline: 7500 }) },
      gears: [4.89, 3.17, 2.15, 1.56, 1.18, 0.94, 0.76, 0.61], final: 3.03, reverse: 3.2, shift: 0.08,
      brake: { torque: 4600, bias: 0.62 }, aero: { cd: 0.31, area: 2.0, clF: 0.2, clR: 0.3 },
    }),
  },
  {
    id: 'f458', make: 'Ferrari', model: '458 Spider', year: 2012, country: 'Italy', price: 240000, rarity: 'Legendary', group: 'Ferrari',
    hp: 562, desc: 'The last naturally aspirated mid-engine V8 Ferrari, with a 9,000 rpm redline and the roof folded away.',
    engine: '4.5L V8', sound: { bank: 'v8f', ratio: 1.0 },
    def: { id: 'f458', model: 'ferrari_458', paint: { color: 0xa00808, finish: 'metallic' }, materials: { paint: /^Body_Color$/, glass: /^Glass_Gray$/, head: /Projector_Glass/, tail: /Taillight_Glass/, drl: /Turn_Signal_LED/ },
      tweak: { metal_gray: { color: 0x2c2d30, metalness: 0.9, roughness: 0.35 } } },
    phys: std({
      mass: 1485, cgH: 0.44, wf: 0.42, drive: 'RWD', grip: 1.18,
      engine: { idle: 1000, redline: 9000, limiter: 9050, inertia: 0.14, revRate: 16000, curve: torqueCurve({ nm: 540, nmRpm: 6000, hp: 562, hpRpm: 9000, idle: 1000, redline: 9000 }) },
      gears: [3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], final: 4.44, reverse: 2.9, shift: 0.07,
      brake: { torque: 4800, bias: 0.6 }, aero: { cd: 0.33, area: 1.95, clF: 0.25, clR: 0.4 },
    }),
  },
  {
    id: 'laferrari', make: 'Ferrari', model: 'LaFerrari Aperta', year: 2017, country: 'Italy', price: 3500000, rarity: 'Legendary', group: 'Ferrari',
    hp: 950, desc: 'A 6.3-litre V12 and HY-KERS electric boost: 950 horsepower, 9,250 rpm, and no roof.',
    engine: '6.3L V12 + HY-KERS', sound: { bank: 'v12d', ratio: 1.0 },
    def: { id: 'laferrari', model: 'laferrari', paint: { color: 0xb00000, finish: 'metallic' }, materials: { paint: /smallspecmap_PRIMARY/ } },
    phys: std({
      mass: 1520, cgH: 0.4, wf: 0.41, drive: 'RWD', grip: 1.28,
      engine: { idle: 1000, redline: 9250, limiter: 9300, inertia: 0.15, revRate: 16000, curve: torqueCurve({ nm: 700, nmRpm: 6750, hp: 789, hpRpm: 9000, idle: 1000, redline: 9250 }) },
      emotor: { axle: 'rear', torque: 540, vBase: 20, vMax: 95 },
      gears: [3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69], final: 4.2, reverse: 2.9, shift: 0.06, lsd: 0.55,
      brake: { torque: 5600, bias: 0.6 }, aero: { cd: 0.35, area: 1.9, clF: 0.5, clR: 0.8 },
    }),
  },
  {
    id: 'huracangt3', make: 'Lamborghini', model: 'Huracán GT3', year: 2016, country: 'Italy', price: 520000, rarity: 'Legendary', group: 'Race',
    hp: 585, desc: 'A customer race car: V10, sequential gearbox, slicks, and more downforce than anything road legal.',
    engine: '5.2L V10', sound: { bank: 'v12d', ratio: 0.833 },
    def: { id: 'huracangt3', model: 'huracan_gt3', materials: { paint: /^$/, head: /Emissive_Light_Front|Glass_Emissive_Front/, tail: /Emissive_Light_Rear|Glass_Emissive_Rear/ } },
    phys: std({
      mass: 1300, cgH: 0.38, wf: 0.43, drive: 'RWD', grip: 1.45,
      engine: { idle: 1200, redline: 8500, limiter: 8550, inertia: 0.13, revRate: 17000, curve: torqueCurve({ nm: 560, nmRpm: 6500, hp: 585, hpRpm: 8250, idle: 1200, redline: 8500 }) },
      gears: [3.0, 2.2, 1.72, 1.4, 1.16, 0.98], final: 3.8, reverse: 2.9, shift: 0.05, lsd: 0.7,
      brake: { torque: 6200, bias: 0.58 }, aero: { cd: 0.45, area: 2.0, clF: 1.3, clR: 2.0 },
      susp: { freqF: 3.0, freqR: 3.2, damp: 0.38, arbF: 0.7, arbR: 0.5, rest: 0.16, travel: 0.06, droop: 0.05 },
    }),
  },
  {
    id: 'urus', make: 'Lamborghini', model: 'Urus', year: 2019, country: 'Italy', price: 230000, rarity: 'Epic', group: 'SUV',
    hp: 641, desc: 'The super SUV: a twin-turbo V8, torque vectoring all-wheel drive and a nose that means business.',
    engine: '4.0L twin-turbo V8', sound: { bank: 'ct-v8', ratio: 1.0, turbo: 1 },
    def: { id: 'urus', model: 'urus', paint: { color: 0xf0a800, finish: 'metallic' }, materials: { paint: /^WhiteCar$/, head: /LightsFrontLed|LightsGlassFront/, tail: /LightsGlassBack/, brake: /emitbrake/ } },
    phys: std({
      mass: 2200, cgH: 0.62, wf: 0.57, drive: 'AWD', awdFront: 0.4, grip: 1.08,
      engine: { idle: 750, redline: 6800, limiter: 6900, inertia: 0.25, turbo: 1, boostRpm: 1800, curve: torqueCurve({ nm: 850, nmRpm: 2250, flat: 2250, hp: 641, hpRpm: 6000, idle: 750, redline: 6800 }) },
      gears: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67], final: 3.2, reverse: 3.3, shift: 0.15,
      brake: { torque: 6000, bias: 0.64 }, aero: { cd: 0.35, area: 2.7, clF: 0.05, clR: 0.1 },
      susp: { freqF: 1.6, freqR: 1.7, damp: 0.34, arbF: 0.6, arbR: 0.4, rest: 0.26, travel: 0.13, droop: 0.1 },
    }),
  },
  {
    id: 'jeep', make: 'Jeep', model: 'Wrangler Rubicon', year: 2024, country: 'USA', price: 55000, rarity: 'Common', group: 'Offroad',
    hp: 285, desc: 'Doors off, locking diffs, 33-inch tyres. Leave the road and keep going.',
    engine: '3.6L Pentastar V6', sound: { bank: 'b-i6r', ratio: 1.0 },
    def: { id: 'jeep', model: 'jeep_wrangler', paint: { color: 0x3e7a1c, finish: 'gloss' }, materials: { paint: /smallspecmap_PRIMARY/ } },
    phys: std({
      mass: 2050, cgH: 0.75, wf: 0.52, drive: 'AWD', awdFront: 0.5, grip: 0.95, offroad: 1,
      engine: { idle: 700, redline: 6400, limiter: 6500, inertia: 0.24, curve: torqueCurve({ nm: 353, nmRpm: 4800, hp: 285, hpRpm: 6400, idle: 700, redline: 6400 }) },
      gears: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67], final: 4.1, reverse: 3.3, shift: 0.2, lsd: 0.8,
      brake: { torque: 4400, bias: 0.64 }, aero: { cd: 0.45, area: 3.1, clF: 0, clR: 0 },
      susp: { freqF: 1.3, freqR: 1.4, damp: 0.3, arbF: 0.25, arbR: 0.2, rest: 0.34, travel: 0.2, droop: 0.16 },
    }),
  },
  {
    id: 'mp45', make: 'McLaren', model: 'MP4/5 Honda', year: 1989, country: 'UK', price: 4500000, rarity: 'Legendary', group: 'Race',
    hp: 690, desc: 'Senna and Prost\'s title winner: a 3.5-litre Honda V10 screaming to 13,000 rpm in a 500 kg chassis.',
    engine: '3.5L Honda RA109E V10', sound: { bank: 'v12d', ratio: 0.75 },
    def: { id: 'mp45', model: 'mclaren_mp45', materials: { paint: /^$/ } },
    phys: std({
      mass: 580, cgH: 0.27, wf: 0.4, drive: 'RWD', grip: 1.6,
      engine: { idle: 3500, redline: 13000, limiter: 13100, inertia: 0.06, revRate: 30000, launch: 5500, curve: torqueCurve({ nm: 390, nmRpm: 10500, hp: 690, hpRpm: 13000, idle: 3500, redline: 13000 }) },
      gears: [2.6, 2.05, 1.7, 1.45, 1.27, 1.12], final: 4.2, reverse: 2.9, shift: 0.05, lsd: 0.6,
      brake: { torque: 4200, bias: 0.6 }, aero: { cd: 0.9, area: 1.5, clF: 1.5, clR: 2.2 },
      susp: { freqF: 3.6, freqR: 3.8, damp: 0.4, arbF: 0.8, arbR: 0.6, rest: 0.12, travel: 0.04, droop: 0.03 },
    }),
  },
  {
    id: 'supragt300', make: 'Toyota', model: 'GR Supra GT300', year: 2020, country: 'Japan', price: 480000, rarity: 'Legendary', group: 'Race',
    hp: 550, desc: 'A Super GT300 racer from Fuji and Suzuka, wing, livery and all.',
    engine: '3.0L turbo inline-6', sound: { bank: 'b-i6r', ratio: 1.0, turbo: 1 },
    def: { id: 'supragt300', model: 'supra_gt300', materials: { paint: /^$/ } },
    phys: std({
      mass: 1250, cgH: 0.38, wf: 0.5, drive: 'RWD', grip: 1.42,
      engine: { idle: 1200, redline: 8000, limiter: 8050, inertia: 0.13, turbo: 1, boostRpm: 3000, curve: torqueCurve({ nm: 650, nmRpm: 4500, hp: 550, hpRpm: 7000, idle: 1200, redline: 8000 }) },
      gears: [2.9, 2.1, 1.65, 1.35, 1.14, 0.97], final: 3.9, reverse: 2.9, shift: 0.05, lsd: 0.7,
      brake: { torque: 5600, bias: 0.58 }, aero: { cd: 0.42, area: 2.0, clF: 1.1, clR: 1.7 },
      susp: { freqF: 3.0, freqR: 3.2, damp: 0.38, arbF: 0.7, arbR: 0.5, rest: 0.16, travel: 0.06, droop: 0.05 },
    }),
  },
];

// Solve each car's drag so its drag-limited top speed matches the published figure.
function calibrate(c) {
  const P = c.phys;
  if (!c.vmax || !P.aero) return;
  const v = c.vmax / 3.6;
  const power = c.hp * hpToW * 0.86;
  const roll = (P.roll ?? 0.012) * P.mass * 9.81 + 0.012 * 0.5 * 1.2 * ((P.aero.clF ?? 0) + (P.aero.clR ?? 0)) * v * v;
  const cda = (2 * (power / v - roll)) / (1.2 * v * v);
  P.aero.cd = Math.max(0.2, cda / P.aero.area);
}
const VMAX = { zr1x: 375, zr1: 375, eray: 294, c5z06: 275, nsx: 270, nsxr: 275, vipergts: 298, c6zr1: 330, c8z06: 312, c7: 290, gts992: 309, f458: 320, laferrari: 350, huracangt3: 285, urus: 305, jeep: 175, mp45: 330, supragt300: 290 };
for (const c of CARS) {
  c.vmax ??= VMAX[c.id];
  calibrate(c);
  c.pi = perfIndex(c); c.cls = classOf(c.pi); c.name = `${c.year} ${c.make} ${c.model}`;
}
export const carById = (id) => CARS.find((c) => c.id === id);

// FH-style 0-10 stat bars for the Autoshow and garage
export function ratings(c) {
  const P = c.phys, pw = (c.hp * hpToW) / P.mass;
  const aero = (P.aero?.clF ?? 0) + (P.aero?.clR ?? 0);
  const r = (v) => Math.max(1, Math.min(10, Math.round(v * 10) / 10));
  const speed = r(((c.vmax ?? 250) - 140) / 22);
  const accel = r((Math.log(pw) - 3.9) * 3.2);
  const launch = r(accel * 0.85 + (P.drive === 'AWD' ? 1.6 : P.drive === 'FWD' ? 0.3 : 0.6) + (P.emotor ? 0.8 : 0));
  const handling = r(((P.grip ?? 1.1) - 0.9) * 13 + aero * 0.8 - (P.mass - 1400) / 700 + (P.cgH < 0.45 ? 0.6 : 0));
  const braking = r(((P.brake?.torque ?? 4000) / P.mass) * 1.1 + ((P.grip ?? 1.1) - 1) * 6 + aero * 0.5);
  const offroad = r((P.offroad ? 7.5 : 2.5) + (P.susp?.travel ?? 0.1) * 12 + (P.drive === 'AWD' ? 1 : 0) - aero);
  return { speed, handling, accel, launch, braking, offroad };
}
