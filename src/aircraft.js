// Aircraft: airframe data for the flight model and weapons, and the models. Models are built
// from real proportions: the fuselage is lofted through superellipse cross-sections, wings
// and tails are lofted airfoil sections along the span, then painted in each type's scheme.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Flight model numbers (SI): thrust as acceleration at full military power and the extra from
// afterburner, drag so top speed comes out right, stall speed, G and roll limits.
//   agm: air-to-ground missiles, aam: IR air-to-air missiles, gun: rate (s/round), damage, name
export const AIRFRAMES = {
  f16: { name: 'F-16C', team: 0, role: 'fighter', mil: 13, ab: 16, vmax: 255, vab: 330, stall: 62, g: 9, roll: 4.6, pitch: 0.55,
    agm: { n: 2, name: 'AGM-65' }, aam: { n: 2, name: 'AIM-9' }, gun: { rate: 0.0167, dmg: 42, name: 'Jet Cannon', rounds: 510 }, hp: 1250 },
  su27: { name: 'Su-27', team: 1, role: 'fighter', mil: 12.5, ab: 16, vmax: 250, vab: 335, stall: 64, g: 9, roll: 4.1, pitch: 0.55,
    agm: { n: 2, name: 'Kh-29' }, aam: { n: 4, name: 'R-73' }, gun: { rate: 0.04, dmg: 60, name: 'Jet Cannon', rounds: 150 }, hp: 1350 },
  a10: { name: 'A-10C', team: 0, role: 'attack', mil: 7.5, ab: 0, vmax: 185, vab: 185, stall: 45, g: 7.3, roll: 2.9, pitch: 0.5,
    agm: { n: 6, name: 'AGM-65' }, aam: { n: 2, name: 'AIM-9' }, gun: { rate: 0.0154, dmg: 95, name: 'GAU-8', rounds: 1150 }, hp: 2400 },
  su25: { name: 'Su-25', team: 1, role: 'attack', mil: 8.5, ab: 0, vmax: 225, vab: 225, stall: 55, g: 6.5, roll: 3.3, pitch: 0.5,
    agm: { n: 4, name: 'Kh-25' }, aam: { n: 2, name: 'R-60' }, gun: { rate: 0.02, dmg: 70, name: 'Jet Cannon', rounds: 250 }, hp: 2000 },
};
export const airframeFor = (kind, team) => kind === 'attacker' ? (team ? 'su25' : 'a10') : (team ? 'su27' : 'f16');

// ---------- geometry ----------
// superellipse point; n = 2 is an ellipse, higher is boxier
const se = (t, a, b, n) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n)];
};

// Fuselage loft along -z (nose) to +z (tail). sections: [z, halfWidth, top, bottom, yCentre, n]
export function loft(sections, seg = 24, capEnds = true) {
  const pos = [], uv = [], idx = [];
  sections.forEach(([z, w, top, bot, yc, n = 2.2], i) => {
    for (let k = 0; k <= seg; k++) {
      const t = k / seg * Math.PI * 2;
      const [x, y] = se(t, Math.max(w, 1e-3), 1, n);
      const h = y >= 0 ? top : bot;
      pos.push(x, yc + y * Math.max(h, 1e-3), z);
      uv.push(z / 3, k / seg * 2);
    }
  });
  const R = seg + 1;
  for (let i = 0; i < sections.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * R + k, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (capEnds) {
    // close the tail end with a fan (the nose section is already a point)
    const last = sections.length - 1, [z, , , , yc] = sections[last];
    const ci = pos.length / 3;
    pos.push(0, yc, z); uv.push(0, 0);
    for (let k = 0; k < seg; k++) idx.push(last * R + k + 1, last * R + k, ci);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
  }
  g.computeVertexNormals();
  return g;
}

// symmetric airfoil outline (x along chord 0..1, y thickness), 14 points round
const AIRFOIL = (() => {
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const x = 1 - (1 - Math.cos(i / 7 * Math.PI)) / 2;
    const t = 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    pts.push([x, t]);
  }
  const out = pts.slice();
  for (let i = pts.length - 2; i > 0; i--) out.push([pts[i][0], -pts[i][1]]);
  return out;
})();

