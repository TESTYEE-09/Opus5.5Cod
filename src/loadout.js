// Custom loadouts: which guns you carry, the attachments bolted to them and three
// perks. Everything is gated by career level (see rank.js) and kept in this browser
// next to frontline.settings.
import { WEAPONS } from './weapons.js';
import { profile } from './rank.js';

const KEY = 'frontline.loadouts';
export const SLOT_COUNT = 5;
export const PERK_SLOTS = 3;

// level a thing unlocks at; anything absent is available from level 1
export const PRIMARIES = [
  { id: 'ar', level: 1 }, { id: 'smg', level: 1 }, { id: 'shotgun', level: 3 }, { id: 'burst', level: 6 },
  { id: 'lmg', level: 9 }, { id: 'dmr', level: 14 }, { id: 'sniper', level: 18 }, { id: 'ssmg', level: 24 },
];
export const SECONDARIES = [{ id: 'pistol', level: 1 }, { id: 'revolver', level: 11 }, { id: 'spistol', level: 20 }];
export const LAUNCHERS = [{ id: '', level: 1 }, { id: 'rpg', level: 16 }, { id: 'stinger', level: 26 }];

// Attachments are stat deltas applied over a copy of the weapon def.
export const ATTACHMENTS = {
  optic: [
    { id: '', name: 'Iron sights', desc: 'No change.', level: 1 },
    { id: 'reflex', name: 'Reflex', desc: 'Snaps to the shoulder faster, slightly wider zoom.', level: 2, apply: (d) => { d.adsTime *= 0.86; d.fov = Math.min(70, d.fov + 4); } },
    { id: 'acog', name: '4x scope', desc: 'A full-screen reticle and real magnification. Slower to raise.', level: 13, apply: (d) => { if (d.scope) return; d.overlay = 'acog'; d.fov = Math.max(26, d.fov - 18); d.adsTime *= 1.3; d.ads *= 0.6; } },
  ],
  barrel: [
    { id: '', name: 'Standard barrel', desc: 'No change.', level: 1 },
    { id: 'suppressor', name: 'Suppressor', desc: 'Quiet, no tracer and no minimap blip. Shorter effective range.', level: 7, apply: (d) => { d.silent = true; d.range = [d.range[0] * 0.78, d.range[1] * 0.78]; d.recoil = { v: d.recoil.v * 0.92, h: d.recoil.h * 0.92 }; } },
    { id: 'long', name: 'Long barrel', desc: 'Holds damage further out. Slower to aim.', level: 17, apply: (d) => { d.range = [d.range[0] * 1.3, d.range[1] * 1.25]; d.adsTime *= 1.15; d.move *= 1.15; } },
  ],
  magazine: [
    { id: '', name: 'Standard mag', desc: 'No change.', level: 1 },
    { id: 'extended', name: 'Extended mag', desc: 'Half again as many rounds. Slower reload.', level: 4, apply: (d) => { d.mag = Math.round(d.mag * 1.5); d.reload *= 1.18; d.reloadEmpty *= 1.18; } },
    { id: 'fast', name: 'Fast mag', desc: 'Reloads noticeably quicker.', level: 10, apply: (d) => { d.reload *= 0.75; d.reloadEmpty *= 0.75; d.shellTime && (d.shellTime *= 0.75); } },
  ],
  underbarrel: [
    { id: '', name: 'None', desc: 'No change.', level: 1 },
    { id: 'grip', name: 'Foregrip', desc: 'Cuts recoil. A little slower to move with.', level: 5, apply: (d) => { d.recoil = { v: d.recoil.v * 0.7, h: d.recoil.h * 0.65 }; d.speed *= 0.97; } },
    { id: 'laser', name: 'Laser', desc: 'Much tighter hip fire.', level: 15, apply: (d) => { d.hip *= 0.68; d.bloom *= 0.85; } },
  ],
};
export const ATTACH_SLOTS = Object.keys(ATTACHMENTS);

// Perks act on the player, not the gun: game.js, player.js and weapons.js read them.
export const PERKS = [
  [
    { id: '', name: 'None', desc: '' , level: 1 },
    { id: 'light', name: 'Lightweight', desc: 'Move 10% faster on foot.', level: 1 },
    { id: 'quiet', name: 'Quiet Boots', desc: 'Your footsteps are much harder to hear.', level: 8 },
  ],
  [
    { id: '', name: 'None', desc: '', level: 1 },
    { id: 'quickdraw', name: 'Quickdraw', desc: 'Reload a quarter faster and aim 20% faster.', level: 1 },
    { id: 'bandolier', name: 'Bandolier', desc: 'One extra grenade and half again as much reserve ammo.', level: 12 },
  ],
  [
    { id: '', name: 'None', desc: '', level: 1 },
    { id: 'steady', name: 'Steady', desc: 'Recoil is 15% lighter.', level: 1 },
    { id: 'ghost', name: 'Ghost', desc: 'Enemy UAVs and minimaps never show you.', level: 21 },
  ],
];

export const unlocked = (thing, level) => (thing.level || 1) <= level;

const blank = (i) => ({
  name: `Custom ${i + 1}`,
  primary: 'ar', secondary: 'pistol', launcher: '',
  attach: { optic: '', barrel: '', magazine: '', underbarrel: '' },
  perks: ['', '', ''],
});

