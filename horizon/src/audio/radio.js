// Horizon radio: four stations of music synthesised live with Web Audio. Each song is
// generated from a seed (key, chord progression, drum pattern, bass rhythm, arpeggio and a
// lead melody over an intro / verse / chorus / breakdown / chorus / outro form) and played by
// a small step sequencer with drum machines, a Rhodes-style FM piano, analogue-style bass,
// pads, plucks and leads through tempo-synced delay and a generated reverb.
import { mulberry } from '../world/noise.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROGS = {
  minor: [[0, 8, 3, 10], [0, 5, 8, 10], [0, 3, 8, 7], [0, 10, 8, 7], [0, 8, 10, 3]],
  major: [[0, 7, 9, 5], [5, 7, 4, 9], [0, 9, 5, 7], [2, 7, 0, 9], [5, 4, 2, 7]],
};
const WORDS_A = ['Neon', 'Midnight', 'Sakura', 'Crimson', 'Electric', 'Golden', 'Shibuya', 'Paper', 'Velvet', 'Chrome', 'Summer', 'Wangan', 'Silver', 'Distant', 'Lucky'];
const WORDS_B = ['Horizon', 'Drift', 'Skyline', 'Lights', 'Highway', 'Rain', 'Hearts', 'Signal', 'Dreams', 'Coast', 'Sunset', 'Runner', 'Paradise', 'Memory', 'Wave'];
const ARTISTS = ['Kōsoku', 'LUNA 8', 'Aoi Mirage', 'Hayate', 'Neon Ghosts', 'TOKYO VICE', 'Mika Sato', 'Night Tempo Club', 'Shiori', 'Redline Kids', 'Yuzu Collective', 'Kiraboshi'];

export const STATIONS = [
  { name: 'Horizon Pulse', style: 'synthwave', bpm: [112, 124], mode: 'minor' },
  { name: 'Horizon Bass Arena', style: 'dnb', bpm: [170, 176], mode: 'minor' },
  { name: 'City Pop FM', style: 'citypop', bpm: [100, 112], mode: 'major' },
  { name: 'Horizon Lo-Fi', style: 'lofi', bpm: [74, 86], mode: 'major' },
];

