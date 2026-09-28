// The running game: owns the player car, cameras, systems and the frame loop, and switches
// between title, free roam, menus, events, rewind and photo mode.
import * as THREE from 'three';
import { carById, CARS } from '../cars/catalog.js';
import { makeCar, syncCar } from '../cars/factory.js';
import { CarSound } from '../audio/audio.js';
import { Radio } from '../audio/radio.js';
import { CarCamera } from '../core/camera.js';
import { Menu } from '../ui/menu.js';
import { TouchControls } from '../ui/touch.js';
import { Skills } from './skills.js';
import { Traffic } from './traffic.js';
import { RoadGraph, RouteRibbon } from './route.js';
import { Events } from './events.js';
import { PLACES } from '../world/layout.js';
import { CITY } from '../world/city.js';
import { LAMPS } from '../world/landmarks.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Game {
  constructor(o) {
    Object.assign(this, o); // scene, camera, gfx, renderer, world, terrain, forest, water, sky, col, hud, input, audio, profile, quality
    this.state = 'title';
    this.ccam = new CarCamera(this.camera, this.world);
    this.graph = new RoadGraph(this.world);
    this.ribbon = new RouteRibbon(this.world);
    this.scene.add(this.ribbon.mesh);
    this.route = null;
    this.skills = new Skills(this.hud, (pts, mult) => this.bankSkills(pts, mult));
    this.traffic = new Traffic(this.world, this.scene, this.col, { count: Math.round(14 + 14 * this.gfx.q.trees) });
    this.events = new Events(this);
    this.menu = new Menu(document.getElementById('ui'), this);
    this.touch = new TouchControls(document.body, this.input, { menu: () => this.menu.toggle(), camera: () => this.ccam.next(), rewind: () => { this.rewindHeld = 0.6; } });
    this.fader = Object.assign(document.createElement('div'), { className: 'fader' });
    document.body.appendChild(this.fader);
    this.history = [];
    this.rewinding = false;
    this.tTitle = 0;
    this.kmh = true;
    this.discovered = new Set(Object.keys(this.profile.d.roads));
    this.lastRoad = null;
    this.onMenu = (open) => { this.paused = open; if (open) this.audio.duckAll?.(0.35); else this.audio.duckAll?.(1); };
    this.applySettings();
  }

  // ------------------------------------------------------------------ car
  async switchCar(id, keepPlace = true) {
    const entry = carById(id) ?? CARS[0];
    this.fade(true);
    const car = await makeCar(entry, this.world);
    const old = this.car;
    let p = null, hd = 0;
    if (old && keepPlace) { p = old.veh.modelPosition(new THREE.Vector3()); const f = old.veh.axes[2]; hd = Math.atan2(f.x, f.z); }
    if (old) { this.scene.remove(old.vis.group); this.sound?.dispose(); }
    this.car = car;
    this.scene.add(car.vis.group);
    car.veh.onSubstep = (v) => this.col.resolveStatic(v);
    if (p) {
      const n = this.world.nearestRoad(p.x, p.z, 60);
      car.veh.reset(n ? new THREE.Vector3(n.x, n.y + 0.3, n.z) : p.add(new THREE.Vector3(0, 0.5, 0)), n ? (Math.cos(n.hdg - hd) > 0 ? n.hdg : n.hdg + Math.PI) : hd);
    }
    this.profile.d.car = id; this.profile.save();
    this.applySettings();
    if (this.audio.ctx) this.sound = new CarSound(this.audio, entry, { player: true });
    this.ccam.inited = false;
    this.history.length = 0;
    this.fade(false);
    this.hud.note(entry.make.toUpperCase(), `${entry.year} ${entry.model}`, '#ff2d8a', 2.4);
  }

  applySettings() {
    const S = this.profile.d.settings;
    this.kmh = S.units !== 'mph';
    if (this.car) {
      const A = this.car.veh.assist;
      A.abs = S.abs; A.tcs = S.tcs; A.stm = S.stm; A.steer = S.steer; A.autoGear = S.autoGear;
      A.counter = S.steer ? 0.6 : 0;
    }
    this.ccam.fovOffset = S.fov ?? 0;
    this.ccam.shakeScale = S.shake ?? 1;
  }

  // ------------------------------------------------------------------ helpers used by the UI
  playerPos() { return this.car.veh.modelPosition(_v); }
  playerHeading() { const f = this.car.veh.axes[2]; return Math.atan2(f.x, f.z); }
  sfx(name, gain = 0.7) { this.audio.oneShot(name, { gain, bus: 'ui' }); }
  fade(on) { this.fader.classList.toggle('on', on); }

  listenerRel(car) {
    // position of another car in camera space for the panner, plus a doppler factor
    const p = car.veh.modelPosition(_w).clone().applyMatrix4(this.camera.matrixWorldInverse);
    const rel = car.veh.vel.clone().sub(this.car.veh.vel);
    const dir = car.veh.modelPosition(new THREE.Vector3()).sub(this.camera.position).normalize();
    const vr = rel.dot(dir);
    return { x: p.x, y: p.y, z: p.z, doppler: clamp(343 / (343 + vr), 0.8, 1.25) };
  }

  mapMarkers() {
    const P = PLACES;
    return [
      { x: P.festival.x, z: P.festival.z, color: '#ffb020', icon: '★', label: 'Horizon Festival Japan', desc: 'The festival site on the beach.', big: true },
      ...this.events.markers(),
      ...(this.route?.target ? [{ x: this.route.target[0], z: this.route.target[1], color: '#ff2d8a', icon: '◆', label: 'Waypoint' }] : []),
    ];
  }

  fastTravelPoints() {
    const W = this.world;
    const at = (label, x, z, sub) => { const n = W.nearestRoad(x, z, 400); return n && { label, sub, x: n.x, z: n.z, hdg: n.hdg }; };
    return [
      at('Horizon Festival', PLACES.festival.x, PLACES.festival.z - 110, 'Festival site'),
      at('Minato City', 1060, 400, 'Downtown'),
      at('Lake Kawa', -1260, -100, 'Lake loop'),
      at('Haruna Summit', -1230, -1230, 'Touge'),
      at('Sunrise Circuit', 900, -960, 'Pit straight'),
      at('Shrine Road', -760, 880, 'Pagoda hill'),
      at('Wangan Expressway', 480, -60, 'Elevated highway'),
      at('Cedar Trail', -420, -1500, 'Dirt'),
    ].filter(Boolean);
  }

  fastTravel(x, z, hdg = null) {
    const n = this.world.nearestRoad(x, z, 400);
    if (!n) return;
    this.fade(true);
    setTimeout(() => {
      this.car.veh.reset(new THREE.Vector3(n.x, n.y + 0.3, n.z), hdg ?? n.hdg);
      this.terrain.update(new THREE.Vector3(n.x, n.y, n.z), 1e9);
      this.ccam.inited = false;
      this.history.length = 0;
      this.forest.lastX = 1e9;
      setTimeout(() => this.fade(false), 250);
    }, 450);
  }

  setRoute(x, z) {
    const p = this.playerPos();
    const pts = this.graph.path(p.x, p.z, x, z, this.playerHeading());
    if (!pts) { this.hud.note('NO ROUTE', 'That spot is off the road network', '#555'); return; }
    this.route = { pts, target: [x, z] };
    this.ribbon.set(pts);
    this.hud.setRoute(pts.filter((_, i) => i % 3 === 0));
    this.hud.note('ROUTE SET', `${(pts.length * 2 / 1000).toFixed(1)} km`, '#ff2d8a', 1.6);
  }

  clearRoute() { this.route = null; this.ribbon.set(null); this.hud.setRoute(null); }

  bankSkills(pts, mult) {
    const xp = Math.round(pts / 12), cr = Math.round(pts / 20);
    this.hud.pop(`${fmt(pts)} SKILL SCORE`);
    this.hud.pop(`+${fmt(xp)} XP`, 'xp');
    if (cr >= 50) this.hud.pop(`+${fmt(cr)} CR`, 'cr');
    const up = this.profile.addXP(xp);
    this.profile.addCredits(cr);
    const st = this.profile.d.stats;
    if (pts > st.skillBest) { st.skillBest = pts; if (pts > 20000) this.hud.note('NEW SKILL RECORD', fmt(pts), '#29e0ff', 2); }
    if (up) { this.hud.note(`LEVEL ${this.profile.d.level}`, '+1 Wheelspin', '#ffb020', 3); this.sfx('win2', 0.8); }
    this.profile.save();
  }

  showResults({ title, pos, rows, rewards, onClose }) {
    const m = document.getElementById('modal');
    m.classList.remove('hidden');
    const suf = ['', 'st', 'nd', 'rd'][pos] ?? 'th';
    m.innerHTML = `<div class="md results"><h2>${title}</h2><div class="place">${pos}<small>${suf}</small></div>
      <table>${rows}</table><div class="rw">${rewards}</div><div><button class="btn pink" data-a="ok">Continue</button></div></div>`;
    this.paused = true;
    m.onclick = (e) => { if (e.target.closest('[data-a="ok"]')) { m.classList.add('hidden'); this.paused = false; onClose?.(); } };
  }

  // ------------------------------------------------------------------ start
  start() {
    this.state = 'title';
    this.menu.showTitle(async () => {
      await this.audio.start();
      this.sound = new CarSound(this.audio, this.car.entry, { player: true });
      this.radio = new Radio(this.audio, this.hud);
      this.music = this.radio;
      this.radio.play(this.profile.d.settings.radio ?? 0);
      this.state = 'drive';
      this.ccam.inited = false;
      this.hud.root.classList.remove('hidden');
      setTimeout(() => this.hud.note('WELCOME TO HORIZON', 'Festival Japan · drive into a pink beam to race', '#ff2d8a', 4.5), 700);
    });
    this.hud.root.classList.add('hidden');
  }

  // ------------------------------------------------------------------ frame
  frame(dt) {
    const I = this.input, veh = this.car.veh;
    // global keys
    if (this.state !== 'title') {
      if (I.took('Escape') || I.took('pad:9')) this.photo ? this.endPhoto() : this.menu.toggle();
      if (this.menu.isOpen) {
        if (I.took('pad:4')) this.menu.cycle(-1);
        if (I.took('pad:5')) this.menu.cycle(1);
        if (I.took('pad:1')) this.menu.close();
      }
    }
    const active = this.state === 'drive' && !this.paused && !this.photo;
    if (active) {
      veh.input.throttle = I.state.throttle; veh.input.brake = I.state.brake; veh.input.steer = I.state.steer;
      veh.input.handbrake = I.state.handbrake; veh.input.steerRate = I.state.steerRate;
      if (I.took('KeyC') || I.took('pad:3')) this.ccam.next();
      if (I.took('KeyE') || I.took('pad:1')) veh.shift(1);
      if (I.took('KeyQ') || I.took('pad:2')) veh.shift(-1);
      if (I.took('KeyR')) this.resetToRoad();
      if (I.took('KeyT')) this.sky.time = (this.sky.time + 1) % 24;
      if (I.took('KeyN') || I.took('pad:15')) { this.radio?.next(); this.profile.d.settings.radio = this.radio?.station ?? 0; this.profile.save(); }
      if (I.took('KeyH') || I.took('pad:10')) this.horn();
      if (I.took('KeyP') || I.took('pad:12')) this.startPhoto();
      if (I.took('KeyG') && !this.events.race) this.clearRoute();
      if (I.took('KeyM')) this.menu.open('map');
      if (I.keys.has('Backspace') || I.pressedPad?.(8) || this.rewindHeld > 0) this.rewind(dt); else this.rewinding = this.endRewind();
      this.rewindHeld = Math.max(0, (this.rewindHeld ?? 0) - dt);
    } else if (this.state === 'title') {
      veh.input.throttle = 0; veh.input.brake = 0.3; veh.input.steer = 0;
    }
    if (this.photo) this.updatePhoto(dt);
    const simulate = !this.paused && !this.rewinding && !this.photo;
    if (simulate) {
      veh.update(dt);
      this.record(dt);
    }
    syncCar(this.car);
    const night = this.sky.night;
    this.car.vis.setLights({ head: night > 0.2 ? 1 : 0, tail: night > 0.2 ? 1 : 0.15, brake: veh.input.brake > 0.1 && veh.gear > 0 ? 1 : 0, reverse: veh.gear < 0 ? 1 : 0 });
    // camera
    if (this.state === 'title') this.titleCam(dt);
    else if (!this.photo) this.ccam.update(dt, this.car, { x: I.keys.has('KeyV') || I.padLookBack ? 1 : 0, y: 0 });
    // world
    this.sky.update(dt, this.camera.position, this.scene, 0);
    this.terrain.update(this.camera.position);
    for (const m of this.water.userData.mats) m.userData.uniforms.uTime.value += dt;
    this.forest.update(this.camera.position, dt, this.scene, this.sky.sun);
    CITY.uNight.value = night;
    LAMPS.uNight.value = night;
    this.landmarks?.update(dt);
    if (simulate) {
      this.traffic.update(dt, this.car, this.camera, this.state === 'drive' ? this.skills : null, night);
      this.events.update(dt);
      if (this.state === 'drive' && !this.events.race) this.skills.update(dt, veh);
      else if (this.events.race && this.skills.enabled) this.skills.update(dt, veh);
      this.checkWater(dt);
      this.stats(dt);
    }
    // route ribbon in free roam
    const mp = this.playerPos();
    if (this.route && !this.events.race) {
      const i = this.ribbon.update(dt, mp.x, mp.z);
      const t = this.route.target;
      if (Math.hypot(t[0] - mp.x, t[1] - mp.z) < 25) { this.hud.note('YOU HAVE ARRIVED', '', '#ff2d8a', 1.6); this.clearRoute(); }
      else if (i >= 0 && Math.hypot(this.route.pts[i][0] - mp.x, this.route.pts[i][1] - mp.z) > 45) this.reroute();
    }
    // audio
    this.sound?.update(dt, veh);
    this.radio?.update(dt);
    // HUD
    if (this.state !== 'title') {
      const f = veh.axes[2];
      const g0 = this.world.ground(mp.x, mp.z, mp.y + 2);
      this.hud.update(dt, { speed: veh.speed * (this.kmh ? 3.6 : 2.237), unit: this.kmh ? 'KM/H' : 'MPH', speedMs: veh.speed, rpm: veh.rpm, redline: this.car.entry.phys.engine.redline, gear: veh.gear, boost: veh.engine.boost, turbo: !!this.car.entry.phys.engine.turbo, x: mp.x, z: mp.z, heading: Math.atan2(f.x, f.z), road: g0.road });
      this.hud.markers = this.mapMarkers().filter((m) => Math.hypot(m.x - mp.x, m.z - mp.z) < 700).map((m) => ({ x: m.x, z: m.z, color: m.color, icon: m.icon }));
      if (this.events.race) for (const d of this.events.race.drivers) { const p = d.car.veh.modelPosition(_w); this.hud.markers.push({ x: p.x, z: p.z, color: '#29e0ff', r: 7 }); }
      this.discover(g0.road);
    }
    const blur = this.rewinding ? 1 : 0.5;
    this.gfx.render(dt, { speed: this.photo ? 0 : clamp((veh.speed - 20) / 60, 0, 1), blur: this.photo ? 0 : blur, flash: this.flash ?? 0 });
    this.flash = Math.max(0, (this.flash ?? 0) - dt * 2);
    this.gfx.adapt(dt);
  }

  titleCam(dt) {
    this.tTitle += dt;
    const p = this.playerPos();
    const hd = this.playerHeading() + 0.9 + this.tTitle * 0.08;
    const r = 6.2;
    this.camera.position.set(p.x + Math.sin(hd) * r, p.y + 1.25, p.z + Math.cos(hd) * r);
    this.camera.lookAt(p.x, p.y + 0.55, p.z);
    if (this.camera.fov !== 42) { this.camera.fov = 42; this.camera.updateProjectionMatrix(); }
  }

  resetToRoad() {
    const p = this.playerPos();
    const n = this.world.nearestRoad(p.x, p.z, 500);
    if (!n) return;
    const hd = this.playerHeading();
    this.car.veh.reset(new THREE.Vector3(n.x, n.y + 0.3, n.z), Math.cos(n.hdg - hd) > 0 ? n.hdg : n.hdg + Math.PI);
    this.ccam.inited = false;
  }

  reroute() {
    const t = this.route.target;
    this.rerouteT = (this.rerouteT ?? 0) + 1;
    if (this.rerouteT % 30 !== 1) return; // at most every half second
    const p = this.playerPos();
    const pts = this.graph.path(p.x, p.z, t[0], t[1], this.playerHeading());
    if (pts) { this.route.pts = pts; this.ribbon.set(pts); this.ribbon.near = 0; this.hud.setRoute(pts.filter((_, i) => i % 3 === 0)); }
  }

  horn() {
    if (!this.audio.ctx) return;
    const ctx = this.audio.ctx, t = ctx.currentTime, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.setValueAtTime(0.18, t + 0.45); g.gain.linearRampToValueAtTime(0, t + 0.55);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
    for (const hz of [415, 523]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz; o.connect(f); o.start(t); o.stop(t + 0.6); }
    f.connect(g); g.connect(this.audio.bus.sfx);
  }

  // water: deeper than the doors means a reset to the road, FH style
  checkWater(dt) {
    const p = this.playerPos();
    const g = this.world.ground(p.x, p.z, p.y + 1);
    const lvl = this.world.waterLevel(p.x, p.z);
    if (!g.road && p.y < lvl - 0.6) {
      this.wet = (this.wet ?? 0) + dt;
      if (this.wet > 0.8) { this.wet = 0; this.sfx('splash', 0.8); this.hud.note('RESET', 'Back to the road', '#555', 1.2); this.resetToRoad(); }
    } else this.wet = 0;
  }

  stats(dt) {
    const st = this.profile.d.stats, v = this.car.veh.speed;
    st.distance += v * dt;
    if (v * 3.6 > st.topSpeed) st.topSpeed = v * 3.6;
    for (const e of this.car.veh.events) if (e.type === 'hit' && e.speed > 8) st.crashes++;
    this.saveT = (this.saveT ?? 0) + dt;
    if (this.saveT > 10) { this.saveT = 0; this.profile.save(); }
  }

  // FH-style road discovery
  discover(road) {
    if (!road || road === this.lastRoad) return;
    this.lastRoad = road;
    const key = road.name;
    if (this.profile.d.roads[key]) return;
    this.profile.d.roads[key] = 1;
    this.hud.pop(`NEW ROAD · ${road.name.toUpperCase()}`);
    this.hud.pop('+100 XP', 'xp');
    this.profile.addXP(100);
  }

  // ------------------------------------------------------------------ rewind
  record(dt) {
    this.recT = (this.recT ?? 0) + dt;
    if (this.recT < 1 / 30) return;
    this.recT = 0;
    const v = this.car.veh;
    this.history.push({ p: v.pos.clone(), q: v.quat.clone(), vel: v.vel.clone(), w: v.angVel.clone(), gear: v.gear, rpm: v.engine.rpm, om: v.wheels.map((x) => x.omega) });
    if (this.history.length > 300) this.history.shift();
  }

  rewind(dt) {
    if (this.events.race?.t < 0) return;
    if (!this.rewinding) { this.rewinding = true; this.rwEl = Object.assign(document.createElement('div'), { className: 'rewind-fx', textContent: '◀◀ REWIND' }); document.body.appendChild(this.rwEl); this.skills.reset(); }
    const v = this.car.veh;
    for (let k = 0; k < 2 && this.history.length > 1; k++) this.history.pop();
    const s = this.history[this.history.length - 1];
    if (!s) return;
    v.pos.copy(s.p); v.quat.copy(s.q); v.vel.copy(s.vel); v.angVel.copy(s.w); v.gear = s.gear; v.engine.rpm = s.rpm;
    v.wheels.forEach((w, i) => { w.omega = s.om[i]; });
    v.axes[0].set(1, 0, 0).applyQuaternion(v.quat); v.axes[1].set(0, 1, 0).applyQuaternion(v.quat); v.axes[2].set(0, 0, 1).applyQuaternion(v.quat);
  }

  endRewind() {
    if (this.rwEl) { this.rwEl.remove(); this.rwEl = null; }
    return false;
  }

  // ------------------------------------------------------------------ photo mode
  startPhoto() {
    this.photo = { yaw: this.playerHeading() + Math.PI * 0.8, pitch: 0.12, dist: 6, fov: 45, h: 0 };
    this.hud.root.classList.add('hidden');
    const el = this.photoEl = document.createElement('div');
    el.className = 'photo-ui';
    el.innerHTML = `<b>PHOTO MODE</b><span>Drag / WASD orbit · wheel zoom</span><label>FOV <input type="range" min="15" max="80" value="45" id="phFov"></label><label>Time <input type="range" min="0" max="24" step="0.1" value="${this.sky.time}" id="phTime"></label><button class="btn pink" id="phShot">Capture</button><button class="btn" id="phExit">Exit</button>`;
    document.body.appendChild(el);
    el.querySelector('#phFov').oninput = (e) => { this.photo.fov = +e.target.value; };
    el.querySelector('#phTime').oninput = (e) => { this.sky.time = +e.target.value; };
    el.querySelector('#phExit').onclick = () => this.endPhoto();
    el.querySelector('#phShot').onclick = () => this.capture();
    let drag = null;
    this.photoDown = (e) => { if (e.target === this.gfx.renderer.domElement) drag = [e.clientX, e.clientY]; };
    this.photoMove = (e) => { if (!drag) return; this.photo.yaw -= (e.clientX - drag[0]) * 0.006; this.photo.pitch = clamp(this.photo.pitch + (e.clientY - drag[1]) * 0.004, -0.1, 1.3); drag = [e.clientX, e.clientY]; };
    this.photoUp = () => { drag = null; };
    this.photoWheel = (e) => { this.photo.dist = clamp(this.photo.dist * Math.exp(e.deltaY * 0.001), 2.5, 25); };
    addEventListener('pointerdown', this.photoDown); addEventListener('pointermove', this.photoMove); addEventListener('pointerup', this.photoUp); addEventListener('wheel', this.photoWheel);
  }

  updatePhoto(dt) {
    const P = this.photo, I = this.input.state;
    P.yaw += I.steer * dt * 1.2; P.pitch = clamp(P.pitch + (I.throttle - I.brake) * dt * 0.8, -0.1, 1.3);
    const p = this.playerPos();
    const y = p.y + 0.6 + Math.sin(P.pitch) * P.dist;
    this.camera.position.set(p.x + Math.sin(P.yaw) * Math.cos(P.pitch) * P.dist, Math.max(y, this.world.ground(p.x, p.z).h + 0.3), p.z + Math.cos(P.yaw) * Math.cos(P.pitch) * P.dist);
    this.camera.lookAt(p.x, p.y + 0.6, p.z);
    if (this.camera.fov !== P.fov) { this.camera.fov = P.fov; this.camera.updateProjectionMatrix(); }
  }

  capture() {
    this.gfx.render(0, { speed: 0, blur: 0 });
    this.gfx.renderer.domElement.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `horizon-japan-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    this.flash = 1;
    this.sfx('check', 0.5);
  }

  endPhoto() {
    this.photo = null;
    this.photoEl?.remove();
    removeEventListener('pointerdown', this.photoDown); removeEventListener('pointermove', this.photoMove); removeEventListener('pointerup', this.photoUp); removeEventListener('wheel', this.photoWheel);
    this.hud.root.classList.remove('hidden');
    this.ccam.inited = false;
  }
}
