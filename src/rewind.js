// Two halves of making hits honest over a real connection.
//
// Rewind: a short ring of where a soldier was, so the host can look at the world as
// a client saw it when that client claims a hit.
// verifyHit: the checks the host runs against that rewound world before it applies
// a client's damage.
import * as THREE from 'three';
import { lineOfSight } from './world.js';
import { WEAPONS, falloff } from './weapons.js';

// How far behind the newest snapshot a client draws other players. The host uses the
// same number to work out which moment a claim refers to.
export const RENDER_DELAY = 0.1;
const SPAN = 0.6;   // seconds of history the host keeps
const MAX_REWIND = 0.5;

export class Rewind {
  constructor() { this.buf = []; }

  push(t, s) {
    const b = this.buf;
    b.push({ t, x: s.pos.x, y: s.pos.y, z: s.pos.z, c: s.crouchAmt || 0, lean: s.leanOff || 0, alive: s.alive });
    while (b.length > 2 && t - b[0].t > SPAN) b.shift();
  }

  clear() { this.buf.length = 0; }

  // The sample at time t, interpolated. Null when there is no history at all.
  at(t) {
    const b = this.buf;
    if (!b.length) return null;
    if (t <= b[0].t) return b[0];
    const last = b[b.length - 1];
    if (t >= last.t) return last;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const a = b[i - 1], c = b[i];
    const k = (t - a.t) / Math.max(1e-6, c.t - a.t);
    return {
      t, alive: c.alive,
      x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k,
      c: a.c + (c.c - a.c) * k, lean: a.lean + (c.lean - a.lean) * k,
    };
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// Where a soldier's chest and head were, given a rewound sample.
function points(sample, yaw) {
  const prone = Math.max(0, Math.min(1, sample.c - 1)), crouch = Math.min(1, sample.c);
  const lo = sample.lean;
  const cx = sample.x + Math.cos(yaw) * lo, cz = sample.z - Math.sin(yaw) * lo;
  if (prone > 0.5) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    return [_a.set(sample.x, sample.y + 0.25, sample.z), _b.set(sample.x + fx * 0.75, sample.y + 0.32, sample.z + fz * 0.75)];
  }
  return [_a.set(cx, sample.y + 1.2 - 0.35 * crouch, cz), _b.set(cx, sample.y + 1.62 - 0.5 * crouch, cz)];
}

// The most damage one trigger pull of this weapon could do at `dist`, headshots and
// buckshot included. Claims above it are rejected.
export function maxDamage(weapon, dist, head) {
  const def = Object.values(WEAPONS).find(w => w.name === weapon);
  if (!def) return null;
  if (def.launcher) return def.dmg[0] * 1.2;
  const one = falloff(def, dist) * (head ? def.head : 1);
  const burst = def.pellets || (def.burst || 1);
  return one * burst * 1.25 + 2;
}

// The host's check on a client's hit claim. Returns null when it is plausible, or a
// short reason to log and drop it.
//
// This catches damage a shot could not have done - through a wall, from too far, more
// than the weapon carries, or with no shot fired. It does not, and cannot from here,
// tell a good aim from an aimbot.
export function verifyHit(game, shooter, victim, dmg, weapon, head, shotAt) {
  if (!shooter.alive) return 'shooter dead';
  if (weapon === 'Knife') {
    if (shooter.pos.distanceTo(victim.pos) > 4) return 'knife out of reach';
    return null;
  }
  if (game.time - (shooter.shotT ?? -99) > 0.6) return 'no shot';

  const sample = victim.rewind?.at(shotAt);
  if (!sample) return null;              // no history yet: let it through rather than eat a real hit
  if (!sample.alive) return 'already dead';

  shooter.eye(_a.set(0, 0, 0));
  const eye = _a.clone();
  const [chest, headPt] = points(sample, victim.yaw);
  const dChest = eye.distanceTo(chest), dHead = eye.distanceTo(headPt);
  const dist = Math.min(dChest, dHead);

  const cap = maxDamage(weapon, dist, head);
  if (cap !== null && dmg > cap) return `damage ${dmg.toFixed(0)} over cap ${cap.toFixed(0)} at ${dist.toFixed(0)}m`;

  // one clear line to either point is enough; a shot can clip a sill the ray misses
  if (!lineOfSight(eye, chest) && !lineOfSight(eye, headPt)) return `no line of sight at ${dist.toFixed(0)}m`;
  return null;
}

// The host time a claim refers to: the snapshot the client had acknowledged, minus the
// interpolation delay it was drawing with. Clamped so a bad ack cannot rewind far.
export function claimTime(now, sentAt) {
  if (!(sentAt > 0)) return now - RENDER_DELAY;
  return Math.max(now - MAX_REWIND, Math.min(now, sentAt - RENDER_DELAY));
}
