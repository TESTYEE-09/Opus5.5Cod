// In-drive HUD: tachometer/speedometer, rotating minimap with GPS route, skill chain,
// notifications and race info. Canvas for the gauges and map, DOM for text.
import { HALF, SIZE, coastZ, PLACES } from '../world/layout.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Hud {
  constructor(root, world) {
    this.root = root; this.world = world;
    root.innerHTML = `
      <div class="hud-tl" id="hudTL"></div>
      <div class="hud-race hidden" id="hudRace"><div class="pos" id="rPos"></div><div class="lap" id="rLap"></div><div class="time" id="rTime"></div></div>
      <div class="hud-note" id="hudNote"></div>
      <div class="hud-skill" id="hudSkill"><div class="sk-mult" id="skMult"></div><div class="sk-pts" id="skPts"></div><div class="sk-list" id="skList"></div><div class="sk-bar"><i id="skBar"></i></div></div>
      <div class="hud-feed" id="hudFeed"></div>
      <canvas class="hud-map" id="hudMap" width="440" height="440"></canvas>
      <div class="hud-road" id="hudRoad"></div>
      <canvas class="hud-tacho" id="hudTacho" width="520" height="520"></canvas>
      <div class="hud-center" id="hudCenter"></div>
    `;
    this.tacho = root.querySelector('#hudTacho').getContext('2d');
    this.mapCtx = root.querySelector('#hudMap').getContext('2d');
    this.$ = (id) => root.querySelector('#' + id);
    this.buildMap();
    this.route = null;
    this.markers = [];
    this.noteT = 0;
    this.feed = [];
  }

  // a 2048 px bitmap of the whole map: land, sea, lake and every road
  buildMap() {
    const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const W = this.world, N = W.N;
    const img = g.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const h = W.H[Math.round((j * (N - 1)) / S) * N + Math.round((i * (N - 1)) / S)];
      const o = (j * S + i) * 4;
      const x = -HALF + (i / S) * SIZE, z = -HALF + (j / S) * SIZE;
      const lake = Math.hypot(x - PLACES.lake.x, z - PLACES.lake.z) < PLACES.lake.r && h < PLACES.lake.water;
      if (h < 0 || lake) { img.data[o] = 18; img.data[o + 1] = 40; img.data[o + 2] = 62; }
      else { const k = clamp(0.55 + h / 500, 0.5, 1); img.data[o] = 34 * k; img.data[o + 1] = 44 * k; img.data[o + 2] = 40 * k; }
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const px = (v) => ((v + HALF) / SIZE) * S;
    const col = { expressway: '#ffffff', highway: '#e8e8e8', coast: '#e8e8e8', street: '#c8c8c8', road: '#d0d0d0', touge: '#d0d0d0', circuit: '#ff4d6d', dirt: '#a07850' };
    for (const pass of [0, 1]) for (const r of W.roads) {
      g.beginPath();
      for (let i = 0; i < r.n; i += 2) (i ? g.lineTo : g.moveTo).call(g, px(r.xs[i]), px(r.zs[i]));
      if (r.loop) g.closePath();
      g.lineWidth = pass === 0 ? r.T.hw * 1.1 + 5 : r.T.hw * 1.1;
      g.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.6)' : col[r.type] ?? '#ccc';
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.stroke();
    }
    this.mapImg = c;
    this.mapScale = S / SIZE;
  }

  setRoute(pts) { this.route = pts; }

  note(title, sub = '', color = '#ff2d8a', time = 3.2) {
    const n = this.$('hudNote');
    n.innerHTML = `<b style="background:${color}">${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
    this.noteT = time;
  }

  // right-side feed: "+1,250 XP", "SKILL BANKED"
  pop(text, cls = '') {
    const el = document.createElement('div');
    el.className = `feed-item ${cls}`;
    el.innerHTML = text;
    this.$('hudFeed').prepend(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }

  center(html) { this.$('hudCenter').innerHTML = html ?? ''; }

  update(dt, s) {
    this.drawTacho(s);
    this.drawMap(s);
    if (this.noteT > 0) { this.noteT -= dt; if (this.noteT <= 0) this.$('hudNote').classList.remove('show'); }
    const road = s.road;
    this.$('hudRoad').textContent = road ? road.name : '';
  }

  drawTacho(s) {
    const g = this.tacho, W = 520, cx = 260, cy = 270, R = 200;
    g.clearRect(0, 0, W, W);
    const red = s.redline, max = Math.ceil((red * 1.08) / 1000) * 1000;
    const a0 = Math.PI * 0.72, a1 = Math.PI * 2.28;
    const ang = (rpm) => a0 + (a1 - a0) * clamp(rpm / max, 0, 1);
    // backing disc
    const bg = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.08);
    bg.addColorStop(0, 'rgba(8,6,16,0.72)'); bg.addColorStop(1, 'rgba(8,6,16,0.0)');
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R * 1.08, 0, TAU); g.fill();
    // track and redline
    g.lineCap = 'butt';
    g.lineWidth = 14; g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    g.strokeStyle = 'rgba(255,45,70,0.75)';
    g.beginPath(); g.arc(cx, cy, R, ang(red), a1); g.stroke();
    // live rpm sweep
    const grad = g.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#29e0ff'); grad.addColorStop(0.6, '#b76bff'); grad.addColorStop(1, '#ff2d8a');
    g.strokeStyle = grad; g.lineWidth = 14;
    g.shadowColor = '#ff2d8a'; g.shadowBlur = 18;
    g.beginPath(); g.arc(cx, cy, R, a0, ang(s.rpm)); g.stroke();
    g.shadowBlur = 0;
    // ticks and numbers
    g.fillStyle = '#fff'; g.font = 'italic 700 26px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let r = 0; r <= max; r += 500) {
      const a = ang(r), major = r % 1000 === 0;
      const r0 = R - (major ? 30 : 20), r1 = R - 10;
      g.strokeStyle = r >= red ? '#ff4d6d' : 'rgba(255,255,255,0.85)'; g.lineWidth = major ? 4 : 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      if (major) { g.fillStyle = r >= red ? '#ff4d6d' : '#fff'; g.fillText(String(r / 1000), cx + Math.cos(a) * (R - 52), cy + Math.sin(a) * (R - 52)); }
    }
    // needle
    const a = ang(s.rpm);
    g.strokeStyle = '#ff2d8a'; g.lineWidth = 5; g.shadowColor = '#ff2d8a'; g.shadowBlur = 12;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); g.lineTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4)); g.stroke();
    g.shadowBlur = 0;
    // speed and gear
    g.fillStyle = '#fff';
    g.font = 'italic 800 118px "Barlow Condensed", sans-serif';
    g.fillText(String(Math.round(s.speed)), cx + 6, cy - 4);
    g.font = '700 26px "Barlow Condensed", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(s.unit, cx, cy + 62);
    const shift = s.rpm > red * 0.93 && s.gear > 0;
    g.fillStyle = shift ? '#ff2d8a' : '#fff';
    g.font = 'italic 800 64px "Barlow Condensed", sans-serif';
    g.fillText(s.gear < 0 ? 'R' : s.gear === 0 ? 'N' : String(s.gear), cx + Math.cos(Math.PI * 0.5) * 118, cy + 118);
    if (shift && (performance.now() / 70) % 2 < 1) { g.strokeStyle = '#ff2d8a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R + 18, a0, a1); g.stroke(); }
    // assists / boost
    if (s.boost !== undefined && s.turbo) {
      g.strokeStyle = 'rgba(41,224,255,0.9)'; g.lineWidth = 6;
      g.beginPath(); g.arc(cx, cy, R - 70, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 0.4 * clamp(s.boost, 0, 1)); g.stroke();
    }
  }

  drawMap(s) {
    const g = this.mapCtx, W = 440, c = W / 2;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(c, c, c - 8, 0, TAU); g.clip();
    g.fillStyle = '#0c1014'; g.fillRect(0, 0, W, W);
    const zoom = 1.5 + clamp(s.speedMs / 60, 0, 1) * -0.4; // px per metre on the minimap
    g.translate(c, c);
    g.rotate(Math.PI + s.heading);
    const k = zoom / this.mapScale;
    g.scale(k, k);
    const mx = (s.x + HALF) * this.mapScale, mz = (s.z + HALF) * this.mapScale;
    g.drawImage(this.mapImg, -mx, -mz);
    // GPS route
    if (this.route?.length) {
      g.strokeStyle = '#ff2d8a'; g.lineWidth = 10 / k; g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = '#ff2d8a'; g.shadowBlur = 10;
      g.beginPath();
      this.route.forEach(([x, z], i) => { const px = (x + HALF) * this.mapScale - mx, pz = (z + HALF) * this.mapScale - mz; (i ? g.lineTo : g.moveTo).call(g, px, pz); });
      g.stroke(); g.shadowBlur = 0;
    }
    // markers (events, other cars)
    for (const m of this.markers) {
      const px = (m.x + HALF) * this.mapScale - mx, pz = (m.z + HALF) * this.mapScale - mz;
      g.save(); g.translate(px, pz); g.rotate(-(Math.PI + s.heading)); g.scale(1 / k, 1 / k);
      g.fillStyle = m.color ?? '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, m.r ?? 11, 0, TAU); g.fill(); g.stroke();
      if (m.icon) { g.fillStyle = '#000'; g.font = '700 14px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m.icon, 0, 1); }
      g.restore();
    }
    g.restore();
    // player arrow and ring
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4;
    g.beginPath(); g.arc(c, c, c - 8, 0, TAU); g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = '#ff2d8a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(c, c - 18); g.lineTo(c + 12, c + 14); g.lineTo(c, c + 7); g.lineTo(c - 12, c + 14); g.closePath(); g.fill(); g.stroke();
    // north marker
    const na = Math.PI + s.heading;
    g.fillStyle = '#fff'; g.font = '800 22px "Barlow Condensed"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', c + Math.sin(na) * (c - 28), c - Math.cos(na) * (c - 28));
    void coastZ;
  }
}