export class Radio {
  constructor(audio, hud) {
    this.a = audio; this.hud = hud;
    const ctx = this.ctx = audio.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0.9;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 18000;
    this.out.connect(this.tone); this.tone.connect(audio.bus.music);
    // shared effects: tempo delay and a generated plate-ish reverb
    this.delay = ctx.createDelay(2); this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.32;
    this.delayF = ctx.createBiquadFilter(); this.delayF.type = 'lowpass'; this.delayF.frequency.value = 3200;
    this.delay.connect(this.delayF); this.delayF.connect(this.delayFb); this.delayFb.connect(this.delay); this.delayF.connect(this.out);
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.6);
    this.verbG = ctx.createGain(); this.verbG.gain.value = 0.28;
    this.verb.connect(this.verbG); this.verbG.connect(this.out);
    // sidechain bus: pads and bass pump against the kick
    this.pump = ctx.createGain(); this.pump.connect(this.out);
    this.noise = audio.noise;
    this.station = -1;
    this.timer = null;
    this.duckK = 1;
  }

  impulse(sec) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (i < 200 ? i / 200 : 1);
    }
    return b;
  }

  play(i) {
    this.stop();
    this.station = i;
    if (i < 0 || i >= STATIONS.length) { this.hud.radio('Radio off', ''); return; }
    this.song = this.makeSong(STATIONS[i], (Math.random() * 1e9) | 0);
    this.step = 0;
    this.next16 = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 25);
    this.hud.radio(STATIONS[i].name, `${this.song.artist} — ${this.song.title}`);
  }

  next() { const n = this.station + 1; this.play(n >= STATIONS.length ? -1 : n); }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  duck(k) { this.duckK = k; this.out.gain.setTargetAtTime(0.9 * k, this.ctx.currentTime, 0.4); }

  update() {}

  // ---------------------------------------------------------------- composition
  makeSong(st, seed) {
    const r = mulberry(seed);
    const pick = (a) => a[(r() * a.length) | 0];
    const bpm = st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]);
    const root = 40 + ((r() * 12) | 0); // E2..D#3
    const prog = pick(PROGS[st.mode]);
    const scale = st.mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    // drum patterns (16 steps)
    const D = {
      synthwave: { k: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], h: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1] },
      dnb: { k: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], h: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0] },
      citypop: { k: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], h: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1] },
      lofi: { k: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], h: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0] },
    }[st.style];
    if (st.style === 'dnb' && r() < 0.5) D.k = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
    const bassR = st.style === 'synthwave' ? [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] : st.style === 'citypop' ? [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1] : st.style === 'dnb' ? [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0] : [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
    const arp = Array.from({ length: 16 }, (_, i) => [0, 2, 1, 2, 0, 2, 1, 3][(i + ((r() * 2) | 0)) % 8]);
    // lead motif: 2 bars over chord tones and passing notes, repeated with variation
    const motif = [];
    for (let i = 0; i < 32; i++) {
      const on = r() < (st.style === 'lofi' ? 0.28 : 0.42) || i % 8 === 0;
      motif.push(on ? { deg: pick([0, 2, 4, 4, 2, 5, 1, 6]) + (r() < 0.2 ? 7 : 0), len: pick([1, 2, 2, 3, 4]) } : null);
    }
    // song form in bars
    const form = [['intro', 8], ['verse', 16], ['chorus', 16], ['break', 8], ['chorus', 16], ['outro', 8]];
    const bars = form.reduce((a, [, n]) => a + n, 0);
    return { st, bpm, root, prog, scale, D, bassR, arp, motif, form, bars, title: `${pick(WORDS_A)} ${pick(WORDS_B)}`, artist: pick(ARTISTS), swing: st.style === 'lofi' ? 0.18 : st.style === 'citypop' ? 0.06 : 0 };
  }

  section(bar) {
    let b = 0;
    for (const [name, n] of this.song.form) { if (bar < b + n) return name; b += n; }
    return 'end';
  }

  schedule() {
    const S = this.song, ctx = this.ctx;
    const s16 = 60 / S.bpm / 4;
    while (this.next16 < ctx.currentTime + 0.12) {
      const step = this.step, bar = Math.floor(step / 16), i = step % 16;
      const sec = this.section(bar);
      if (sec === 'end') { this.play(this.station); return; }
      const t = this.next16 + (i % 2 ? S.swing * s16 : 0);
      this.playStep(t, bar, i, sec, s16);
      this.step++;
      this.next16 += s16;
    }
  }

  chordAt(bar) {
    const S = this.song, deg = S.prog[bar % S.prog.length];
    const third = S.st.mode === 'minor' ? ([0, 5, 7].includes(deg % 12) ? 3 : 4) : ([0, 5, 7].includes(deg % 12) ? 4 : 3);
    const r = S.root + deg;
    return [r, r + third, r + 7, r + (S.st.style === 'citypop' || S.st.style === 'lofi' ? (third === 4 ? 11 : 10) : 12)];
  }

  playStep(t, bar, i, sec, s16) {
    const S = this.song, D = S.D, st = S.st.style;
    const chord = this.chordAt(bar);
    const full = sec === 'chorus', calm = sec === 'intro' || sec === 'outro' || sec === 'break';
    const fillBar = bar % 8 === 7;
    // drums
    if (!(sec === 'break' && st !== 'lofi') && !(sec === 'intro' && bar < 4 && st !== 'lofi')) {
      if (D.k[i]) this.kick(t, st === 'dnb' ? 0.9 : 1);
      if (D.s[i] || (fillBar && i >= 12 && st !== 'lofi' && i % 2 === 0)) this.snare(t, st);
      if (D.h[i]) this.hat(t, st === 'synthwave' && i % 4 === 2 ? 0.25 : 0.05, st === 'lofi' ? 0.5 : 1);
      if (st === 'dnb' && full && i % 2 === 1) this.hat(t, 0.03, 0.5);
    }
    if (st === 'lofi' && i === 0 && bar % 2 === 0) this.crackle(t, s16 * 32);
    // bass
    if (S.bassR[i] && !(sec === 'intro' && bar < 2)) {
      const oct = st === 'citypop' && i % 4 === 3 ? 12 : 0;
      const note = chord[0] - 12 + oct + (st === 'citypop' && i === 13 ? 7 : 0);
      this.bass(t, note, s16 * (st === 'dnb' ? 6 : st === 'synthwave' ? 1.6 : 2.2), st);
    }
    // harmony
    if (i === 0) {
      if (st === 'citypop' || st === 'lofi') this.epChord(t, chord, s16 * 16, st === 'lofi' ? 0.5 : 0.7);
      else this.pad(t, chord, s16 * 16, calm ? 0.45 : 0.3);
    }
    if (st === 'citypop' && (i === 6 || i === 10) && !calm) this.epChord(t, chord.map((n) => n + 12), s16 * 2, 0.35);
    // arpeggio (synthwave / dnb) on 16ths
    if ((st === 'synthwave' || (st === 'dnb' && full)) && !(sec === 'intro' && bar < 4)) {
      const n = chord[S.arp[i] % chord.length] + 24;
      this.pluck(t, n, s16 * 0.9, st === 'dnb' ? 0.1 : 0.14);
    }
    // lead melody in choruses (and softly in verses for city pop and lo-fi)
    if (full || ((st === 'citypop' || st === 'lofi') && sec === 'verse')) {
      const m = S.motif[(bar % 2) * 16 + i];
      if (m) {
        const oct = st === 'lofi' ? 12 : 24;
        const n = S.root + S.prog[bar % S.prog.length] * 0 + S.scale[m.deg % 7] + 12 * Math.floor(m.deg / 7) + oct + (bar % 4 === 3 && i > 8 ? 2 : 0);
        this.lead(t, n, s16 * m.len * 0.95, st);
      }
    }
  }

  // ---------------------------------------------------------------- instruments
  env(g, t, a, peak, d, sus = 0) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(sus, t + a, d / 3);
  }

  kick(t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(v * 0.95, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.45);
    // sidechain pump
    this.pump.gain.setValueAtTime(0.35, t); this.pump.gain.setTargetAtTime(1, t + 0.02, 0.09);
  }

  snare(t, st) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = st === 'lofi' ? 1400 : 2000; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(st === 'lofi' ? 0.3 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + (st === 'synthwave' ? 0.28 : 0.18));
    n.connect(f); f.connect(g); g.connect(this.out); g.connect(this.verb);
    n.start(t, Math.random()); n.stop(t + 0.3);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(this.out); o.start(t); o.stop(t + 0.12);
  }

  hat(t, dec, v = 1) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); g.gain.setValueAtTime(0.16 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
    n.connect(f); f.connect(g); g.connect(this.out);
    n.start(t, Math.random()); n.stop(t + dec + 0.02);
  }

  crackle(t, dur) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    const g = c.createGain(); g.gain.value = 0.02;
    n.connect(f); f.connect(g); g.connect(this.out);
    n.start(t, Math.random()); n.stop(t + dur);
  }

  bass(t, note, dur, st) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = st === 'dnb' ? 4 : 2;
    const base = st === 'dnb' ? 300 : st === 'lofi' ? 500 : 900;
    f.frequency.setValueAtTime(base * 2.4, t); f.frequency.setTargetAtTime(base * 0.6, t, 0.08);
    const oscs = [];
    const types = st === 'dnb' ? [['sawtooth', -9], ['sawtooth', 9]] : st === 'lofi' ? [['sine', 0], ['triangle', 0]] : [['sawtooth', 0], ['square', -1200]];
    for (const [type, det] of types) { const o = c.createOscillator(); o.type = type; o.frequency.value = mtof(note); o.detune.value = det; o.connect(f); oscs.push(o); }
    const sub = c.createOscillator(); sub.frequency.value = mtof(note - 12); sub.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.008); g.gain.setTargetAtTime(0.18, t + 0.05, 0.1); g.gain.setTargetAtTime(0, t + dur, 0.03);
    f.connect(g); g.connect(this.pump);
    for (const o of [...oscs, sub]) { o.start(t); o.stop(t + dur + 0.2); }
  }

  pad(t, chord, dur, v) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.1, t + 0.5); g.gain.setTargetAtTime(0, t + dur - 0.1, 0.25);
    for (const n of chord.slice(0, 3)) for (const det of [-11, 11]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n + 12); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 1);
    }
    f.connect(g); g.connect(this.pump); g.connect(this.verb);
  }

  // two-operator FM electric piano
  epChord(t, chord, dur, v) {
    const c = this.ctx;
    chord.forEach((n, k) => {
      const tt = t + k * 0.012;
      const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      const f = mtof(n + 12);
      car.frequency.value = f; mod.frequency.value = f;
      mg.gain.setValueAtTime(f * 2.2, tt); mg.gain.exponentialRampToValueAtTime(f * 0.15, tt + 0.6);
      mod.connect(mg); mg.connect(car.frequency);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.07 * v, tt + 0.006); g.gain.setTargetAtTime(0.03 * v, tt + 0.01, 0.4); g.gain.setTargetAtTime(0, tt + dur - 0.05, 0.12);
      car.connect(g); g.connect(this.out); g.connect(this.verb);
      car.start(tt); mod.start(tt); car.stop(tt + dur + 0.6); mod.stop(tt + dur + 0.6);
    });
  }

  pluck(t, n, dur, v) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square'; o.frequency.value = mtof(n);
    f.type = 'lowpass'; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.18);
    g.gain.setValueAtTime(v * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);
    o.connect(f); f.connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.15);
  }

  lead(t, n, dur, st) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.value = st === 'lofi' ? 1800 : 3600; f.Q.value = 1;
    const types = st === 'citypop' ? ['square'] : st === 'lofi' ? ['triangle'] : ['sawtooth', 'sawtooth'];
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.5; vg.gain.value = 0;
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(6, t + Math.min(dur, 0.5));
    vib.connect(vg);
    types.forEach((type, k) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = mtof(n); o.detune.value = k ? 8 : -8;
      vg.connect(o.detune); o.connect(f); o.start(t); o.stop(t + dur + 0.3);
    });
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(st === 'lofi' ? 0.05 : 0.07, t + 0.02); g.gain.setTargetAtTime(0, t + dur, 0.06);
    f.connect(g); g.connect(this.out); g.connect(this.delay); g.connect(this.verb);
    vib.start(t); vib.stop(t + dur + 0.3);
    this.delay.delayTime.setValueAtTime((60 / this.song.bpm) * 0.75, t);
  }
}
