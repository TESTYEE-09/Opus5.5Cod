// Touch controls for phones and tablets: a floating move stick on the left half, drag-to-look
// on the right half, and thumb buttons for everything else. It feeds the same key and mouse
// sets main.js reads from the keyboard, so the game code never knows the difference.

export const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;

// look speed: screen pixels of drag become mouse-count units
const LOOK = 1.35;
const STICK_R = 56;

// [id, label, hold code or mouse button, kind]  kind: 'hold' key held while touched, 'tap' pressed once,
// 'mouse' a mouse button, 'toggle' latches (aim)
const BUTTONS = [
  ['fire', 'FIRE', 0, 'mouse'],
  ['fire2', 'FIRE', 0, 'mouse'],
  ['ads', 'AIM', 2, 'toggle'],
  ['jump', 'JUMP', 'Space', 'hold'],
  ['crouch', 'CROUCH', 'KeyC', 'crouch'],
  ['reload', 'RELOAD', 'KeyR', 'tap'],
  ['nade', 'FRAG', 'KeyG', 'hold'],
  ['knife', 'KNIFE', 'KeyV', 'tap'],
  ['swap', 'SWAP', 'swap', 'tap'],
  ['use', 'USE', 'KeyF', 'hold'],
  ['leanL', 'Q', 'KeyQ', 'hold'],
  ['leanR', 'E', 'KeyE', 'hold'],
];

