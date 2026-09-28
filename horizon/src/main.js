// Horizon Japan: boot. Loads textures, generates the world in a worker, builds terrain,
// roads, city, forests, water and sky, puts the player's car at the festival, and hands
// over to the Game for the frame loop.
import * as THREE from 'three';
import { Graphics } from './core/graphics.js';
import { Input } from './core/input.js';
import { installFog, Sky } from './world/sky.js';
import { World } from './world/world.js';
import { Terrain, terrainMaterial, splatTexture, noiseTexture } from './world/terrain.js';
import { buildRoads, roadMaterial } from './world/roadmesh.js';
import { buildWater } from './world/water.js';
import { buildCity, buildHouses } from './world/city.js';
import { buildLandmarks } from './world/landmarks.js';
import { PLACES } from './world/layout.js';
import { CARS, carById } from './cars/catalog.js';
import { makeCar } from './cars/factory.js';
import { Forest } from './world/trees.js';
import { scatterTrees } from './world/scatter.js';
import { Collisions } from './physics/collide.js';
import { Hud } from './ui/hud.js';
import { Audio } from './audio/audio.js';
import { Profile } from './game/profile.js';
import { Game } from './game/game.js';

installFog();
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const TIPS = [
  'Hold the brake at a standstill to reverse.',
  'Space pulls the handbrake. Flick it into a hairpin on the Haruna touge.',
  'C cycles cameras: chase, far chase, hood, bumper and cockpit.',
  "The Z06's LT6 is a flat-plane V8. Wind it to 8,600 rpm and listen.",
  'Plug in a controller: triggers for throttle and brake, stick to steer.',
  'Hold Backspace to rewind a mistake.',
  'Drive into a pink beam of light to start a race. Blue beams are PR stunts.',
  'N changes the radio station. P opens photo mode.',
  'Chain drifts, near misses, air and speed for a bigger skill multiplier.',
];
$('ldTip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
const progress = (text, p) => { $('ldText').textContent = text; $('ldFill').style.width = `${Math.round(p * 100)}%`; };
const tick = () => new Promise((r) => setTimeout(r, 0));

const profile = new Profile();
const canvas = $('game');
const gfx = new Graphics(canvas);
const renderer = gfx.renderer;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, 30000);
const touchDevice = matchMedia('(pointer: coarse)').matches;
let quality = q.get('q');
try { quality ??= localStorage.getItem('hz.quality'); } catch { /* storage blocked */ }
quality ??= touchDevice ? 'low' : 'high';
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
      if (e.data.progress !== undefined) progress('Shaping Japan', 0.05 + e.data.progress * 0.5);
      if (e.data.done) { resolve(e.data); w.terminate(); }
    };
    w.postMessage({ N: 2049, seed: 7 });
  });
}

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
  progress('Paving the roads', 0.58);
  await tick();
  const world = new World(data);
  const T = { splat: splatTexture(world), noise: noiseTexture(), grass, grassN, dirt, dirtN, rock, rockN, gravel, gravelN, sand, sandN };
  const terrain = new Terrain(world, terrainMaterial(T));
  scene.add(terrain.group);
  const mats = {
    road: roadMaterial({ asphalt, asphaltN, asphaltR }),
    dirt: new THREE.MeshStandardMaterial({ map: gravel, normalMap: gravelN, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: concrete, color: 0xd8d4cc, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.75, roughness: 0.38 }),
  };
  if (mats.concrete.map) mats.concrete.map.repeat.set(0.25, 0.25);
  const roads = buildRoads(world, mats);
  scene.add(roads.root);
  world.walls = roads.walls;
  progress('Planting forests', 0.66);
  await tick();
  const forest = new Forest(world, scatterTrees(world, gfx.q.trees), { nearRadius: 160 + 100 * gfx.q.trees });
  forest.bakeImpostors(renderer);
  scene.add(forest.group);
  progress('Building Minato', 0.72);
  await tick();
  const city = buildCity(world), houses = buildHouses(world);
  scene.add(city.group, houses.group);
  const marks = buildLandmarks(world, mats);
  scene.add(marks.group);
  const col = new Collisions();
  col.addWalls(world.walls);
  col.addBoxes(city.colliders); col.addBoxes(houses.colliders); col.addBoxes(marks.boxes);
  col.addCircles(marks.circles);
  col.addCircles(forest.list.filter((t) => t.s > 0.75).map((t) => ({ x: t.x, z: t.z, r: 0.12 + 0.16 * t.s, y0: t.y - 1, y1: t.y + 6 })));
  progress('Lighting the sky', 0.78);
  const water = buildWater(world, { waterN });
  scene.add(water);
  const sky = new Sky(renderer);
  sky.addTo(scene);
  sky.setShadowQuality(gfx.q.shadow, gfx.q.shadowExtent);
  sky.time = +(q.get('time') ?? 16.9);

  progress('Warming up the engine', 0.84);
  const id = q.get('car') ?? profile.d.car;
  const entry = carById(profile.owns(id) || q.get('car') ? id : 'c8z06') ?? CARS[0];
  const car = await makeCar(entry, world);
  scene.add(car.vis.group);
  // spawn on the festival road, facing north up the boulevard
  const F = PLACES.festival;
  const sp = world.nearestRoad(F.x, F.z - 120, 400, (r) => r.id === 'festival') ?? world.nearestRoad(F.x, F.z, 800);
  car.veh.reset(new THREE.Vector3(sp.x, sp.y + 0.05, sp.z), sp.road.hdg[sp.i]);
  car.veh.onSubstep = (v) => col.resolveStatic(v);
  terrain.update(new THREE.Vector3(sp.x, sp.y, sp.z), 1e9);

  const hudRoot = $('hud');
  hudRoot.classList.remove('hidden');
  const hud = new Hud(hudRoot, world);
  const input = new Input();
  const audio = new Audio();
  progress('Opening the festival', 0.94);
  await tick();
  const game = window.game = new Game({ scene, camera, gfx, renderer, world, terrain, forest, water, sky, col, hud, input, audio, profile, quality, city, landmarks: marks });
  game.car = car;
  game.applySettings();
  progress('Ready', 1);

  const fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'position:fixed;left:10px;top:10px;font:600 12px monospace;opacity:.45;z-index:6;pointer-events:none';
  if (q.has('fps')) document.body.appendChild(fpsEl);
  let last = performance.now(), fpsT = 0, fpsN = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.update(dt);
    game.frame(dt);
    input.endFrame();
    fpsT += dt; fpsN++;
    if (fpsT > 0.5) { fpsEl.textContent = `${Math.round(fpsN / fpsT)} fps  ${renderer.info.render.triangles} tris  ${renderer.info.render.calls} calls  ${(gfx.dynScale * 100) | 0}%`; fpsT = 0; fpsN = 0; }
    window.__frames = (window.__frames ?? 0) + 1;
    window.__info = { pos: game.car.veh.pos.toArray().map((v) => +v.toFixed(2)), cam: camera.position.toArray().map((v) => +v.toFixed(1)), speed: game.car.veh.speed, gear: game.car.veh.gear, rpm: game.car.veh.rpm, state: game.state };
    requestAnimationFrame(loop);
  };
  $('loading').classList.add('fade');
  if (q.has('skip')) { game.state = 'drive'; game.hud.root.classList.remove('hidden'); } else game.start();
  window.__ready = true;
  requestAnimationFrame(loop);
}

boot().catch((e) => { console.error(e); progress(`Error: ${e.message}`, 1); });
