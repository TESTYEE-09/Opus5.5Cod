// Recorded, CC0 sound effects (see public/sfx/CREDITS.md), played through WebAudio.
// Every sample is loudness-normalised on load, then mixed from one table (MIX) so that
// levels are set in one place. World sounds get distance falloff, panning, a distance
// and behind-you lowpass, and a send into an outdoor reverb that changes per map.
const BASE = `${import.meta.env.BASE_URL}sfx/`;
const GUNS = ['ar', 'smg', 'lmg', 'sniper', 'shotgun', 'pistol'];
const FILES = [
  ...GUNS.flatMap(g => [`${g}_near1`, `${g}_near2`, `${g}_far`]),
  'mag_out', 'mag_in', 'charge', 'smg_out', 'smg_in', 'lmg_out', 'lmg_in', 'pistol_out', 'pistol_in', 'slide',
  'bolt', 'shell', 'pump', 'dry_rifle', 'dry_pistol', 'explosion', 'explosion_far', 'flyby', 'knife1', 'knife2', 'stab',
  'bounce1', 'bounce2', 'pin', 'casings1', 'casings2', 'casings3', 'heartbeat', 'jet', 'heli',
  'step1', 'step2', 'step3', 'step4', 'step5', 'land', 'hurt1', 'hurt2', 'kill', 'head', 'impact1', 'impact2', 'impact3',
  'scrape', 'hit', 'ui', 'pickup', 'streak', 'friendly', 'alarm',
];
const MAX_VOICES = 64;
const pick = (base, n) => `${base}${1 + Math.floor(Math.random() * n)}`;
const db = (v) => Math.pow(10, v / 20);

// Weapon model → recorded gun family and pitch. The new guns reuse recordings, pitched.
export const GUN_SOUND = {
  ar: ['ar', 1], smg: ['smg', 1], lmg: ['lmg', 1], sniper: ['sniper', 1], shotgun: ['shotgun', 1], pistol: ['pistol', 1],
  burst: ['ar', 1.12], dmr: ['sniper', 1.3], revolver: ['sniper', 1.55], heli: ['lmg', 0.75],
};

