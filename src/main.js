import * as THREE from 'three';
import { buildWorld, SIZE } from './world.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { CLASSES } from './weapons.js';
import { DIFFICULTY } from './bots.js';
import { Net, cleanName } from './net.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8c9a8, 45, 230);
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 700);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight(0xcfdcf0, 0x7a6448, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
const sunDir = new THREE.Vector3(0.45, 0.55, 0.7).normalize();
sun.position.set(SIZE / 2, 0, SIZE / 2).addScaledVector(sunDir, 90);
sun.target.position.set(SIZE / 2, 0, SIZE / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 10, far: 200 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// the viewmodel renders in its own pass so it never clips into walls
const wscene = new THREE.Scene();
const wcamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
wscene.add(new THREE.HemisphereLight(0xe6ecf5, 0x6a5a45, 2.2));
const wsun = new THREE.DirectionalLight(0xffe8c8, 1.6);
wsun.position.set(0.6, 1, 0.4);
const wfill = new THREE.DirectionalLight(0xdde6ff, 1.2);
wfill.position.set(-0.3, 0.4, 1);
wscene.add(wsun, wfill);

buildWorld(scene);

const audio = new Sfx();
const hud = new Hud(audio);
const game = new Game({ renderer, scene, camera, wscene, audio, hud });

// ---------- settings ----------
const defaults = { sens: 1, fov: 80, vol: 0.7, difficulty: 'regular', cls: 'assault', name: '' };
const MATCH = { scoreLimit: 100, timeLimit: 600 };
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem('frontline.settings') || '{}')); } catch { /* storage unavailable */ }
if (!CLASSES[settings.cls]) settings.cls = 'assault';
if (!DIFFICULTY[settings.difficulty]) settings.difficulty = 'regular';
const save = () => { try { localStorage.setItem('frontline.settings', JSON.stringify(settings)); } catch { /* storage unavailable */ } };
audio.setVolume(settings.vol);

const $ = (id) => document.getElementById(id);

function renderClassCards() {
  $('classes').innerHTML = Object.entries(CLASSES).map(([k, c]) =>
    `<button class="card${k === settings.cls ? ' on' : ''}" data-cls="${k}"><b>${c.name}</b><span>${c.desc}</span></button>`).join('');
  $('pauseClasses').innerHTML = Object.entries(CLASSES).map(([k, c]) =>
    `<button class="${k === (game.pendingCls || settings.cls) ? 'on' : ''}" data-cls="${k}">${c.name}</button>`).join('');
  $('diffs').innerHTML = Object.entries(DIFFICULTY).map(([k, d]) =>
    `<button class="${k === settings.difficulty ? 'on' : ''}" data-diff="${k}">${d.name}</button>`).join('');
}
renderClassCards();

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
  game.startMatch({ ...settings, ...MATCH, name: cleanName(settings.name) });
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
  hideScreens();
  $('mpMsg').textContent = typeof msg === 'string' ? msg : '';
  $('hud').classList.add('hidden');
  $('death').classList.add('hidden');
  $('scoreboard').classList.add('hidden');
  $('menu').classList.remove('hidden');
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

const escapeHtml = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function showLobby() {
  hideScreens();
  $('lobby').classList.remove('hidden');
}

function startMp() {
  audio.init();
  net.startGame({ ...settings, ...MATCH });
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
const GAME_KEYS = new Set(['Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyG', 'KeyV', 'KeyR']);

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
  if (pressed.has('Digit1')) switchTo = 0;
  if (pressed.has('Digit2')) switchTo = 1;
  if (wheel !== 0 && game.arsenal.slots.length) switchTo = 1 - game.arsenal.cur;
  const streak = pressed.has('Digit3') ? 'uav' : pressed.has('Digit4') ? 'airstrike' : pressed.has('Digit5') ? 'chopper' : null;
  const inp = {
    forward: k('KeyW'), back: k('KeyS'), left: k('KeyA'), right: k('KeyD'),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    fire: mouse.has(0), firePressed: mousePressed.has(0),
    ads: mouse.has(2), adsPressed: mousePressed.has(2),
    reload: pressed.has('KeyR'), jumpPressed: pressed.has('Space'), crouchPressed: pressed.has('KeyC'),
    melee: pressed.has('KeyV') || pressed.has('KeyF'), nade: keys.has('KeyG'), nadePressed: pressed.has('KeyG'),
    switchTo, streak, dx: mdx, dy: mdy,
  };
  pressed.clear(); mousePressed.clear();
  mdx = mdy = 0; wheel = 0;
  return inp;
}

// ---------- loop ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = wcamera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  wcamera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
let menuT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (game.state === 'playing') {
    hud.showScores = locked && keys.has('Tab');
    if (locked || net.active) game.update(dt, readInput());
    else { readInput(); game.effects.update(0); }
  } else if (game.state === 'menu') {
    menuT += dt * 0.05;
    camera.position.set(SIZE / 2 + Math.cos(menuT) * 48, 24, SIZE / 2 + Math.sin(menuT) * 48);
    camera.fov = 60; camera.updateProjectionMatrix();
    camera.lookAt(SIZE / 2, 2, SIZE / 2);
    game.arsenal.holder.visible = false;
  } else {
    game.effects.update(dt);
  }
  renderer.clear();
  renderer.render(scene, camera);
  if (game.state === 'playing' && game.player.alive) {
    renderer.clearDepth();
    renderer.render(wscene, wcamera);
  }
}
frame();