export function createTouch(api) {
  // api: { keys, pressed, mouse, mousePressed, look(dx, dy), wheel(n), stick, active(), pause(), kit(open), scores(on) }
  const root = document.createElement('div');
  root.id = 'touch';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="tzone tleft"></div><div class="tzone tright"></div>
    <div class="stick hidden"><i></i></div>
    <div class="tbar">
      <button data-t="pause" aria-label="Pause">II</button>
      <button data-t="map" aria-label="Map">MAP</button>
      <button data-t="scores" aria-label="Scores">SCORE</button>
      <button data-t="kit" aria-label="Streaks and vehicles">KIT</button>
    </div>
    <div class="tkit hidden">
      <button data-k="KeyT">SANDBAGS</button><button data-k="KeyX">BEACON</button><button data-k="loadout">LOADOUT</button>
    </div>
    <div class="tbtns">${BUTTONS.map(([id, label]) => `<button class="tb tb-${id}" data-b="${id}">${label}</button>`).join('')}</div>
    <div class="rotate"><b>ROTATE YOUR DEVICE</b><span>Frontline plays in landscape.</span></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const stickEl = $('.stick'), knob = stickEl.firstElementChild;
  const byId = Object.fromEntries(BUTTONS.map(b => [b[0], b]));

  const touches = new Map(); // pointerId -> { kind, ... }
  let adsOn = false;

  const press = (code) => { api.pressed.add(code); api.keys.add(code); };
  const release = (code) => api.keys.delete(code);

  function down(e) {
    if (e.pointerType === 'mouse' || !api.active()) return;
    const b = e.target.closest('[data-b]');
    const t = { x: e.clientX, y: e.clientY, t: performance.now(), el: b };
    if (b) {
      e.preventDefault();
      const [id, , code, kind] = byId[b.dataset.b];
      t.kind = 'btn'; t.id = id; t.look = true; // every button also turns the view when dragged
      b.classList.add('on');
      if (kind === 'mouse') { api.mouse.add(code); api.mousePressed.add(code); }
      else if (kind === 'toggle') { adsOn = !adsOn; if (adsOn) { api.mouse.add(2); api.mousePressed.add(2); } else api.mouse.delete(2); syncAds(); }
      else if (kind === 'hold') press(code);
      else if (kind === 'crouch') t.hold = setTimeout(() => { t.prone = true; press('KeyZ'); release('KeyZ'); b.classList.add('long'); }, 380);
      else if (id === 'swap') api.wheel(1);
      else press(code);
      navigator.vibrate?.(8);
    } else if (e.target.closest('.tleft')) {
      e.preventDefault();
      t.kind = 'stick'; t.ox = e.clientX; t.oy = e.clientY;
      stickEl.style.left = `${t.ox}px`; stickEl.style.top = `${t.oy}px`;
      stickEl.classList.remove('hidden');
      knob.style.transform = '';
    } else if (e.target.closest('.tright')) {
      e.preventDefault();
      t.kind = 'look'; t.look = true;
    } else return;
    touches.set(e.pointerId, t);
    root.setPointerCapture?.(e.pointerId);
  }

  function move(e) {
    const t = touches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    if (t.kind === 'stick') {
      let sx = e.clientX - t.ox, sy = e.clientY - t.oy;
      const len = Math.hypot(sx, sy);
      // the stick follows your thumb when you push past its rim
      if (len > STICK_R * 1.4) { const k = (len - STICK_R * 1.4) / len; t.ox += sx * k; t.oy += sy * k; sx -= sx * k; sy -= sy * k; stickEl.style.left = `${t.ox}px`; stickEl.style.top = `${t.oy}px`; }
      const l = Math.min(1, Math.hypot(sx, sy) / STICK_R), a = Math.atan2(sy, sx);
      const nx = Math.cos(a) * l, ny = Math.sin(a) * l;
      knob.style.transform = `translate(${nx * STICK_R}px, ${ny * STICK_R}px)`;
      // small dead zone, then full range
      const dz = (v) => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
      api.stick.x = dz(nx); api.stick.y = dz(ny);
      // pushed hard forward: sprint; a flick forward from rest acts as the double tap for tactical sprint
      const sprint = ny < -0.9 && Math.hypot(sx, sy) > STICK_R * 1.05;
      if (sprint && !api.stick.sprint) api.stick.sprintPressed = true;
      api.stick.sprint = sprint;
      stickEl.classList.toggle('sprint', sprint);
    } else if (t.look) {
      api.look(dx * LOOK, dy * LOOK);
    }
  }

  function up(e) {
    const t = touches.get(e.pointerId);
    if (!t) return;
    touches.delete(e.pointerId);
    if (t.kind === 'stick') {
      stickEl.classList.add('hidden');
      api.stick.x = api.stick.y = 0; api.stick.sprint = false;
    } else if (t.kind === 'btn') {
      const [id, , code, kind] = byId[t.id];
      t.el.classList.remove('on', 'long');
      if (kind === 'mouse') { if (![...touches.values()].some(o => o.kind === 'btn' && byId[o.id][3] === 'mouse')) api.mouse.delete(code); }
      else if (kind === 'hold') release(code);
      else if (kind === 'crouch') { clearTimeout(t.hold); if (!t.prone) { press('KeyC'); release('KeyC'); } }
      else if (kind === 'tap' && id !== 'swap') release(code);
    }
  }

  function syncAds() { $('.tb-ads').classList.toggle('latched', adsOn); }

  root.addEventListener('pointerdown', down, { passive: false });
  root.addEventListener('pointermove', move, { passive: false });
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // top bar and kit panel: plain taps
  root.querySelector('.tbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const k = b.dataset.t;
    if (k === 'pause') api.pause();
    else if (k === 'map') press('KeyM'), release('KeyM');
    else if (k === 'scores') { b.classList.toggle('latched'); api.scores(b.classList.contains('latched')); }
    else if (k === 'kit') { const open = b.classList.toggle('latched'); root.classList.toggle('kitopen', open); $('.tkit').classList.toggle('hidden', !open); api.kit(open); }
  });
  root.querySelector('.tkit').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    if (b.dataset.k === 'loadout') api.pause('loadout');
    else { press(b.dataset.k); release(b.dataset.k); }
  });
  // the live killstreak / vehicle list doubles as the kit menu: tap an entry to call it in
  document.getElementById('streaks').addEventListener('click', (e) => {
    const k = e.target.closest('.sk')?.querySelector('kbd')?.textContent.trim();
    if (!k || !api.active()) return;
    const code = /^\d$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`;
    press(code); release(code);
    navigator.vibrate?.(12);
  });
  // choose a spawn point by tapping it on the death screen
  document.getElementById('spawnSel').addEventListener('click', (e) => {
    const d = e.target.closest('[data-d]')?.dataset.d;
    if (d) { press(`Digit${d}`); release(`Digit${d}`); }
  });

  return {
    root,
    show(on) {
      root.classList.toggle('hidden', !on);
      if (!on) this.reset();
    },
    reset() {
      for (const [, t] of touches) if (t.el) t.el.classList.remove('on', 'long');
      touches.clear();
      stickEl.classList.add('hidden');
      Object.assign(api.stick, { x: 0, y: 0, sprint: false, sprintPressed: false });
      adsOn = false; syncAds();
    },
    // hide buttons that do nothing right now
    update(game) {
      const pl = game.player, veh = pl.alive && pl.vehicle;
      root.classList.toggle('dead', !pl.alive);
      root.classList.toggle('veh', !!veh);
      if (veh && adsOn) { adsOn = false; api.mouse.delete(2); syncAds(); }
    },
  };
}
