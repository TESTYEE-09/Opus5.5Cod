// The player's save: credits, XP and level, garage, wheelspins, event results, discoveries and
// settings. Kept in localStorage; every write is guarded so private windows still play.
const KEY = 'hz.profile.v1';

// the festival welcome pack: the cars the player asked for are in the garage from the start
export const STARTER = ['c8z06', 'zr1x', 'nsx', 'gts992', 'vipergts', 'c5z06', 'c6zr1'];

const DEFAULTS = () => ({
  credits: 1500000, xp: 0, level: 1, wheelspins: 3, superWheelspins: 1,
  owned: [...STARTER], car: 'c8z06', paints: {},
  events: {}, found: [], boards: {}, stats: { distance: 0, topSpeed: 0, skillBest: 0, crashes: 0, drift: 0, air: 0, nearMiss: 0, wins: 0 },
  roads: {},
  settings: { quality: null, units: 'kmh', assists: 'standard', abs: true, tcs: true, stm: true, steer: 1, autoGear: true, line: 'braking', camera: 0, fov: 0, radio: 0, shake: 1 },
});

export const LEVEL_XP = (lvl) => 4000 + lvl * 1500;

export class Profile {
  constructor() {
    this.data = DEFAULTS();
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (s) this.data = { ...this.data, ...s, settings: { ...this.data.settings, ...s.settings }, stats: { ...this.data.stats, ...s.stats } };
    } catch { /* fresh profile */ }
    this.listeners = [];
  }

  get d() { return this.data; }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
    for (const f of this.listeners) f(this.data);
  }

  owns(id) { return this.data.owned.includes(id); }

  // returns levels gained
  addXP(n) {
    const d = this.data;
    d.xp += Math.round(n);
    let up = 0;
    while (d.xp >= LEVEL_XP(d.level)) { d.xp -= LEVEL_XP(d.level); d.level++; d.wheelspins++; up++; }
    this.save();
    return up;
  }

  addCredits(n) { this.data.credits = Math.max(0, Math.round(this.data.credits + n)); this.save(); }

  buy(entry) {
    if (this.owns(entry.id) || this.data.credits < entry.price) return false;
    this.data.credits -= entry.price;
    this.data.owned.push(entry.id);
    this.save();
    return true;
  }

  give(id) { if (!this.owns(id)) { this.data.owned.push(id); this.save(); return true; } return false; }

  reset() { this.data = DEFAULTS(); this.save(); }
}
