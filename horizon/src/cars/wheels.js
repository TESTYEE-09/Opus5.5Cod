// Procedural wheels: tyre, rim (barrel, lip, spokes in several styles), brake disc and caliper.
// Axle along x; the outer face of the wheel looks toward +x. Geometry is cached per spec.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cache = new Map();
const cached = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

// sidewall and tread texture: u runs around the tyre, v across the profile
function tyreTexture(brand = 'SUNRISE', model = 'PERFORMANCE RS') {
  return cached(`tyretex${brand}${model}`, () => {
    const W = 2048, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#161616'; g.fillRect(0, 0, W, H);
    // tread band in the middle: circumferential grooves plus sipes
    const t0 = H * 0.3, t1 = H * 0.7;
    g.fillStyle = '#121212'; g.fillRect(0, t0, W, t1 - t0);
    g.fillStyle = '#050505';
    for (const f of [0.36, 0.47, 0.58]) g.fillRect(0, H * f, W, H * 0.018);
    for (let x = 0; x < W; x += 24) { g.fillRect(x, t0 + 4, 3, H * 0.05); g.fillRect(x + 12, t1 - H * 0.05 - 4, 3, H * 0.05); }
    // sidewall lettering on the outer wall (v near 1)
    g.font = 'bold 34px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = '#3a3a3a';
    for (let k = 0; k < 2; k++) {
      g.save(); g.translate(W * (0.04 + k * 0.5), H * 0.86); g.scale(1, -1);
      g.fillText(brand, 0, 0); g.font = '600 20px Arial'; g.fillText(model + '  ·  245/35ZR20 95Y', 230, 2); g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;
    return tex;
  });
}

function tyreGeometry(r, w, rimR) {
  return cached(`tyre${r.toFixed(3)},${w.toFixed(3)},${rimR.toFixed(3)}`, () => {
    // profile from the inner bead (x = -w/2) over the tread to the outer bead (x = +w/2)
    const pts = [];
    const side = r - rimR, sh = Math.min(0.035, side * 0.35);
    const prof = [
      [-w * 0.46, rimR + 0.004], [-w * 0.5, rimR + side * 0.25], [-w * 0.52, rimR + side * 0.55], [-w * 0.5, r - sh * 1.2],
      [-w * 0.44, r - sh * 0.25], [-w * 0.36, r], [w * 0.36, r], [w * 0.44, r - sh * 0.25],
      [w * 0.5, r - sh * 1.2], [w * 0.52, rimR + side * 0.55], [w * 0.5, rimR + side * 0.25], [w * 0.46, rimR + 0.004],
    ];
    // smooth with Catmull-Rom
    const curve = new THREE.SplineCurve(prof.map(([x, y]) => new THREE.Vector2(y, x)));
    for (const p of curve.getPoints(40)) pts.push(new THREE.Vector2(p.x, p.y));
    const g = new THREE.LatheGeometry(pts, 72);
    // lathe spins around y: turn so the axle is x
    g.rotateZ(-Math.PI / 2);
    return g;
  });
}

// a ring (annulus) swept as a lathe, for the barrel and the lip
function lathe(profile, seg = 64) {
  const g = new THREE.LatheGeometry(profile.map(([rr, x]) => new THREE.Vector2(rr, x)), seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}

// One spoke outline in the wheel plane (radial r along +y, tangent along z), extruded along x.
function spokeShape(style, r0, r1) {
  const s = new THREE.Shape();
  const hw0 = style.hub, hw1 = style.tip;
  if (style.split) {
    // Y spoke: one arm from the hub that forks in two near the rim
    const fork = r0 + (r1 - r0) * style.fork;
    s.moveTo(-hw0, r0); s.lineTo(hw0, r0); s.lineTo(hw0 * 0.9, fork);
    s.lineTo(style.spread + hw1, r1); s.lineTo(style.spread - hw1, r1); s.lineTo(0, fork + (r1 - fork) * 0.35);
    s.lineTo(-style.spread + hw1, r1); s.lineTo(-style.spread - hw1, r1); s.lineTo(-hw0 * 0.9, fork); s.lineTo(-hw0, r0);
  } else {
    s.moveTo(-hw0, r0); s.lineTo(hw0, r0);
    s.bezierCurveTo(hw0, (r0 + r1) / 2, hw1, (r0 + r1) / 2, hw1, r1);
    s.lineTo(-hw1, r1);
    s.bezierCurveTo(-hw1, (r0 + r1) / 2, -hw0, (r0 + r1) / 2, -hw0, r0);
  }
  return s;
}

export const RIMS = {
  z06: { n: 5, hub: 0.022, tip: 0.012, split: true, fork: 0.35, spread: 0.05, depth: 0.025, dish: 0.02 },
  spoke5: { n: 5, hub: 0.03, tip: 0.028, depth: 0.028, dish: 0.03 },
  spoke10: { n: 10, hub: 0.014, tip: 0.012, depth: 0.022, dish: 0.02 },
  te37: { n: 6, hub: 0.03, tip: 0.02, depth: 0.03, dish: 0.045, rib: true },
  twin7: { n: 7, hub: 0.022, tip: 0.013, split: true, fork: 0.15, spread: 0.028, depth: 0.024, dish: 0.018 },
  multi: { n: 15, hub: 0.008, tip: 0.008, depth: 0.018, dish: 0.012 },
  turbine: { n: 12, hub: 0.012, tip: 0.02, depth: 0.02, dish: 0.01, twist: 0.35 },
  mesh: { n: 10, hub: 0.006, tip: 0.006, depth: 0.018, dish: 0.03, mesh: true },
  classic: { n: 5, hub: 0.045, tip: 0.03, depth: 0.03, dish: 0.0, cap: 0.11 },
  rally: { n: 8, hub: 0.02, tip: 0.02, depth: 0.03, dish: 0.035 },
  star: { n: 5, hub: 0.035, tip: 0.018, depth: 0.028, dish: 0.035, twist: 0.12 },
};

function rimFaceGeometry(style, rimR) {
  return cached(`rim${JSON.stringify(style)}${rimR.toFixed(3)}`, () => {
    const parts = [];
    const r0 = rimR * 0.28, r1 = rimR * 0.94;
    const shape = spokeShape(style, r0, r1);
    const spoke = new THREE.ExtrudeGeometry(shape, { depth: style.depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.0035, bevelSegments: 2, curveSegments: 6 });
    // extruded along +z; make thickness run along x (outward), radial along y
    spoke.rotateY(Math.PI / 2);
    spoke.translate(-style.depth, 0, 0);
    const reps = style.mesh ? style.n * 2 : style.n;
    for (let i = 0; i < reps; i++) {
      const g = spoke.clone();
      if (style.mesh) g.rotateX(i % 2 ? 0.22 : -0.22);
      if (style.twist) g.rotateX(style.twist);
      g.rotateX((i / style.n) * Math.PI * 2);
      parts.push(g);
    }
    let face = mergeGeometries(parts);
    // dish: push the spokes inward toward the hub for a concave face
    const p = face.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const rr = Math.hypot(p.getY(i), p.getZ(i)) / rimR;
      p.setX(i, p.getX(i) - style.dish * (1 - rr) * 1.6 + (style.rib && rr > 0.8 ? 0.004 : 0));
    }
    face.computeVertexNormals();
    // hub with centre cap
    const hubR = style.cap ?? rimR * 0.3;
    const hub = new THREE.CylinderGeometry(hubR, hubR * 1.05, 0.03, 32);
    hub.rotateZ(Math.PI / 2); hub.translate(-style.dish * 1.3 - 0.005, 0, 0);
    parts.length = 0; parts.push(face, hub.toNonIndexed());
    return mergeGeometries(parts);
  });
}

function nutsGeometry(rimR, dish) {
  return cached(`nuts${rimR}${dish}`, () => {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6);
      g.rotateZ(Math.PI / 2);
      const a = (i / 5) * Math.PI * 2;
      g.translate(-dish * 1.3 + 0.012, Math.cos(a) * rimR * 0.2, Math.sin(a) * rimR * 0.2);
      parts.push(g);
    }
    const cap = new THREE.SphereGeometry(rimR * 0.1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.rotateZ(-Math.PI / 2); cap.scale(0.4, 1, 1); cap.translate(-dish * 1.3 + 0.012, 0, 0);
    parts.push(cap);
    return mergeGeometries(parts);
  });
}

