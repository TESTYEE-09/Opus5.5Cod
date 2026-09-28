// Headless vehicle test bench: 0-100 km/h, quarter mile, top speed, 100-0 braking and skidpad g.
//   node tools/horizon/phystest.mjs [carId]
import * as THREE from 'three';
import { Vehicle } from '../../horizon/src/physics/vehicle.js';
import { CARS } from '../../horizon/src/cars/catalog.js';

const flat = { lastGround: null, ground(x, z) { const g = { h: 0, nx: 0, ny: 1, nz: 0, surface: 0, grip: 1, bump: 0, water: 0 }; this.lastGround = g; return g; } };
const ids = process.argv.slice(2);
const dimsFor = (c) => c.def.dims ?? { len: 4.5, wid: 1.95, hgt: 1.25, wb: 2.7, trackF: 1.62, trackR: 1.6, rF: 0.34, rR: 0.35, wF: 0.26, wR: 0.3 };
for (const c of CARS.filter((c) => !ids.length || ids.includes(c.id))) {
  const v = new Vehicle({ id: c.id, dims: dimsFor(c), phys: c.phys }, flat);
  v.reset(new THREE.Vector3(0, 0, 0), 0);
  const dt = 1 / 60;
  // settle
  for (let i = 0; i < 60; i++) v.update(dt);
  let t = 0, t100 = null, tq = null, vq = 0, top = 0, dist = 0;
  v.input.throttle = 1;
  while (t < 60) {
    v.update(dt); t += dt;
    const kmh = v.speed * 3.6; dist += v.speed * dt;
    if (t100 === null && kmh >= 100) t100 = t;
    if (tq === null && dist >= 402.3) { tq = t; vq = kmh; }
    top = Math.max(top, kmh);
  }
  // braking from 100
  v.reset(new THREE.Vector3(0, 0, 0), 0);
  for (let i = 0; i < 30; i++) v.update(dt);
  v.vel.set(0, 0, 100 / 3.6); for (const w of v.wheels) w.omega = (100 / 3.6) / w.r;
  v.input.throttle = 0; v.input.brake = 1;
  let bd = 0, bt = 0;
  while (v.speed > 0.3 && bt < 10) { v.update(dt); bd += v.speed * dt; bt += dt; }
  // skidpad: constant radius ~ steady lateral g at 60 km/h with steering
  v.reset(new THREE.Vector3(0, 0, 0), 0);
  for (let i = 0; i < 30; i++) v.update(dt);
  v.vel.set(0, 0, 70 / 3.6); for (const w of v.wheels) w.omega = (70 / 3.6) / w.r;
  v.input.brake = 0; v.input.throttle = 0.35; v.input.steer = 0.5; v.assist.counter = 0;
  let latg = 0;
  for (let i = 0; i < 300; i++) { v.update(dt); if (i > 120) latg = Math.max(latg, Math.abs(v.gForce.dot(v.axes[0])) / 9.81); }
  console.log(`${c.id.padEnd(11)} PI ${c.pi} ${c.cls.padEnd(2)} | 0-100 ${t100?.toFixed(2) ?? '-'}s  1/4mi ${tq?.toFixed(2) ?? '-'}s @${vq.toFixed(0)}  top ${top.toFixed(0)} km/h (gear ${v.gear})  | 100-0 ${bd.toFixed(1)} m  | lat ${latg.toFixed(2)} g`);
}
