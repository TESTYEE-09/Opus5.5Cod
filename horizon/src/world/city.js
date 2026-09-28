// Minato city and the buildings of the countryside.
//
// Buildings are instanced unit boxes scaled per instance; one facade shader draws windows,
// mullions, floor bands and balconies from the building's own metric coordinates, lights a
// random share of windows at night, and gives ground floors shop fronts. Neon signs (a canvas
// atlas of Japanese signage), rooftop plant, a lattice tower and tiled-roof houses complete it.
// Every building adds an oriented box collider for the physics.
import * as THREE from 'three';
import { mulberry } from './noise.js';
import { PLACES } from './layout.js';
import { addFog } from './sky.js';

export const CITY = { uNight: { value: 0 } };

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 });
  m.customProgramCacheKey = () => 'facade';
  m.onBeforeCompile = (sh) => {
    addFog(sh);
    Object.assign(sh.uniforms, CITY);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aBld; // style, seed, tint hue, lit share
        varying vec3 vLoc; varying vec3 vLN; varying vec4 vBld; varying vec3 vSize;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 bsz = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vLoc = position * bsz; vLN = normal; vBld = aBld; vSize = bsz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        varying vec3 vLoc; varying vec3 vLN; varying vec4 vBld; varying vec3 vSize;
        float hsh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        vec3 BE; float BR; float BM;`)
      .replace('#include <map_fragment>', `
        int style = int(vBld.x + 0.5);
        float seed = vBld.y;
        vec3 n = normalize(vLN);
        // facade coordinates: u across the face, v up (metres)
        float u = abs(n.x) > 0.5 ? vLoc.z : vLoc.x;
        float v = vLoc.y;
        float fw = style == 0 ? 1.6 : style == 2 ? 3.2 : 2.6;   // window pitch
        float fh = style == 3 ? 4.2 : 3.4;                        // floor height
        vec2 cell = vec2(u / fw, v / fh);
        vec2 f = fract(cell);
        vec2 id = floor(cell);
        float isWin = step(0.12, f.x) * step(f.x, 0.88) * step(0.22, f.y) * step(f.y, 0.86);
        if (style == 0) isWin = step(0.05, f.x) * step(0.08, f.y);
        float top = step(abs(n.y), 0.5);
        vec3 wall = style == 0 ? vec3(0.32, 0.36, 0.4) : style == 1 ? vec3(0.62, 0.6, 0.56) : style == 2 ? vec3(0.78, 0.76, 0.7) : vec3(0.7, 0.66, 0.58);
        wall *= 0.85 + 0.3 * fract(seed * 7.13);
        vec3 glass = style == 0 ? mix(vec3(0.05, 0.12, 0.16), vec3(0.08, 0.16, 0.14), fract(seed * 3.1)) : vec3(0.05, 0.06, 0.07);
        vec3 col = mix(wall, glass, isWin * top);
        BR = mix(0.75, 0.08, isWin * top);
        BM = mix(0.0, 0.6, isWin * top * (style == 0 ? 1.0 : 0.3));
        // balconies on residential blocks
        if (style == 2) { float bal = smoothstep(0.02, 0.0, abs(f.y - 0.1)) * top; col = mix(col, vec3(0.85), bal); }
        // ground floor shop fronts
        float ground = step(v, 4.4) * top;
        vec3 shop = vec3(0.06, 0.07, 0.08);
        col = mix(col, shop, ground * step(0.1, fract(u / 6.0)) * step(0.6, v));
        // roof
        col = mix(col, vec3(0.34, 0.33, 0.32) * (0.8 + 0.2 * hsh(floor(vLoc.xz))), 1.0 - top);
        diffuseColor.rgb = col;
        // night: a share of windows lit, warm or cool; shops always lit
        float lit = step(hsh(id + seed * 13.1), vBld.w) * isWin * top;
        float warm = hsh(id * 1.7 + seed);
        BE = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.9, 1.0), step(0.6, warm)) * lit * (0.6 + 0.8 * hsh(id + 3.0));
        BE += vec3(1.0, 0.85, 0.6) * ground * step(0.6, v) * step(0.1, fract(u / 6.0)) * 1.4;
        BE *= uNight * 2.2;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = BR;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = BM;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += BE;');
  };
  return m;
}

