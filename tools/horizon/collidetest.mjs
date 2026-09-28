// Headless collision checks: head-on into a building, a glancing guardrail scrape, car vs car.
//   node tools/horizon/collidetest.mjs
import * as THREE from 'three';
import { Vehicle } from '../../horizon/src/physics/vehicle.js';
import { Collisions } from '../../horizon/src/physics/collide.js';
import { carById } from '../../horizon/src/cars/catalog.js';

const flat = { lastGround: null, ground() { const g = { h: 0, nx: 0, ny: 1, nz: 0, surface: 0, grip: 1, bump: 0, water: 0 }; this.lastGround = g; return g; } };
const c = carById('c8z06');
const mk = () => { const v = new Vehicle({ id: c.id, dims: c.def.dims, phys: c.phys }, flat); return v; };
const dt = 1 / 60;

function run(name, setup, frames, report) {
  const col = new Collisions();
  const cars = setup(col);
  for (const v of cars) v.onSubstep = (vv) => col.resolveStatic(vv);
  const log = [];
  for (let f = 0; f < frames; f++) {
    for (const v of cars) v.update(dt);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) col.resolvePair(cars[i], cars[j]);
    for (const v of cars) for (const e of v.events) if (e.type === 'hit') log.push(`f${f} hit ${e.kind} ${e.speed.toFixed(1)} m/s`);
  }
  console.log(`--- ${name}\n${log.slice(0, 6).join('\n')}\n${report(cars)}`);
}

run('head-on into a wall at 30 m/s', (col) => {
  col.addBoxes([{ x: 0, z: 40, hx: 20, hz: 5, rot: 0, y0: -1, y1: 20 }]);
  const v = mk(); v.reset(new THREE.Vector3(0, 0, 0), 0);
  for (let i = 0; i < 30; i++) v.update(dt);
  v.vel.set(0, 0, 30); for (const w of v.wheels) w.omega = 30 / w.r;
  return [v];
}, 120, ([v]) => { const p = v.modelPosition(new THREE.Vector3()); return `front at z=${(p.z + c.def.dims.len / 2).toFixed(2)} (wall face 35) v=${v.vel.z.toFixed(2)} yaw=${v.angVel.y.toFixed(2)}`; });

run('glancing 15° into a guardrail at 40 m/s', (col) => {
  col.addWalls([{ ax: 3, az: -50, bx: 3, bz: 400, y0: -0.5, y1: 0.9, rail: true }]);
  const v = mk(); v.reset(new THREE.Vector3(0, 0, 0), 0.26);
  for (let i = 0; i < 30; i++) v.update(dt);
  const f = new THREE.Vector3(Math.sin(0.26), 0, Math.cos(0.26)).multiplyScalar(40);
  v.vel.copy(f); for (const w of v.wheels) w.omega = 40 / w.r;
  v.input.throttle = 0.3;
  return [v];
}, 150, ([v]) => { const p = v.modelPosition(new THREE.Vector3()); return `x=${p.x.toFixed(2)} (rail at 3, max x ~ ${(3 - c.def.dims.wid * 0.47).toFixed(2)}) speed=${v.speed.toFixed(1)} heading=${(Math.atan2(v.axes[2].x, v.axes[2].z) * 57.3).toFixed(1)}°`; });

run('T-bone: car into a stationary car at 20 m/s', (col) => {
  const a = mk(); a.reset(new THREE.Vector3(0, 0, 0), 0);
  const b = mk(); b.reset(new THREE.Vector3(0, 0, 15), Math.PI / 2);
  for (let i = 0; i < 30; i++) { a.update(dt); b.update(dt); }
  a.vel.set(0, 0, 20); for (const w of a.wheels) w.omega = 20 / w.r;
  return [a, b];
}, 90, ([a, b]) => `a v=${a.vel.toArray().map((x) => x.toFixed(1))} b v=${b.vel.toArray().map((x) => x.toFixed(1))} b yawrate=${b.angVel.y.toFixed(2)} gap=${(b.pos.z - a.pos.z).toFixed(2)}`);
