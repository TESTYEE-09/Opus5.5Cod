// Front end: the title card, and the pause menu with the map (routes and fast travel),
// garage, Autoshow, events list and settings. Plain DOM, styled in style.css.
import { CARS, carById, ratings, CLASSES } from '../cars/catalog.js';
import { HALF, SIZE } from '../world/layout.js';
import { LEVEL_XP } from '../game/profile.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const CLASS_COL = { D: '#3fc1ff', C: '#ffd23f', B: '#ff7a2f', A: '#ff3b3b', S1: '#b45cff', S2: '#2f6bff', X: '#2ee88a' };
export const classBadge = (c) => `<span class="cls" style="--c:${CLASS_COL[c.cls]}"><b>${c.cls}</b><i>${c.pi}</i></span>`;
const RARITY_COL = { Common: '#9aa4b1', Rare: '#3fa9ff', Epic: '#b45cff', Legendary: '#ffb020', 'Forza Edition': '#ff2d8a' };

export class Menu {
  constructor(root, game) {
    this.root = root; this.game = game;
    this.tab = 'map';
    this.isOpen = false;
    root.innerHTML = `
      <div id="title" class="title hidden">
        <div class="t-logo"><span class="ld-jp">日の出</span><b>HORIZON</b><i>JAPAN</i></div>
        <div class="t-press" id="tPress">Press any key</div>
        <div class="t-foot">WASD / arrows drive · Space handbrake · C camera · Esc menu · Gamepad supported</div>
      </div>
      <div id="pause" class="pause hidden">
        <div class="p-top">
          <div class="p-tabs" id="pTabs"></div>
          <div class="p-wallet" id="pWallet"></div>
        </div>
        <div class="p-body" id="pBody"></div>
        <div class="p-hint" id="pHint"></div>
      </div>
      <div id="modal" class="modal hidden"></div>`;
    this.$ = (id) => root.querySelector('#' + id);
    this.tabs = [['map', 'Map'], ['garage', 'My Cars'], ['autoshow', 'Autoshow'], ['events', 'Festival'], ['settings', 'Settings']];
    this.$('pTabs').innerHTML = this.tabs.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join('') + '<button class="p-close" data-close>Resume ✕</button>';
    this.$('pTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) { this.close(); return; }
      this.show(b.dataset.tab);
    });
    this.game.profile.listeners.push(() => this.wallet());
  }

  // ---------------------------------------------------------------- title
  showTitle(onStart) {
    const t = this.$('title');
    t.classList.remove('hidden');
    const go = (e) => {
      if (e?.type === 'keydown' && ['F5', 'F12'].includes(e.code)) return;
      removeEventListener('keydown', go); removeEventListener('pointerdown', go); clearInterval(this.padPoll);
      t.classList.add('out');
      setTimeout(() => t.classList.add('hidden'), 900);
      onStart();
    };
    addEventListener('keydown', go); addEventListener('pointerdown', go);
    this.padPoll = setInterval(() => { const p = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.buttons.some((b) => b.pressed)); if (p) go(); }, 100);
  }

  // ---------------------------------------------------------------- pause menu
  open(tab = this.tab) {
    this.isOpen = true;
    this.$('pause').classList.remove('hidden');
    this.wallet();
    this.show(tab);
    this.game.onMenu?.(true);
  }

  close() {
    this.isOpen = false;
    this.$('pause').classList.add('hidden');
    this.stopMap();
    this.game.onMenu?.(false);
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  cycle(dir) {
    const i = this.tabs.findIndex(([k]) => k === this.tab);
    this.show(this.tabs[(i + dir + this.tabs.length) % this.tabs.length][0]);
  }

  wallet() {
    const d = this.game.profile.d;
    const need = LEVEL_XP(d.level);
    this.$('pWallet').innerHTML = `<span class="lvl">LVL <b>${d.level}</b><i style="width:${(d.xp / need) * 100}%"></i></span><span class="cr">${fmt(d.credits)} CR</span><span class="ws">⟳ ${d.wheelspins}</span>`;
  }

  show(tab) {
    this.stopMap();
    this.tab = tab;
    for (const b of this.$('pTabs').querySelectorAll('button[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    const body = this.$('pBody');
    body.scrollTop = 0;
    this[`tab_${tab}`](body);
  }

  // ---------------------------------------------------------------- map
  tab_map(body) {
    const g = this.game;
    body.innerHTML = `<div class="map-wrap"><canvas id="mapC"></canvas><div class="map-side" id="mapSide"></div></div>`;
    const cv = this.$('mapC'), ctx = cv.getContext('2d');
    const img = g.hud.mapImg;
    const view = this.mapView ?? (this.mapView = { cx: 0, cz: 0, zoom: 1 });
    const p = g.playerPos();
    if (!this.mapSel) { view.cx = p.x; view.cz = p.z; }
    const fit = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; };
    fit();
    const scale = () => (Math.min(cv.width, cv.height) / SIZE) * view.zoom;
    const toScreen = (x, z) => [cv.width / 2 + (x - view.cx) * scale(), cv.height / 2 + (z - view.cz) * scale()];
    const toWorld = (sx, sy) => [view.cx + (sx - cv.width / 2) / scale(), view.cz + (sy - cv.height / 2) / scale()];
    const draw = () => {
      const s = scale();
      ctx.fillStyle = '#10222f'; ctx.fillRect(0, 0, cv.width, cv.height);
      const [x0, y0] = toScreen(-HALF, -HALF);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, x0, y0, SIZE * s, SIZE * s);
      // route
      if (g.route?.pts?.length) {
        ctx.strokeStyle = '#ff2d8a'; ctx.lineWidth = 4 * devicePixelRatio; ctx.lineJoin = 'round';
        ctx.beginPath();
        g.route.pts.forEach(([x, z], i) => { const [a, b] = toScreen(x, z); (i ? ctx.lineTo : ctx.moveTo).call(ctx, a, b); });
        ctx.stroke();
      }
      // places and events
      const dpr = devicePixelRatio;
      for (const m of g.mapMarkers()) {
        const [a, b] = toScreen(m.x, m.z);
        ctx.fillStyle = m.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * dpr;
        ctx.beginPath(); ctx.arc(a, b, (m.big ? 11 : 8) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (m.icon) { ctx.fillStyle = '#000'; ctx.font = `700 ${11 * dpr}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.icon, a, b + dpr); }
        if (m.label && (view.zoom > 1.6 || m.big)) {
          ctx.font = `700 ${13 * dpr}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(m.label, a + 14 * dpr, b);
          ctx.fillStyle = '#fff'; ctx.fillText(m.label, a + 14 * dpr, b);
        }
      }
      // player
      const pp = g.playerPos(), [px, py] = toScreen(pp.x, pp.z), hd = g.playerHeading();
      ctx.save(); ctx.translate(px, py); ctx.rotate(-hd + Math.PI);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff2d8a'; ctx.lineWidth = 3 * dpr;
      ctx.beginPath(); ctx.moveTo(0, -12 * dpr); ctx.lineTo(9 * dpr, 10 * dpr); ctx.lineTo(0, 5 * dpr); ctx.lineTo(-9 * dpr, 10 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      // selection
      if (this.mapSel) {
        const [a, b] = toScreen(this.mapSel.x, this.mapSel.z);
        ctx.strokeStyle = '#29e0ff'; ctx.lineWidth = 3 * dpr;
        ctx.beginPath(); ctx.arc(a, b, 14 * dpr, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a - 22 * dpr, b); ctx.lineTo(a + 22 * dpr, b); ctx.moveTo(a, b - 22 * dpr); ctx.lineTo(a, b + 22 * dpr); ctx.stroke();
      }
    };
    this.side();
    // interaction: drag to pan, wheel/pinch to zoom, click to select
    let drag = null, moved = 0;
    const pts = new Map();
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.offsetX, e.offsetY]); drag = { x: e.offsetX, y: e.offsetY, cx: view.cx, cz: view.cz, d: 0 }; moved = 0; };
    cv.onpointermove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pts.size === 2) {
        const [[ax, ay], [bx, by]] = [...pts.values()];
        const d = Math.hypot(ax - bx, ay - by);
        if (drag.d) view.zoom = Math.min(12, Math.max(0.8, view.zoom * (d / drag.d)));
        drag.d = d; moved = 99;
        return;
      }
      const dx = (e.offsetX - drag.x) * devicePixelRatio, dy = (e.offsetY - drag.y) * devicePixelRatio;
      moved = Math.max(moved, Math.hypot(dx, dy));
      view.cx = drag.cx - dx / scale(); view.cz = drag.cz - dy / scale();
    };
    cv.onpointerup = (e) => {
      pts.delete(e.pointerId);
      if (moved < 6 && pts.size === 0) {
        const [x, z] = toWorld(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
        this.selectOnMap(x, z);
      }
    };
    cv.onwheel = (e) => { e.preventDefault(); view.zoom = Math.min(12, Math.max(0.8, view.zoom * Math.exp(-e.deltaY * 0.0015))); };
    const loop = () => { draw(); this.mapRAF = requestAnimationFrame(loop); };
    loop();
    this.mapResize = () => fit();
    addEventListener('resize', this.mapResize);
  }

  stopMap() {
    if (this.mapRAF) cancelAnimationFrame(this.mapRAF);
    this.mapRAF = null;
    if (this.mapResize) removeEventListener('resize', this.mapResize);
  }

  selectOnMap(x, z) {
    const g = this.game;
    // snap to a marker if one is close, else to the nearest road
    const s = (Math.min(this.$('mapC').width, this.$('mapC').height) / SIZE) * this.mapView.zoom;
    const hit = g.mapMarkers().find((m) => Math.hypot(m.x - x, m.z - z) * s < 16 * devicePixelRatio);
    const road = g.world.nearestRoad(hit?.x ?? x, hit?.z ?? z, 300);
    this.mapSel = { x: hit?.x ?? road?.x ?? x, z: hit?.z ?? road?.z ?? z, marker: hit, road };
    this.side();
  }

  side() {
    const el = this.$('mapSide'), sel = this.mapSel, g = this.game;
    if (!el) return;
    const places = g.fastTravelPoints();
    el.innerHTML = `
      <div class="ms-sel">${sel ? `
        <h3>${sel.marker?.label ?? sel.road?.road.name ?? 'Off road'}</h3>
        ${sel.marker?.desc ? `<p>${sel.marker.desc}</p>` : ''}
        <p class="dim">${Math.round(Math.hypot(sel.x - g.playerPos().x, sel.z - g.playerPos().z) / 100) / 10} km away</p>
        ${sel.marker?.event ? `<button class="btn pink" data-act="event">Start event</button>` : ''}
        <button class="btn" data-act="route">Set route</button>
        <button class="btn" data-act="travel" ${sel.road ? '' : 'disabled'}>Fast travel</button>` : '<h3>Map</h3><p class="dim">Drag to pan, scroll or pinch to zoom. Click a road or marker to set a route or fast travel.</p>'}
      </div>
      <div class="ms-list"><h4>Fast travel</h4>${places.map((p, i) => `<button class="row" data-ft="${i}"><span>${p.label}</span><i>${p.sub ?? ''}</i></button>`).join('')}</div>`;
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ft !== undefined) { const p = places[+b.dataset.ft]; g.fastTravel(p.x, p.z, p.hdg); this.close(); return; }
      const a = b.dataset.act;
      if (a === 'route') { g.setRoute(sel.x, sel.z); this.close(); }
      if (a === 'travel') { g.fastTravel(sel.x, sel.z); this.close(); }
      if (a === 'event') { this.close(); g.startEvent(sel.marker.event); }
    };
  }

  // ---------------------------------------------------------------- cars
  card(c, owned) {
    const d = this.game.profile.d;
    const cur = d.car === c.id;
    return `<div class="card ${cur ? 'cur' : ''}" data-car="${c.id}" style="--r:${RARITY_COL[c.rarity] ?? '#999'}">
      <div class="c-img"><img src="../hz/thumbs/${c.id}.webp" alt="" loading="lazy" onerror="this.remove()"><span class="c-make">${c.make}</span></div>
      <div class="c-info">${classBadge(c)}<div class="c-name"><b>${c.model}</b><i>${c.year} · ${c.rarity}</i></div></div>
      <div class="c-foot">${owned ? (cur ? '<span class="tag">Driving</span>' : '<span class="tag own">Owned</span>') : `<span class="price">${fmt(c.price)} CR</span>`}<span class="dim">${c.hp} hp · ${c.phys.drive}</span></div>
    </div>`;
  }

  tab_garage(body) { this.carGrid(body, true); }
  tab_autoshow(body) { this.carGrid(body, false); }

  carGrid(body, garage) {
    const P = this.game.profile;
    const f = this.carFilter ?? (this.carFilter = { make: 'All', sort: 'pi' });
    const list = CARS.filter((c) => (garage ? P.owns(c.id) : true) && (f.make === 'All' || c.make === f.make || c.group === f.make));
    list.sort((a, b) => (f.sort === 'price' ? a.price - b.price : f.sort === 'name' ? a.name.localeCompare(b.name) : f.sort === 'year' ? a.year - b.year : a.pi - b.pi));
    const makes = ['All', 'Corvette', ...new Set(CARS.map((c) => c.make))];
    body.innerHTML = `
      <div class="grid-top">
        <div class="chips">${makes.map((m) => `<button class="chip ${f.make === m ? 'on' : ''}" data-make="${m}">${m}</button>`).join('')}</div>
        <select id="carSort"><option value="pi">Sort: Performance</option><option value="price">Sort: Value</option><option value="year">Sort: Year</option><option value="name">Sort: Name</option></select>
      </div>
      <div class="cards">${list.map((c) => this.card(c, P.owns(c.id))).join('') || '<p class="dim">Nothing here yet.</p>'}</div>`;
    this.$('carSort').value = f.sort;
    this.$('carSort').onchange = (e) => { f.sort = e.target.value; this.carGrid(body, garage); };
    body.onclick = (e) => {
      const chip = e.target.closest('[data-make]');
      if (chip) { f.make = chip.dataset.make; this.carGrid(body, garage); return; }
      const card = e.target.closest('[data-car]');
      if (card) this.carDetail(carById(card.dataset.car), garage, () => this.carGrid(body, garage));
    };
  }

  carDetail(c, fromGarage, back) {
    const P = this.game.profile, owned = P.owns(c.id), r = ratings(c);
    const bars = [['Speed', r.speed], ['Handling', r.handling], ['Acceleration', r.accel], ['Launch', r.launch], ['Braking', r.braking], ['Offroad', r.offroad]];
    const m = this.$('modal');
    m.classList.remove('hidden');
    m.innerHTML = `<div class="md car-md" style="--r:${RARITY_COL[c.rarity] ?? '#999'}">
      <div class="md-img"><img src="../hz/thumbs/${c.id}.webp" alt="" onerror="this.remove()"></div>
      <div class="md-info">
        <div class="md-head">${classBadge(c)}<div><h2>${c.year} ${c.make} ${c.model}</h2><p class="rar">${c.rarity} · ${c.country ?? ''}</p></div></div>
        <p class="desc">${c.desc}</p>
        <div class="specs"><span><b>${c.hp}</b> hp</span><span><b>${fmt(c.phys.mass)}</b> kg</span><span><b>${c.phys.drive}</b></span><span><b>${c.engine}</b></span><span><b>${c.vmax ?? '—'}</b> km/h</span></div>
        <div class="bars">${bars.map(([n, v]) => `<div class="bar"><span>${n}</span><i><em style="width:${v * 10}%"></em></i><b>${v.toFixed(1)}</b></div>`).join('')}</div>
        <div class="md-btns">
          ${owned ? `<button class="btn pink" data-a="drive">Drive</button>` : `<button class="btn pink" data-a="buy" ${P.d.credits < c.price ? 'disabled' : ''}>Buy · ${fmt(c.price)} CR</button>`}
          <button class="btn" data-a="back">Back</button>
        </div>
      </div></div>`;
    m.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a && e.target === m) { m.classList.add('hidden'); return; }
      if (a === 'back') { m.classList.add('hidden'); back?.(); }
      if (a === 'buy') {
        if (P.buy(c)) { this.game.sfx('win1'); m.classList.add('hidden'); this.game.hud.note('NEW CAR', `${c.make} ${c.model}`, '#ffb020'); this.carDetail(c, fromGarage, back); }
      }
      if (a === 'drive') { m.classList.add('hidden'); this.close(); await this.game.switchCar(c.id); }
    };
  }

  // ---------------------------------------------------------------- events
  tab_events(body) {
    const g = this.game, P = g.profile.d;
    const evs = g.events?.list ?? [];
    const kinds = [['race', 'Road Racing'], ['street', 'Street Scene'], ['dirt', 'Dirt Racing'], ['circuit', 'Circuit'], ['showcase', 'Showcase'], ['pr', 'PR Stunts']];
    body.innerHTML = `<div class="ev-cols">${kinds.map(([k, n]) => {
      const l = evs.filter((e) => e.kind === k || (k === 'pr' && e.pr));
      if (!l.length) return '';
      return `<div class="ev-col"><h3>${n}</h3>${l.map((e) => {
        const r = P.events[e.id];
        const stars = e.pr ? `<span class="stars">${'★'.repeat(r?.stars ?? 0)}${'☆'.repeat(3 - (r?.stars ?? 0))}</span>` : r?.pos ? `<span class="res">${r.pos === 1 ? '🏆 1st' : `${r.pos}${['', 'st', 'nd', 'rd'][r.pos] ?? 'th'}`}</span>` : '';
        return `<button class="ev" data-ev="${e.id}"><b>${e.name}</b><i>${e.sub ?? ''}</i>${stars}</button>`;
      }).join('')}</div>`;
    }).join('') || '<p class="dim">Events are loading.</p>'}</div>`;
    body.onclick = (e) => {
      const b = e.target.closest('[data-ev]');
      if (!b) return;
      const ev = evs.find((x) => x.id === b.dataset.ev);
      this.close();
      g.startEvent(ev);
    };
  }

  // ---------------------------------------------------------------- settings
  tab_settings(body) {
    const g = this.game, S = g.profile.d.settings, V = g.audio.volumes;
    const sel = (id, label, opts, val) => `<label class="set"><span>${label}</span><select data-set="${id}">${opts.map(([v, n]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    const tog = (id, label, val) => `<label class="set"><span>${label}</span><input type="checkbox" data-set="${id}" ${val ? 'checked' : ''}></label>`;
    const rng = (id, label, val) => `<label class="set"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${val}" data-vol="${id}"></label>`;
    body.innerHTML = `<div class="set-cols">
      <div class="set-col"><h3>Driving</h3>
        ${sel('assists', 'Difficulty', [['assisted', 'Assisted'], ['standard', 'Standard'], ['pro', 'Pro (all off)'], ['custom', 'Custom']], S.assists)}
        ${tog('abs', 'ABS', S.abs)}${tog('tcs', 'Traction control', S.tcs)}${tog('stm', 'Stability control', S.stm)}
        ${sel('steer', 'Steering', [[1, 'Standard'], [0, 'Simulation']], S.steer)}
        ${tog('autoGear', 'Automatic gearbox', S.autoGear)}
        ${sel('line', 'Driving line', [['full', 'Full line'], ['braking', 'Braking only'], ['off', 'Off']], S.line)}
        ${sel('units', 'Units', [['kmh', 'Metric (km/h)'], ['mph', 'Imperial (mph)']], S.units)}
      </div>
      <div class="set-col"><h3>Video</h3>
        ${sel('quality', 'Quality preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], g.quality)}
        <p class="dim">Changing the preset reloads the game.</p>
        ${sel('fov', 'Field of view', [[-8, 'Narrow'], [0, 'Default'], [8, 'Wide'], [16, 'Very wide']], S.fov)}
        ${sel('shake', 'Camera shake', [[0, 'Off'], [0.5, 'Low'], [1, 'Full']], S.shake)}
        <h3>Audio</h3>
        ${rng('master', 'Master', V.master)}${rng('engine', 'Engine', V.engine)}${rng('sfx', 'Effects', V.sfx)}${rng('music', 'Radio', V.music)}
      </div>
      <div class="set-col"><h3>Controls</h3>
        <table class="keys">
          <tr><td>Throttle / brake</td><td>W S · ↑ ↓ · RT LT</td></tr>
          <tr><td>Steer</td><td>A D · ← → · Left stick</td></tr>
          <tr><td>Handbrake</td><td>Space · A</td></tr>
          <tr><td>Shift up / down</td><td>E Q · B X</td></tr>
          <tr><td>Camera</td><td>C · Y</td></tr>
          <tr><td>Look back</td><td>V · R3</td></tr>
          <tr><td>Rewind</td><td>Backspace · View</td></tr>
          <tr><td>Horn</td><td>H · L3</td></tr>
          <tr><td>Radio station</td><td>N · D-pad right</td></tr>
          <tr><td>Reset to road</td><td>R</td></tr>
          <tr><td>Photo mode</td><td>P · D-pad up</td></tr>
          <tr><td>Time of day</td><td>T</td></tr>
          <tr><td>Menu</td><td>Esc · Menu</td></tr>
        </table>
        <button class="btn" data-a="reset">Reset progress</button>
      </div></div>`;
    body.onchange = (e) => {
      const t = e.target;
      if (t.dataset.vol) { V[t.dataset.vol] = +t.value; g.audio.applyVolumes(); return; }
      const k = t.dataset.set;
      if (!k) return;
      const v = t.type === 'checkbox' ? t.checked : t.value;
      if (k === 'quality') { try { localStorage.setItem('hz.quality', v); } catch { /* ignore */ } location.reload(); return; }
      S[k] = ['steer', 'fov', 'shake'].includes(k) ? +v : v;
      if (k === 'assists' && v !== 'custom') {
        const on = v === 'assisted' ? true : v === 'standard' ? null : false;
        if (on !== null) { S.abs = S.tcs = S.stm = on; S.steer = on ? 1 : 0; S.autoGear = true; }
        else { S.abs = true; S.tcs = true; S.stm = false; S.steer = 1; }
      } else if (['abs', 'tcs', 'stm', 'steer', 'autoGear'].includes(k)) S.assists = 'custom';
      g.profile.save();
      g.applySettings();
      if (k === 'assists') this.tab_settings(body);
    };
    body.onclick = (e) => {
      if (e.target.closest('[data-a="reset"]') && confirm('Reset all progress?')) { g.profile.reset(); location.reload(); }
    };
  }
}