// Wing loft along the span (+x). stations: [x, zLeadingEdge, chord, thickness, y]
function wing(stations, mirror = true) {
  const pos = [], uv = [], idx = [], n = AIRFOIL.length;
  stations.forEach(([x, zl, c, th, y]) => {
    for (const [u, v] of AIRFOIL) { pos.push(x, y + v * th * c * 0.5, zl + u * c); uv.push(x / 3, u * c / 3); }
  });
  for (let i = 0; i < stations.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * n + k, b = i * n + (k + 1) % n, c = a + n, d = b + n;
    idx.push(a, b, c, b, d, c);
  }
  // tip cap
  const t0 = (stations.length - 1) * n;
  for (let k = 1; k < n - 1; k++) idx.push(t0, t0 + k, t0 + k + 1);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g = g.toNonIndexed();
  if (mirror) {
    const m = g.clone(); m.scale(-1, 1, 1);
    // flip winding of the mirrored copy
    const p = m.attributes.position, u = m.attributes.uv;
    for (let i = 0; i < p.count; i += 3) {
      for (const a of [p, u]) { const s = a.itemSize; for (let k = 0; k < s; k++) { const t = a.array[(i + 1) * s + k]; a.array[(i + 1) * s + k] = a.array[(i + 2) * s + k]; a.array[(i + 2) * s + k] = t; } }
    }
    g = mergeGeometries([g, m]);
  }
  g.computeVertexNormals();
  return g;
}
// a fin: a wing standing up (stations along +y), optionally canted
function fin(stations, x = 0, cant = 0) {
  const g = wing(stations.map(([h, zl, c, th]) => [h, zl, c, th, 0]), false);
  g.rotateZ(Math.PI / 2 - cant);
  g.translate(x, 0, 0);
  return g;
}

