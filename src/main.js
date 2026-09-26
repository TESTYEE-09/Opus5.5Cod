import * as THREE from 'three';
import { SIZE, loadMap, updateWorld, wetFloor, sites } from './world.js';
import { MAPS, MODES } from './maps.js';
import { profile } from './rank.js';
import { Graphics, QUALITY } from './graphics.js';
import { Atmosphere } from './atmosphere.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { CLASSES } from './weapons.js';
import { DIFFICULTY } from './bots.js';
import { Net, cleanName } from './net.js';

const canvas = document.getElementById('game');
const gfx = new Graphics(canvas);
const renderer = gfx.renderer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.1, 3000);
camera.rotation.order = 'YXZ';

// the viewmodel renders in its own pass so it never clips into walls
const wscene = new THREE.Scene();
const wcamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
const whemi = new THREE.HemisphereLight(0xe6ecf5, 0x6a5a45, 1.2);
const wsun = new THREE.DirectionalLight(0xffe8c8, 2.2);
wsun.position.set(0.6, 1, 0.4);
const wfill = new THREE.DirectionalLight(0xdde6ff, 0.6);
wfill.position.set(-0.3, 0.4, 1);
const wrim = new THREE.DirectionalLight(0xffffff, 0.8);
wrim.position.set(-0.5, 0.3, -1);
wscene.add(whemi, wsun, wfill, wrim);

const atmo = new Atmosphere(scene, wscene, renderer);
gfx.setup(scene, camera, wscene, wcamera);

const audio = new Sfx();
atmo.onThunder = (dist, strength) => audio.thunder(dist, strength);
const hud = new Hud(audio);

let currentMap = null;
function loadMapById(id) {
  const key = MAPS[id] ? id : 'crossroads';
  if (currentMap === key) return MAPS[key];
  currentMap = key;
  const def = loadMap(scene, MAPS[key]);
  wetFloor()?.setScale(QUALITY[settings.quality]?.reflect ?? 0);
  const look = def.look;
  atmo.apply(look);
  gfx.applyLook(look);
  game.effects.setLook(look, scene.fog);
  audio.setEnvironment(def.audio);
  // light the viewmodel like the world around it
  const sd = new THREE.Vector3(...look.sunDir).normalize();
  wsun.color.set(look.sunColor); wsun.intensity = look.sunIntensity * 0.75;
  wsun.position.set(0.5, sd.y * 2 + 0.3, 0.5);
  whemi.color.set(look.hemiSky); whemi.groundColor.set(look.hemiGround); whemi.intensity = look.hemiIntensity * 1.8;
  wrim.color.set(look.sunGlow);
  $('mapName').textContent = def.name;
  return def;
}

const game = new Game({ renderer, scene, camera, wscene, audio, hud, loadMap: loadMapById });

// ---------- settings ----------
const defaults = { sens: 1, fov: 80, vol: 0.7, difficulty: 'regular', cls: 'assault', name: '', map: 'crossroads', mode: 'gw', quality: 'high' };
const matchRules = () => ({ scoreLimit: MODES[settings.mode].scoreLimit, timeLimit: MODES[settings.mode].timeLimit });
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem('frontline.settings') || '{}')); } catch { /* storage unavailable */ }
if (!CLASSES[settings.cls]) settings.cls = 'assault';
if (!DIFFICULTY[settings.difficulty]) settings.difficulty = 'regular';
if (!MAPS[settings.map]) settings.map = 'crossroads';
const fixMode = () => { if (!MAPS[settings.map].modes.includes(settings.mode)) settings.mode = MAPS[settings.map].modes[0]; };
fixMode();
if (!QUALITY[settings.quality]) settings.quality = 'high';
const save = () => { try { localStorage.setItem('frontline.settings', JSON.stringify(settings)); } catch { /* storage unavailable */ } };
audio.setVolume(settings.vol);

function $(id) { return document.getElementById(id); }

gfx.setQuality(settings.quality, atmo);
loadMapById(settings.map);

