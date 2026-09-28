// The map: a 4 km square of southern Japan in the style of the Izu and Hakone area.
// x runs east, z runs south (north is -z). Sea level is y = 0.
//
//   north-west   Mt. Haruna and its touge pass (hairpins to the summit)
//   north        forested hills and the ridge road
//   north-east   the Suzuka-style circuit on a plateau
//   east         Minato, a harbour city of towers and neon, ringed by the elevated expressway
//   centre       farmland and rice paddies, the shrine hill with its pagoda
//   west         Lake Kawa
//   south        the coast road above the beaches; the Sunrise Festival site on the shore
export const SIZE = 4096;
export const HALF = SIZE / 2;
export const SEA = 0;

export const coastZ = (x) => 1470 + 90 * Math.sin(x / 380) + 50 * Math.sin(x / 137 + 2) + 30 * Math.sin(x / 61);

export const PLACES = {
  festival: { x: -130, z: 1170, r: 230, h: 6 },
  city: { x0: 640, x1: 1660, z0: -20, z1: 960, h: 8 },
  lake: { x: -1260, z: 330, r: 330, water: 36 },
  mountain: { x: -1320, z: -1330, h: 230, r: 760 },
  circuit: { x: 1080, z: -1180, w: 1340, d: 820, h: 58 },
  paddies: { x: -380, z: 640, w: 1000, d: 520, h: 12 },
  shrine: { x: -880, z: 860, r: 110, h: 42 },
};

// Road classes: width is the paved half-width; grade is the steepest slope the profile allows.
export const ROAD_TYPES = {
  expressway: { hw: 8.5, shoulder: 2.5, grade: 0.06, smooth: 80, lanes: 4, divided: true, rail: true, lights: 40, prio: 5, surface: 0 },
  highway: { hw: 5.2, shoulder: 1.8, grade: 0.07, smooth: 40, lanes: 2, rail: false, lights: 0, prio: 4, surface: 0 },
  coast: { hw: 5.0, shoulder: 1.6, grade: 0.07, smooth: 40, lanes: 2, rail: true, lights: 0, prio: 4, surface: 0 },
  street: { hw: 6.0, shoulder: 2.4, grade: 0.06, smooth: 20, lanes: 2, city: true, lights: 30, prio: 3, surface: 0 },
  road: { hw: 3.8, shoulder: 1.2, grade: 0.09, smooth: 30, lanes: 2, prio: 2, surface: 0 },
  touge: { hw: 3.4, shoulder: 0.8, grade: 0.115, smooth: 18, lanes: 2, rail: true, prio: 2, surface: 0 },
  circuit: { hw: 7.0, shoulder: 3.5, grade: 0.04, smooth: 40, lanes: 0, kerbs: true, prio: 6, surface: 0, loop: true },
  dirt: { hw: 2.8, shoulder: 1.0, grade: 0.14, smooth: 18, lanes: 0, prio: 1, surface: 3 },
};

const coastRoad = [];
for (let x = -2020; x <= 2020; x += 160) coastRoad.push([x, coastZ(x) - 140 - 25 * Math.sin(x / 300)]);

// The touge climbs the south-east face of Mt. Haruna in switchbacks.
const touge = [
  [-930, -330], [-1010, -430], [-990, -540], [-880, -620], [-900, -700], [-1060, -720], [-1210, -660],
  [-1330, -700], [-1330, -790], [-1210, -850], [-1060, -880], [-1000, -960], [-1080, -1040],
  [-1240, -1040], [-1390, -1010], [-1480, -1080], [-1440, -1170], [-1320, -1190], [-1220, -1240],
];

