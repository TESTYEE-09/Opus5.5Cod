// Peer-to-peer multiplayer over WebRTC (PeerJS). The host's browser runs the match:
// bots, damage, score and killstreaks. Clients move their own soldier, report hits,
// and draw everything else from the host's 20 Hz snapshots.
import * as THREE from 'three';
import { Peer } from 'peerjs';
import { buildSoldier, setRelation, animateSoldier, animateDeath } from './bots.js';
import { buildChopper, chopperHit } from './streaks.js';

const PREFIX = 'frontline-opus55cod-';
const RATE = 1 / 20;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS = 12;

const r2 = (v) => Math.round(v * 100) / 100;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (a) => Array.isArray(a) && a.length >= 3 ? new THREE.Vector3(num(a[0]), num(a[1]), num(a[2])) : null;
export const cleanName = (s) => String(s ?? '').replace(/[^\w .-]/g, '').trim().slice(0, 16) || 'Player';
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// A soldier moved by the network: a remote human on the host, or any other soldier on a client.
export class NetSoldier {
  constructor(game, id, team, name, human, remote) {
    Object.assign(this, { game, id, team, name, human, isRemote: remote, isNet: true });
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.tgt = new THREE.Vector3();
    this.yaw = 0; this.tYaw = 0; this.pitch = 0; this.crouchAmt = 0; this.tCrouch = 0;
    this.alive = false; this.health = 100; this.protect = 0; this.lastHurt = -99;
    this.damagers = new Map(); this.rewards = [];
    this.kills = 0; this.deaths = 0; this.assists = 0; this.score = 0; this.streak = 0; this.bestStreak = 0;
    this.firedT = -99; this.walkPhase = 0; this.deathT = 0; this.fallDir = 1; this.respawnT = 0;
    this.model = buildSoldier(team, name);
    this.model.root.visible = false;
    game.scene.add(this.model.root);
    setRelation(this.model, team === game.player.team);
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z); this.tgt.set(x, y, z);
    this.yaw = this.tYaw = yaw;
    this.alive = true; this.health = 100; this.protect = 1.5; this.lastHurt = -99;
    this.damagers.clear();
    const r = this.model.root;
    r.visible = true; r.rotation.set(0, yaw, 0); r.position.copy(this.pos);
  }

  setState(x, y, z, yaw, pitch, crouch) {
    this.tgt.set(x, y, z); this.tYaw = yaw; this.pitch = pitch; this.tCrouch = crouch;
  }

  aimPoint(out, head) {
    return out.set(this.pos.x, this.pos.y + (head ? 1.62 - 0.5 * this.crouchAmt : 1.2 - 0.35 * this.crouchAmt), this.pos.z);
  }

  eye(out) { return out.set(this.pos.x, this.pos.y + 1.6 - 0.5 * this.crouchAmt, this.pos.z); }

  die() {
    this.alive = false; this.deathT = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    this.respawnT = 4;
  }

  update(dt) {
    if (!this.alive) {
      animateDeath(this.model, this, dt);
      if (this.isRemote && (this.respawnT -= dt) <= 0) this.game.respawnRemote(this);
      return;
    }
    const px = this.pos.x, pz = this.pos.z;
    if (this.pos.distanceTo(this.tgt) > 4) this.pos.copy(this.tgt);
    else this.pos.lerp(this.tgt, 1 - Math.exp(-dt * 14));
    this.vel.set((this.pos.x - px) / Math.max(dt, 1e-3), 0, (this.pos.z - pz) / Math.max(dt, 1e-3));
    this.yaw = wrap(this.yaw + wrap(this.tYaw - this.yaw) * Math.min(1, dt * 16));
    this.crouchAmt += (this.tCrouch - this.crouchAmt) * Math.min(1, dt * 12);
    if (this.protect > 0) this.protect -= dt;
    if (this.isRemote && this.game.time - this.lastHurt > 4 && this.health < 100) this.health = Math.min(100, this.health + 40 * dt);
    animateSoldier(this.model, this, dt);
  }

  remove() { this.game.scene.remove(this.model.root); }
}