function discTexture() {
  return cached('disctex', () => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
    grd.addColorStop(0, '#555'); grd.addColorStop(0.5, '#8a8a8a'); grd.addColorStop(1, '#6d6d6d');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    // machining rings
    for (let r = S * 0.25; r < S / 2; r += 2) { g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.stroke(); }
    // cross-drilled holes on spiral rows
    g.fillStyle = '#111';
    for (let i = 0; i < 36; i++) for (let k = 0; k < 3; k++) {
      const a = (i / 36) * Math.PI * 2 + k * 0.05, rr = S * (0.33 + k * 0.05);
      g.beginPath(); g.arc(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr, 4, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  });
}

const matCache = new Map();
function mat(key, f) { if (!matCache.has(key)) matCache.set(key, f()); return matCache.get(key); }

export function rimMaterial(color = 0xb8bcc2, finish = 'painted') {
  return mat(`rim${color}${finish}`, () => {
    const m = new THREE.MeshPhysicalMaterial({ color, metalness: finish === 'chrome' ? 1 : 0.85, roughness: finish === 'chrome' ? 0.05 : finish === 'satin' ? 0.45 : 0.28, clearcoat: finish === 'chrome' ? 0 : 0.8, clearcoatRoughness: 0.08 });
    return m;
  });
}

// Build one wheel. spec: { r (tyre radius), w (tyre width), rim (rim radius), style, color, finish, caliper, brand }
export function buildWheel(spec) {
  const style = RIMS[spec.style] ?? RIMS.spoke5;
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const tyreMat = mat('tyre', () => new THREE.MeshStandardMaterial({ map: tyreTexture(), roughness: 0.88, metalness: 0 }));
  const tyre = new THREE.Mesh(tyreGeometry(spec.r, spec.w, spec.rim), tyreMat);
  tyre.castShadow = true;
  spin.add(tyre);
  const rm = rimMaterial(spec.color ?? 0xb8bcc2, spec.finish ?? 'painted');
  // barrel (dark inside) and polished lip on the outer edge
  const barrel = new THREE.Mesh(cached(`barrel${spec.rim}${spec.w}`, () => lathe([[spec.rim * 0.96, -spec.w * 0.45], [spec.rim * 0.9, -spec.w * 0.3], [spec.rim * 0.9, spec.w * 0.3], [spec.rim * 0.97, spec.w * 0.42]])),
    mat('barrel', () => new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.8, roughness: 0.5, side: THREE.DoubleSide })));
  spin.add(barrel);
  const lip = new THREE.Mesh(cached(`lip${spec.rim}${spec.w}`, () => lathe([[spec.rim * 0.9, spec.w * 0.4], [spec.rim * 1.02, spec.w * 0.44], [spec.rim * 1.04, spec.w * 0.47], [spec.rim * 0.99, spec.w * 0.49]])),
    spec.lip === 'chrome' ? rimMaterial(0xffffff, 'chrome') : rm);
  spin.add(lip);
  const face = new THREE.Mesh(rimFaceGeometry(style, spec.rim), rm);
  face.position.x = spec.w * 0.43;
  face.castShadow = true;
  spin.add(face);
  const nuts = new THREE.Mesh(nutsGeometry(spec.rim, style.dish), rimMaterial(0x9aa0a8, 'chrome'));
  nuts.position.x = spec.w * 0.43;
  spin.add(nuts);
  // brake disc and caliper sit behind the spokes
  const discR = spec.rim * 0.86;
  const disc = new THREE.Mesh(cached(`disc${discR}`, () => { const g = new THREE.CylinderGeometry(discR, discR, 0.032, 48); g.rotateZ(Math.PI / 2); return g; }),
    mat('disc', () => new THREE.MeshStandardMaterial({ map: discTexture(), metalness: 0.9, roughness: 0.42, emissive: 0xff3300, emissiveIntensity: 0 })));
  disc.position.x = spec.w * 0.05;
  spin.add(disc);
  const cal = new THREE.Mesh(cached(`cal${discR}`, () => {
    const g = new RoundedBoxGeometry(0.075, 0.065, discR * 0.9, 2, 0.02);
    g.translate(0, discR * 0.82, 0);
    return g;
  }), mat(`cal${spec.caliper ?? 0xcc1010}`, () => new THREE.MeshPhysicalMaterial({ color: spec.caliper ?? 0xcc1010, roughness: 0.3, clearcoat: 1 })));
  cal.position.x = spec.w * 0.08;
  cal.rotation.x = spec.caliperAngle ?? 0.6;
  root.add(cal);
  root.userData = { spin, disc, radius: spec.r };
  return root;
}