// neon sign atlas: 8 x 4 signs of Japanese signage
function signAtlas() {
  const W = 1024, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const words = ['ラーメン', '居酒屋', 'カラオケ', '寿司', 'ホテル', 'コンビニ', '焼肉', 'パチンコ', '喫茶', '書店', '薬局', 'ゲーム', '日の出', '東京', '湊', '祭', 'バー', '銀行', 'カフェ', '電器', '花', '夢', '酒', '駐車場', 'スシ', '牛丼', '宝石', '眼鏡', '中華', '百貨店', 'ビル', '映画'];
  const cols = ['#ff2d8a', '#29e0ff', '#ffd23f', '#7dff5a', '#ff6a3d', '#c77dff', '#ffffff', '#ff4d6d'];
  const cw = W / 8, ch = H / 4;
  words.forEach((w, i) => {
    const x = (i % 8) * cw, y = ((i / 8) | 0) * ch;
    const col = cols[i % cols.length];
    g.fillStyle = '#0a0a12'; g.fillRect(x + 6, y + 6, cw - 12, ch - 12);
    g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 14;
    g.strokeRect(x + 12, y + 12, cw - 24, ch - 24);
    g.fillStyle = col;
    // vertical (tategaki) text
    const chars = [...w];
    const fs = Math.min(cw * 0.62, (ch - 40) / chars.length);
    g.font = `900 ${fs}px "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((chr, k) => g.fillText(chr, x + cw / 2, y + 20 + fs * (k + 0.5) + (ch - 40 - fs * chars.length) / 2));
    g.shadowBlur = 0;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildCity(world) {
  const rnd = mulberry(4242);
  const group = new THREE.Group(); group.name = 'city';
  const colliders = [];
  const blds = []; // {x, z, w, d, h, rot, style, lit}
  const C = PLACES.city;
  const gx = [700, 880, 1060, 1240, 1420, 1600], gz = [40, 220, 400, 580, 760, 920];
  const cx = 1180, cz = 470;
  const margin = 13;
  for (let i = 0; i < gx.length - 1; i++) for (let j = 0; j < gz.length - 1; j++) {
    const x0 = gx[i] + margin, x1 = gx[i + 1] - margin, z0 = gz[j] + margin, z1 = gz[j + 1] - margin;
    const dc = Math.hypot((x0 + x1) / 2 - cx, (z0 + z1) / 2 - cz);
    const down = Math.max(0, 1 - dc / 520);
    // tower block landmark in one block
    const park = i === 1 && j === 3;
    if (park) continue;
    const nx = rnd() < 0.5 ? 2 : 3, nz = rnd() < 0.5 ? 2 : 3;
    const lw = (x1 - x0) / nx, ld = (z1 - z0) / nz;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      if (rnd() < 0.08) continue;
      const w = lw * (0.7 + rnd() * 0.25), d = ld * (0.7 + rnd() * 0.25);
      const x = x0 + (a + 0.5) * lw, z = z0 + (b + 0.5) * ld;
      const tall = down > 0.55 && rnd() < 0.55;
      const h = tall ? 70 + rnd() * 150 * down : 12 + rnd() * (25 + 50 * down);
      const style = tall ? (rnd() < 0.7 ? 0 : 1) : h < 20 ? 3 : rnd() < 0.5 ? 2 : 1;
      blds.push({ x, z, w, d, h, rot: 0, style, lit: 0.25 + rnd() * 0.45 });
    }
  }
  // harbour warehouses and a few mid-rises toward the coast
  for (let k = 0; k < 14; k++) blds.push({ x: 720 + k * 65, z: 1030 + (k % 2) * 20, w: 40, d: 26, h: 9 + (k % 3) * 3, rot: 0, style: 3, lit: 0.1 });
  const base = world.terrainHeight(cx, cz);
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(geo, facadeMaterial(), blds.length);
  const attr = new Float32Array(blds.length * 4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  blds.forEach((b, i) => {
    const y = world.terrainHeight(b.x, b.z) - 1;
    m4.compose(p.set(b.x, y, b.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), s.set(b.w, b.h + 1, b.d));
    inst.setMatrixAt(i, m4);
    attr.set([b.style, rnd(), 0, b.lit], i * 4);
    colliders.push({ type: 'box', x: b.x, z: b.z, hx: b.w / 2, hz: b.d / 2, rot: b.rot, y0: y, y1: y + b.h });
  });
  geo.setAttribute('aBld', new THREE.InstancedBufferAttribute(attr, 4));
  inst.castShadow = true; inst.receiveShadow = true;
  group.add(inst);

  // rooftop plant on the taller buildings
  const roofGeo = new THREE.BoxGeometry(1, 1, 1); roofGeo.translate(0, 0.5, 0);
  const roofs = blds.filter((b) => b.h > 20);
  const rInst = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.7, metalness: 0.3 }), roofs.length * 3);
  let ri = 0;
  for (const b of roofs) for (let k = 0; k < 3; k++) {
    const y = world.terrainHeight(b.x, b.z) + b.h;
    m4.compose(p.set(b.x + (rnd() - 0.5) * b.w * 0.6, y, b.z + (rnd() - 0.5) * b.d * 0.6), q.identity(), s.set(3 + rnd() * 6, 2 + rnd() * 4, 3 + rnd() * 6));
    rInst.setMatrixAt(ri++, m4);
  }
  rInst.castShadow = true;
  group.add(rInst);

  // neon signs on street-facing walls of the low and mid rises
  const atlas = signAtlas();
  const signMat = new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff, toneMapped: false });
  signMat.onBeforeCompile = (sh) => {
    addFog(sh);
    Object.assign(sh.uniforms, CITY);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSign;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((mod(aSign, 8.0) + uv.x) / 8.0, (3.0 - floor(aSign / 8.0) + uv.y) / 4.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 0.35 + uNight * 3.2;');
  };
  signMat.customProgramCacheKey = () => 'neon';
  const signs = [];
  for (const b of blds) {
    if (b.h > 60 || rnd() < 0.35) continue;
    const n = 1 + ((rnd() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const face = (rnd() * 4) | 0;
      const along = (rnd() - 0.5) * 0.8;
      const y = world.terrainHeight(b.x, b.z) + 5 + rnd() * Math.min(12, b.h - 8);
      const nx = [1, -1, 0, 0][face], nz = [0, 0, 1, -1][face];
      const x = b.x + nx * (b.w / 2 + 0.6) + (nz ? along * b.w : 0), z = b.z + nz * (b.d / 2 + 0.6) + (nx ? along * b.d : 0);
      signs.push({ x, y, z, ry: Math.atan2(nx, nz) + Math.PI / 2, id: (rnd() * 32) | 0 });
    }
  }
  const sgeo = new THREE.PlaneGeometry(2.2, 6.4);
  const sInst = new THREE.InstancedMesh(sgeo, signMat, signs.length);
  const sid = new Float32Array(signs.length);
  signs.forEach((sg, i) => {
    m4.compose(p.set(sg.x, sg.y, sg.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg.ry), s.set(1, 1, 1));
    sInst.setMatrixAt(i, m4); sid[i] = sg.id;
  });
  sgeo.setAttribute('aSign', new THREE.InstancedBufferAttribute(sid, 1));
  group.add(sInst);

  // lattice tower in the park block: tapering red and white legs and bracing, two decks
  group.add(latticeTower(world, 945, 505));
  colliders.push({ type: 'box', x: 945, z: 505, hx: 18, hz: 18, rot: 0, y0: base, y1: base + 20 });
  void base; void C;
  return { group, colliders, buildings: blds };
}

function latticeTower(world, x, z) {
  const g = new THREE.Group();
  const y0 = world.terrainHeight(x, z);
  const H = 190;
  const red = new THREE.MeshStandardMaterial({ color: 0xd8401e, roughness: 0.55, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.5, metalness: 0.3 });
  const width = (h) => 20 * Math.pow(1 - h / H, 1.6) + 1.2;
  const beam = (a, b, r, mat) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    g.add(m);
  };
  const seg = 18;
  for (let i = 0; i < seg; i++) {
    const h0 = (i / seg) * H, h1 = ((i + 1) / seg) * H;
    const w0 = width(h0), w1 = width(h1);
    const mat = i % 2 ? white : red;
    const c0 = [[w0, w0], [-w0, w0], [-w0, -w0], [w0, -w0]].map(([a, b]) => new THREE.Vector3(x + a, y0 + h0, z + b));
    const c1 = [[w1, w1], [-w1, w1], [-w1, -w1], [w1, -w1]].map(([a, b]) => new THREE.Vector3(x + a, y0 + h1, z + b));
    for (let k = 0; k < 4; k++) {
      beam(c0[k], c1[k], 0.7 * (1 - i / seg) + 0.25, mat);
      beam(c0[k], c1[(k + 1) % 4], 0.18, mat);
      beam(c1[k], c1[(k + 1) % 4], 0.2, mat);
    }
  }
  for (const [h, r] of [[H * 0.28, 1.35], [H * 0.55, 1.2]]) {
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(width(h) * r, width(h) * r, 6, 8), white);
    deck.position.set(x, y0 + h, z); deck.castShadow = true;
    g.add(deck);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 30, 6), white);
  mast.position.set(x, y0 + H + 15, z);
  g.add(mast);
  // aviation lights
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.4, 0.2), toneMapped: false }));
  lamp.position.set(x, y0 + H + 30, z);
  g.add(lamp);
  return g;
}

// Japanese houses along the country roads: white walls, dark tiled hip roofs
export function buildHouses(world) {
  const rnd = mulberry(777);
  const list = [];
  const C = PLACES.city;
  for (const r of world.roads) {
    if (!['road', 'highway', 'coast'].includes(r.type)) continue;
    for (let i = 20; i < r.n; i += 18 + ((rnd() * 30) | 0)) {
      if (rnd() < 0.45) continue;
      const side = rnd() < 0.5 ? -1 : 1;
      const off = r.T.hw + r.T.shoulder + 9 + rnd() * 10;
      const hd = r.hdg[i];
      const x = r.xs[i] + Math.cos(hd) * off * side, z = r.zs[i] - Math.sin(hd) * off * side;
      if (x > C.x0 - 40 && x < C.x1 + 40 && z > C.z0 - 40 && z < C.z1 + 40) continue;
      if (world.roadAt(x, z) || world.roadAt(x + 6, z) || world.roadAt(x - 6, z) || world.roadAt(x, z + 6) || world.roadAt(x, z - 6)) continue;
      const h = world.terrainHeight(x, z);
      if (h < world.waterLevel(x, z) + 1.5) continue;
      list.push({ x, z, y: h, w: 8 + rnd() * 5, d: 7 + rnd() * 4, rot: hd + (rnd() < 0.5 ? 0 : Math.PI / 2), floors: rnd() < 0.4 ? 2 : 1 });
    }
  }
  const g = new THREE.Group(); g.name = 'houses';
  const wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
  // hip roof: a squashed pyramid over a unit footprint
  const roofGeo = new THREE.CylinderGeometry(0.0001, 0.78, 1, 4, 1); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.5, 0);
  roofGeo.scale(1, 1, 1);
  const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.85 }), list.length);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.55, metalness: 0.2 }), list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const colliders = [];
  list.forEach((b, i) => {
    const wh = b.floors * 3;
    q.setFromAxisAngle(up, b.rot);
    m4.compose(p.set(b.x, b.y - 0.5, b.z), q, s.set(b.w, wh + 0.5, b.d)); walls.setMatrixAt(i, m4);
    m4.compose(p.set(b.x, b.y + wh, b.z), q, s.set(b.w * 1.25, 2.4, b.d * 1.3)); roofs.setMatrixAt(i, m4);
    colliders.push({ type: 'box', x: b.x, z: b.z, hx: b.w / 2, hz: b.d / 2, rot: b.rot, y0: b.y, y1: b.y + wh + 2 });
  });
  walls.castShadow = roofs.castShadow = true; walls.receiveShadow = roofs.receiveShadow = true;
  g.add(walls, roofs);
  return { group: g, colliders };
}