// A killstreak helicopter as a client sees it.
export class NetVehicle {
  constructor(game, id, team) {
    Object.assign(this, { game, id, team, isVehicle: true, alive: true, name: 'Attack Chopper' });
    this.pos = new THREE.Vector3(); this.tgt = new THREE.Vector3(); this.heading = 0; this.tHeading = 0; this.fresh = true;
    this.m = buildChopper(team);
    game.scene.add(this.m.g);
    this.sound = game.audio.rotor();
  }
  hit(o, d, maxT) { return chopperHit(this.pos, o, d, maxT); }
  aimPoint(out) { return out.copy(this.pos); }
  update(dt) {
    if (this.fresh) { this.pos.copy(this.tgt); this.fresh = false; }
    this.pos.lerp(this.tgt, 1 - Math.exp(-dt * 10));
    this.heading = wrap(this.heading + wrap(this.tHeading - this.heading) * Math.min(1, dt * 8));
    this.m.g.position.copy(this.pos);
    this.m.g.rotation.set(-0.08, this.heading, 0, 'YXZ');
    this.m.rotor.rotation.y += dt * 28;
    this.m.tail.rotation.x += dt * 35;
    this.sound.set(this.pos);
  }
  remove() { this.alive = false; this.game.scene.remove(this.m.g); this.sound.stop(); }
}

