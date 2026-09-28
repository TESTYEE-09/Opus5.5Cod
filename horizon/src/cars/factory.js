// Builds a drivable car: the visual (procedural body or imported model) and the physics spec
// with dimensions taken from the body def or measured from the model's wheels.
import * as THREE from 'three';
import { CarVisual, carTextures } from './car.js';
import { GlbCar } from './glbcar.js';
import { Vehicle } from '../physics/vehicle.js';

const texLoader = new THREE.TextureLoader();

export async function makeCar(entry, world, opts = {}) {
  const def = entry.def;
  const vis = def.model ? new GlbCar(def, opts) : new CarVisual(def, { carbonTex: carTextures(texLoader), ...opts });
  await vis.ready;
  let dims = def.dims;
  if (!dims) {
    const m = vis.meta, w = m.wheels;
    dims = {
      len: m.dims.len, wid: m.dims.wid * 0.94, hgt: m.dims.hgt,
      wb: (w[0].c[2] + w[1].c[2]) / 2 - (w[2].c[2] + w[3].c[2]) / 2,
      trackF: Math.abs(w[0].c[0] - w[1].c[0]), trackR: Math.abs(w[2].c[0] - w[3].c[0]),
      rF: (w[0].r + w[1].r) / 2, rR: (w[2].r + w[3].r) / 2, wF: 0.26, wR: 0.3,
      // wheel centres may sit a little off the wheelbase midpoint
      zOff: ((w[0].c[2] + w[1].c[2]) / 2 + (w[2].c[2] + w[3].c[2]) / 2) / 2,
    };
  }
  const spec = { id: entry.id, dims, phys: entry.phys };
  const veh = world ? new Vehicle(spec, world) : null;
  return { entry, vis, veh, dims };
}

// copy the physics state onto the visual
const _p = new THREE.Vector3();
export function syncCar(car) {
  const { vis, veh } = car;
  veh.modelPosition(_p);
  vis.group.position.copy(_p);
  vis.group.quaternion.copy(veh.quat);
  const spin = [], susp = [];
  for (const w of veh.wheels) { spin.push(w.spin); susp.push(w.comp - w.load0 / w.k); }
  vis.updateWheels(spin, veh.steerAngle, susp);
}
