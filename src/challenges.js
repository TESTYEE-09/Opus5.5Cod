// Daily challenges and a play streak, kept in this browser. Three challenges a day, picked
// from the date so everyone gets the same set; each pays XP once, the first match of each
// day pays double, and playing on consecutive days raises a streak bonus (up to +50%).
import { mulberry } from './textures.js';

const KEY = 'frontline.daily';
const POOL = [
  { id: 'kills', text: 'Get {n} kills', n: [25, 40, 60], xp: 1500, on: 'kill' },
  { id: 'heads', text: 'Get {n} headshot kills', n: [8, 12, 20], xp: 2000, on: 'kill', if: (d) => d.headshot },
  { id: 'long', text: 'Get {n} longshots (over 40 m)', n: [4, 6, 10], xp: 2000, on: 'kill', if: (d) => d.dist > 40 },
  { id: 'multi', text: 'Get {n} double kills or better', n: [3, 5, 8], xp: 2000, on: 'multi' },
  { id: 'knife', text: 'Get {n} knife kills', n: [2, 3, 5], xp: 2500, on: 'kill', if: (d) => d.weapon === 'Knife' },
  { id: 'streak', text: 'Reach a {n}-kill streak', n: [5, 7, 10], xp: 2500, on: 'streak', max: true },
  { id: 'wins', text: 'Win {n} matches', n: [2, 3, 4], xp: 2500, on: 'match', if: (d) => d.win },
  { id: 'play', text: 'Finish {n} matches', n: [3, 4, 5], xp: 1200, on: 'match' },
  { id: 'veh', text: 'Get {n} kills from vehicles or streaks', n: [5, 10, 15], xp: 2000, on: 'kill', if: (d) => d.vehicle },
  { id: 'score', text: 'Score {n} points in one match', n: [3000, 4500, 6000], xp: 2000, on: 'match', val: (d) => d.score, max: true },
];

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };

function pick(day) {
  const R = mulberry(dayNum(day) * 7919 + 13), pool = [...POOL], out = [];
  for (let tier = 0; tier < 3; tier++) {
    const c = pool.splice(Math.floor(R() * pool.length), 1)[0];
    out.push({ id: c.id, goal: c.n[tier], xp: Math.round(c.xp * (1 + tier * 0.5)), have: 0, done: false });
  }
  return out;
}

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage unavailable */ }
  const t = today();
  if (s.day !== t) {
    const gap = s.lastPlayed ? dayNum(t) - dayNum(s.lastPlayed) : 99;
    s = { day: t, list: pick(t), playedToday: false, streak: gap <= 1 ? s.streak || 0 : 0, lastPlayed: s.lastPlayed };
    save(s);
  }
  return s;
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

const def = (id) => POOL.find(p => p.id === id);
export const describe = (c) => def(c.id).text.replace('{n}', c.goal.toLocaleString());

export function daily() {
  const s = load();
  return { list: s.list, streak: s.streak, bonusReady: !s.playedToday };
}

// Records an event; returns the challenges it just completed (for a popup).
export function track(on, d = {}) {
  const s = load(), done = [];
  for (const c of s.list) {
    const p = def(c.id);
    if (c.done || p.on !== on || (p.if && !p.if(d))) continue;
    const v = p.val ? p.val(d) : on === 'streak' ? d.streak : 1;
    c.have = p.max ? Math.max(c.have, v) : c.have + v;
    if (c.have >= c.goal) { c.have = c.goal; c.done = true; done.push(c); }
  }
  save(s);
  return done;
}

// Called once per finished match: returns the XP multiplier and challenge XP to add.
export function finishMatch(d) {
  const newly = track('match', d);
  const s = load();
  let mult = 1;
  if (!s.playedToday) {
    mult = 2;
    s.playedToday = true;
    if (s.lastPlayed !== s.day) s.streak = (s.streak || 0) + 1;
    s.lastPlayed = s.day;
  }
  mult *= 1 + Math.min(0.5, Math.max(0, s.streak - 1) * 0.1);
  save(s);
  const earned = s.list.filter(c => c.done && !c.paid);
  for (const c of earned) c.paid = true;
  save(s);
  return { mult, streak: s.streak, challengeXp: earned.reduce((a, c) => a + c.xp, 0), earned, newly };
}
