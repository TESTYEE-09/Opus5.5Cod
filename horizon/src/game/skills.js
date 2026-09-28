// Skill chains, the Horizon way: drifts, air, speed, near misses, burnouts, drafting and
// wreckage add points and bump the multiplier; the chain banks when its timer runs out and
// is lost on a crash. Banked chains pay XP and credits.
const TIERS = [[0, ''], [2500, 'GREAT '], [7000, 'AWESOME '], [15000, 'EPIC '], [30000, 'ULTIMATE ']];
const tier = (p) => { let t = ''; for (const [v, n] of TIERS) if (p >= v) t = n; return t; };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class Skills {
  constructor(hud, onBank) {
    this.hud = hud; this.onBank = onBank;
    this.points = 0; this.mult = 1; this.timer = 0; this.list = [];
    this.drift = 0; this.air = 0; this.speed = 0; this.burn = 0;
    this.enabled = true;
  }

  add(name, pts, bumpMult = true) {
    this.points += pts;
    if (bumpMult) this.mult = Math.min(99, this.mult + 1);
    this.timer = 3.4;
    const last = this.list[this.list.length - 1];
    if (last && last.n === name) { last.c++; last.p += pts; } else this.list.push({ n: name, c: 1, p: pts });
    if (this.list.length > 3) this.list.shift();
  }

  crash() {
    if (this.points > 0) { this.hud.pop('<span style="color:#ff4d6d">SKILL CHAIN BROKEN</span>'); this.reset(); }
  }

  reset() { this.points = 0; this.mult = 1; this.timer = 0; this.list = []; this.drift = this.air = this.speed = this.burn = 0; }

  bank() {
    const total = Math.round(this.points * this.mult);
    if (total > 0) this.onBank?.(total, this.mult);
    this.reset();
  }

  // near-miss and wreckage come from outside: traffic and smashables
  nearMiss(close) { this.add(close ? 'CLOSE NEAR MISS' : 'NEAR MISS', close ? 900 : 500); }
  wreck(name = 'WRECKAGE') { this.add(name, 200); }
  draft(dt) { this.draftT = (this.draftT ?? 0) + dt; if (this.draftT > 1.5) { this.add('DRAFTING', 300); this.draftT = 0; } }

  update(dt, veh) {
    if (!this.enabled) return this.draw();
    const v = veh.speed, kmh = v * 3.6;
    // drift: sustained slip angle at speed, banked when it ends
    const ang = Math.abs(veh.driftAngle);
    if (veh.onGround && v > 9 && ang > 0.26 && veh.fwdSpeed > 0) {
      this.drift += dt * v * (ang - 0.2) * 55;
      this.timer = Math.max(this.timer, 1.2);
    } else if (this.drift > 0) {
      if (this.drift > 250) this.add(`${tier(this.drift)}DRIFT`, this.drift);
      this.drift = 0;
    }
    // air: time off the ground, banked on landing
    if (!veh.onGround) this.air += dt;
    else if (this.air > 0) {
      if (this.air > 0.55 && v > 8) this.add(this.air > 2 ? 'ULTIMATE AIR' : this.air > 1.2 ? 'GREAT AIR' : 'AIR', Math.round(this.air * this.air * 900 + 300));
      this.air = 0;
    }
    // speed: time over 180 km/h
    if (kmh > 180 && veh.onGround) {
      this.speed += dt * (kmh - 150) * 4;
      if (this.speed > 900) { this.add(kmh > 300 ? 'ULTIMATE SPEED' : kmh > 250 ? 'GREAT SPEED' : 'SPEED', this.speed); this.speed = 0; }
    } else if (this.speed > 250) { this.add('SPEED', this.speed); this.speed = 0; } else this.speed = 0;
    // burnout: wheels spinning up a storm with the car barely moving
    let spin = 0;
    for (const w of veh.wheels) if (w.contact) spin = Math.max(spin, Math.abs(w.omega * w.r) - v);
    if (v < 6 && spin > 12 && veh.input.throttle > 0.8) { this.burn += dt; if (this.burn > 1.5) { this.add('BURNOUT', 400); this.burn = 0; } }
    else this.burn = 0;
    // hits end the chain
    for (const e of veh.events) if (e.type === 'hit' && e.speed > 7 && e.kind !== 'prop') this.crash();
    if (this.timer > 0 && this.drift <= 0 && veh.onGround) {
      this.timer -= dt;
      if (this.timer <= 0) this.bank();
    }
    this.draw();
  }

  draw() {
    const h = this.hud, live = this.points + this.drift + this.air * 400;
    const on = live > 0;
    const el = h.$('hudSkill');
    el.classList.toggle('on', on);
    if (!on) return;
    h.$('skMult').textContent = `${this.mult}x`;
    h.$('skPts').textContent = fmt(live * this.mult);
    const cur = this.drift > 0 ? `<em>${tier(this.drift)}DRIFT ${fmt(this.drift)}</em>` : '';
    h.$('skList').innerHTML = this.list.map((s) => `${s.n}${s.c > 1 ? ` x${s.c}` : ''}`).join(' · ') + cur;
    h.$('skBar').style.width = `${Math.max(0, Math.min(1, this.timer / 3.4)) * 100}%`;
  }
}