// ---------- paint ----------
const paintCache = {};
export function paint(key, cols, pattern) {
  if (paintCache[key]) return paintCache[key];
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = cols[0]; g.fillRect(0, 0, S, S);
  let seed = key.length * 97;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (pattern === 'splinter' || pattern === 'blotch') {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = cols[1 + (i % (cols.length - 1))];
      g.beginPath();
      const cx = R() * S, cy = R() * S, r = 40 + R() * 90, n = pattern === 'splinter' ? 4 : 9;
      for (let k = 0; k < n; k++) { const a = k / n * 6.28 + R() * 0.8, rr = r * (0.5 + R() * 0.7); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.fill();
    }
  } else if (pattern === 'twotone') {
    g.fillStyle = cols[1];
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(R() * S, R() * S, 60 + R() * 100, 30 + R() * 60, R() * 3, 0, 7); g.fill(); }
  }
  // panel lines and rivet rows
  g.strokeStyle = 'rgba(20,22,26,0.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) { const x = R() * S; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (R() - 0.5) * 20, S); g.stroke(); }
  for (let i = 0; i < 12; i++) { const y = R() * S; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y + (R() - 0.5) * 20); g.stroke(); }
  g.fillStyle = 'rgba(30,30,34,0.25)';
  for (let i = 0; i < 400; i++) g.fillRect(R() * S, R() * S, 1.5, 1.5);
  // weathering streaks
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(40,38,34,${0.03 + R() * 0.05})`; g.fillRect(R() * S, R() * S, 2 + R() * 4, 20 + R() * 60); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (paintCache[key] = t);
}

const SCHEMES = {
  f16: { cols: ['#7c838b', '#6a7179'], pattern: 'twotone' },
  su27: { cols: ['#a9bccb', '#8aa3b7', '#c9d6df'], pattern: 'splinter' },
  a10: { cols: ['#5b6064', '#4c5155'], pattern: 'twotone' },
  su25: { cols: ['#8b7a50', '#56603a', '#a58f60', '#3e4430'], pattern: 'blotch' },
};

function materials(type, ally) {
  const s = SCHEMES[type];
  const skin = new THREE.MeshStandardMaterial({ map: paint(type, s.cols, s.pattern), roughness: 0.55, metalness: 0.25 });
  return {
    skin,
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.45, metalness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.3, metalness: 0.9 }),
    nozzle: new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.6, metalness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x3a3218, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.8, envMapIntensity: 2 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.45, metalness: 0.2 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x5a6038, roughness: 0.55, metalness: 0.2 }),
    band: new THREE.MeshStandardMaterial({ color: ally ? 0x3d7fe0 : 0xd0342a, emissive: ally ? 0x3d7fe0 : 0xd0342a, emissiveIntensity: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.6), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
}

function add(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
const cyl = (r1, r2, l, s = 16) => new THREE.CylinderGeometry(r1, r2, l, s).rotateX(Math.PI / 2);

// stores hung on pylons: each returns the group so a fired one can be hidden
function aam(g, M, x, y, z) {
  const s = new THREE.Group(); s.position.set(x, y, z); g.add(s);
  add(s, cyl(0.064, 0.064, 2.85, 10), M.white);
  add(s, new THREE.ConeGeometry(0.064, 0.22, 10).rotateX(-Math.PI / 2), M.dark, 0, 0, -1.53);
  for (const r of [0, Math.PI / 2]) { add(s, new THREE.BoxGeometry(0.42, 0.01, 0.2), M.white, 0, 0, 1.25, 0, 0, r); add(s, new THREE.BoxGeometry(0.3, 0.01, 0.12), M.white, 0, 0, -1.1, 0, 0, r); }
  return s;
}
function agm(g, M, x, y, z) {
  const s = new THREE.Group(); s.position.set(x, y, z); g.add(s);
  add(s, cyl(0.15, 0.15, 2.5, 12), M.olive);
  add(s, new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), M.glass, 0, 0, -1.25);
  for (const r of [Math.PI / 4, -Math.PI / 4]) add(s, new THREE.BoxGeometry(0.9, 0.012, 0.6), M.olive, 0, 0, 0.6, 0, 0, r);
  add(s, new THREE.BoxGeometry(0.08, 0.22, 0.9), M.dark, 0, 0.24, 0);
  return s;
}
function pylon(g, M, x, y, z, h = 0.3, l = 1.4) { add(g, new THREE.BoxGeometry(0.1, h, l), M.skin, x, y - h / 2, z); }
function flame(M, r, len) {
  const f = new THREE.Mesh(new THREE.ConeGeometry(r, len, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, len / 2), M.flame);
  f.castShadow = false;
  return f;
}

// ---------- the four types ----------
function f16(M) {
  const g = new THREE.Group();
  add(g, loft([[-7.9, 0.001, 0.001, 0.001, 0.05], [-7.3, 0.2, 0.2, 0.2, 0.05], [-6.2, 0.45, 0.45, 0.42, 0.05], [-4.8, 0.6, 0.62, 0.55, 0.1],
    [-3.2, 0.72, 0.85, 0.6, 0.12, 2.4], [-1.5, 0.95, 0.72, 0.62, 0.05, 2.8], [1.5, 0.98, 0.62, 0.62, 0, 2.8], [4.5, 0.75, 0.5, 0.55, 0, 2.4], [6.4, 0.55, 0.48, 0.5, 0, 2.1]]), M.skin);
  // chin intake
  add(g, loft([[-3.4, 0.5, 0.35, 0.3, -0.85, 2.6], [-2.2, 0.55, 0.36, 0.3, -0.8, 2.6], [0.5, 0.45, 0.3, 0.3, -0.62, 2.4], [2, 0.3, 0.2, 0.2, -0.45]], 20, false), M.skin);
  add(g, new THREE.CircleGeometry(0.42, 20).scale(1.15, 0.68, 1).rotateY(Math.PI), M.dark, 0, -0.85, -3.41);
  // bubble canopy with a gold tint
  add(g, new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.75, 0.9, 2.3), M.glass, 0, 0.62, -3.6);
  // cropped delta wing with LERX, stabilators, fin, ventral fins
  add(g, wing([[0.9, -2.1, 4.1, 0.05, 0.05], [2.4, -0.8, 2.8, 0.045, 0.05], [4.7, 0.9, 1.1, 0.04, 0.05]]), M.skin, 0, 0, 0.8);
  add(g, wing([[0.7, -4.4, 2.2, 0.03, 0.08], [1.0, -2.2, 1.0, 0.03, 0.06]]), M.skin, 0, 0, 0.8);
  add(g, wing([[0.6, 4.2, 2.3, 0.04, -0.05], [2.8, 5.4, 1.1, 0.035, -0.12]]), M.skin);
  add(g, fin([[0.4, 3.0, 3.1, 0.05], [3.3, 5.1, 1.2, 0.045]]), M.skin, 0, 0.1, 0);
  for (const s of [-1, 1]) add(g, fin([[0.1, 4.6, 1.0, 0.04], [0.65, 5.0, 0.6, 0.04]], 0, 0), M.skin, 0.55 * s, -0.55, 0, 0, 0, Math.PI + 0.3 * s);
  add(g, cyl(0.55, 0.5, 1.1, 18), M.nozzle, 0, 0, 6.9);
  add(g, new THREE.CylinderGeometry(0.47, 0.47, 0.05, 18).rotateX(Math.PI / 2), M.dark, 0, 0, 7.45);
  add(g, new THREE.BoxGeometry(0.4, 0.06, 0.4), M.band, 0, 0.62, 2.5);
  // stores: wingtip and outboard AIM-9s, AGM-65s on the mid pylons
  const aams = [], agms = [];
  for (const s of [-1, 1]) {
    aams.push(aam(g, M, 4.8 * s, 0.05, 1.8));
    pylon(g, M, 2.6 * s, -0.05, 1.3);
    agms.push(agm(g, M, 2.6 * s, -0.55, 1.2));
  }
  const fl = new THREE.Group(); fl.position.z = 7.45; fl.add(flame(M, 0.45, 3)); g.add(fl);
  return { g, flame: fl, aams, agms };
}

function su27(M) {
  const g = new THREE.Group();
  // long drooped nose, humped canopy spine
  add(g, loft([[-11, 0.001, 0.001, 0.001, -0.1], [-10.2, 0.22, 0.22, 0.22, -0.08], [-8.8, 0.5, 0.5, 0.5, -0.02], [-6.8, 0.72, 0.9, 0.62, 0.05, 2.3],
    [-4.8, 0.9, 1.0, 0.55, 0.1, 2.5], [-2.5, 1.2, 0.7, 0.4, 0.1, 3], [1, 1.1, 0.55, 0.35, 0.05, 3], [4.5, 0.75, 0.4, 0.3, 0.05, 2.6], [7.8, 0.35, 0.3, 0.25, 0.1, 2.2], [9.3, 0.001, 0.12, 0.12, 0.1]]), M.skin);
  add(g, new THREE.SphereGeometry(0.58, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.72, 0.85, 2.5), M.glass, 0, 0.85, -6.2);
  // two engine nacelles with ramped intakes under the wing roots
  const aams = [], agms = [];
  for (const s of [-1, 1]) {
    add(g, loft([[-3.2, 0.62, 0.55, 0.55, -0.55, 3.4], [-1, 0.66, 0.6, 0.62, -0.5, 3], [3, 0.62, 0.6, 0.6, -0.35, 2.4], [6.9, 0.55, 0.55, 0.55, -0.25, 2]], 20, false), M.skin, 1.2 * s, 0, 0);
    add(g, new THREE.PlaneGeometry(1.1, 0.95).rotateY(Math.PI), M.dark, 1.2 * s, -0.55, -3.21);
    add(g, cyl(0.52, 0.48, 1.0, 18), M.nozzle, 1.2 * s, -0.25, 7.3);
    add(g, fin([[0.3, 4.4, 3.2, 0.05], [3.4, 6.3, 1.4, 0.045]], 0, 0.08 * s), M.skin, 2.0 * s, 0.3, 0);
    add(g, new THREE.BoxGeometry(0.06, 0.5, 0.5), M.band, 2.12 * s, 1.8, 5.4);
  }
  // swept wing with long LERX, stabilators
  add(g, wing([[1.3, -2.4, 5.2, 0.05, 0.1], [3.5, 0.4, 3.0, 0.045, 0.05], [7.3, 2.7, 1.2, 0.04, -0.05]]), M.skin, 0, 0, 0.6);
  add(g, wing([[0.9, -6, 3.8, 0.03, 0.1], [1.3, -2.4, 1.2, 0.03, 0.1]]), M.skin, 0, 0, 0.6);
  add(g, wing([[1.8, 5.2, 2.6, 0.035, -0.2], [4.4, 6.9, 1.2, 0.03, -0.25]]), M.skin);
  for (const s of [-1, 1]) {
    aams.push(aam(g, M, 7.4 * s, -0.05, 2.9));
    aams.push(aam(g, M, 5.4 * s, -0.3, 2.3)); pylon(g, M, 5.4 * s, 0, 2.3);
    agms.push(agm(g, M, 1.2 * s, -1.4, 0.8));
  }
  const fl = new THREE.Group(); fl.position.z = 7.8;
  for (const s of [-1, 1]) { const f = flame(M, 0.44, 3.2); f.position.set(1.2 * s, -0.25, 0); fl.add(f); }
  g.add(fl);
  return { g, flame: fl, aams, agms };
}

function a10(M) {
  const g = new THREE.Group();
  add(g, loft([[-8.3, 0.001, 0.001, 0.001, -0.2], [-7.9, 0.35, 0.35, 0.35, -0.2], [-6.8, 0.72, 0.7, 0.7, -0.1, 2.4], [-5.2, 0.85, 1.05, 0.8, 0, 2.6],
    [-2.5, 0.9, 0.85, 0.9, 0, 3], [1.5, 0.8, 0.75, 0.8, 0, 2.8], [5, 0.5, 0.55, 0.5, 0.15, 2.4], [7.6, 0.25, 0.3, 0.3, 0.3]]), M.skin);
  add(g, new THREE.SphereGeometry(0.58, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.78, 0.8, 1.9), M.glass, 0, 0.95, -5);
  // GAU-8 muzzle under the nose
  add(g, cyl(0.1, 0.12, 1.1, 10), M.dark, 0.1, -0.35, -8.6);
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; add(g, cyl(0.022, 0.022, 0.5, 6), M.metal, 0.1 + Math.cos(a) * 0.07, -0.35 + Math.sin(a) * 0.07, -9.2); }
  // thick straight wing with dihedral outer panels and gear pods
  add(g, wing([[0.8, -1.5, 3.1, 0.16, -0.35], [3.2, -1.3, 2.7, 0.15, -0.35], [8.7, -0.6, 1.5, 0.12, 0.25]]), M.skin);
  for (const s of [-1, 1]) add(g, loft([[-3, 0.001, 0.001, 0.001, 0], [-2.4, 0.28, 0.3, 0.3, 0], [0.2, 0.32, 0.33, 0.3, 0], [0.9, 0.001, 0.1, 0.1, 0]], 14), M.skin, 2.2 * s, -0.7, 0);
  // engines high on the rear fuselage
  for (const s of [-1, 1]) {
    add(g, loft([[2.2, 0.62, 0.62, 0.62, 0, 2], [3.2, 0.65, 0.65, 0.65, 0], [5.4, 0.55, 0.55, 0.55, 0], [6.1, 0.45, 0.45, 0.45, 0]], 18, false), M.skin, 1.25 * s, 0.95, 0);
    add(g, new THREE.CircleGeometry(0.55, 18).rotateY(Math.PI), M.dark, 1.25 * s, 0.95, 2.21);
    add(g, new THREE.BoxGeometry(0.2, 0.5, 1.4), M.skin, 0.8 * s, 0.55, 3.8);
    add(g, cyl(0.42, 0.38, 0.5, 16), M.nozzle, 1.25 * s, 0.95, 6.3);
  }
  // twin fins on the tailplane tips
  add(g, wing([[0.3, 6.3, 1.9, 0.05, 0.25], [2.8, 6.6, 1.5, 0.045, 0.25]]), M.skin);
  for (const s of [-1, 1]) add(g, fin([[-0.9, 6.0, 2.0, 0.05], [1.9, 6.3, 1.6, 0.045]], 0, 0), M.skin, 2.85 * s, 0.25, 0);
  add(g, new THREE.BoxGeometry(0.4, 0.06, 0.4), M.band, 0, 0.8, 2);
  const aams = [], agms = [];
  for (const s of [-1, 1]) {
    for (const x of [3.3, 4.4, 5.5]) { pylon(g, M, x * s, -0.35, -0.3, 0.3, 1.8); agms.push(agm(g, M, x * s, -0.85, -0.4)); }
    pylon(g, M, 7.2 * s, -0.1, -0.3, 0.25, 1.4); aams.push(aam(g, M, 7.2 * s, -0.5, -0.3));
  }
  const fl = new THREE.Group(); fl.position.z = 6.55;
  for (const s of [-1, 1]) { const f = flame(M, 0.3, 1.2); f.position.set(1.25 * s, 0.95, 0); fl.add(f); }
  g.add(fl);
  return { g, flame: fl, aams, agms };
}

function su25(M) {
  const g = new THREE.Group();
  add(g, loft([[-7.9, 0.001, 0.001, 0.001, -0.1], [-7.2, 0.3, 0.3, 0.3, -0.1], [-5.8, 0.58, 0.62, 0.55, 0, 2.3], [-4.3, 0.72, 0.95, 0.65, 0.05, 2.6],
    [-2, 0.78, 0.7, 0.7, 0, 3], [2, 0.7, 0.65, 0.6, 0.05, 2.8], [5.2, 0.45, 0.5, 0.4, 0.15, 2.4], [7.4, 0.2, 0.3, 0.2, 0.3]]), M.skin);
  add(g, new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.75, 0.75, 1.7), M.glass, 0, 0.85, -4.3);
  add(g, new THREE.CircleGeometry(0.25, 14).rotateY(Math.PI), M.glass, 0, -0.1, -7.25);
  // engine nacelles along the fuselage sides
  for (const s of [-1, 1]) {
    add(g, loft([[-3, 0.45, 0.5, 0.5, -0.15, 3], [-1, 0.52, 0.55, 0.55, -0.15, 2.6], [3.5, 0.5, 0.52, 0.52, -0.1, 2.2], [5.3, 0.42, 0.42, 0.42, -0.05]], 18, false), M.skin, 0.95 * s, 0, 0);
    add(g, new THREE.CircleGeometry(0.45, 16).scale(0.9, 1, 1).rotateY(Math.PI), M.dark, 0.95 * s, -0.15, -3.01);
    add(g, cyl(0.4, 0.36, 0.5, 16), M.nozzle, 0.95 * s, -0.05, 5.5);
  }
  add(g, wing([[1.3, -1.6, 3.4, 0.11, 0.2], [3.5, -0.6, 2.5, 0.1, 0.15], [7.2, 0.9, 1.3, 0.08, 0.05]]), M.skin);
  add(g, wing([[0.4, 4.9, 2.1, 0.05, 0.4], [2.8, 5.8, 1.1, 0.045, 0.5]]), M.skin);
  add(g, fin([[0.4, 4.4, 2.9, 0.05], [3.3, 6.1, 1.3, 0.045]]), M.skin, 0, 0.3, 0);
  add(g, new THREE.BoxGeometry(0.06, 0.5, 0.5), M.band, 0.08, 2.2, 5.6);
  const aams = [], agms = [];
  for (const s of [-1, 1]) {
    for (const x of [2.6, 3.9]) { pylon(g, M, x * s, 0.1, 0, 0.3, 1.6); agms.push(agm(g, M, x * s, -0.4, 0)); }
    pylon(g, M, 6.3 * s, 0.05, 0.4, 0.25, 1.2); aams.push(aam(g, M, 6.3 * s, -0.3, 0.4));
  }
  const fl = new THREE.Group(); fl.position.z = 5.75;
  for (const s of [-1, 1]) { const f = flame(M, 0.33, 1.3); f.position.set(0.95 * s, -0.05, 0); fl.add(f); }
  g.add(fl);
  return { g, flame: fl, aams, agms };
}

const BUILD = { f16, su27, a10, su25 };
export function buildAircraft(type, ally) {
  const m = BUILD[type](materials(type, ally));
  m.type = type;
  return m;
}

// ---------- attack helicopters ----------
// Same interface as before: { g, rotor (spins about y), tail (spins about x) }; the nose is -z.
function blades(n, r, chord, M) {
  const rotor = new THREE.Group();
  const blade = wing([[0.3, -chord / 2, chord, 0.08, 0], [r, -chord / 2, chord * 0.85, 0.06, -0.08]], false);
  for (let i = 0; i < n; i++) { const b = add(rotor, blade, M.dark); b.rotation.y = i / n * Math.PI * 2; }
  add(rotor, new THREE.CylinderGeometry(0.3, 0.34, 0.35, 12), M.dark, 0, 0, 0);
  const blur = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  blur.castShadow = false;
  rotor.add(blur);
  return rotor;
}
function tailRotor(n, r, M) {
  const t = new THREE.Group();
  for (let i = 0; i < n; i++) add(t, new THREE.BoxGeometry(0.04, r * 2, 0.16), M.dark, 0, 0, 0, i * Math.PI / n);
  return t;
}
function heliMats(key, cols, pattern) {
  return {
    skin: new THREE.MeshStandardMaterial({ map: paint(key, cols, pattern), roughness: 0.65, metalness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.35, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.85 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4e5634, roughness: 0.6, metalness: 0.2 }),
  };
}
function hellfire(g, M, x, y, z) { add(g, cyl(0.09, 0.09, 1.6, 10), M.olive, x, y, z); add(g, new THREE.ConeGeometry(0.09, 0.2, 10).rotateX(-Math.PI / 2), M.dark, x, y, z - 0.9); }
function rocketPod(g, M, x, y, z, r = 0.25) { add(g, cyl(r, r, 1.6, 14), M.olive, x, y, z); add(g, new THREE.CircleGeometry(r * 0.85, 14).rotateY(Math.PI), M.dark, x, y, z - 0.81); }

export function buildApacheModel() {
  const M = heliMats('ah64', ['#3f4536', '#363b2e'], 'twotone'), g = new THREE.Group();
  // narrow fuselage with the stepped tandem cockpit
  add(g, loft([[-3.9, 0.001, 0.001, 0.001, -0.35], [-3.6, 0.3, 0.3, 0.3, -0.35], [-2.9, 0.48, 0.5, 0.55, -0.25, 2.6], [-1.4, 0.55, 0.65, 0.7, -0.1, 3],
    [0.5, 0.58, 0.8, 0.75, 0, 3.2], [2.0, 0.5, 0.75, 0.6, 0.05, 3], [3.2, 0.3, 0.45, 0.35, 0.2, 2.4], [8.2, 0.14, 0.2, 0.18, 0.35]]), M.skin);
  add(g, new THREE.SphereGeometry(0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.9, 1.4), M.glass, 0, 0.35, -2.45);
  add(g, new THREE.SphereGeometry(0.48, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 1.1, 1.3), M.glass, 0, 0.62, -1.3);
  // sensor turret on the nose and the chin gun
  add(g, new THREE.SphereGeometry(0.33, 14, 10), M.dark, 0, -0.45, -3.75);
  add(g, new THREE.BoxGeometry(0.34, 0.26, 0.34), M.dark, 0, -0.9, -2.15);
  add(g, cyl(0.05, 0.05, 1.5, 8), M.metal, 0, -0.95, -2.9);
  for (const s of [-1, 1]) {
    // engine nacelles high on the sides, exhaust suppressors
    add(g, loft([[-0.8, 0.001, 0.001, 0.001, 0], [-0.6, 0.3, 0.3, 0.3, 0], [1.3, 0.32, 0.32, 0.32, 0], [1.9, 0.22, 0.22, 0.22, 0.05]], 14), M.skin, 0.85 * s, 0.55, 0.3);
    add(g, cyl(0.2, 0.26, 0.5, 12), M.dark, 0.95 * s, 0.6, 2.2);
    // stub wing: Hellfires outboard, rocket pod inboard
    add(g, wing([[0.5, -0.5, 1.0, 0.1, 0], [2.0, -0.45, 0.8, 0.09, -0.08]], false), M.skin, 0, 0.02, 0).scale.x = s;
    for (const [dx, dy] of [[-0.15, -0.35], [0.15, -0.35], [-0.15, -0.62], [0.15, -0.62]]) hellfire(g, M, 1.8 * s + dx, dy, -0.2);
    rocketPod(g, M, 1.1 * s, -0.45, -0.2);
    add(g, new THREE.CylinderGeometry(0.28, 0.28, 0.16, 14).rotateZ(Math.PI / 2), M.dark, 1.0 * s, -1.3, -1.35);
    add(g, new THREE.BoxGeometry(0.07, 0.8, 0.07), M.dark, 1.0 * s, -0.9, -1.35);
  }
  add(g, fin([[0.1, 6.9, 1.2, 0.1], [1.8, 7.5, 0.8, 0.09]]), M.skin, 0, 0.4, 0);
  add(g, wing([[0.1, 7.4, 0.6, 0.08, 0.3], [1.2, 7.5, 0.5, 0.07, 0.3]]), M.skin);
  const rotor = blades(4, 7.3, 0.55, M); rotor.position.y = 1.78; g.add(rotor);
  add(g, new THREE.CylinderGeometry(0.1, 0.14, 0.6, 10), M.dark, 0, 1.5, 0);
  add(g, new THREE.SphereGeometry(0.28, 12, 8), M.dark, 0, 2.05, 0);
  const tail = tailRotor(2, 1.4, M); tail.position.set(-0.3, 1.9, 8.0); g.add(tail);
  return { g, rotor, tail };
}

export function buildHindModel() {
  const M = heliMats('mi24', ['#7a6e4a', '#4d5634', '#8e8058', '#3a3f2a'], 'blotch'), g = new THREE.Group();
  add(g, loft([[-4.5, 0.001, 0.001, 0.001, -0.3], [-4.1, 0.35, 0.35, 0.35, -0.3], [-3.2, 0.62, 0.6, 0.6, -0.15, 2.6], [-1.6, 0.9, 0.95, 0.9, 0, 3],
    [1.2, 1.0, 1.1, 0.95, 0.05, 3.2], [3.0, 0.8, 0.9, 0.7, 0.15, 2.8], [4.2, 0.35, 0.45, 0.35, 0.35, 2.4], [10.2, 0.16, 0.22, 0.18, 0.55]]), M.skin);
  // the "double bubble" tandem canopies
  add(g, new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.3), M.glass, 0, 0.25, -3.1);
  add(g, new THREE.SphereGeometry(0.55, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1.4), M.glass, 0, 0.62, -1.8);
  add(g, new THREE.SphereGeometry(0.2, 12, 8), M.dark, 0.2, -0.45, -4.0);
  add(g, cyl(0.06, 0.06, 1.3, 8), M.metal, -0.1, -0.5, -4.4);
  for (const s of [-1, 1]) {
    add(g, loft([[-1.2, 0.001, 0.001, 0.001, 0], [-0.9, 0.36, 0.36, 0.36, 0], [2.2, 0.36, 0.36, 0.36, 0], [2.8, 0.26, 0.26, 0.26, 0.05]], 14), M.skin, 0.72 * s, 1.1, 0);
    add(g, cyl(0.3, 0.3, 0.05, 14), M.dark, 0.72 * s, 1.1, -1.21);
    add(g, cyl(0.24, 0.3, 0.6, 12), M.dark, 1.0 * s, 1.05, 3.0);
    // anhedral stub wings, two rocket pods and the Shturm rails at the tip
    const w = add(g, wing([[0.9, -0.2, 1.6, 0.1, -0.1], [3.2, 0.1, 1.2, 0.09, -0.45]], false), M.skin, 0, 0.1, 0.2);
    w.scale.x = s;
    for (const x of [1.6, 2.4]) rocketPod(g, M, x * s, -0.35 - (x - 1.6) * 0.2, 0.3, 0.27);
    for (const dy of [-0.55, -0.85]) hellfire(g, M, 3.2 * s, dy, 0.4);
    add(g, new THREE.CylinderGeometry(0.3, 0.3, 0.18, 14).rotateZ(Math.PI / 2), M.dark, 1.1 * s, -1.4, 1.2);
    add(g, new THREE.BoxGeometry(0.08, 0.8, 0.08), M.dark, 1.1 * s, -1.0, 1.2);
  }
  add(g, fin([[0.2, 8.9, 1.4, 0.1], [2.0, 9.6, 0.9, 0.09]], 0, 0.1), M.skin, 0, 0.5, 0);
  add(g, wing([[0.1, 8.7, 0.7, 0.08, 0.5], [1.6, 8.8, 0.55, 0.07, 0.5]]), M.skin);
  const rotor = blades(5, 8.6, 0.6, M); rotor.position.y = 1.9; g.add(rotor);
  add(g, new THREE.CylinderGeometry(0.14, 0.18, 0.5, 10), M.dark, 0, 1.65, 0);
  const tail = tailRotor(3, 1.6, M); tail.position.set(-0.35, 2.2, 10.0); g.add(tail);
  return { g, rotor, tail };
}