export class Net {
  // ui: { lobby(state), started(), error(msg), closed(msg) }
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.isHost = false;
    this.peer = null;
    this.clients = new Map(); // host: id -> { conn, name, team }
    this.nextId = 1;
    this.mode = 'versus';
    this.sendT = 0;
    this.myId = 0;
    this.name = 'Player';
  }

  get active() { return !!this.peer; }

  host(name) {
    this.isHost = true;
    this.name = cleanName(name);
    return new Promise((resolve, reject) => {
      const attempt = (tries) => {
        const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
        const peer = new Peer(PREFIX + code, { debug: 0 });
        peer.on('open', () => { this.peer = peer; this.code = code; resolve(code); this.pushLobby(); });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && tries > 0) { peer.destroy(); attempt(tries - 1); return; }
          if (!this.peer) reject(new Error(describe(e)));
          else this.ui.error(describe(e));
        });
        peer.on('connection', (conn) => this.accept(conn));
        peer.on('disconnected', () => { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); });
      };
      attempt(3);
    });
  }

  join(code, name) {
    this.isHost = false;
    this.name = cleanName(name);
    this.code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 0 });
      let settled = false;
      const fail = (msg) => {
        if (!settled) { settled = true; reject(new Error(msg)); peer.destroy(); }
        else if (this.peer === peer) { this.leave(); this.ui.closed(msg); }
      };
      peer.on('error', (e) => fail(describe(e)));
      peer.on('open', () => {
        this.peer = peer;
        const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => conn.send({ t: 'hello', name: this.name }));
        conn.on('data', (d) => {
          if (d?.t === 'welcome') { settled = true; this.myId = num(d.id); resolve(); }
          if (d?.t === 'full') { fail('That game is full.'); return; }
          this.onClientData(d);
        });
        conn.on('close', () => fail('The host left the game.'));
      });
      setTimeout(() => { if (!settled) fail('Could not reach that game. Check the code and try again.'); }, 15000);
    });
  }

  leave() {
    if (this.isHost) this.broadcast({ t: 'bye' });
    const p = this.peer;
    this.peer = null; this.conn = null;
    this.clients.clear();
    if (p) setTimeout(() => p.destroy(), 200);
  }

  // ---------- host ----------
  accept(conn) {
    conn.on('data', (d) => {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'hello') {
        if (this.clients.size + 1 >= MAX_PLAYERS) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
        const id = this.nextId++;
        const c = { conn, name: cleanName(d.name), team: 0 };
        this.clients.set(id, c);
        conn.peerId = id;
        conn.send({ t: 'welcome', id });
        if (this.game.state === 'playing') {
          c.team = this.pickTeam();
          this.game.addRemote(id, c.name, c.team);
          this.sendStart(id);
        }
        this.pushLobby();
        return;
      }
      const id = conn.peerId;
      if (id) this.onHostData(id, d);
    });
    conn.on('close', () => {
      const id = conn.peerId;
      if (!id || !this.clients.has(id)) return;
      this.clients.delete(id);
      if (this.game.state === 'playing') this.game.removeRemote(id);
      this.pushLobby();
    });
  }

  pickTeam() {
    if (this.mode === 'coop') return 0;
    const count = [0, 0];
    for (const s of this.game.soldiers) if (s.isPlayer || s.human) count[s.team]++;
    return count[0] <= count[1] ? 0 : 1;
  }

  members() {
    return [{ id: 0, name: this.name, host: true }, ...[...this.clients].map(([id, c]) => ({ id, name: c.name }))];
  }

  pushLobby() {
    const state = { t: 'lobby', code: this.code, mode: this.mode, members: this.members(), playing: this.game.state === 'playing' };
    this.broadcast(state);
    this.ui.lobby(state);
  }

  setMode(mode) { this.mode = mode === 'coop' ? 'coop' : 'versus'; this.pushLobby(); }

  startGame(settings) {
    const members = this.members();
    const humans = members.map((m, i) => ({ id: m.id, name: m.name, team: this.mode === 'coop' ? 0 : i % 2, me: m.id === 0 }));
    for (const h of humans) if (h.id) this.clients.get(h.id).team = h.team;
    this.game.startMatch({ ...settings, name: this.name }, humans);
    for (const id of this.clients.keys()) this.sendStart(id);
    this.pushLobby();
  }

  sendStart(id) {
    const g = this.game, c = this.clients.get(id);
    if (!c?.conn.open) return;
    c.conn.send({ t: 'start', you: id, rules: { scoreLimit: g.settings.scoreLimit, timeLimit: g.settings.timeLimit, timeLeft: g.timeLeft }, roster: g.rosterList(), score: g.teamScore });
  }

  broadcast(msg) {
    for (const c of this.clients.values()) if (c.conn.open) c.conn.send(msg);
  }

  onHostData(id, d) {
    const g = this.game, s = g.byId.get(id);
    if (g.state !== 'playing' || !s) return;
    switch (d.t) {
      case 'st':
        if (s.alive) {
          const p = vec(d.p);
          if (p) s.setState(p.x, p.y, p.z, num(d.y), num(d.pi), Math.max(0, Math.min(1, num(d.c))));
        }
        break;
      case 'hit': {
        if (!s.alive) break;
        const v = g.byId.get(d.id) || g.vehicles.find(x => x.id === d.id);
        if (v) g.damage(v, Math.max(0, Math.min(250, num(d.d))), s, String(d.w ?? '').slice(0, 20), !!d.h, s.pos);
        break;
      }
      case 'fire':
        if (!s.alive) break;
        s.firedT = g.time;
        g.noise(s, s.pos, 45);
        g.remoteShot(s, d);
        break;
      case 'nade': {
        const p = vec(d.p), v = vec(d.v);
        if (p && v && s.alive) g.spawnGrenade(p, v.clampLength(0, 30), Math.max(0.02, Math.min(3.5, num(d.f, 3.5))), s);
        break;
      }
      case 'streak': {
        const i = s.rewards.indexOf(d.id);
        if (i < 0 || !s.alive) break;
        s.rewards.splice(i, 1);
        g.useStreak(s, d.id, vec(d.p), num(d.yaw));
        break;
      }
      case 'took':
        g.takePickup(num(d.id, -1), s);
        break;
    }
  }

  snapshot() {
    const g = this.game;
    return {
      t: 'snap', tl: r2(g.timeLeft), sc: g.teamScore, uav: g.uav.map(r2),
      s: g.soldiers.map(s => [s.id, r2(s.pos.x), r2(s.pos.y), r2(s.pos.z), r2(s.yaw), r2(s.pitch || 0), r2(s.crouchAmt),
        s.alive ? 1 : 0, Math.max(0, Math.round(s.health)), s.kills, s.deaths, s.assists, s.score, s.streak]),
      v: g.vehicles.filter(v => v.alive).map(v => [v.id, v.team, r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r2(v.heading)]),
      n: g.grenades.map(n => [r2(n.pos.x), r2(n.pos.y), r2(n.pos.z)]),
      ev: g.events.splice(0),
    };
  }

  flush() { if (this.isHost && this.peer) this.broadcast(this.snapshot()); }

  // ---------- client ----------
  onClientData(d) {
    if (!d || typeof d !== 'object') return;
    const g = this.game;
    if (d.t === 'lobby') this.ui.lobby(d);
    else if (d.t === 'start') { g.startClient(d, this.myId); this.ui.started(); }
    else if (d.t === 'snap' && g.state === 'playing') g.applySnapshot(d);
    else if (d.t === 'snap' && Array.isArray(d.ev)) { for (const ev of d.ev) if (ev?.k === 'end') g.applyEvent(ev); }
    else if (d.t === 'bye') this.ui.closed('The host ended the session.');
  }

  send(msg) { if (this.conn?.open) this.conn.send(msg); }

  tick(dt) {
    if (!this.peer) return;
    this.sendT += dt;
    if (this.sendT < RATE) return;
    this.sendT = 0;
    if (this.isHost) { if (this.clients.size) this.broadcast(this.snapshot()); else this.game.events.length = 0; return; }
    const pl = this.game.player;
    this.send({ t: 'st', p: [r2(pl.pos.x), r2(pl.pos.y), r2(pl.pos.z)], y: r2(pl.yaw), pi: r2(pl.pitch), c: r2(pl.crouchAmt) });
  }
}

function describe(e) {
  switch (e?.type) {
    case 'peer-unavailable': return 'No game with that code is running.';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return 'Could not reach the matchmaking server. Check your connection.';
    case 'browser-incompatible': return 'This browser does not support WebRTC.';
    default: return e?.message || 'Connection error.';
  }
}
