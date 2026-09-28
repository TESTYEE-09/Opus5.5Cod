// Audio: mixer, sample loading, and the car sound model.
//
// Engines are sample-based: each bank holds seamless loops recorded at fixed rpm (1000, 2000,
// ... from the engine-sim recordings in Stunt Rally 3). A car plays every loop of its bank at
// once, pitch-shifted to the current rpm, with equal-power crossfades between the two nearest
// recordings. Load (throttle) drives a waveshaper and opens a low-pass filter, and lift-off at
// high rpm adds exhaust crackle and the odd backfire. Turbo, supercharger and electric motor
// layers, tyre squeal blended by slip and surface, gravel and grass rumble, wind and road
// noise, suspension bumps, shifts and crashes complete a car.
const MANIFEST_URL = '../hz/sfx/manifest.json';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.pending = new Map();
    this.volumes = { master: 0.9, engine: 1, sfx: 0.9, music: 0.55, ui: 0.8 };
    try { Object.assign(this.volumes, JSON.parse(localStorage.getItem('hz.vol') ?? '{}')); } catch { /* defaults */ }
  }

  // must be called from a user gesture
  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 3.5; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.bus = {};
    for (const k of ['engine', 'sfx', 'music', 'ui']) { this.bus[k] = ctx.createGain(); this.bus[k].connect(this.master); }
    this.applyVolumes();
    this.manifest = await fetch(MANIFEST_URL).then((r) => r.json());
    this.noise = this.makeNoise(2);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    for (const k of Object.keys(this.bus)) this.bus[k].gain.value = this.volumes[k];
    localStorage.setItem('hz.vol', JSON.stringify(this.volumes));
  }

  makeNoise(sec) {
    const ctx = this.ctx, b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
    return b;
  }

  load(url) {
    if (this.buffers.has(url)) return Promise.resolve(this.buffers.get(url));
    if (this.pending.has(url)) return this.pending.get(url);
    const p = fetch(url).then((r) => r.arrayBuffer()).then((a) => this.ctx.decodeAudioData(a)).then((b) => { this.buffers.set(url, b); return b; }).catch(() => null);
    this.pending.set(url, p);
    return p;
  }

  // a looping source that plays the seamless middle of a doubled loop file
  loop(buffer, loopLen, dest) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true;
    const mid = buffer.duration / 2;
    s.loopStart = Math.max(0, mid - loopLen / 2); s.loopEnd = Math.min(buffer.duration, s.loopStart + loopLen);
    s.connect(dest);
    s.start(0, s.loopStart + Math.random() * loopLen * 0.9);
    return s;
  }

  async oneShot(name, { gain = 1, rate = 1, bus = 'sfx', pan = 0 } = {}) {
    if (!this.ctx) return;
    const b = await this.load(`../hz/sfx/${name}.mp3`);
    if (!b) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.value = gain;
    let out = g;
    if (pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    s.connect(g); out.connect(this.bus[bus]);
    s.start();
  }
}

export class CarSound {
  constructor(audio, entry, { player = true } = {}) {
    this.a = audio; this.entry = entry; this.player = player;
    this.ready = false; this.popT = 0; this.prevThrottle = 0; this.prevGear = 1; this.blowoff = 0;
    this.limiterPhase = 0;
    this.init();
  }

