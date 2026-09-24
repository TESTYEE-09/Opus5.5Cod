// Recorded, CC0 sound effects (see public/sfx/CREDITS.md), played through WebAudio
// with distance attenuation, stereo panning and a distance lowpass.
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
const MAX_VOICES = 48;
const pick = (base, n) => `${base}${1 + Math.floor(Math.random() * n)}`;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.volume = 0.7;
    this.voices = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    for (const name of FILES) {
      fetch(BASE + name + '.mp3')
        .then(r => { if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.arrayBuffer(); })
        .then(b => ctx.decodeAudioData(b))
        .then(buf => { this.buffers[name] = buf; })
        .catch(err => console.warn('sound failed to load', err));
    }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  spatial(p) {
    const L = this.listener;
    const dx = p.x - L.x, dz = p.z - L.z;
    const dist = Math.hypot(dx, dz);
    const pan = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / dist));
    return { dist, pan };
  }

  // gain, rate, pan, dist (lowpass), when, offset, loop
  play(name, o = {}) {
    const ctx = this.ctx, buf = this.buffers[name];
    if (!ctx || !buf) return null;
    const gain = o.gain ?? 1;
    if (gain < 0.004) return null;
    if (this.voices >= MAX_VOICES && !o.loop && gain < 0.3) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    src.loop = !!o.loop;
    let node = src;
    if (o.dist > 3) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(700, 20000 / (1 + o.dist * 0.045));
      node.connect(f); node = f;
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    node.connect(g);
    const p = ctx.createStereoPanner();
    p.pan.value = (o.pan ?? 0) * 0.8;
    g.connect(p).connect(this.master);
    const t = ctx.currentTime + (o.when || 0);
    src.start(t, o.offset || 0);
    this.voices++;
    src.onended = () => { this.voices--; };
    return { src, gain: g, pan: p };
  }

  at(pos) { return pos ? this.spatial(pos) : { dist: 0, pan: 0 }; }

  // key is a weapon model name; pos omitted = the local player's own gun
  shot(key, pos, rate = 1) {
    if (!this.ctx) return;
    const r = rate * (0.96 + Math.random() * 0.08);
    if (!pos) {
      this.play(pick(`${key}_near`, 2), { gain: 0.95, rate: r });
      if (key !== 'shotgun' && Math.random() < (key === 'sniper' ? 1 : 0.35)) {
        this.play(pick('casings', 3), { gain: 0.14, when: 0.28 + Math.random() * 0.2, rate: 0.9 + Math.random() * 0.2 });
      }
      return;
    }
    const { dist, pan } = this.spatial(pos);
    const fall = 1 / (1 + dist * 0.06);
    const nearMix = Math.max(0, Math.min(1, 1 - (dist - 8) / 30));
    const farMix = Math.max(0, Math.min(1, (dist - 4) / 20));
    if (nearMix > 0) this.play(pick(`${key}_near`, 2), { gain: 0.9 * fall * nearMix, rate: r, pan, dist });
    if (farMix > 0) this.play(`${key}_far`, { gain: 0.9 * Math.max(fall, 0.08) * farMix, rate: r, pan, dist: dist * 0.5, when: dist / 340 });
  }

  // stage: out | in | charge | bolt | shell | pump | slide, per weapon family
  reload(model, stage) {
    const fam = model === 'smg' ? 'smg' : model === 'lmg' ? 'lmg' : model === 'pistol' ? 'pistol' : '';
    let name;
    if (stage === 'out') name = fam ? `${fam}_out` : 'mag_out';
    else if (stage === 'in') name = fam ? `${fam}_in` : 'mag_in';
    else if (stage === 'charge') name = model === 'pistol' ? 'slide' : 'charge';
    else name = stage;
    this.play(name, { gain: 0.7 });
  }

  empty(model) { this.play(model === 'pistol' ? 'dry_pistol' : 'dry_rifle', { gain: 0.6 }); }
  swap() { this.play('mag_in', { gain: 0.25, rate: 1.3 }); }

  hit(kind) {
    this.play('hit', { gain: 0.55 });
    if (kind === 'head') this.play('head', { gain: 0.45, rate: 1.3 });
    else if (kind === 'kill') this.play('kill', { gain: 0.7 });
  }

  hurt() { this.play(pick('hurt', 2), { gain: 0.8 }); }
  heartbeat() { this.play('heartbeat', { gain: 0.9 }); }

  step(pos, gain = 0.3) {
    const { dist, pan } = this.at(pos);
    this.play(pick('step', 5), { gain: gain / (1 + dist * 0.25), rate: 0.9 + Math.random() * 0.2, pan, dist });
  }

  land() { this.play('land', { gain: 0.6 }); }
  slide() { this.play('scrape', { gain: 0.5, rate: 0.7 }); }

  impact(pos) {
    const { dist, pan } = this.spatial(pos);
    if (dist > 18) return;
    this.play(pick('impact', 3), { gain: 0.3 / (1 + dist * 0.3), rate: 1.2 + Math.random() * 0.4, pan, dist });
  }

  explosion(pos) {
    if (!this.ctx) return;
    const { dist, pan } = this.spatial(pos);
    const fall = 1 / (1 + dist * 0.03);
    this.play('explosion', { gain: 1.3 * fall * Math.max(0.2, 1 - dist / 60), pan, dist: dist * 0.4, when: dist / 340 });
    if (dist > 15) this.play('explosion_far', { gain: 0.9 * Math.min(1, (dist - 15) / 25) * Math.max(fall, 0.15), pan, when: dist / 340 });
  }

  bounce(pos) {
    const { dist, pan } = this.spatial(pos);
    this.play(pick('bounce', 2), { gain: 0.5 / (1 + dist * 0.2), pan, dist, rate: 0.9 + Math.random() * 0.25 });
  }

  pin() { this.play('pin', { gain: 0.7 }); }
  knife() { this.play(pick('knife', 2), { gain: 0.8 }); }
  stab() { this.play('stab', { gain: 0.9 }); }
  whizz(pan) { this.play('flyby', { gain: 0.8, pan, rate: 0.85 + Math.random() * 0.3 }); }
  // the recording is loudest ~5 s in; the jet passes overhead 1.3 s after it appears
  jet() { this.play('jet', { gain: 1, offset: 3.7 }); }
  beep() { this.play('friendly', { gain: 0.6 }); }
  streak() { this.play('streak', { gain: 0.7 }); }
  alarm() { this.play('alarm', { gain: 0.7 }); }
  ui() { this.play('ui', { gain: 0.5 }); }
  pickup() { this.play('pickup', { gain: 0.6 }); }

  // Looping rotor for a helicopter. Returns an updater and a stopper.
  rotor() {
    const v = this.play('heli', { gain: 0, loop: true });
    if (!v) return { set() {}, stop() {} };
    const ctx = this.ctx;
    return {
      set: (pos) => {
        const s = this.spatial(pos);
        const d3 = Math.hypot(s.dist, pos.y);
        v.gain.gain.setTargetAtTime(1.6 / (1 + d3 * 0.06), ctx.currentTime, 0.1);
        v.pan.pan.setTargetAtTime(s.pan * 0.7, ctx.currentTime, 0.1);
      },
      stop: () => { v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4); v.src.stop(ctx.currentTime + 2); },
    };
  }
}
