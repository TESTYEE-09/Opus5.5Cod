// Tech tree, War Thunder style: three lines (ground vehicles, jets, FPV drones), each a chain
// of vehicles. The first in each line is free; every match's XP is also research points (RP)
// that go into the next locked vehicle of every line. Kept in this browser.
const KEY = 'frontline.research';

export const TREE = [
  { line: 'Ground', key: '8', setting: 'ground', nodes: [
    { id: 'apc', names: ['M113', 'BTR-80'], role: 'APC · heavy MG', cost: 0 },
    { id: 'ifv', names: ['M2 Bradley', 'BMP-2'], role: 'IFV · autocannon + ATGM', cost: 4000 },
    { id: 'tank', names: ['M1 Abrams', 'T-80'], role: 'Main battle tank', cost: 10000 },
    { id: 'mbt', names: ['M1A2 SEPv3', 'T-90M'], role: 'Modern MBT · faster reload', cost: 22000 },
  ] },
  { line: 'Jets', key: '9', setting: 'jet', nodes: [
    { id: 'attack', names: ['A-10C', 'Su-25'], role: 'Attack · Mavericks, big gun', cost: 0 },
    { id: 'fighter', names: ['F-16C', 'Su-27'], role: 'Fighter · fast, IR missiles', cost: 8000 },
  ] },
  { line: 'FPV', key: '7', setting: 'fpv', nodes: [
    { id: '5', names: ['5" FPV', '5" FPV'], role: 'Fast · small charge', cost: 0 },
    { id: '10', names: ['10" FPV', '10" FPV'], role: 'Heavy · kills tanks', cost: 5000 },
  ] },
];

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
