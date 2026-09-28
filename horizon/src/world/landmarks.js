// Landmarks and roadside detail: Mt. Fuji and the distant ranges, the senbon torii tunnel on
// the Shrine Road, the five-storey pagoda, a great torii standing in Lake Kawa, the Horizon
// festival site (arch, stage, tents, lanterns and a Ferris wheel), utility poles with sagging
// wires along the country lanes, street lights on the expressway and city streets, stone
// lanterns, vending machines and flooded rice paddies. Everything solid returns a collider.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLACES } from './layout.js';
import { addFog } from './sky.js';
import { mulberry } from './noise.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
export const LAMPS = { uNight: { value: 0 } };

function inst(geo, mat, list, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach(([x, y, z, ry = 0, sx = 1, sy = 1, sz = 1], i) => { _q.setFromAxisAngle(UP, ry); m.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))); });
  m.count = list.length;
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);
const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }));

// a glowing material that lights up at night (lamps, windows, lanterns)
function nightGlow(color, day = 0.15, night = 3) {
  const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: day, roughness: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = LAMPS.uNight;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(${day.toFixed(2)}, ${night.toFixed(2)}, uNight) / ${day.toFixed(2)};`);
  };
  return m;
}

// torii: two pillars, kasagi (top beam with upswept ends), shimaki, nuki (tie beam), gakuzuka
function toriiGeo(w, h, t = 1) {
  const r = 0.16 * t * (h / 4);
  const parts = [
    cyl(r, r * 1.1, h, -w / 2, h / 2, 0), cyl(r, r * 1.1, h, w / 2, h / 2, 0),
    box(w + 0.9 * t, 0.22 * t, 0.34 * t, 0, h * 0.78, 0),
    box(w * 0.18, h * 0.12, 0.14 * t, 0, h * 0.86, 0),
  ];
  // kasagi: segments bending upward at the ends
  const n = 9, L = w + 1.8 * t;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n - 0.5, x = u * L;
    const lift = Math.pow(Math.abs(u) * 2, 2.2) * 0.28 * t;
    parts.push(box(L / n + 0.02, 0.26 * t, 0.42 * t, x, h + lift, 0));
  }
  parts.push(box(L * 0.96, 0.14 * t, 0.36 * t, 0, h - 0.2 * t, 0));
  const g = merge(parts);
  return g;
}

export function buildLandmarks(world, mats) {
  const group = new THREE.Group(); group.name = 'landmarks';
  const boxes = [], circles = [];
  const rnd = mulberry(77);
  const H = (x, z) => world.terrainHeight(x, z);
  const vermilion = new THREE.MeshStandardMaterial({ color: 0xd8401e, roughness: 0.55 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.85 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8b8a84, roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.7 });

  // ------------------------------------------------ Mt. Fuji and distant ranges (backdrop)
  {
    const fuji = new THREE.CylinderGeometry(260, 5200, 3600, 96, 24, true);
    const pos = fuji.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 1800, x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      // concave flanks and ridges
      const k = y / 3600;
      const rr = Math.hypot(x, z) * (1 - 0.35 * Math.sin(k * Math.PI) * 0.5) * (1 + 0.03 * Math.sin(a * 13) * (1 - k));
      pos.setXYZ(i, Math.cos(a) * rr, y - 1800, Math.sin(a) * rr);
      const snow = k > 0.62 + 0.06 * Math.sin(a * 9) + 0.04 * Math.sin(a * 23);
      col.push(...(snow ? [0.93, 0.95, 1] : [0.28, 0.33, 0.42]));
    }
    fuji.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    fuji.computeVertexNormals();
    const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const f = new THREE.Mesh(fuji, fm);
    f.position.set(-7800, 1800 - 40, -15500);
    f.scale.setScalar(1.15);
    group.add(f);
    // far ranges: low, hazy ridges all round
    const rng = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2, d = 9000 + rnd() * 5000;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 3000 && Math.abs(x) < 9000) continue; // the sea to the south
      const h = 500 + rnd() * 900, r = 1800 + rnd() * 2200;
      rng.push(new THREE.ConeGeometry(r, h, 7 + ((rnd() * 5) | 0), 1).translate(x, h / 2 - 60, z));
    }
    const rm = new THREE.Mesh(merge(rng), new THREE.MeshStandardMaterial({ color: 0x3c4a44, roughness: 1, flatShading: true }));
    group.add(rm);
  }

  // ------------------------------------------------ senbon torii along the Shrine Road
  const shrineRoad = world.roads.find((r) => r.id === 'shrine');
  if (shrineRoad) {
    const w = (shrineRoad.T.hw + shrineRoad.T.shoulder) * 2 + 0.8;
    const g = toriiGeo(w, 5.2);
    const list = [];
    const i0 = Math.floor(shrineRoad.n * 0.35);
    for (let i = i0; i < shrineRoad.n - 8; i += 2) {
      const x = shrineRoad.xs[i], z = shrineRoad.zs[i], hd = shrineRoad.hdg[i];
      list.push([x, shrineRoad.ys[i] - 0.1, z, hd + Math.PI / 2]);
      for (const s of [-1, 1]) circles.push({ x: x + Math.cos(hd) * (w / 2) * s, z: z - Math.sin(hd) * (w / 2) * s, r: 0.22, y0: shrineRoad.ys[i] - 1, y1: shrineRoad.ys[i] + 6, kind: 'post' });
    }
    // rotate so the beam spans the road: the geometry's width is along x
    const im = inst(g, vermilion, list.map(([x, y, z, ry]) => [x, y, z, ry - Math.PI / 2]));
    group.add(im);
  }

  // ------------------------------------------------ five-storey pagoda on the shrine hill
  {
    const S = PLACES.shrine, x0 = S.x + 18, z0 = S.z - 30, y0 = H(x0, z0);
    const parts = [], roofs = [];
    let y = 1.2, w = 9;
    parts.push(box(12, 1.2, 12, 0, 0.6, 0));
    for (let k = 0; k < 5; k++) {
      const h = k === 0 ? 4.2 : 3.2;
      parts.push(box(w, h, w, 0, y + h / 2, 0));
      y += h;
      // roof: a wide flat pyramid with upswept corners
      const rg = new THREE.CylinderGeometry(w * 0.45, w * 0.98, 1.3, 4, 1).rotateY(Math.PI / 4).translate(0, y + 0.45, 0);
      const p = rg.attributes.position;
      for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i); if (Math.abs(px) > w * 0.6 && Math.abs(pz) > w * 0.6) p.setY(i, p.getY(i) + 0.45); }
      roofs.push(rg);
      y += 0.9;
      w *= 0.86;
    }
    parts.push(cyl(0.18, 0.28, 9, 0, y + 4.5, 0, 8));
    for (let k = 0; k < 9; k++) parts.push(new THREE.TorusGeometry(0.55, 0.07, 6, 16).rotateX(Math.PI / 2).translate(0, y + 1.2 + k * 0.7, 0));
    const body = new THREE.Mesh(merge(parts), vermilion), roof = new THREE.Mesh(merge(roofs), black);
    for (const m of [body, roof]) { m.position.set(x0, y0 - 0.3, z0); m.castShadow = true; m.receiveShadow = true; group.add(m); }
    boxes.push({ x: x0, z: z0, hx: 6, hz: 6, rot: 0, y0: y0 - 1, y1: y0 + 30 });
  }

  // ------------------------------------------------ the great torii standing in Lake Kawa
  {
    const L = PLACES.lake, a = 2.3, x = L.x + Math.cos(a) * (L.r - 60), z = L.z + Math.sin(a) * (L.r - 60);
    const t = new THREE.Mesh(toriiGeo(10, 14, 2.6), vermilion);
    t.position.set(x, L.water - 2, z); t.rotation.y = a + Math.PI / 2;
    t.castShadow = true;
    group.add(t);
  }

  // ------------------------------------------------ festival site
  {
    const F = PLACES.festival;
    const fest = world.roads.find((r) => r.id === 'festival');
    // the arch over the boulevard
    const ai = Math.min(fest.n - 1, 40), ax = fest.xs[ai], az = fest.zs[ai], ay = fest.ys[ai], ah = fest.hdg[ai];
    const span = fest.T.hw * 2 + 6;
    const arch = new THREE.Group();
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.6 });
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(box(1.2, 11, 1.2, s * span / 2, 5.5, 0), trussMat); arch.add(leg);
      circles.push({ x: ax + Math.cos(ah) * (span / 2) * s, z: az - Math.sin(ah) * (span / 2) * s, r: 0.8, y0: ay - 1, y1: ay + 11, kind: 'post' });
    }
    arch.add(new THREE.Mesh(box(span + 1.2, 2.6, 1.3, 0, 11.6, 0), trussMat));
    const sign = document.createElement('canvas'); sign.width = 1024; sign.height = 128;
    const sg = sign.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 1024, 0); grad.addColorStop(0, '#ff2d8a'); grad.addColorStop(1, '#ff8a3d');
    sg.fillStyle = grad; sg.fillRect(0, 0, 1024, 128);
    sg.fillStyle = '#fff'; sg.font = 'italic 800 84px "Barlow Condensed", Arial Narrow, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
    sg.fillText('HORIZON  日の出  JAPAN', 512, 68);
    const stex = new THREE.CanvasTexture(sign); stex.colorSpace = THREE.SRGBColorSpace;
    const smat = new THREE.MeshStandardMaterial({ map: stex, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 0.8 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(span, 2.3), smat); p.position.set(0, 11.6, s * 0.67); if (s < 0) p.rotation.y = Math.PI; arch.add(p); }
    arch.position.set(ax, ay, az); arch.rotation.y = ah;
    arch.traverse((o) => { o.castShadow = true; });
    group.add(arch);
    // stage, screens and tents on the beach side
    const sx = F.x + 110, sz = F.z + 40, sy = H(sx, sz);
    const stage = new THREE.Group();
    stage.add(new THREE.Mesh(box(30, 1.6, 16, 0, 0.8, 0), trussMat));
    for (const [x, z] of [[-14, -7], [14, -7], [-14, 7], [14, 7]]) stage.add(new THREE.Mesh(box(0.8, 16, 0.8, x, 8, z), trussMat));
    stage.add(new THREE.Mesh(box(30, 1.2, 16, 0, 16.2, 0), trussMat));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2d8a, emissiveIntensity: 1.4, emissiveMap: stex }));
    scr.position.set(0, 9, -7.6);
    stage.add(scr);
    stage.position.set(sx, sy, sz); stage.rotation.y = Math.PI * 0.05;
    stage.traverse((o) => { o.castShadow = true; });
    group.add(stage);
    boxes.push({ x: sx, z: sz, hx: 15, hz: 8, rot: Math.PI * 0.05, y0: sy - 1, y1: sy + 17 });
    // tents: white peaked marquees
    const tents = [];
    for (let k = 0; k < 14; k++) {
      const a = -0.6 + k * 0.17, d = 85 + (k % 2) * 16;
      const x = F.x + Math.cos(a) * d - 40, z = F.z + Math.sin(a) * d * 0.6 + 10;
      if (world.roadAt(x, z) || world.roadAt(x + 5, z) || world.roadAt(x - 5, z)) continue;
      tents.push([x, H(x, z), z, a]);
      boxes.push({ x, z, hx: 3.2, hz: 3.2, rot: a, y0: H(x, z), y1: H(x, z) + 4 });
    }
    const tg = merge([box(6, 2.4, 6, 0, 1.2, 0), new THREE.ConeGeometry(4.6, 2.2, 4, 1).rotateY(Math.PI / 4).translate(0, 3.5, 0)]);
    group.add(inst(tg, white, tents));
    // strings of paper lanterns between poles along the boulevard
    const lant = [];
    for (let i = 10; i < Math.min(fest.n, 160); i += 3) {
      for (const s of [-1, 1]) {
        const off = fest.T.hw + fest.T.shoulder + 1.2;
        lant.push([fest.xs[i] + Math.cos(fest.hdg[i]) * off * s, fest.ys[i] + 4.2 + Math.sin(i * 0.9) * 0.15, fest.zs[i] - Math.sin(fest.hdg[i]) * off * s]);
      }
    }
    const lg = new THREE.SphereGeometry(0.32, 10, 8).scale(1, 1.25, 1);
    group.add(inst(lg, nightGlow(0xff5a2a, 0.5, 4), lant, false));
    // Ferris wheel on the shore
    const wx = F.x - 150, wz = F.z + 70, wy = H(wx, wz);
    const wheel = new THREE.Group();
    const R = 26;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.45, 8, 96), steel);
    const rim2 = rim.clone(); rim.position.z = 1.4; rim2.position.z = -1.4;
    const spokes = [];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; spokes.push(box(0.18, R, 0.18, 0, R / 2, 0).rotateZ(a)); }
    const sp = new THREE.Mesh(merge(spokes), steel);
    const rot = new THREE.Group(); rot.add(rim, rim2, sp);
    const cabGeo = merge([box(2.2, 2.4, 2.2, 0, -1.4, 0), cyl(0.06, 0.06, 1.2, 0, 0, 0, 6)]);
    const cabs = [];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; cabs.push([Math.cos(a) * R, Math.sin(a) * R, 0]); }
    const cabMats = [0xff2d8a, 0x29e0ff, 0xffd23f, 0x2ee88a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));
    const cabMeshes = cabMats.map((m, j) => inst(cabGeo, m, cabs.filter((_, k) => k % 4 === j)));
    const lights = [];
    for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2; lights.push([Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), 1.6]); lights.push([Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5), -1.6]); }
    const bulbs = inst(new THREE.SphereGeometry(0.22, 6, 5), nightGlow(0xfff0c0, 0.4, 5), lights, false);
    rot.add(bulbs);
    wheel.add(rot);
    for (const m of cabMeshes) wheel.add(m);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(merge([box(0.8, R + 4, 0.8, -10, (R + 4) / 2, s * 2.4).rotateZ(0), box(0.8, R + 4, 0.8, 10, (R + 4) / 2, s * 2.4)]), steel);
      leg.geometry.computeVertexNormals();
      wheel.add(leg);
    }
    wheel.position.set(wx, wy, wz);
    rot.position.y = R + 4; for (const m of cabMeshes) m.position.y = R + 4;
    wheel.rotation.y = 0.4;
    wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(wheel);
    boxes.push({ x: wx, z: wz, hx: 12, hz: 4, rot: 0.4, y0: wy - 1, y1: wy + 8 });
    group.userData.ferris = { rot, cabMeshes, cabs, R };
  }

  // ------------------------------------------------ utility poles and wires along country roads
  {
    const poles = [], wires = [];
    const poleGeo = merge([cyl(0.13, 0.17, 10, 0, 5, 0, 8), box(1.8, 0.1, 0.1, 0, 9.3, 0), box(1.3, 0.1, 0.1, 0, 8.6, 0), cyl(0.18, 0.18, 0.6, 0.5, 8.1, 0, 8)]);
    for (const r of world.roads) {
      if (!['road', 'coast', 'highway'].includes(r.type) || r.id === 'festival') continue;
      const off = r.T.hw + r.T.shoulder + 1.6;
      let prev = null;
      for (let i = 0; i < r.n; i += 17) {
        const hd = r.hdg[i], x = r.xs[i] + Math.cos(hd) * off, z = r.zs[i] - Math.sin(hd) * off;
        if (world.roadAt(x, z)) { prev = null; continue; }
        const y = H(x, z);
        if (y < world.waterLevel(x, z) + 0.5) { prev = null; continue; }
        poles.push([x, y, z, hd]);
        circles.push({ x, z, r: 0.2, y0: y - 1, y1: y + 10, kind: 'post' });
        if (prev) for (const [dy, dx] of [[9.3, 0.8], [9.3, -0.8], [8.6, 0.55], [8.6, -0.55]]) {
          const a = [prev[0] + Math.cos(prev[3]) * dx, prev[1] + dy, prev[2] - Math.sin(prev[3]) * dx], b = [x + Math.cos(hd) * dx, y + dy, z - Math.sin(hd) * dx];
          // catenary sag in 6 segments
          for (let k = 0; k < 6; k++) {
            const u0 = k / 6, u1 = (k + 1) / 6;
            const p = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 0.9, a[2] + (b[2] - a[2]) * u];
            wires.push(...p(u0), ...p(u1));
          }
        }
        prev = [x, y, z, hd];
      }
    }
    group.add(inst(poleGeo, new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.9 }), poles));
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    const wm = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7, fog: true });
    group.add(new THREE.LineSegments(wg, wm));
  }

  // ------------------------------------------------ street lights (expressway and city)
  {
    const list = [], heads = [];
    for (const r of world.roads) {
      const every = r.type === 'expressway' ? 20 : r.type === 'street' ? 15 : r.type === 'circuit' ? 0 : 0;
      if (!every) continue;
      const off = r.T.divided ? 0 : r.T.hw + r.T.shoulder + 0.6;
      for (let i = 4; i < r.n - 4; i += every) {
        const hd = r.hdg[i];
        for (const s of r.T.divided ? [0] : [-1, 1]) {
          if (!r.T.divided && (i / every) % 2 !== (s > 0 ? 0 : 1)) continue;
          const x = r.xs[i] + Math.cos(hd) * off * s, z = r.zs[i] - Math.sin(hd) * off * s;
          const y = r.T.divided ? r.ys[i] + 0.9 : world.ground(x, z, r.ys[i] + 2).h;
          list.push([x, y, z, hd + (s < 0 ? Math.PI : 0) + (r.T.divided ? 0 : Math.PI / 2)]);
          if (!r.T.divided) circles.push({ x, z, r: 0.18, y0: y - 1, y1: y + 9, kind: 'post' });
        }
      }
    }
    const pole = merge([cyl(0.1, 0.14, 9, 0, 4.5, 0, 8), box(0.12, 0.12, 2.6, 0, 9, 1.2), box(0.12, 0.12, 2.6, 0, 9, -1.2)]);
    const head = merge([box(0.35, 0.14, 0.7, 0, 8.85, 2.4), box(0.35, 0.14, 0.7, 0, 8.85, -2.4)]);
    group.add(inst(pole, steel, list));
    group.add(inst(head, nightGlow(0xffd9a0, 0.05, 6), list, false));
  }

  // ------------------------------------------------ stone lanterns and vending machines
  {
    const lan = [], vend = [];
    const sr = world.roads.find((r) => r.id === 'shrine');
    for (let i = 4; i < Math.floor(sr.n * 0.35); i += 10) for (const s of [-1, 1]) {
      const off = sr.T.hw + sr.T.shoulder + 1.5;
      const x = sr.xs[i] + Math.cos(sr.hdg[i]) * off * s, z = sr.zs[i] - Math.sin(sr.hdg[i]) * off * s;
      lan.push([x, H(x, z), z, sr.hdg[i]]);
      circles.push({ x, z, r: 0.45, y0: H(x, z) - 1, y1: H(x, z) + 2.4, kind: 'post' });
    }
    const lg = merge([box(0.9, 0.3, 0.9, 0, 0.15, 0), cyl(0.18, 0.2, 1.1, 0, 0.85, 0, 8), box(0.7, 0.55, 0.7, 0, 1.65, 0), new THREE.ConeGeometry(0.75, 0.45, 4).rotateY(Math.PI / 4).translate(0, 2.15, 0)]);
    group.add(inst(lg, stone, lan));
    group.add(inst(box(0.4, 0.3, 0.4, 0, 1.65, 0), nightGlow(0xffa050, 0.1, 3), lan, false));
    // vending machines at a few corners in town and by the festival
    for (const r of world.roads.filter((x) => x.type === 'street' || x.id === 'festival' || x.id === 'paddy')) {
      for (let i = 20; i < r.n; i += 90) {
        const off = r.T.hw + r.T.shoulder + 1.0, hd = r.hdg[i];
        const x = r.xs[i] + Math.cos(hd) * off, z = r.zs[i] - Math.sin(hd) * off;
        if (world.roadAt(x, z)) continue;
        vend.push([x, H(x, z), z, hd + Math.PI / 2], [x + Math.sin(hd) * 1.05, H(x, z), z + Math.cos(hd) * 1.05, hd + Math.PI / 2]);
        boxes.push({ x, z, hx: 1.1, hz: 0.5, rot: hd, y0: H(x, z), y1: H(x, z) + 1.9 });
      }
    }
    const vg = box(1, 1.85, 0.8, 0, 0.925, 0);
    group.add(inst(vg, new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.4 }), vend));
    group.add(inst(box(0.86, 1.1, 0.02, 0, 1.15, 0.41), nightGlow(0xc8e8ff, 0.8, 3), vend, false));
  }

  // ------------------------------------------------ flooded rice paddies
  {
    const P = PLACES.paddies, cells = [];
    for (let x = P.x - P.w * 0.42; x < P.x + P.w * 0.42; x += 34) {
      for (let z = P.z - P.d * 0.4; z < P.z + P.d * 0.4; z += 26) {
        const cx = x + 17, cz = z + 13;
        if (world.roadAt(cx, cz) || world.roadAt(cx + 16, cz) || world.roadAt(cx - 16, cz) || world.roadAt(cx, cz + 12) || world.roadAt(cx, cz - 12)) continue;
        cells.push([cx, H(cx, cz) + 0.12, cz, 0, 31, 1, 23]);
      }
    }
    const pg = new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2);
    const pm = new THREE.MeshStandardMaterial({ color: 0x5a7a58, roughness: 0.08, metalness: 0.1 });
    pm.onBeforeCompile = (sh) => {
      addFog(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;\nfloat hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
        .replace('#include <map_fragment>', `#include <map_fragment>
          // rows of young rice over still water
          float row = smoothstep(0.35, 0.0, abs(fract(vW.x * 0.8) - 0.5)) * step(0.45, hsh(floor(vW.xz * vec2(0.8, 3.0))));
          diffuseColor.rgb = mix(vec3(0.18, 0.26, 0.28), vec3(0.36, 0.62, 0.22), row);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.04, 0.8, row);');
    };
    const pad = inst(pg, pm, cells, false);
    pad.receiveShadow = true;
    group.add(pad);
  }

  return { group, boxes, circles, update: (dt) => {
    const F = group.userData.ferris;
    if (!F) return;
    F.rot.rotation.z += dt * 0.05;
    const a0 = F.rot.rotation.z;
    // cabins hang level while the wheel turns
    let j = [0, 0, 0, 0];
    for (let k = 0; k < F.cabs.length; k++) {
      const a = (k / F.cabs.length) * Math.PI * 2 + a0, m = F.cabMeshes[k % 4], i = j[k % 4]++;
      m.setMatrixAt(i, _m.compose(_p.set(Math.cos(a) * F.R, Math.sin(a) * F.R, 0), _q.identity(), _s.set(1, 1, 1)));
    }
    for (const m of F.cabMeshes) m.instanceMatrix.needsUpdate = true;
  } };
}
