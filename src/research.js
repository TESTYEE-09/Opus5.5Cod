// Tech tree, War Thunder style: each line (ground forces, aviation, helicopters, drones) is a
// column of vehicles by rank. The first vehicle of a line is free; every match's XP is also
// research points (RP) that go into the next locked vehicle of every line. Kept in this browser.
const KEY = 'frontline.research';

export const NATIONS = [{ id: 0, name: 'USA', short: 'US' }, { id: 1, name: 'Russia', short: 'RU' }];
export const RANKS = ['I', 'II', 'III', 'IV'];

// icon: silhouette in ICONS; br: battle rating shown on the card
export const TREE = [
  { line: 'Ground forces', key: '8', setting: 'ground', nodes: [
    { id: 'apc', rank: 1, br: '3.0', icon: 'apc', names: ['M113', 'BTR-80'], role: 'APC · heavy machine gun', cost: 0 },
    { id: 'ifv', rank: 2, br: '6.7', icon: 'ifv', names: ['M2 Bradley', 'BMP-2'], role: 'IFV · autocannon + ATGM', cost: 4000 },
    { id: 'tank', rank: 3, br: '8.7', icon: 'tank', names: ['M1 Abrams', 'T-80'], role: 'Main battle tank', cost: 10000 },
    { id: 'mbt', rank: 4, br: '11.3', icon: 'tank', names: ['M1A2 SEPv3', 'T-90M'], role: 'Modern MBT · faster reload', cost: 22000 },
  ] },
  { line: 'Aviation', key: '9', setting: 'jet', nodes: [
    { id: 'attack', rank: 2, br: '9.0', icon: 'attacker', names: ['A-10C', 'Su-25'], role: 'Attack jet · missiles, big gun', cost: 0 },
    { id: 'fighter', rank: 3, br: '11.7', icon: 'fighter', names: ['F-16C', 'Su-27'], role: 'Fighter · fast, IR missiles', cost: 8000 },
  ] },
  { line: 'Helicopters', key: 'H', setting: 'heli', nodes: [
    { id: 'heli', rank: 3, br: '10.3', icon: 'heli', names: ['AH-64D Apache', 'Mi-24V Hind'], role: 'Gunship · 30 mm, ATGMs, rockets', cost: 0 },
  ] },
  { line: 'Drones', key: '7', setting: 'fpv', nodes: [
    { id: '5', rank: 1, br: '1.0', icon: 'drone', names: ['5" FPV', '5" FPV'], role: 'Fast · small charge', cost: 0 },
    { id: '10', rank: 2, br: '4.0', icon: 'drone', names: ['10" FPV', '10" FPV'], role: 'Heavy · kills tanks', cost: 5000 },
  ] },
];

// side-view (ground, heli) and top-view (jets, drones) silhouettes, 64 x 24
export const ICONS = {
  apc: '<path d="M5 8h40l10 7v4H3v-6z"/><circle cx="12" cy="20" r="3.2"/><circle cx="22" cy="20" r="3.2"/><circle cx="36" cy="20" r="3.2"/><circle cx="46" cy="20" r="3.2"/><rect x="18" y="4" width="8" height="4"/><rect x="25" y="5" width="16" height="1.4"/>',
  ifv: '<path d="M4 17h52l-4 5H8z"/><path d="M6 9h38l10 8H3z"/><path d="M20 4h14l3 5H18z"/><rect x="34" y="5.4" width="20" height="1.3"/><rect x="21" y="1.5" width="6" height="2.5"/>',
  tank: '<path d="M4 17h50l-4 5H8z"/><path d="M6 12h44l6 5H3z"/><path d="M16 6h20l5 6H13z"/><rect x="38" y="7.6" width="25" height="1.9"/><rect x="18" y="4" width="5" height="2"/>',
  attacker: '<path d="M4 12l8-1h14l2-10h6v10h14l4-4h4l-1 4h5v2h-5l1 4h-4l-4-4H34v10h-6l-2-10H12z"/>',
  fighter: '<path d="M2 12l12-2h16l14-8h4l-6 8h12l6-5h2l-2 6 2 1-2 1 2 6h-2l-6-5H42l6 8h-4l-14-8H14z"/>',
  heli: '<path d="M7 13q2-5 12-5h10l4 3h24l3-4h2v7H33l-5 3H14q-7-1-7-4z"/><rect x="4" y="3.6" width="48" height="1.4"/><rect x="25" y="4" width="2" height="4"/><rect x="10" y="18.5" width="18" height="1.2"/>',
  drone: '<g fill="none" stroke="currentColor" stroke-width="2.4"><path d="M22 6l20 12M42 6L22 18"/><circle cx="20" cy="5" r="4.5"/><circle cx="44" cy="5" r="4.5"/><circle cx="20" cy="19" r="4.5"/><circle cx="44" cy="19" r="4.5"/></g><rect x="28" y="9" width="8" height="6" rx="1"/>',
};

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage unavailable */ }
  s.rp ||= {};
  return s;
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

export function unlocked(id) {
  const s = load();
  for (const l of TREE) { const n = l.nodes.find(x => x.id === id); if (n) return n.cost === 0 || (s.rp[id] || 0) >= n.cost; }
  return false;
}

// the node a line is researching now: the first one not yet unlocked
export function researching(line) { return line.nodes.find(n => !unlocked(n.id)) || null; }
export const progress = (id) => load().rp[id] || 0;

// Adds a match's RP to every line; returns the vehicles it unlocked
export function addResearch(rp) {
  const s = load(), done = [];
  for (const l of TREE) {
    const n = l.nodes.find(x => x.cost > 0 && (s.rp[x.id] || 0) < x.cost);
    if (!n) continue;
    s.rp[n.id] = Math.min(n.cost, (s.rp[n.id] || 0) + Math.round(rp));
    if (s.rp[n.id] >= n.cost) done.push(n);
  }
  save(s);
  return done;
}

// the best unlocked choice for a line if the saved one is locked
export function validChoice(line, want) {
  if (line.nodes.some(n => n.id === want) && unlocked(want)) return want;
  return [...line.nodes].reverse().find(n => unlocked(n.id))?.id || line.nodes[0].id;
}
