// Horizon Japan: boot, world build and the main loop.
import * as THREE from 'three';
import { Graphics } from './core/graphics.js';
import { Input } from './core/input.js';
import { CarCamera } from './core/camera.js';
import { installFog, Sky } from './world/sky.js';
import { World } from './world/world.js';
import { Terrain, terrainMaterial, splatTexture, noiseTexture } from './world/terrain.js';
import { buildRoads, roadMaterial } from './world/roadmesh.js';
import { buildWater } from './world/water.js';
import { PLACES } from './world/layout.js';
import { CARS, carById } from './cars/catalog.js';
import { makeCar, syncCar } from './cars/factory.js';

installFog();
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const TIPS = [
  'Hold the brake at a standstill to reverse, just like the festival pros.',
  'Space pulls the handbrake. Flick it into a hairpin on the Haruna touge.',
  'C cycles cameras: chase, far chase, hood, bumper and cockpit.',
  "The Z06's LT6 is a flat-plane V8. Wind it to 8,600 rpm and listen.",
  'Plug in a controller: triggers for throttle and brake, stick to steer.',
];
$('ldTip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
const progress = (text, p) => { $('ldText').textContent = text; $('ldFill').style.width = `${Math.round(p * 100)}%`; };

const canvas = $('game');
const gfx = new Graphics(canvas);
const renderer = gfx.renderer;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, 30000);
const quality = q.get('q') ?? localStorage.getItem('hz.quality') ?? 'high';
gfx.setup(scene, camera, quality);
addEventListener('resize', () => gfx.resize());

const loader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
function tex(url, srgb = true, repeat = true) {
  return new Promise((res) => loader.load(url, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, aniso);
    res(t);
  }, undefined, () => res(null)));
}