function renderClassCards() {
  $('classes').innerHTML = Object.entries(CLASSES).map(([k, c]) =>
    `<button class="card${k === settings.cls ? ' on' : ''}" data-cls="${k}"><b>${c.name}</b><span>${c.desc}</span></button>`).join('');
  $('pauseClasses').innerHTML = Object.entries(CLASSES).map(([k, c]) =>
    `<button class="${k === (game.pendingCls || settings.cls) ? 'on' : ''}" data-cls="${k}">${c.name}</button>`).join('');
  $('diffs').innerHTML = Object.entries(DIFFICULTY).map(([k, d]) =>
    `<button class="${k === settings.difficulty ? 'on' : ''}" data-diff="${k}">${d.name}</button>`).join('');
  $('maps').innerHTML = Object.entries(MAPS).map(([k, m]) =>
    `<button class="card map-${k}${k === settings.map ? ' on' : ''}" data-map="${k}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('');
  $('quality').innerHTML = Object.entries(QUALITY).map(([k, q]) =>
    `<button class="${k === settings.quality ? 'on' : ''}" data-q="${k}">${q.name}</button>`).join('');
  $('lobbyMaps').innerHTML = Object.entries(MAPS).map(([k, m]) =>
    `<button class="${k === settings.map ? 'on' : ''}" data-map="${k}"${net.active && !net.isHost ? ' disabled' : ''}>${m.name}</button>`).join('');
  const modes = MAPS[settings.map].modes;
  $('modesel').innerHTML = Object.entries(MODES).map(([k, m]) =>
    `<button class="card${k === settings.mode ? ' on' : ''}${modes.includes(k) ? '' : ' off'}" data-mode="${k}"><b>${m.name}</b><span>${modes.includes(k) ? m.desc : `Not on ${MAPS[settings.map].name}`}</span></button>`).join('');
  $('lobbyGm').innerHTML = Object.entries(MODES).filter(([k]) => modes.includes(k)).map(([k, m]) =>
    `<button class="${k === settings.mode ? 'on' : ''}" data-gm="${k}"${net.active && !net.isHost ? ' disabled' : ''}>${m.name}</button>`).join('');
  $('modeName').textContent = MODES[settings.mode].name;
  const pr = profile();
  $('rankLine').innerHTML = `Rank <b>${pr.level}</b> &middot; ${pr.title}` + (pr.next ? ` &middot; ${pr.cur.toLocaleString()} / ${pr.next.toLocaleString()} XP` : ' &middot; max rank');
  $('deploy').textContent = MODES[settings.mode].coop ? 'PLAY SOLO MISSION' : 'PLAY SOLO';
}

$('classes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cls]');
  if (!b) return;
  settings.cls = b.dataset.cls; save(); audio.init(); audio.ui(); renderClassCards();
});
$('pauseClasses').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cls]');
  if (!b) return;
  settings.cls = game.pendingCls = b.dataset.cls; save(); audio.ui(); renderClassCards();
});
$('diffs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-diff]');
  if (!b) return;
  settings.difficulty = b.dataset.diff; save(); audio.init(); audio.ui(); renderClassCards();
});
function chooseMap(id) {
  settings.map = id; fixMode(); save(); audio.init(); audio.ui();
  if (game.state !== 'playing') loadMapById(id);
  if (net.active && net.isHost) { net.setMap(id); net.setGameMode(settings.mode); }
  renderClassCards();
}
function chooseMode(k) {
  if (!MODES[k] || !MAPS[settings.map].modes.includes(k)) return;
  settings.mode = k; save(); audio.init(); audio.ui();
  if (net.active && net.isHost) net.setGameMode(k);
  renderClassCards();
}
$('modesel').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) chooseMode(b.dataset.mode); });
$('lobbyGm').addEventListener('click', (e) => { const b = e.target.closest('[data-gm]'); if (b && net.isHost) chooseMode(b.dataset.gm); });
$('maps').addEventListener('click', (e) => { const b = e.target.closest('[data-map]'); if (b) chooseMap(b.dataset.map); });
$('lobbyMaps').addEventListener('click', (e) => { const b = e.target.closest('[data-map]'); if (b && net.isHost) chooseMap(b.dataset.map); });
$('quality').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  settings.quality = b.dataset.q; save(); audio.init(); audio.ui();
  gfx.setQuality(settings.quality, atmo);
  gfx.applyLook(MAPS[currentMap].look);
  wetFloor()?.setScale(QUALITY[settings.quality].reflect ?? 0);
  renderClassCards();
});

function bindRange(id, key, fmt) {
  const input = $(id), out = $(id + 'Out');
  input.value = settings[key];
  out.textContent = fmt(settings[key]);
  input.addEventListener('input', () => {
    settings[key] = parseFloat(input.value);
    out.textContent = fmt(settings[key]);
    if (key === 'vol') audio.setVolume(settings.vol);
    if (id === 'sens2') { $('sens').value = settings.sens; $('sensOut').textContent = fmt(settings.sens); }
    if (id === 'sens') { $('sens2').value = settings.sens; $('sens2Out').textContent = fmt(settings.sens); }
    save();
  });
}
bindRange('sens', 'sens', v => v.toFixed(2));
bindRange('sens2', 'sens', v => v.toFixed(2));
bindRange('fov', 'fov', v => String(v));
bindRange('vol', 'vol', v => `${Math.round(v * 100)}`);

// ---------- pointer lock & screens ----------
let locked = false;
function lock() {
  $('lockMsg').textContent = '';
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { $('lockMsg').textContent = 'The browser refused the mouse lock. Wait a second and press Resume again.'; });
  } catch { $('lockMsg').textContent = 'The browser refused the mouse lock. Press Resume again.'; }
}

function hideScreens() {
  for (const id of ['menu', 'end', 'pause', 'lobby']) $(id).classList.add('hidden');
}

function deploy() {
  audio.init();
  if (net.active) { net.leave(); game.net = null; }
  game.startMatch({ ...settings, ...matchRules(), name: cleanName(settings.name) });
  hideScreens();
  renderClassCards();
  lock();
}

function toMenu(msg) {
  if (net.active) net.leave();
  game.net = null;
  if (game.state === 'playing') game.state = 'ended';
  game.clear();
  game.state = 'menu';
  loadMapById(settings.map);
  hideScreens();
  $('mpMsg').textContent = typeof msg === 'string' ? msg : '';
  $('hud').classList.add('hidden');
  $('death').classList.add('hidden');
  $('scoreboard').classList.add('hidden');
  $('menu').classList.remove('hidden');
  renderClassCards();
  if (document.pointerLockElement) document.exitPointerLock();
}

$('deploy').addEventListener('click', deploy);
$('again').addEventListener('click', () => { if (net.active && net.isHost) startMp(); else if (!net.active) deploy(); });
$('toMenu').addEventListener('click', () => toMenu());
$('resume').addEventListener('click', () => { audio.init(); lock(); });
$('quit').addEventListener('click', () => toMenu());

// ---------- multiplayer ----------
const net = new Net(game, {
  lobby(state) {
    $('roomCode').textContent = state.code || '';
    $('members').innerHTML = (state.members || []).map(m =>
      `<li><span>${escapeHtml(m.name)}</span><em>${m.host ? 'host' : ''}</em></li>`).join('');
    for (const b of $('modes').querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.mode === state.mode);
      b.disabled = !net.isHost;
    }
    if (!net.isHost && MAPS[state.map] && game.state !== 'playing') { settings.map = state.map; loadMapById(state.map); }
    if (!net.isHost && MODES[state.gm]) settings.mode = state.gm;
    renderClassCards();
    $('startMp').classList.toggle('hidden', !net.isHost || state.playing);
    $('lobbyMsg').textContent = net.isHost
      ? (state.playing ? 'Match in progress. New players join straight into it.' : 'Keep this tab in front while you host: the match runs in your browser.')
      : 'Waiting for the host to start the match.';
    $('codeNote').classList.toggle('hidden', !net.isHost);
  },
  started() {
    hideScreens();
    renderClassCards();
    $('pauseTitle').textContent = 'MATCH STARTED';
    $('pauseNote').textContent = 'Click Resume to take control. The match keeps running while this screen is open.';
    $('pause').classList.remove('hidden');
  },
  error(msg) { $('lobbyMsg').textContent = msg; },
  closed(msg) { toMenu(msg); },
});
renderClassCards();

const escapeHtml = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function showLobby() {
  hideScreens();
  renderClassCards();
  $('lobby').classList.remove('hidden');
}

function startMp() {
  audio.init();
  net.startGame({ ...settings, ...matchRules() });
  hideScreens();
  renderClassCards();
  lock();
}

$('callsign').value = settings.name;
$('callsign').addEventListener('input', () => { settings.name = $('callsign').value; save(); });

$('hostBtn').addEventListener('click', async () => {
  audio.init();
  $('mpMsg').textContent = 'Creating a room…';
  try {
    game.net = net;
    net.map = settings.map;
    net.gameMode = settings.mode;
    await net.host(settings.name);
    $('mpMsg').textContent = '';
    showLobby();
  } catch (e) {
    game.net = null;
    $('mpMsg').textContent = e.message;
  }
});

$('joinBtn').addEventListener('click', async () => {
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length < 5) { $('mpMsg').textContent = 'Type the 5-letter room code first.'; return; }
  audio.init();
  $('mpMsg').textContent = 'Connecting…';
  try {
    game.net = net;
    await net.join(code, settings.name);
    $('mpMsg').textContent = '';
    if (game.state !== 'playing') showLobby();
  } catch (e) {
    game.net = null;
    $('mpMsg').textContent = e.message;
  }
});

$('modes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (b && net.isHost) net.setMode(b.dataset.mode);
});
$('startMp').addEventListener('click', startMp);
$('leaveLobby').addEventListener('click', () => toMenu());
canvas.addEventListener('click', () => { if (game.state === 'playing' && !locked) lock(); });

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) $('pause').classList.add('hidden');
  else if (game.state === 'playing') {
    renderClassCards();
    $('pauseTitle').textContent = 'PAUSED';
    $('pauseNote').textContent = net.active ? 'This is a multiplayer match, so it keeps running while you are paused.' : '';
    $('pause').classList.remove('hidden');
  }
  keys.clear(); mouse.clear();
});

// ---------- input ----------
const keys = new Set(), pressed = new Set(), mouse = new Set(), mousePressed = new Set();
let mdx = 0, mdy = 0, wheel = 0;
const GAME_KEYS = new Set(['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyG', 'KeyV', 'KeyR', 'KeyQ', 'KeyE', 'KeyF', 'KeyZ', 'KeyM',
  'ControlLeft', 'ControlRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);

addEventListener('keydown', (e) => {
  if (!locked) return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousedown', (e) => { if (!locked) return; mouse.add(e.button); mousePressed.add(e.button); });
addEventListener('mouseup', (e) => mouse.delete(e.button));
addEventListener('mousemove', (e) => { if (locked) { mdx += e.movementX; mdy += e.movementY; } });
addEventListener('wheel', (e) => { if (locked) wheel += Math.sign(e.deltaY); }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('blur', () => { keys.clear(); mouse.clear(); });

function readInput() {
  const k = (c) => keys.has(c) ? 1 : 0;
  let switchTo = null;
  const ars = game.arsenal, n = ars.slots.length;
  if (pressed.has('Digit1')) switchTo = 0;
  if (pressed.has('Digit2')) switchTo = 1;
  if (pressed.has('Digit3') && n > 2) switchTo = 2;
  if (wheel !== 0 && n) switchTo = (ars.cur + (wheel > 0 ? 1 : n - 1)) % n;
  const streak = pressed.has('Digit4') ? 'uav' : pressed.has('Digit5') ? 'airstrike' : pressed.has('Digit6') ? 'chopper' : null;
  const call = pressed.has('Digit7') ? 'drone' : pressed.has('Digit8') ? 'tank' : pressed.has('Digit9') ? 'jet' : null;
  let digit = 0;
  for (let d = 1; d <= 9 && !digit; d++) if (pressed.has(`Digit${d}`)) digit = d;
  if (pressed.has('KeyM')) hud.toggleMap();
  const inp = {
    forward: k('KeyW'), back: k('KeyS'), left: k('KeyA'), right: k('KeyD'),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), sprintPressed: pressed.has('ShiftLeft') || pressed.has('ShiftRight'),
    fire: mouse.has(0), firePressed: mousePressed.has(0),
    ads: mouse.has(2), adsPressed: mousePressed.has(2),
    reload: pressed.has('KeyR'), jumpPressed: pressed.has('Space'), jump: keys.has('Space'), crouchPressed: pressed.has('KeyC'),
    pronePressed: pressed.has('ControlLeft') || pressed.has('ControlRight') || pressed.has('KeyZ'),
    leanL: keys.has('KeyQ'), leanR: keys.has('KeyE'), usePressed: pressed.has('KeyF'), use: keys.has('KeyF'), digit,
    melee: pressed.has('KeyV'), nade: keys.has('KeyG'), nadePressed: pressed.has('KeyG'),
    switchTo, streak, call, dx: mdx, dy: mdy,
  };
  pressed.clear(); mousePressed.clear();
  mdx = mdy = 0; wheel = 0;
  return inp;
}

// ---------- loop ----------
function resize() {
  gfx.resize();
  camera.aspect = wcamera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  wcamera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const _sun = new THREE.Vector3(), _cd = new THREE.Vector3();
const timer = new THREE.Timer();
timer.connect(document);
let menuT = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  timer.update(ts);
  const dt = Math.min(0.05, timer.getDelta());
  if (game.state === 'playing') {
    hud.showScores = locked && keys.has('Tab');
    if (locked || net.active) game.update(dt, readInput());
    else { readInput(); game.effects.update(0); }
  } else if (game.state === 'menu') {
    menuT += dt * 0.05;
    const small = SIZE < 100, rad = small ? 30 : 70;
    camera.position.set(SIZE / 2 + Math.cos(menuT) * rad, small ? 14 : 30, SIZE / 2 + Math.sin(menuT) * rad);
    camera.fov = 60; camera.updateProjectionMatrix();
    camera.lookAt(SIZE / 2, small ? 1 : 3, SIZE / 2);
    game.arsenal.holder.visible = false;
    game.effects.update(dt);
  } else {
    game.effects.update(dt);
  }
  const px = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  atmo.update(dt, camera, px);
  updateWorld(dt, camera.position, scene.fog.far + 60);
  camera.updateMatrixWorld();
  wetFloor()?.render(renderer, scene, camera, dt);
  // sun shafts: where the sun is on screen, and how much we face it
  const look = MAPS[currentMap].look;
  if (gfx.rays && atmo.sunDir) {
    _sun.copy(camera.position).addScaledVector(atmo.sunDir, 1000).project(camera);
    camera.getWorldDirection(_cd);
    const facing = _cd.dot(atmo.sunDir);
    gfx.setSun((_sun.x + 1) / 2, (_sun.y + 1) / 2, facing > 0 && _sun.z < 1 ? (look.rays || 0) * Math.min(1, facing * 1.5) : 0, look.sunGlow);
  }
  const pl = game.player, playing = game.state === 'playing';
  const veh = playing && pl.alive ? pl.vehicle : null;
  const hurt = playing ? (pl.alive ? Math.max(0, (45 - pl.health) / 45) * 0.8 : 0.7) : 0;
  const d = game.arsenal.w?.def;
  const scoped = playing && pl.alive && !veh && d && (d.scope || d.overlay) && game.arsenal.adsEase() > 0.92;
  gfx.override = veh ? veh.grade() : scoped ? { vignette: 0.1, fringe: 0, grain: 0.02 } : null;
  gfx.render(playing && pl.alive && !veh, dt, veh ? hurt * 0.3 : hurt, Math.min(0.8, game.flashT * 2.2));
}
requestAnimationFrame(frame);

// hook for automated screenshots in dev and test builds only
if (import.meta.env.DEV || import.meta.env.VITE_TEST_HOOK) window.__fl = { game, THREE, deploy, settings, loadMapById, gfx, atmo, audio, CLASSES, sites };
