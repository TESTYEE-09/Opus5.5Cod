import { minimapImage, SIZE } from './world.js';
import { STREAKS } from './game.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
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
  }

  reset() {
    this.root.classList.remove('hidden');
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
    const res = a > e ? 'VICTORY' : a < e ? 'DEFEAT' : 'DRAW';
    const el = $('end');
    el.classList.remove('hidden');
    $('endTitle').textContent = res;
    $('endTitle').className = a > e ? 'win' : a < e ? 'lose' : '';
    $('endScore').innerHTML = `<span class="ally">${a}</span> &ndash; <span class="enemy">${e}</span>`;
    const pl = game.player;
    const kd = pl.deaths ? (pl.kills / pl.deaths).toFixed(2) : pl.kills.toFixed(2);
    $('endStats').innerHTML = [['Score', pl.score], ['Kills', pl.kills], ['Deaths', pl.deaths], ['K/D', kd], ['Assists', pl.assists], ['Best streak', pl.bestStreak]]
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
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
      return `<table class="${team === pl.team ? 'ally' : 'enemy'}"><thead><tr><th>${team ? 'OpFor' : 'Rangers'} &middot; ${game.teamScore[team]}</th><th>Score</th><th>K</th><th>D</th><th>A</th></tr></thead><tbody>` +
        rows.map(s => `<tr class="${s === pl ? 'me' : ''}${s.alive ? '' : ' dead'}"><td>${esc(s === pl ? 'You' : s.name)}${s.human || s.isPlayer ? ' &#9679;' : ''}</td><td>${s.score}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td></tr>`).join('') +
        '</tbody></table>';
    };
    return table(pl.team) + table(1 - pl.team);
  }

  update(game, dt, aimed) {
    const pl = game.player, ars = game.arsenal;
    const a = game.teamScore[pl.team], e = game.teamScore[1 - pl.team], lim = game.settings.scoreLimit;
    $('scoreA').textContent = a; $('scoreE').textContent = e;
    $('barA').style.width = `${a / lim * 100}%`; $('barE').style.width = `${e / lim * 100}%`;
    const tl = Math.ceil(game.timeLeft);
    $('timer').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;

    if (pl.alive) {
      const w = ars.w, d = w.def;
      $('wname').textContent = d.name + (d.auto ? '' : d.action ? '' : ' · SEMI');
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
    const scoped = pl.alive && ars.w && ars.w.def.scope && ease > 0.92;
    $('scope').classList.toggle('show', !!scoped);
    $('breath').textContent = scoped ? (ars.holding ? 'HOLDING BREATH' : 'SHIFT: HOLD BREATH') : '';
    const showCross = pl.alive && ease < 0.5 && !pl.sprinting && !game.targeting;
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

    // killstreaks
    const next = STREAKS.find(s => s.kills > pl.streak);
    $('streaks').innerHTML = STREAKS.map(s => {
      const have = pl.rewards.filter(r => r === s.id).length;
      const cls = have ? 'ready' : pl.streak >= s.kills ? 'done' : '';
      return `<div class="sk ${cls}"><kbd>${s.key}</kbd><span>${s.name}</span><em>${have ? (have > 1 ? `x${have}` : 'READY') : s.kills}</em></div>`;
    }).join('') + `<div class="streak-count">Streak ${pl.streak}${next ? ` &middot; ${next.kills - pl.streak} to ${next.name}` : ''}</div>`;

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
    const s = W / 80;
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
      g.fillStyle = v.team === pl.team ? '#6fb0ff' : '#ff4a3a';
      g.fillRect(v.pos.x - 1.8, v.pos.z - 1.8, 3.6, 3.6);
    }
    g.restore();
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.moveTo(W / 2, W / 2 - 8); g.lineTo(W / 2 + 6, W / 2 + 6); g.lineTo(W / 2, W / 2 + 3); g.lineTo(W / 2 - 6, W / 2 + 6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 3, 0, Math.PI * 2); g.stroke();
  }
}