function generateWorld() {
  return new Promise((resolve) => {
    const w = new Worker(new URL('./world/genworker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.progress !== undefined) progress('Shaping Japan', 0.05 + e.data.progress * 0.55);
      if (e.data.done) { resolve(e.data); w.terminate(); }
    };
    w.postMessage({ N: 2049, seed: 7 });
  });
}

const game = window.game = { scene, camera, gfx };

async function boot() {
  progress('Loading textures', 0.02);
  const texP = Promise.all([
    tex('../hz/tex/grass_diff.jpg'), tex('../hz/tex/grass_nor.jpg', false), tex('../tex/dry_ground_01_diff.jpg'), tex('../tex/dry_ground_01_nor.jpg', false),
    tex('../tex/rocks_ground_06_diff.jpg'), tex('../tex/rocks_ground_06_nor.jpg', false), tex('../tex/rocky_trail_diff.jpg'), tex('../tex/rocky_trail_nor.jpg', false),
    tex('../hz/tex/sand_diff.jpg'), tex('../hz/tex/sand_nor.jpg', false), tex('../hz/tex/asphalt_diff.jpg'), tex('../hz/tex/asphalt_nor.jpg', false),
    tex('../hz/tex/asphalt_rough.jpg', false), tex('../hz/tex/waternormals.jpg', false), tex('../tex/concrete_wall_008_diff.jpg'),
  ]);
  const data = await generateWorld();
  const [grass, grassN, dirt, dirtN, rock, rockN, gravel, gravelN, sand, sandN, asphalt, asphaltN, asphaltR, waterN, concrete] = await texP;
  progress('Paving the roads', 0.62);
  await new Promise((r) => setTimeout(r, 0));
  const world = new World(data);
  game.world = world;
  const T = { splat: splatTexture(world), noise: noiseTexture(), grass, grassN, dirt, dirtN, rock, rockN, gravel, gravelN, sand, sandN };
  const terrain = new Terrain(world, terrainMaterial(T));
  scene.add(terrain.group);
  const mats = {
    road: roadMaterial({ asphalt, asphaltN, asphaltR }),
    dirt: new THREE.MeshStandardMaterial({ map: gravel, normalMap: gravelN, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: concrete, color: 0xd8d4cc, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.75, roughness: 0.38 }),
  };
  mats.concrete.map && (mats.concrete.map.repeat.set(0.25, 0.25));
  const roads = buildRoads(world, mats);
  scene.add(roads.root);
  world.walls = roads.walls;
  progress('Lighting the sky', 0.75);
  const water = buildWater(world, { waterN });
  scene.add(water);
  const sky = new Sky(renderer);
  sky.addTo(scene);
  sky.setShadowQuality(gfx.q.shadow, gfx.q.shadowExtent);
  sky.time = +(q.get('time') ?? 16.8);
  game.sky = sky;

  progress('Warming up the engine', 0.82);
  const entry = carById(q.get('car') ?? localStorage.getItem('hz.car') ?? 'c8z06') ?? CARS[0];
  const car = await makeCar(entry, world);
  scene.add(car.vis.group);
  game.car = car;
  // spawn on the festival road, facing north up the boulevard
  const F = PLACES.festival;
  const sp = world.nearestRoad(F.x, F.z - 120, 400, (r) => r.id === 'festival') ?? world.nearestRoad(F.x, F.z, 800);
  const hdg = sp.road.hdg[sp.i] + (q.get('rev') ? Math.PI : 0);
  car.veh.reset(new THREE.Vector3(sp.x, sp.y + 0.05, sp.z), hdg);
  const debugCam = q.get('cam')?.split(',').map(Number);
  // build the fine terrain around the spawn before the first frame
  terrain.update(new THREE.Vector3(sp.x, sp.y, sp.z), 1e9);
  const input = new Input();
  const ccam = new CarCamera(camera, world);
  game.input = input; game.ccam = ccam;
  progress('Ready', 1);

  // HUD (placeholder until the full HUD module)
  const hud = $('hud');
  hud.classList.remove('hidden');
  hud.innerHTML = '<div id="spd" style="position:fixed;right:40px;bottom:30px;text-align:right;font:italic 800 64px Barlow Condensed;text-shadow:0 2px 12px #000"><span id="spdN">0</span><small style="font-size:22px"> KM/H</small><div id="gear" style="font-size:30px;color:#ff2d8a">N</div><div style="width:220px;height:8px;background:#0006;margin-top:6px"><i id="rpm" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#29e0ff,#ff2d8a)"></i></div></div><div id="fps" style="position:fixed;left:10px;top:10px;font:600 14px monospace;opacity:.6"></div>';

  let last = performance.now(), fpsT = 0, fpsN = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.update(dt);
    const veh = car.veh;
    veh.input.throttle = input.state.throttle; veh.input.brake = input.state.brake; veh.input.steer = input.state.steer; veh.input.handbrake = input.state.handbrake; veh.input.steerRate = input.state.steerRate;
    if (input.took('KeyC') || input.took('pad:3')) ccam.next();
    if (input.took('KeyE') || input.took('pad:5')) veh.shift(1);
    if (input.took('KeyQ') || input.took('pad:4')) veh.shift(-1);
    if (input.took('KeyR')) {
      const p = veh.modelPosition(new THREE.Vector3());
      const n = world.nearestRoad(p.x, p.z, 500);
      if (n) veh.reset(new THREE.Vector3(n.x, n.y + 0.3, n.z), n.hdg);
    }
    if (input.took('KeyT')) sky.time = (sky.time + 1) % 24;
    veh.update(dt);
    syncCar(car);
    car.vis.setLights({ head: sky.night > 0.2 ? 1 : 0, tail: sky.night > 0.2 ? 1 : 0.15, brake: veh.input.brake > 0.1 && veh.gear > 0 ? 1 : 0, reverse: veh.gear < 0 ? 1 : 0 });
    if (debugCam) { camera.position.set(debugCam[0], debugCam[1], debugCam[2]); camera.lookAt(debugCam[3], debugCam[4], debugCam[5]); }
    else ccam.update(dt, car);
    sky.update(dt, camera.position, scene, +(q.get('ts') ?? 0));
    terrain.update(camera.position);
    for (const m of water.userData.mats) m.userData.uniforms.uTime.value += dt;
    $('spdN').textContent = Math.round(veh.speed * 3.6);
    $('gear').textContent = veh.gear < 0 ? 'R' : veh.gear === 0 ? 'N' : veh.gear;
    $('rpm').style.width = `${Math.min(100, (veh.rpm / entry.phys.engine.redline) * 100)}%`;
    gfx.render(dt, { speed: Math.min(1, Math.max(0, (veh.speed - 20) / 60)), blur: 0.5 });
    gfx.adapt(dt);
    fpsT += dt; fpsN++;
    if (fpsT > 0.5) { $('fps').textContent = `${Math.round(fpsN / fpsT)} fps  ${renderer.info.render.triangles} tris  ${renderer.info.render.calls} calls  ${(gfx.dynScale * 100) | 0}%`; fpsT = 0; fpsN = 0; }
    input.endFrame();
    window.__frames = (window.__frames ?? 0) + 1;
    window.__info = { pos: car.veh.pos.toArray().map((v) => +v.toFixed(2)), cam: camera.position.toArray().map((v) => +v.toFixed(1)), speed: car.veh.speed, gear: car.veh.gear, rpm: car.veh.rpm };
    requestAnimationFrame(loop);
  };
  $('loading').classList.add('fade');
  window.__ready = true;
  requestAnimationFrame(loop);
}

boot().catch((e) => { console.error(e); progress(`Error: ${e.message}`, 1); });