export const ROADS = [
  { id: 'coast', type: 'coast', name: 'Coast Road', pts: coastRoad },
  {
    id: 'expressway', type: 'expressway', name: 'Shuto Wangan', pts: [
      [-930, -330], [-700, -250], [-420, -170], [-120, -110], [180, -80], [480, -60], [720, 20], [900, 120],
      [1150, 180], [1420, 200], [1690, 300], [1840, 520], [1860, 800], [1780, 1060], [1640, coastZ(1640) - 140 - 25 * Math.sin(1640 / 300)],
    ], elevated: [[900, 1860]],
  },
  {
    id: 'festival', type: 'highway', name: 'Festival Boulevard', pts: [
      [-130, 1060], [-110, 900], [-40, 700], [40, 480], [100, 260], [160, 80], [180, -80],
    ],
  },
  {
    id: 'paddy', type: 'road', name: 'Paddy Lane', pts: [
      [-40, 700], [-230, 690], [-470, 740], [-700, 700], [-880, 600], [-980, 500],
    ],
  },
  { id: 'lake', type: 'road', name: 'Lake Kawa Loop', loop: true, pts: circle(-1260, 330, 430, 22) },
  { id: 'lakewest', type: 'road', name: 'Lake Road', pts: [[-1450, 695], [-1540, 900], [-1500, 1120], [-1400, coastZ(-1400) - 140 - 25 * Math.sin(-1400 / 300)]] },
  { id: 'lakenorth', type: 'road', name: 'Kawa Pass', pts: [[-1070, -48], [-990, -180], [-930, -330]] },
  { id: 'touge', type: 'touge', name: 'Haruna Touge', pts: touge },
  {
    id: 'ridge', type: 'touge', name: 'Ridge Road', pts: [
      [-1220, -1240], [-1060, -1390], [-880, -1320], [-720, -1480], [-480, -1580], [-260, -1450], [-60, -1540], [140, -1420], [300, -1310], [420, -1230],
    ],
  },
  {
    id: 'circuit', type: 'circuit', name: 'Horizon Circuit', loop: true, pts: [
      [520, -1000], [900, -960], [1300, -950], [1560, -980], [1650, -1060], [1600, -1150], [1450, -1170],
      [1380, -1250], [1440, -1360], [1580, -1440], [1560, -1540], [1380, -1560], [1180, -1470], [1040, -1330],
      [880, -1360], [720, -1480], [560, -1440], [470, -1300], [500, -1160],
    ],
  },
  { id: 'circuitroad', type: 'road', name: 'Circuit Access', pts: [[720, 20], [760, -240], [800, -520], [760, -800], [640, -1000], [520, -1080]] },
  { id: 'hills', type: 'dirt', name: 'Cedar Trail', pts: [[-420, -1560], [-460, -1200], [-300, -950], [-420, -700], [-380, -450], [-420, -170]] },
  { id: 'shore', type: 'dirt', name: 'Lakeshore Trail', pts: [[-1540, 900], [-1300, 780], [-1100, 800], [-880, 860]] },
  { id: 'shrine', type: 'road', name: 'Shrine Road', pts: [[-470, 740], [-600, 820], [-760, 880], [-880, 860]] },
];

// Minato street grid (flat, 8 m), linked to the festival road and the coast road.
const gx = [700, 880, 1060, 1240, 1420, 1600], gz = [40, 220, 400, 580, 760, 920];
for (const x of gx) ROADS.push({ id: `c-ns${x}`, type: 'street', name: `${x / 20 | 0}-chome Dori`, pts: gz.map((z) => [x, z]) });
for (const z of gz) ROADS.push({ id: `c-ew${z}`, type: 'street', name: 'Minato Avenue', pts: gx.map((x) => [x, z]) });
ROADS.push({ id: 'citylink', type: 'highway', name: 'Harbour Road', pts: [[700, 920], [480, 1000], [200, 1060], [-10, 1080], [-130, 1060]] });
ROADS.push({ id: 'citysouth', type: 'street', name: 'Pier Street', pts: [[1240, 920], [1240, coastZ(1240) - 140 - 25 * Math.sin(1240 / 300)]] });
ROADS.push({ id: 'citywest', type: 'highway', name: 'Canal Road', pts: [[160, 80], [420, 60], [700, 40]] });

function circle(cx, cz, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.07 * Math.sin(a * 3 + 1));
    out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
  }
  return out;
}
