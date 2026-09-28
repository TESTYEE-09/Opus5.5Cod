import * as THREE from 'three';
import { Vehicle } from '../../horizon/src/physics/vehicle.js';
import { CARS } from '../../horizon/src/cars/catalog.js';
const flat = { lastGround: null, ground() { const g = { h: 0, nx: 0, ny: 1, nz: 0, surface: 0, grip: 1, bump: 0, water: 0 }; this.lastGround = g; return g; } };
const c = CARS.find((c) => c.id === (process.argv[2] ?? 'c8z06'));
for (const steer of [0.05, 0.1, 0.2, 0.35, 0.6, 1.0]) {
  const v = new Vehicle({ id: c.id, dims: c.def.dims, phys: c.phys }, flat);
  v.reset(new THREE.Vector3(), 0); v.assist.counter = 0; v.assist.stm = false;
  for (let i = 0; i < 30; i++) v.update(1 / 60);
  v.vel.set(0, 0, 25); for (const w of v.wheels) w.omega = 25 / w.r;
  v.input.throttle = 0.3; v.input.steer = steer;
  let yaw = 0, lat = 0;
  const hist = [];
  for (let i = 0; i < 240; i++) {
    v.update(1 / 60);
    // hold speed ~25 m/s with a simple controller
    v.input.throttle = Math.max(0, Math.min(1, 0.3 + (25 - v.speed) * 0.3));
    if (i > 150) { yaw += v.angVel.y; lat += v.speed * v.angVel.y / 9.81; hist.push(v.wheels.map((w) => w.slipAngle.toFixed(3)).join(',')); }
  }
  const n = 89;
  console.log(`steer ${steer} angle ${(v.steerAngle * 57.3).toFixed(1)}deg speed ${v.speed.toFixed(1)} yawrate ${(yaw / n).toFixed(3)} lat ${(lat / n).toFixed(2)}g  Fz ${v.wheels.map((w) => w.Fz.toFixed(0)).join('/')}  Fy ${v.wheels.map((w) => w.Fy.toFixed(0)).join('/')} slipA ${hist[hist.length - 1]}`);
}