  async init() {
    const a = this.a, ctx = a.ctx;
    if (!ctx || !a.manifest) return;
    const S = this.entry.sound ?? { bank: 'b-v8', ratio: 1 };
    const bank = a.manifest[S.bank] ?? a.manifest['b-v8'];
    this.ratio = S.ratio ?? 1;
    // output chain: sources -> shaper (load drive) -> low-pass -> gain -> [panner] -> engine bus
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.7; this.lp.frequency.value = 6000;
    this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 180; this.low.gain.value = 3;
    this.shaper = ctx.createWaveShaper(); this.setDrive(0.4);
    this.mix = ctx.createGain();
    this.mix.connect(this.shaper); this.shaper.connect(this.low); this.low.connect(this.lp); this.lp.connect(this.out);
    if (this.player) this.out.connect(a.bus.engine);
    else {
      this.pan = ctx.createPanner(); this.pan.panningModel = 'HRTF'; this.pan.distanceModel = 'inverse'; this.pan.refDistance = 6; this.pan.rolloffFactor = 1.3; this.pan.maxDistance = 400;
      this.out.connect(this.pan); this.pan.connect(a.bus.engine);
    }
    const files = await Promise.all(bank.map(([rpm]) => a.load(`../hz/sfx/eng/${S.bank in a.manifest ? S.bank : 'b-v8'}-${rpm / 1000}.mp3`)));
    this.layers = [];
    const use = this.player ? bank.map((_, i) => i) : bank.map((_, i) => i);
    for (const i of use) {
      if (!files[i]) continue;
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.mix);
      const src = a.loop(files[i], bank[i][1], g);
      this.layers.push({ rpm: bank[i][0], g, src });
    }
    // turbo whistle
    if (S.turbo || this.entry.phys.engine.turbo) {
      const tb = await a.load('../hz/sfx/turbo.mp3');
      if (tb) { this.turboG = ctx.createGain(); this.turboG.gain.value = 0; this.turboSrc = a.loop(tb, a.manifest._loops.turbo, this.turboG); this.turboG.connect(this.player ? a.bus.engine : this.pan); }
    }
    // supercharger or electric whine: oscillators
    if (S.whine || this.entry.phys.emotor) {
      this.whine = ctx.createOscillator(); this.whine.type = 'sawtooth';
      this.whineF = ctx.createBiquadFilter(); this.whineF.type = 'bandpass'; this.whineF.Q.value = 6;
      this.whineG = ctx.createGain(); this.whineG.gain.value = 0;
      this.whine.connect(this.whineF); this.whineF.connect(this.whineG); this.whineG.connect(this.player ? a.bus.engine : this.pan);
      this.whine.start();
    }
    if (this.player) {
      // tyres, surfaces, wind, road
      const L = a.manifest._loops;
      const mk = async (name) => { const b = await a.load(`../hz/sfx/${name}.mp3`); if (!b) return null; const g = ctx.createGain(); g.gain.value = 0; g.connect(a.bus.sfx); return { g, src: a.loop(b, L[name], g) }; };
      [this.sq, this.sqHi, this.sqLo, this.gravel, this.grass, this.wind] = await Promise.all(['squeal', 'squeal_hi', 'squeal_lo', 'gravel', 'grass', 'wind'].map(mk));
      const road = ctx.createBufferSource(); road.buffer = a.noise; road.loop = true;
      this.roadF = ctx.createBiquadFilter(); this.roadF.type = 'lowpass'; this.roadF.frequency.value = 400;
      this.roadG = ctx.createGain(); this.roadG.gain.value = 0;
      road.connect(this.roadF); this.roadF.connect(this.roadG); this.roadG.connect(a.bus.sfx); road.start();
      this.roadSrc = road;
    }
    this.ready = true;
  }

  setDrive(k) {
    if (Math.abs((this.driveK ?? -1) - k) < 0.03) return;
    this.driveK = k;
    const n = 1024, c = new Float32Array(n), amt = 1 + k * 6;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amt) / Math.tanh(amt); }
    this.shaper.curve = c;
  }

  // per frame: vehicle state, listener-relative position for AI cars
  update(dt, veh, rel = null) {
    if (!this.ready) return;
    const ctx = this.a.ctx, t = ctx.currentTime;
    const E = this.entry.phys.engine;
    const rpm = veh.engine.rpm, load = veh.engine.load;
    let r = rpm * this.ratio;
    // rev limiter bounce
    if (veh.engine.limiter) { this.limiterPhase += dt * 28; r *= 1 - 0.04 * (0.5 + 0.5 * Math.sin(this.limiterPhase * 6.28)); }
    // crossfade weights between the two nearest recordings
    const L = this.layers;
    let lo = 0;
    for (let i = 0; i < L.length; i++) if (L[i].rpm <= r) lo = i;
    const hi = Math.min(L.length - 1, lo + 1);
    const span = L[hi].rpm - L[lo].rpm;
    const f = span > 0 ? clamp((r - L[lo].rpm) / span, 0, 1) : 0;
    const rate = (rr) => clamp(r / rr, 0.35, 2.6);
    for (let i = 0; i < L.length; i++) {
      const w = i === lo ? Math.cos(f * Math.PI / 2) : i === hi && hi !== lo ? Math.sin(f * Math.PI / 2) : 0;
      L[i].g.gain.setTargetAtTime(w, t, 0.012);
      if (w > 0.001 || L[i].g.gain.value > 0.001) L[i].src.playbackRate.setTargetAtTime(rate(L[i].rpm) * (rel?.doppler ?? 1), t, 0.01);
    }
    // load: off-throttle is quieter and duller, full throttle driven and bright
    const lf = clamp(load, 0, 1);
    const rn = clamp(rpm / E.redline, 0, 1.1);
    this.setDrive(0.15 + lf * 0.55 + rn * 0.2);
    this.lp.frequency.setTargetAtTime(900 + lf * 7000 + rn * 4000, t, 0.03);
    const vol = (0.28 + 0.34 * lf + 0.25 * rn) * (this.player ? 0.9 : 1.2);
    this.out.gain.setTargetAtTime(vol, t, 0.03);
    if (rel && this.pan) {
      this.pan.positionX.setTargetAtTime(rel.x, t, 0.03); this.pan.positionY.setTargetAtTime(rel.y, t, 0.03); this.pan.positionZ.setTargetAtTime(rel.z, t, 0.03);
    }
    // lift-off crackle and bangs
    const lift = this.prevThrottle > 0.6 && veh.input.throttle < 0.2;
    if (lift && rpm > E.redline * 0.55) this.popT = 0.5 + Math.random() * 0.5;
    if (veh.shiftTimer > 0 && this.prevGear !== veh.gear && rpm > E.redline * 0.7 && this.player) { if (Math.random() < 0.55) this.pop(1.4); }
    if (this.popT > 0) {
      this.popT -= dt;
      if (Math.random() < dt * 22 * this.popT) this.pop(0.4 + Math.random() * 0.7);
    }
    // turbo spool and blow-off
    if (this.turboG) {
      const b = veh.engine.boost ?? 0;
      this.turboG.gain.setTargetAtTime(b * 0.22 * (this.entry.sound?.turbo ?? 1), t, 0.05);
      this.turboSrc.playbackRate.setTargetAtTime(0.6 + b * 0.9 + rn * 0.3, t, 0.05);
      if (this.prevBoost > 0.6 && b < this.prevBoost - 0.02 && veh.input.throttle < 0.2 && this.blowoff <= 0) { this.blowoff = 0.8; this.bov(); }
      this.blowoff -= dt;
      this.prevBoost = b;
    }
    if (this.whine) {
      const em = this.entry.phys.emotor;
      const fr = em ? 180 + Math.abs(veh.fwdSpeed) * 42 : rpm * 0.2;
      this.whine.frequency.setTargetAtTime(fr, t, 0.03);
      this.whineF.frequency.setTargetAtTime(fr * 2, t, 0.03);
      const wl = em ? clamp(Math.abs(veh.emotorLoad ?? 0) + Math.abs(veh.fwdSpeed) * 0.004, 0, 1) * 0.05 : lf * rn * 0.06;
      this.whineG.gain.setTargetAtTime(wl, t, 0.05);
    }
    if (this.player) {
      // tyres: worst slip over the wheels, by surface
      let slip = 0, onAsphalt = 0, onGravel = 0, onGrass = 0, n = 0;
      for (const w of veh.wheels) {
        if (!w.contact) continue;
        n++;
        const s = Math.max(Math.abs(w.slipRatio) * 3, Math.abs(w.slipAngle) * 4.5) - 0.35;
        if (w.surface <= 1) { slip = Math.max(slip, s); onAsphalt++; } else if (w.surface === 2 || w.surface === 6) onGrass++; else onGravel++;
      }
      const sp = veh.speed;
      const sq = clamp(slip, 0, 1.4) * clamp(sp / 4, 0, 1);
      const pitch = 0.85 + clamp(sp / 60, 0, 0.4);
      if (this.sq) {
        this.sqLo.g.gain.setTargetAtTime(clamp(sq * 1.6, 0, 0.5) * 0.5, t, 0.04);
        this.sq.g.gain.setTargetAtTime(clamp((sq - 0.25) * 1.2, 0, 0.6) * 0.55, t, 0.04);
        this.sqHi.g.gain.setTargetAtTime(clamp((sq - 0.7) * 1.2, 0, 0.6) * 0.5, t, 0.05);
        for (const x of [this.sq, this.sqHi, this.sqLo]) x.src.playbackRate.setTargetAtTime(pitch, t, 0.05);
      }
      const rough = clamp(sp / 25, 0, 1);
      this.gravel?.g.gain.setTargetAtTime(n ? (onGravel / n) * rough * 0.5 : 0, t, 0.05);
      this.grass?.g.gain.setTargetAtTime(n ? (onGrass / n) * rough * 0.45 : 0, t, 0.05);
      this.wind?.g.gain.setTargetAtTime(clamp((sp / 70) ** 2, 0, 0.9) * 0.55, t, 0.1);
      this.wind?.src.playbackRate.setTargetAtTime(0.8 + clamp(sp / 90, 0, 0.5), t, 0.1);
      this.roadG.gain.setTargetAtTime(clamp(sp / 50, 0, 1) * 0.16 * (n ? onAsphalt / n : 0), t, 0.1);
      this.roadF.frequency.setTargetAtTime(200 + sp * 12, t, 0.1);
      // shifts and bumps
      if (veh.gear !== this.prevGear && veh.gear > 0 && this.prevGear > 0) this.a.oneShot(`shift${1 + ((Math.random() * 3) | 0)}`, { gain: 0.35, rate: 0.9 + Math.random() * 0.2 });
      for (const w of veh.wheels) {
        const dc = w.comp - (w.lastComp ?? w.comp);
        if (dc > 0.02 && sp > 5) this.a.oneShot(`bump${1 + ((Math.random() * 4) | 0)}`, { gain: clamp(dc * 12, 0.15, 0.9) });
        w.lastComp = w.comp;
      }
    }
    this.prevThrottle = veh.input.throttle; this.prevGear = veh.gear;
  }

  // one exhaust pop: a burst of filtered, distorted noise
  pop(strength = 1) {
    const ctx = this.a.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.a.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 180 + Math.random() * 500; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * strength, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + strength * 0.07);
    s.connect(bp); bp.connect(g); g.connect(this.player ? this.a.bus.engine : this.pan);
    s.start(t, Math.random() * 1.5, 0.2); s.stop(t + 0.25);
  }

  bov() {
    const ctx = this.a.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.a.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(700, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    s.connect(bp); bp.connect(g); g.connect(this.player ? this.a.bus.engine : this.pan);
    s.start(t, Math.random(), 0.5); s.stop(t + 0.5);
  }

  dispose() {
    for (const l of this.layers ?? []) { try { l.src.stop(); } catch { /* stopped */ } }
    for (const x of [this.turboSrc, this.whine, this.roadSrc, this.sq?.src, this.sqHi?.src, this.sqLo?.src, this.gravel?.src, this.grass?.src, this.wind?.src]) { try { x?.stop(); } catch { /* stopped */ } }
    this.out?.disconnect();
  }
}
