import * as THREE from 'three';
import { minimapImage, SIZE, sites } from './world.js';
import { STREAKS, CALLS, TEAM_NAMES } from './game.js';
import { vehicleName } from './vehicles.js';
import { OBJECTIVES } from './modes.js';
import { addXP } from './rank.js';
import { finishMatch, describe } from './challenges.js';
import { CAMOS } from './camo.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const _pv = new THREE.Vector3();
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class Hud {
  constructor(audio) {
    this.audio = audio;
    this.root = $('hud');
    this.cross = $('crosshair');
    this.hitEl = $('hitmarker');
    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.indicators = $('indicators');
    this.dmg = [];
    this.nadeEls = [];
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'nade-ind';
      el.innerHTML = '<span>&#9679;</span>';
      this.indicators.appendChild(el);
      this.nadeEls.push(el);
    }
    this.hitT = 0; this.bannerT = 0; this.toastT = 0; this.popT = 0; this.heartT = 0; this.sbT = 0;
    this.feedItems = [];
    this.popLines = [];
    this.showScores = false;
    this.vc = $('vcanvas');
    this.vctx = this.vc.getContext('2d');
    this.vKind = null; this.vHitT = 0; this.statT = 0; this.useText = '';
    this.big = $('bigmap'); this.bigCtx = this.big.getContext('2d'); this.bigOn = false; this.bigT = 0;
    this.modeT = 0;
  }

  toggleMap() { this.bigOn = !this.bigOn; this.big.classList.toggle('hidden', !this.bigOn); }

  // the mode's panels: Ground War flags, Undercover objectives and suspicion, Hold-F progress
  drawMode(game, dt) {
    const m = game.mode, pl = game.player;
    const gw = m.kind === 'gw', uc = m.kind === 'uc';
    this.root.classList.toggle('mode-gw', gw); this.root.classList.toggle('mode-uc', uc);
    const it = game.interact;
    $('actbar').classList.toggle('show', !!it && pl.alive);
    if (it) { $('actText').textContent = it.text; $('actFill').style.width = `${Math.min(1, (game.actT || 0) / it.time) * 100}%`; }
    if ((this.modeT -= dt) > 0) return;
    this.modeT = 0.12;
    if (gw) {
      $('flagsRow').innerHTML = m.flags.map(f => {
        const mine = pl.team === 0 ? f.cap : -f.cap;
        const own = f.owner < 0 ? 'neutral' : f.owner === pl.team ? 'ally' : 'enemy';
        const fill = `<i class="${mine >= 0 ? 'ally' : 'enemy'}" style="height:${Math.abs(mine) * 100}%"></i>`;
        const here = Math.hypot(pl.pos.x - f.x, pl.pos.z - f.z) < 10 && pl.alive;
        return `<span class="fl ${own}${f.contest ? ' contested' : ''}${here ? ' here' : ''}">${fill}<b>${f.id}</b></span>`;
      }).join('');
    }
    if (uc) {
      const cur = m.current;
      $('objList').innerHTML = OBJECTIVES.map((o, i) => {
        let t = o.text;
        if (o.id === 'sam') t += ` (${['sam1', 'sam2'].filter(k => { const s = sites.find(x => x.kind === k); return s && m.planted?.has(k); }).length}/2 charges)`;
        if (o.id === 'exfil' && m.exfilT > 0) t += ` · ${Math.ceil(m.exfilT)}s`;
        return `<li class="${m.done[i] ? 'done' : i === cur ? 'cur' : ''}">${esc(t)}</li>`;
      }).join('');
      const v = m.susp.get(pl.id) || 0;
      let state = 'UNDERCOVER', cls = 'calm';
      if (m.alarm) { state = 'ALARM: HUNTED'; cls = 'alarm'; } else if (m.radio) { state = `COMPROMISED · RADIO ${Math.ceil(m.radio.t)}s`; cls = 'made'; } else if (v > 1) { state = 'SUSPICIOUS'; cls = 'sus'; } else if (m.caution) state = 'UNDERCOVER · HIGH ALERT';
      $('suspState').textContent = state;
      $('susp').className = cls;
      $('suspBar').style.width = `${m.alarm ? 100 : v}%`;
    }
    // Ground War: choose a spawn while dead
    if (!pl.alive && gw) {
      const opts = m.spawnOptions(pl.team);
      $('spawnSel').innerHTML = 'Spawn at: ' + opts.map((o, i) => `<span class="${(game.spawnChoice || 'auto') === o.id ? 'on' : ''}"><kbd>${i + 1}</kbd> ${o.id === 'base' ? 'Base' : o.id}</span>`).join(' ') +
        `${game.spawnChoice ? '' : ' <em>(auto: front line)</em>'}`;
    } else $('spawnSel').innerHTML = '';
  }

  // world markers on the overlay canvas: flags, the objective, suspicious guards
  drawMarkers(game, ctx, W, H) {
    const m = game.mode, pl = game.player, cam = game.camera;
    if (m.kind === 'tdm') return;
    const proj = (x, y, z, clamp) => {
      _pv.set(x, y, z).project(cam);
      let sx = _pv.x, sy = _pv.y;
      const behind = _pv.z > 1;
      if (behind) { if (!clamp) return null; sx = -sx; sy = -sy; }
      const off = behind || Math.abs(sx) > 0.94 || Math.abs(sy) > 0.9;
      if (off) { if (!clamp) return null; const k = Math.max(Math.abs(sx) / 0.94, Math.abs(sy) / 0.9); sx /= k; sy /= k; }
      return [(sx + 1) / 2 * W, (1 - sy) / 2 * H, off];
    };
    const dist = (x, z) => Math.round(Math.hypot(x - pl.pos.x, z - pl.pos.z));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (m.kind === 'gw') {
      for (const f of m.flags) {
        const d = dist(f.x, f.z);
        if (d < 9) continue;
        const p = proj(f.x, 3, f.z, false);
        if (!p) continue;
        const col = f.owner < 0 ? '#e8e8e8' : f.owner === pl.team ? '#6fb0ff' : '#ff5a4a';
        const r = Math.max(9, 15 - d / 60);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(10,12,14,0.55)'; ctx.beginPath(); ctx.arc(p[0], p[1], r + 2, 0, 7); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.stroke();
        if (f.contest) { ctx.strokeStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(p[0], p[1], r + 4, 0, 7); ctx.stroke(); }
        ctx.fillStyle = col; ctx.font = `700 ${Math.round(r * 1.2)}px Rajdhani, sans-serif`; ctx.fillText(f.id, p[0], p[1] + 1);
        ctx.font = '600 12px Rajdhani, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(`${d}m`, p[0], p[1] + r + 11);
        ctx.globalAlpha = 1;
      }
      return;
    }
    // Undercover: the objective, clamped to the screen edge
    const mk = m.marker();
    if (mk) {
      const p = proj(mk.x, mk.y ?? 1.5, mk.z, true);
      if (p) {
        const [x, y] = p, s = 11;
        ctx.fillStyle = 'rgba(10,12,14,0.5)'; ctx.beginPath(); ctx.moveTo(x, y - s - 3); ctx.lineTo(x + s + 3, y); ctx.lineTo(x, y + s + 3); ctx.lineTo(x - s - 3, y); ctx.fill();
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#ffd24a'; ctx.font = '700 13px Rajdhani, sans-serif'; ctx.fillText(mk.label, x, y - s - 11);
        ctx.font = '600 12px Rajdhani, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(`${dist(mk.x, mk.z)}m`, x, y + s + 11);
      }
    }
    // "?" over guards who are sizing you up, "!" over those who have made you
    const v = m.susp.get(pl.id) || 0;
    for (const id of m.watch.get(pl.id) || []) {
      const b = game.byId.get(id);
      if (!b?.alive) continue;
      const p = proj(b.pos.x, b.pos.y + 2.25, b.pos.z, false);
      if (!p) continue;
      ctx.globalAlpha = 0.35 + 0.65 * v / 100;
      ctx.font = '800 24px Rajdhani, sans-serif'; ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText('?', p[0], p[1]); ctx.fillText('?', p[0], p[1]);
    }
    ctx.globalAlpha = 1;
    for (const id of m.hostileIds()) {
      const b = game.byId.get(id);
      if (!b?.alive || b.pos.distanceTo(pl.pos) > 70) continue;
      const p = proj(b.pos.x, b.pos.y + 2.25, b.pos.z, false);
      if (!p) continue;
      ctx.font = '800 26px Rajdhani, sans-serif'; ctx.fillStyle = '#ff4a3a'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText('!', p[0], p[1]); ctx.fillText('!', p[0], p[1]);
    }
  }

  // M: the whole map, north up
  drawBigMap(game) {
    const c = this.big, g = this.bigCtx, pl = game.player, m = game.mode;
    const S = Math.floor(Math.min(innerHeight * 0.84, innerWidth * 0.62));
    if (c.width !== S) { c.width = c.height = S; }
    const k = S / SIZE;
    g.fillStyle = '#16171a'; g.fillRect(0, 0, S, S);
    g.imageSmoothingEnabled = true; g.globalAlpha = 0.95;
    g.drawImage(minimapImage(), 0, 0, S, S);
    g.globalAlpha = 1;
    const P = (x, z) => [x * k, z * k];
    const label = (x, z, text, col, r = 9) => {
      const [px, pz] = P(x, z);
      g.fillStyle = 'rgba(10,12,14,0.7)'; g.beginPath(); g.arc(px, pz, r + 2, 0, 7); g.fill();
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(px, pz, r, 0, 7); g.stroke();
      g.fillStyle = col; g.font = `700 ${r + 3}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, px, pz + 1);
    };
    if (m.kind === 'gw') for (const f of m.flags) label(f.x, f.z, f.id, f.owner < 0 ? '#e8e8e8' : f.owner === pl.team ? '#6fb0ff' : '#ff5a4a', 11);
    if (m.kind === 'uc') {
      const mk = m.marker();
      if (mk) label(mk.x, mk.z, '◆', '#ffd24a', 10);
    }
    const uav = game.uav[pl.team] > 0;
    for (const e of game.soldiers) {
      if (!e.alive || e === pl) continue;
      const [x, z] = P(e.pos.x, e.pos.z);
      if (e.team === pl.team) { g.fillStyle = '#6fb0ff'; g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill(); } else if (uav || game.time - e.firedT < 1.2) { g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill(); }
    }
    for (const v of game.vehicles) {
      if (!v.alive || (v.team !== pl.team && !uav && v.kind === 'drone')) continue;
      const [x, z] = P(v.pos.x, v.pos.z);
      g.fillStyle = v.team === pl.team ? '#6fb0ff' : '#ff4a3a'; g.fillRect(x - 4, z - 4, 8, 8);
    }
    const [x, z] = P(pl.pos.x, pl.pos.z), yaw = pl.alive ? pl.yaw : game.deathYaw;
    g.save(); g.translate(x, z); g.rotate(-yaw);
    g.fillStyle = '#ffd24a'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '600 13px Rajdhani, sans-serif'; g.textAlign = 'left';
    g.fillText(`${SIZE} m  ·  M to close`, 10, S - 12);
  }

  vehicleHit() { this.vHitT = 0.25; }

  // vehicle HUD panel, and the overlay canvas used by vehicles and the Stinger seeker
  drawVehicle(game, dt) {
    const pl = game.player, v = pl.alive ? pl.vehicle : null, kind = v ? v.kind : null;
    if (kind !== this.vKind) {
      this.vKind = kind;
      $('vhud').classList.toggle('hidden', !v);
      this.root.classList.toggle('invehicle', !!v);
      if (v) { $('vname').textContent = v.name.toUpperCase(); $('vhelp').textContent = v.help; }
    }
    const c = this.vc, W = innerWidth, H = innerHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = this.vctx;
    ctx.clearRect(0, 0, W, H);
    const cam = game.camera;
    const P = (p) => {
      _pv.copy(p).project(cam);
      if (_pv.z > 1 || _pv.z < -1) return null;
      return [(_pv.x + 1) / 2 * W, (1 - _pv.y) / 2 * H];
    };
    if (v) {
      v.drawHud(ctx, W, H, P, game);
      const hp = Math.max(0, v.health / v.maxHealth);
      $('vhp').style.width = `${hp * 100}%`;
      $('vhp').className = hp < 0.3 ? 'low' : '';
      if ((this.statT -= dt) <= 0) { this.statT = 0.1; $('vstats').innerHTML = v.stats(); }
      if (this.vHitT > 0) {
        this.vHitT -= dt;
        ctx.fillStyle = `rgba(255,60,30,${this.vHitT})`;
        ctx.fillRect(0, 0, W, H);
      }
      const warn = v.missileWarn > 0 && v.kind !== 'jet';
      $('vwarn').classList.toggle('show', warn);
      if (warn && (this.warnT = (this.warnT || 0) - dt) <= 0) { this.warnT = 0.18; this.audio.tone(1500, 0.08, 0.1); }
      return;
    }
    $('vwarn').classList.remove('show');
    const ars = game.arsenal;
    if (pl.alive && ars.lockTarget) {
      const s = P(ars.lockTarget.pos);
      if (s) {
        const k = ars.locked ? 1 : Math.min(1, ars.lockT / ars.w.def.lock);
        const r = 46 - 22 * k;
        ctx.strokeStyle = ars.locked ? 'rgba(255,70,50,1)' : 'rgba(255,220,120,0.95)';
        ctx.lineWidth = ars.locked ? 3 : 2;
        ctx.strokeRect(s[0] - r, s[1] - r, r * 2, r * 2);
        ctx.font = '700 15px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(ars.locked ? 'LOCKED' : 'LOCKING', s[0], s[1] + r + 18);
      }
    }
  }

  reset() {
    this.root.classList.remove('hidden');
    this.bigOn = false; this.big.classList.add('hidden'); this.modeT = 0;
    $('killfeed').innerHTML = '';
    this.feedItems = [];
    this.dmg.forEach(d => d.el.remove());
    this.dmg = [];
    $('popups').innerHTML = '';
    this.popLines = [];
    this.hint('');
    this.hideDeath();
    $('end').classList.add('hidden');
    $('banner').className = '';
  }

  hitmarker(kill, head) {
    this.hitEl.className = 'show' + (kill ? ' kill' : head ? ' head' : '');
    this.hitT = kill ? 0.35 : 0.2;
  }

  damageFrom(pos, pl) {
    const el = document.createElement('div');
    el.className = 'dmg-ind';
    this.indicators.appendChild(el);
    this.dmg.push({ el, x: pos.x, z: pos.z, t: 1.6 });
    if (this.dmg.length > 6) this.dmg.shift().el.remove();
  }

  popup(lines) {
    const box = $('popups');
    for (const [text, pts] of lines) {
      const el = document.createElement('div');
      el.innerHTML = `<b>+${pts}</b> ${esc(text)}`;
      box.appendChild(el);
      this.popLines.push({ el, t: 2.2 });
    }
    while (this.popLines.length > 5) this.popLines.shift().el.remove();
  }

  banner(title, sub, kind) {
    const b = $('banner');
    b.innerHTML = `<div class="t">${esc(title)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}`;
    b.className = 'show ' + kind;
    this.bannerT = 3.2;
  }

  toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('show'); this.toastT = 1.6; }
  hint(text) { const h = $('hint'); h.textContent = text; h.classList.toggle('show', !!text); }

  feed(killer, victim, weapon, head, pl) {
    const name = (s) => {
      if (!s) return '';
      const cls = s === pl ? 'me' : s.team === pl.team ? 'ally' : 'enemy';
      return `<span class="${cls}">${esc(s === pl ? 'You' : s.name)}</span>`;
    };
    const el = document.createElement('div');
    el.className = 'feed';
    const k = killer && killer !== victim ? name(killer) + ' ' : '';
    el.innerHTML = `${k}<span class="w">[${esc(weapon)}${head ? ' &#10006;' : ''}]</span> ${name(victim)}`;
    $('killfeed').prepend(el);
    this.feedItems.push({ el, t: 6 });
    while (this.feedItems.length > 6) this.feedItems.shift().el.remove();
  }

  showDeath(killer, weapon, pl) {
    $('death').classList.remove('hidden');
    $('deathBy').innerHTML = killer ? `Killed by <b class="${killer.team === pl.team ? 'ally' : 'enemy'}">${esc(killer.name)}</b> &middot; ${esc(weapon)}` : `You killed yourself &middot; ${esc(weapon)}`;
  }

  hideDeath() { $('death').classList.add('hidden'); }

  showEnd(game) {
    const a = game.teamScore[game.player.team], e = game.teamScore[1 - game.player.team];
    const uc = game.mode.kind === 'uc';
    const win = uc ? game.mode.result === 'complete' : a > e;
    const res = uc ? (win ? 'MISSION COMPLETE' : 'MISSION FAILED') : a > e ? 'VICTORY' : a < e ? 'DEFEAT' : 'DRAW';
    const el = $('end');
    el.classList.remove('hidden');
    $('endTitle').textContent = res;
    $('endTitle').className = win ? 'win' : (uc || a < e) ? 'lose' : '';
    const pl = game.player;
    const kd = pl.deaths ? (pl.kills / pl.deaths).toFixed(2) : pl.kills.toFixed(2);
    if (uc) {
      const m = game.mode, t = Math.round(game.time);
      $('endScore').innerHTML = `<span class="ally">${m.done.filter(Boolean).length}</span> / ${m.done.length} objectives`;
      $('endStats').innerHTML = [['Score', pl.score], ['Kills', pl.kills], ['Deaths', pl.deaths], ['Time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`], ['Alarms raised', m.alarms], ['Best streak', pl.bestStreak]]
        .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    } else {
      $('endScore').innerHTML = `<span class="ally">${a}</span> &ndash; <span class="enemy">${e}</span>`;
      $('endStats').innerHTML = [['Score', pl.score], ['Kills', pl.kills], ['Deaths', pl.deaths], ['K/D', kd], ['Assists', pl.assists], ['Best streak', pl.bestStreak]]
        .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    }
    const day = finishMatch({ win, score: pl.score });
    const xp = addXP((pl.score + (win ? (uc ? 3000 : 1000) : 250)) * day.mult + day.challengeXp);
    const bonus = [day.mult > 1 ? `&times;${day.mult.toFixed(1)} (first match today${day.streak > 1 ? `, ${day.streak}-day streak` : ''})` : '',
      ...day.earned.map(c => `${esc(describe(c))} +${c.xp.toLocaleString()}`)].filter(Boolean);
    $('endXp').innerHTML = `+${xp.gained.toLocaleString()} XP &middot; Rank ${xp.after.level} ${esc(xp.after.title)}` +
      (bonus.length ? `<small class="bonus">${bonus.join(' &middot; ')}</small>` : '') +
      (xp.promoted ? ` <b class="promo">PROMOTED</b>` : '') +
      CAMOS.filter(c => c.rank > xp.before.level && c.rank <= xp.after.level).map(c => ` <b class="promo">${c.name.toUpperCase()} CAMO UNLOCKED</b>`).join('') +
      (xp.after.next ? `<span class="xpbar"><i style="width:${Math.round(xp.after.cur / xp.after.next * 100)}%"></i></span>` : '');
    $('endBoard').innerHTML = this.boardHtml(game);
    $('again').classList.toggle('hidden', game.role === 'client');
    $('endNote').textContent = game.role === 'client' ? 'Waiting for the host to start the next match.' : game.role === 'host' ? 'Play again restarts the match for everyone in the lobby.' : '';
    this.root.classList.add('hidden');
    $('scoreboard').classList.add('hidden');
    this.hideDeath();
  }

  boardHtml(game) {
    const pl = game.player;
    const table = (team) => {
      const rows = game.soldiers.filter(s => s.team === team).sort((x, y) => y.score - x.score);
      return `<table class="${team === pl.team ? 'ally' : 'enemy'}"><thead><tr><th>${TEAM_NAMES[team]} &middot; ${game.teamScore[team]}</th><th>Score</th><th>K</th><th>D</th><th>A</th></tr></thead><tbody>` +
        rows.map(s => `<tr class="${s === pl ? 'me' : ''}${s.alive ? '' : ' dead'}"><td>${esc(s === pl ? 'You' : s.name)}${s.human || s.isPlayer ? ' &#9679;' : ''}</td><td>${s.score}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td></tr>`).join('') +
        '</tbody></table>';
    };
    return table(pl.team) + table(1 - pl.team);
  }

  update(game, dt, aimed) {
    const pl = game.player, ars = game.arsenal;
    const a = game.teamScore[pl.team], e = game.teamScore[1 - pl.team], lim = Math.min(game.settings.scoreLimit, 9999);
    $('scoreA').textContent = a; $('scoreE').textContent = e;
    $('nameA').textContent = TEAM_NAMES[pl.team]; $('nameE').textContent = TEAM_NAMES[1 - pl.team];
    $('barA').style.width = `${a / lim * 100}%`; $('barE').style.width = `${e / lim * 100}%`;
    const tl = Math.ceil(game.timeLeft);
    $('timer').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;

    if (pl.alive) {
      const w = ars.w, d = w.def;
      $('wname').textContent = d.name + (d.auto || d.action || d.launcher ? '' : d.burst ? ' · BURST' : ' · SEMI');
      $('mag').textContent = w.mag;
      $('mag').className = w.mag <= Math.ceil(d.mag * 0.25) ? 'low' : '';
      $('reserve').textContent = w.reserve;
      $('nades').innerHTML = '<i></i>'.repeat(ars.frags);
      let hint = '';
      if (w.mag === 0 && w.reserve === 0) hint = 'NO AMMO';
      else if (ars.reload) hint = 'RELOADING';
      else if (w.mag <= Math.ceil(d.mag * 0.25)) hint = 'PRESS R TO RELOAD';
      $('ammoHint').textContent = hint;
      $('hpbar').style.width = `${pl.health}%`;
      $('hpbar').className = pl.health < 35 ? 'low' : '';
      if (ars.cook) $('cook').style.width = `${(1 - ars.cook.t / 3.5) * 100}%`;
      $('cookbar').classList.toggle('show', !!ars.cook);
    }
    const hurt = pl.alive ? 1 - pl.health / 100 : 1;
    $('vignette').style.opacity = Math.min(1, hurt * 1.25);
    if (pl.alive && pl.health < 35) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 0.9; this.audio.heartbeat(); }
    }

    // crosshair
    const ease = ars.adsEase ? ars.adsEase() : 0;
    const ov = pl.alive && !pl.vehicle && ars.w ? (ars.w.def.scope ? 'sniper' : ars.w.def.overlay) : null;
    const scoped = ov && ease > 0.92;
    $('scope').className = scoped ? `show ${ov}` : '';
    $('breath').textContent = scoped && ov === 'sniper' ? (ars.holding ? 'HOLDING BREATH' : 'SHIFT: HOLD BREATH') : '';
    const showCross = pl.alive && !pl.vehicle && ease < 0.5 && !pl.sprinting && !game.targeting;
    this.cross.style.display = showCross ? '' : 'none';
    if (showCross) {
      const spread = ars.spread(pl) * DEG;
      const gap = Math.tan(spread) / Math.tan(game.camera.fov * DEG / 2) * (innerHeight / 2);
      this.cross.style.setProperty('--gap', `${Math.max(3, gap)}px`);
    }
    const enemyAimed = aimed && aimed.team !== pl.team;
    this.cross.classList.toggle('enemy', !!enemyAimed);
    $('aimName').textContent = aimed ? aimed.name : '';
    $('aimName').className = aimed ? (aimed.team === pl.team ? 'ally' : 'enemy') : '';
    $('target').classList.toggle('show', game.targeting);

    if (this.hitT > 0 && (this.hitT -= dt) <= 0) this.hitEl.className = '';

    // indicators
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.t -= dt;
      if (d.t <= 0) { d.el.remove(); this.dmg.splice(i, 1); continue; }
      const ang = Math.atan2(-(d.x - pl.pos.x), -(d.z - pl.pos.z)) - (pl.alive ? pl.yaw : game.deathYaw);
      d.el.style.transform = `rotate(${-ang}rad) translateY(-120px)`;
      d.el.style.opacity = Math.min(1, d.t);
    }
    let ni = 0;
    if (pl.alive) for (const g of game.grenades) {
      if (ni >= this.nadeEls.length) break;
      const dist = g.pos.distanceTo(pl.pos);
      if (dist > 8) continue;
      const el = this.nadeEls[ni++];
      const ang = Math.atan2(-(g.pos.x - pl.pos.x), -(g.pos.z - pl.pos.z)) - pl.yaw;
      el.style.display = 'block';
      el.style.transform = `rotate(${-ang}rad) translateY(-90px) rotate(${ang}rad)`;
      el.classList.toggle('close', dist < 4);
    }
    for (; ni < this.nadeEls.length; ni++) this.nadeEls[ni].style.display = 'none';

    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      if ((f.t -= dt) <= 0) { f.el.remove(); this.feedItems.splice(i, 1); }
      else if (f.t < 1) f.el.style.opacity = f.t;
    }
    for (let i = this.popLines.length - 1; i >= 0; i--) {
      const p = this.popLines[i];
      if ((p.t -= dt) <= 0) { p.el.remove(); this.popLines.splice(i, 1); }
      else if (p.t < 0.5) p.el.style.opacity = p.t * 2;
    }
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $('banner').className = '';
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').classList.remove('show');

    this.drawVehicle(game, dt);
    this.drawMarkers(game, this.vctx, this.vc.width, this.vc.height);
    this.drawMode(game, dt);
    if (this.bigOn && (this.bigT -= dt) <= 0) { this.bigT = 0.1; this.drawBigMap(game); }
    const use = game.useNear ? `Press F to use ${game.useNear.name}` : '';
    if (use !== this.useText) { this.useText = use; $('use').textContent = use; $('use').classList.toggle('show', !!use); }

    // killstreaks and vehicle call-ins
    const next = STREAKS.find(s => s.kills > pl.streak);
    $('streaks').innerHTML = STREAKS.map(s => {
      const have = pl.rewards.filter(r => r === s.id).length;
      const cls = have ? 'ready' : pl.streak >= s.kills ? 'done' : '';
      return `<div class="sk ${cls}"><kbd>${s.key}</kbd><span>${s.name}</span><em>${have ? (have > 1 ? `x${have}` : 'READY') : s.kills}</em></div>`;
    }).join('') + `<div class="streak-count">Streak ${pl.streak}${next ? ` &middot; ${next.kills - pl.streak} to ${next.name}` : ''}</div>` +
      CALLS.map(c => {
        const cd = pl.vcool?.[c.id] || 0;
        return `<div class="sk call ${cd > 0 ? '' : 'ready'}"><kbd>${c.key}</kbd><span>${c.id === 'drone' ? c.name : vehicleName(c.id, game.player.team)}</span><em>${cd > 0 ? `${Math.ceil(cd)}s` : 'READY'}</em></div>`;
      }).join('');

    if (!pl.alive) $('respawnIn').textContent = `Respawning in ${Math.max(0, game.deadT).toFixed(1)}`;

    $('uavTag').className = game.uav[pl.team] > 0 ? 'show ally' : game.uav[1 - pl.team] > 0 ? 'show enemy' : '';
    $('uavTag').textContent = game.uav[pl.team] > 0 ? 'UAV' : 'ENEMY UAV';

    this.drawMinimap(game);

    if (this.showScores) {
      this.sbT -= dt;
      if (this.sbT <= 0) { this.sbT = 0.25; $('scoreboard').innerHTML = this.boardHtml(game); }
    }
    $('scoreboard').classList.toggle('hidden', !this.showScores);
  }

  drawMinimap(game) {
    const c = this.mm, g = this.mmCtx, W = c.width, pl = game.player;
    const yaw = pl.alive ? pl.yaw : game.deathYaw;
    const s = W / (pl.vehicle?.air ? 240 : pl.vehicle ? 120 : 80);
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#23241f'; g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2); g.rotate(yaw); g.scale(s * 1.35, s * 1.35); g.translate(-pl.pos.x, -pl.pos.z);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.85;
    g.drawImage(minimapImage(), 0, 0, SIZE, SIZE);
    g.globalAlpha = 1;
    const uav = game.uav[pl.team] > 0;
    for (const e of game.soldiers) {
      if (!e.alive || e === pl) continue;
      if (e.team === pl.team) {
        const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
        g.fillStyle = '#6fb0ff';
        g.beginPath();
        g.moveTo(e.pos.x + fx * 1.8, e.pos.z + fz * 1.8);
        g.lineTo(e.pos.x - fx * 1.1 + fz * 1.1, e.pos.z - fz * 1.1 - fx * 1.1);
        g.lineTo(e.pos.x - fx * 1.1 - fz * 1.1, e.pos.z - fz * 1.1 + fx * 1.1);
        g.fill();
      } else if (uav || game.time - e.firedT < 1.2) {
        g.fillStyle = '#ff4a3a';
        g.beginPath(); g.arc(e.pos.x, e.pos.z, 1.2, 0, Math.PI * 2); g.fill();
      }
    }
    for (const v of game.vehicles) {
      if (!v.alive || (v.kind === 'drone' && v.team !== pl.team && !uav)) continue;
      g.fillStyle = v.team === pl.team ? '#6fb0ff' : '#ff4a3a';
      g.fillRect(v.pos.x - 1.8, v.pos.z - 1.8, 3.6, 3.6);
    }
    const md = game.mode, u = 1 / (s * 1.35);
    const pin = (x, z, text, col) => {
      g.save(); g.translate(x, z); g.rotate(-yaw); g.scale(u, u);
      g.fillStyle = 'rgba(10,12,14,0.75)'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.stroke();
      g.fillStyle = col; g.font = '700 11px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 1);
      g.restore();
    };
    if (md.kind === 'gw') for (const f of md.flags) pin(f.x, f.z, f.id, f.owner < 0 ? '#e8e8e8' : f.owner === pl.team ? '#6fb0ff' : '#ff5a4a');
    if (md.kind === 'uc') { const mk = md.marker(); if (mk) pin(mk.x, mk.z, '◆', '#ffd24a'); }
    g.restore();
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.moveTo(W / 2, W / 2 - 8); g.lineTo(W / 2 + 6, W / 2 + 6); g.lineTo(W / 2, W / 2 + 3); g.lineTo(W / 2 - 6, W / 2 + 6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2); g.stroke();
  }
}