// Mix in dB after loudness normalisation. Guns and explosions lead; feedback sits under them.
const MIX = {
  gunSelf: -5, gunNear: -4, gunFar: -7, casings: -24, reload: -13, dry: -16, bolt: -11,
  explosion: 0, explosionFar: -4, flyby: -9, knife: -14, stab: -9, bounce: -17, pin: -15,
  heartbeat: -17, jet: -3, heli: -6, stepSelf: -24, stepOther: -13, land: -16, hurt: -12,
  hit: -15, head: -16, kill: -12, impact: -21, scrape: -17, ui: -18, pickup: -15, streak: -12, friendly: -13, alarm: -12,
};
const CAP = { impact: 6, step: 10, casings: 4, flyby: 3, bounce: 4 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.norm = {};
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.volume = 0.7;
    this.voices = 0;
    this.active = {};
    this.muffle = 0; this.stun = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    // world → muffle lowpass → master; ui bypasses the muffle
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.1;
    this.master.connect(comp).connect(limiter).connect(ctx.destination);
    this.world = ctx.createGain();
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.5;
    this.world.connect(this.lp).connect(this.master);
    this.uiBus = ctx.createGain(); this.uiBus.connect(this.master);
    this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0; this.ambGain.connect(this.world);
    // reverb send
    this.verb = ctx.createConvolver();
    this.verbTone = ctx.createBiquadFilter(); this.verbTone.type = 'lowpass'; this.verbTone.frequency.value = 5000;
    this.verbOut = ctx.createGain(); this.verbOut.gain.value = 0.22;
    this.verbIn = ctx.createGain();
    this.verbIn.connect(this.verb).connect(this.verbTone).connect(this.verbOut).connect(this.world);
    this.setEnvironment(this.pendingEnv || { decay: 1.3, wet: 0.22, tone: 5000 });
    // ear ringing
    this.ring = ctx.createOscillator(); this.ring.frequency.value = 3700;
    this.ringGain = ctx.createGain(); this.ringGain.gain.value = 0;
    this.ring.connect(this.ringGain).connect(this.master); this.ring.start();

    for (const name of FILES) {
      fetch(BASE + name + '.mp3')
        .then(r => { if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(b => ctx.decodeAudioData(b))
        .then(buf => { this.buffers[name] = buf; this.norm[name] = loudnessGain(buf); })
        .catch(err => console.warn('sound failed to load', err));
    }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  // map acoustics: reverb length, wet level, reverb brightness, and the ambient bed
  setEnvironment(env) {
    if (!this.ctx) { this.pendingEnv = env; return; }
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * env.decay), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        // a few discrete early echoes off buildings, then a diffuse tail
        const early = [0.021, 0.037, 0.058, 0.083, 0.12].some(e => Math.abs(t - e - c * 0.004) < 0.0015) ? 0.6 : 0;
        d[i] = ((Math.random() * 2 - 1) * 0.5 + early) * Math.pow(1 - i / len, 2.2) * (t < 0.012 ? t / 0.012 : 1);
      }
    }
    this.verb.buffer = ir;
    this.verbOut.gain.setTargetAtTime(env.wet, ctx.currentTime, 0.1);
    this.verbTone.frequency.value = env.tone;
    if (env.amb) this.setAmbience(env.amb);
  }

  // Looping procedural ambience: wind for every map, plus lapping water at the harbour.
  setAmbience(kind) {
    if (!this.ctx) { this.pendingAmb = kind; return; }
    const ctx = this.ctx;
    if (this.amb) { try { this.amb.stop(); } catch { /* already stopped */ } }
    const sr = ctx.sampleRate, len = sr * 8, buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b = 0, w = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, white = Math.random() * 2 - 1;
        b = (b + 0.02 * white) / 1.02;
        const gust = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 / 8 + c) * Math.sin(t * Math.PI * 2 / 4 + 1.3);
        let v = b * 3.5 * gust;
        if (kind === 'snow') { w = w * 0.96 + white * 0.04; v = v * 1.3 + w * 0.35 * gust; }
        if (kind === 'harbor') {
          const swell = Math.max(0, Math.sin(t * Math.PI * 2 / 4 + c * 0.7)) ** 3;
          w = w * 0.9 + white * 0.1;
          v = v * 0.7 + w * 0.5 * swell;
        }
        // crossfade the loop seam
        const edge = Math.min(1, i / (sr * 0.5), (len - i) / (sr * 0.5));
        d[i] = v * edge;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'snow' ? 2400 : 1400;
    src.connect(f).connect(this.ambGain);
    src.start();
    this.amb = src;
    this.ambGain.gain.setTargetAtTime(db(kind === 'snow' ? -20 : -24), ctx.currentTime, 1);
  }

  // local player state: 0..1 low-health muffle
  setMuffle(m) {
    if (!this.ctx) return;
    const target = Math.max(m, this.stun);
    if (Math.abs(target - this.muffle) < 0.01) return;
    this.muffle = target;
    this.lp.frequency.setTargetAtTime(20000 * Math.pow(0.04, target), this.ctx.currentTime, 0.08);
  }

  update(dt) {
    if (!this.ctx || this.stun <= 0) return;
    this.stun = Math.max(0, this.stun - dt * 0.45);
    this.ringGain.gain.setTargetAtTime(this.stun * 0.05, this.ctx.currentTime, 0.1);
    this.setMuffle(this.muffle);
  }

  spatial(p) {
    const L = this.listener;
    const dx = p.x - L.x, dz = p.z - L.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return { dist, pan: 0, back: 0 };
    const pan = Math.max(-1, Math.min(1, (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / dist));
    const fwd = (-dx * Math.sin(L.yaw) - dz * Math.cos(L.yaw)) / dist;
    return { dist, pan, back: Math.max(0, -fwd) };
  }

  // mix: MIX key; gain: extra linear; rate, pan, dist, back, when, offset, loop, send, ui
  play(name, o = {}) {
    const ctx = this.ctx, buf = this.buffers[name];
    if (!ctx || !buf) return null;
    const gain = (o.gain ?? 1) * db(MIX[o.mix] ?? -10) * (this.norm[name] || 1);
    if (gain < 0.001 && !o.loop) return null;
    const cap = CAP[o.cap];
    if (cap && (this.active[o.cap] || 0) >= cap) return null;
    if (this.voices >= MAX_VOICES && !o.loop && gain < 0.2) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    src.loop = !!o.loop;
    let node = src;
    const dist = o.dist || 0, back = o.back || 0;
    if (dist > 3 || back > 0.2) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(600, 20000 / (1 + dist * 0.04)) * (1 - back * 0.45);
      node.connect(f); node = f;
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    node.connect(g);
    const p = ctx.createStereoPanner();
    p.pan.value = (o.pan ?? 0) * 0.85;
    g.connect(p).connect(o.ui ? this.uiBus : this.world);
    if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; p.connect(s).connect(this.verbIn); }
    const t = ctx.currentTime + (o.when || 0);
    src.start(t, o.offset || 0);
    this.voices++;
    if (cap) this.active[o.cap] = (this.active[o.cap] || 0) + 1;
    src.onended = () => { this.voices--; if (cap) this.active[o.cap]--; };
    return { src, gain: g, pan: p, base: gain };
  }

  at(pos) { return pos ? this.spatial(pos) : { dist: 0, pan: 0, back: 0 }; }

  // model is a weapon model name; pos omitted = the local player's own gun
  shot(model, pos, rate = 1) {
    if (!this.ctx) return;
    const [key, pitch] = GUN_SOUND[model] || GUN_SOUND.ar;
    const r = rate * pitch * (0.97 + Math.random() * 0.06);
    const heavy = key === 'sniper' || key === 'shotgun' ? 1.15 : 1;
    if (!pos) {
      this.play(pick(`${key}_near`, 2), { mix: 'gunSelf', gain: heavy, rate: r, send: 0.35 });
      if (key !== 'shotgun' && model !== 'revolver' && Math.random() < (key === 'sniper' ? 1 : 0.4)) {
        this.play(pick('casings', 3), { mix: 'casings', cap: 'casings', when: 0.3 + Math.random() * 0.2, rate: 0.9 + Math.random() * 0.2 });
      }
      return;
    }
    const { dist, pan, back } = this.spatial(pos);
    if (dist > 160) return;
    // inverse-distance falloff with a 4 m reference, crossfading into the distant recording
    const fall = 4 / Math.max(4, dist);
    const nearMix = Math.max(0, Math.min(1, 1 - (dist - 10) / 30));
    const farMix = Math.max(0, Math.min(1, (dist - 5) / 20));
    if (nearMix > 0) this.play(pick(`${key}_near`, 2), { mix: 'gunNear', gain: heavy * Math.pow(fall, 0.8) * nearMix, rate: r, pan, dist, back, send: 0.3 + dist * 0.01 });
    if (farMix > 0) this.play(`${key}_far`, { mix: 'gunFar', gain: heavy * Math.max(Math.pow(fall, 0.55), 0.12) * farMix, rate: r, pan, dist: dist * 0.5, back, when: dist / 340, send: 0.5 });
  }

  // stage: out | in | charge | bolt | shell | pump | slide, per weapon family
  reload(model, stage) {
    const fam = { smg: 'smg', lmg: 'lmg', pistol: 'pistol', revolver: 'pistol' }[model] || '';
    let name, rate = 1;
    if (stage === 'out') name = fam ? `${fam}_out` : 'mag_out';
    else if (stage === 'in') name = fam ? `${fam}_in` : 'mag_in';
    else if (stage === 'charge') name = model === 'pistol' ? 'slide' : 'charge';
    else name = stage;
    if (model === 'dmr') rate = 0.92;
    if (model === 'burst') rate = 1.05;
    this.play(name, { mix: stage === 'bolt' || stage === 'pump' ? 'bolt' : 'reload', rate });
  }

  empty(model) { this.play(model === 'pistol' || model === 'revolver' ? 'dry_pistol' : 'dry_rifle', { mix: 'dry' }); }
  swap() { this.play('mag_in', { mix: 'reload', gain: 0.4, rate: 1.3 }); }

  hit(kind) {
    this.play('hit', { mix: 'hit', ui: true });
    if (kind === 'head') this.play('head', { mix: 'head', rate: 1.3, ui: true });
    else if (kind === 'kill') this.play('kill', { mix: 'kill', ui: true });
  }

  hurt() { this.play(pick('hurt', 2), { mix: 'hurt', ui: true }); }
  heartbeat() { this.play('heartbeat', { mix: 'heartbeat', ui: true }); }

  // own footsteps when pos is null; others are positioned and louder so you can hear them coming
  step(pos, gain = 1) {
    const { dist, pan, back } = this.at(pos);
    if (pos && dist > 30) return;
    const fall = pos ? Math.pow(3 / Math.max(3, dist), 1.1) : 1;
    this.play(pick('step', 5), { mix: pos ? 'stepOther' : 'stepSelf', cap: 'step', gain: gain * fall, rate: 0.9 + Math.random() * 0.2, pan, dist, back, send: pos ? 0.1 : 0 });
  }

  land() { this.play('land', { mix: 'land' }); }
  slide() { this.play('scrape', { mix: 'scrape', rate: 0.7 }); }

  impact(pos) {
    const { dist, pan, back } = this.spatial(pos);
    if (dist > 20) return;
    this.play(pick('impact', 3), { mix: 'impact', cap: 'impact', gain: 3 / Math.max(3, dist), rate: 1.2 + Math.random() * 0.4, pan, dist, back });
  }

  explosion(pos) {
    if (!this.ctx) return;
    const { dist, pan, back } = this.spatial(pos);
    const fall = Math.pow(6 / Math.max(6, dist), 0.7);
    const nearMix = Math.max(0.15, 1 - dist / 70);
    this.play('explosion', { mix: 'explosion', gain: fall * nearMix, pan, dist: dist * 0.4, back, when: dist / 340, send: 0.6 });
    if (dist > 12) this.play('explosion_far', { mix: 'explosionFar', gain: Math.min(1, (dist - 12) / 25) * Math.max(fall, 0.2), pan, back, when: dist / 340, send: 0.7 });
    if (dist < 9) this.stun = Math.max(this.stun, 1 - dist / 9);
  }

  bounce(pos) {
    const { dist, pan, back } = this.spatial(pos);
    this.play(pick('bounce', 2), { mix: 'bounce', cap: 'bounce', gain: 3 / Math.max(3, dist), pan, dist, back, rate: 0.9 + Math.random() * 0.25 });
  }

  pin() { this.play('pin', { mix: 'pin' }); }
  knife() { this.play(pick('knife', 2), { mix: 'knife' }); }
  stab() { this.play('stab', { mix: 'stab' }); }
  whizz(pan) { this.play('flyby', { mix: 'flyby', cap: 'flyby', pan, rate: 0.85 + Math.random() * 0.3 }); }
  // the recording is loudest ~5 s in; the jet passes overhead 1.3 s after it appears
  jet() { this.play('jet', { mix: 'jet', offset: 3.7, send: 0.3 }); }
  beep() { this.play('friendly', { mix: 'friendly', ui: true }); }
  streak() { this.play('streak', { mix: 'streak', ui: true }); }
  alarm() { this.play('alarm', { mix: 'alarm', ui: true }); }
  ui() { this.play('ui', { mix: 'ui', ui: true }); }
  pickup() { this.play('pickup', { mix: 'pickup', ui: true }); }

  // Looping rotor for a helicopter. Returns an updater and a stopper.
  rotor() {
    const v = this.play('heli', { mix: 'heli', gain: 1, loop: true });
    if (!v) return { set() {}, stop() {} };
    const ctx = this.ctx;
    v.gain.gain.value = 0;
    return {
      set: (pos) => {
        const s = this.spatial(pos);
        const d3 = Math.hypot(s.dist, pos.y);
        v.gain.gain.setTargetAtTime(v.base * Math.pow(12 / Math.max(12, d3), 0.9), ctx.currentTime, 0.1);
        v.pan.pan.setTargetAtTime(s.pan * 0.7, ctx.currentTime, 0.1);
      },
      stop: () => { v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4); v.src.stop(ctx.currentTime + 2); },
    };
  }
}

// Gain that brings a sample's loudest 50 ms window to a common RMS level, so a quiet
// footstep recording and a hot gunshot recording start from the same loudness.
function loudnessGain(buf) {
  const ch = [];
  for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
  const win = Math.max(1, Math.floor(buf.sampleRate * 0.05));
  let best = 0;
  for (let s = 0; s + win <= ch[0].length || s === 0; s += win) {
    let sum = 0, n = 0;
    for (const d of ch) for (let i = s; i < Math.min(d.length, s + win); i++) { sum += d[i] * d[i]; n++; }
    best = Math.max(best, Math.sqrt(sum / Math.max(1, n)));
    if (s + win > ch[0].length) break;
  }
  if (best < 1e-5) return 1;
  return Math.max(0.2, Math.min(6, db(-12) / best));
}
