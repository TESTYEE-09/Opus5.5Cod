// Dev-only turntable for checking car bodies: viewer.html?car=c8z06&view=34f
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { CARS } from './cars/catalog.js';
import { CarVisual, carTextures } from './cars/car.js';
import { GlbCar } from './cars/glbcar.js';

const q = new URLSearchParams(location.search);
const id = q.get('car') ?? 'c8z06';
const view = q.get('view') ?? '34f';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = +(q.get('exp') ?? 1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343a);
const cam = new THREE.PerspectiveCamera(+(q.get('fov') ?? 30), innerWidth / innerHeight, 0.05, 100);
const pm = new THREE.PMREMGenerator(renderer);
const hdr = await new HDRLoader().loadAsync(q.get('hdri') ?? '../hz/hdri/photo_studio_loft_hall_2k.hdr');
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = pm.fromEquirectangular(hdr).texture;
scene.environmentIntensity = 1.0;
if (q.get('bg') === 'hdri') scene.background = hdr;
const sun = new THREE.DirectionalLight(0xfff2e0, 2.0);
sun.position.set(4, 8, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -4; sun.shadow.camera.right = sun.shadow.camera.top = 4;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.55 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const entry = CARS.find((c) => c.id === id);
const opts = { carbonTex: carTextures(new THREE.TextureLoader()), color: q.get('color') ? parseInt(q.get('color'), 16) : undefined };
const car = entry.def.model ? new GlbCar(entry.def, opts) : new CarVisual(entry.def, opts);
await car.ready;
car.setLights({ head: +(q.get('lights') ?? 0), tail: +(q.get('lights') ?? 0), brake: +(q.get('brake') ?? 0) });
scene.add(car.group);
const L = entry.def.dims?.len ?? car.meta?.dims.len ?? 4.5;
const dist = +(q.get('dist') ?? L * 1.9);
const views = {
  side: [dist, 0.7, 0], front: [0, 0.7, dist], rear: [0, 0.8, -dist], top: [0, dist, 0.01],
  '34f': [dist * 0.62, dist * 0.28, dist * 0.72], '34r': [-dist * 0.62, dist * 0.3, -dist * 0.72], low: [dist * 0.7, 0.35, dist * 0.55],
  detailf: [0.8, 0.9, 3.8], detailr: [-0.9, 1.1, -3.9], wheel: [2.2, 0.5, 1.6],
};
const v = views[view] ?? views['34f'];
cam.position.set(...v);
cam.lookAt(0, view === 'top' ? 0 : 0.55, view === 'wheel' ? 1.3 : 0);
if (q.get('spin')) car.group.rotation.y = +q.get('spin');
renderer.render(scene, cam);
requestAnimationFrame(() => { renderer.render(scene, cam); window.__ready = true; });