// The five fixed classes double as the starting presets so nobody begins with an empty list.
const PRESETS = [
  { name: 'Assault', primary: 'ar', secondary: 'pistol', launcher: '', attach: { optic: 'reflex', barrel: '', magazine: '', underbarrel: '' }, perks: ['light', 'quickdraw', 'steady'] },
  { name: 'Rusher', primary: 'smg', secondary: 'pistol', launcher: '', attach: { optic: 'reflex', barrel: '', magazine: 'extended', underbarrel: 'laser' }, perks: ['light', 'quickdraw', 'steady'] },
  { name: 'Support', primary: 'lmg', secondary: 'pistol', launcher: '', attach: { optic: '', barrel: '', magazine: '', underbarrel: 'grip' }, perks: ['', 'bandolier', 'steady'] },
  { name: 'Marksman', primary: 'sniper', secondary: 'pistol', launcher: '', attach: { optic: '', barrel: 'long', magazine: '', underbarrel: '' }, perks: ['quiet', '', 'ghost'] },
  { name: 'Breacher', primary: 'shotgun', secondary: 'pistol', launcher: '', attach: { optic: '', barrel: '', magazine: 'extended', underbarrel: 'laser' }, perks: ['light', 'quickdraw', ''] },
];

function sanitise(l, i) {
  const b = blank(i);
  if (!l || typeof l !== 'object') return b;
  const pick = (list, v, dflt) => list.some(o => o.id === v) ? v : dflt;
  const out = {
    name: String(l.name ?? b.name).replace(/[^\w .-]/g, '').trim().slice(0, 14) || b.name,
    primary: pick(PRIMARIES, l.primary, b.primary),
    secondary: pick(SECONDARIES, l.secondary, b.secondary),
    launcher: pick(LAUNCHERS, l.launcher, ''),
    attach: {}, perks: [],
  };
  for (const s of ATTACH_SLOTS) out.attach[s] = pick(ATTACHMENTS[s], l.attach?.[s], '');
  for (let p = 0; p < PERK_SLOTS; p++) out.perks[p] = pick(PERKS[p], l.perks?.[p], '');
  return out;
}

export function loadLoadouts() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* storage unavailable */ }
  const list = Array.isArray(raw) ? raw : PRESETS;
  return Array.from({ length: SLOT_COUNT }, (_, i) => sanitise(list[i], i));
}

export function saveLoadouts(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

// Anything the player has not unlocked yet falls back to the default for that slot.
export function legalise(l, level = profile().level) {
  const out = sanitise(l, 0);
  const keep = (list, v, dflt) => { const o = list.find(x => x.id === v); return o && unlocked(o, level) ? v : dflt; };
  out.primary = keep(PRIMARIES, out.primary, 'ar');
  out.secondary = keep(SECONDARIES, out.secondary, 'pistol');
  out.launcher = keep(LAUNCHERS, out.launcher, '');
  for (const s of ATTACH_SLOTS) out.attach[s] = keep(ATTACHMENTS[s], out.attach[s], '');
  for (let p = 0; p < PERK_SLOTS; p++) out.perks[p] = keep(PERKS[p], out.perks[p], '');
  return out;
}

// A weapon def with this loadout's attachments folded in. Arrays are copied because
// callers read def.range and def.recoil directly.
export function buildWeapon(id, attach) {
  const base = WEAPONS[id];
  if (!base) return null;
  const d = { ...base, range: base.range.slice(), recoil: { ...base.recoil }, dmg: base.dmg.slice() };
  const tags = [];
  for (const s of ATTACH_SLOTS) {
    const a = ATTACHMENTS[s].find(x => x.id === attach?.[s]);
    if (!a || !a.apply) continue;
    a.apply(d);
    tags.push(a.name);
  }
  d.attachNames = tags;
  return d;
}

// Turn a loadout into the class-shaped object Arsenal.equip expects.
export function toClass(l, level = profile().level) {
  const g = legalise(l, level);
  const perks = new Set(g.perks.filter(Boolean));
  const defs = {
    primary: buildWeapon(g.primary, g.attach),
    secondary: buildWeapon(g.secondary, null),
  };
  if (g.launcher) defs.launcher = buildWeapon(g.launcher, null);
  return {
    name: g.name,
    desc: describe(g),
    custom: true,
    primary: g.primary, secondary: g.secondary, launcher: g.launcher || undefined,
    defs,
    frags: 2 + (perks.has('bandolier') ? 1 : 0),
    perks,
  };
}

export function describe(l) {
  const n = (id) => WEAPONS[id]?.name || '';
  const extras = ATTACH_SLOTS.map(s => ATTACHMENTS[s].find(x => x.id === l.attach?.[s])).filter(a => a && a.id);
  const perks = l.perks.filter(Boolean).map(id => PERKS.flat().find(p => p.id === id)?.name).filter(Boolean);
  return [`${n(l.primary)} / ${n(l.secondary)}${l.launcher ? ` / ${n(l.launcher)}` : ''}`,
    extras.length ? extras.map(a => a.name).join(', ') : 'No attachments',
    perks.length ? perks.join(', ') : 'No perks'].join(' · ');
}

// Perks that change a gun's numbers, folded in at equip time so the shared
// WEAPONS entries are never mutated.
export function applyPerks(def, perks) {
  if (!perks || !perks.size) return def;
  const quick = perks.has('quickdraw'), steady = perks.has('steady');
  if (!quick && !steady) return def;
  const d = { ...def, range: def.range.slice(), recoil: { ...def.recoil }, dmg: def.dmg.slice() };
  if (quick) {
    d.reload *= 0.75; d.reloadEmpty *= 0.75; d.adsTime *= 0.8;
    if (d.shellTime) d.shellTime *= 0.75;
  }
  if (steady) { d.recoil.v *= 0.85; d.recoil.h *= 0.85; }
  return d;
}

export const NO_PERKS = new Set();
