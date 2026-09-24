// Career rank: every match's score (plus a win or mission bonus) goes into XP kept in this
// browser. 55 levels, army ranks along the way.
const KEY = 'frontline.profile';
const TITLES = ['Private', 'Private First Class', 'Specialist', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Sergeant First Class',
  'Master Sergeant', 'First Sergeant', 'Sergeant Major', 'Warrant Officer', 'Second Lieutenant', 'First Lieutenant', 'Captain',
  'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General', 'Lieutenant General', 'General', 'Commander'];
export const MAX_LEVEL = 55;

// total XP needed to reach level n (level 1 needs 0)
const need = (n) => 600 * (n - 1) + 150 * (n - 1) * (n - 1);

export function levelFor(xp) {
  let n = 1;
  while (n < MAX_LEVEL && xp >= need(n + 1)) n++;
  return n;
}

export const titleFor = (n) => TITLES[Math.min(TITLES.length - 1, Math.floor((n - 1) * TITLES.length / MAX_LEVEL))];

export function profile() {
  let p = { xp: 0, matches: 0 };
  try { p = { ...p, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage unavailable */ }
  const level = levelFor(p.xp);
  return { ...p, level, title: titleFor(level), cur: p.xp - need(level), next: level < MAX_LEVEL ? need(level + 1) - need(level) : 0 };
}

export function addXP(amount) {
  const before = profile();
  const p = { xp: before.xp + Math.max(0, Math.round(amount)), matches: before.matches + 1 };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  const after = profile();
  return { gained: p.xp - before.xp, before, after, promoted: after.level > before.level };
}
