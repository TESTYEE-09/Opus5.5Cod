// Procedural surface textures. Each one paints a colour canvas and a height canvas side by
// side, then derives a tangent-space normal map from the height so walls, bricks, planks and
// corrugated metal catch the light. Everything is seeded, so a map looks the same every load.
import * as THREE from 'three';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise: `cells` lattice cells across the texture, summed over octaves.
export function fbm(size, cells, octaves, seed, persist = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = cells << o, R = mulberry(seed + o * 101);
    const lat = new Float32Array(c * c);
    for (let i = 0; i < lat.length; i++) lat[i] = R();
    const step = c / size;
    for (let y = 0; y < size; y++) {
      const fy = y * step, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % c) * c, r1 = ((y0 + 1) % c) * c;
      for (let x = 0; x < size; x++) {
        const fx = x * step, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % c, c1 = (x0 + 1) % c;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp; amp *= persist;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const clamp255 = (v) => v < 0 ? 0 : v > 255 ? 255 : v;

// Painting context handed to each texture recipe.
class Painter {
  constructor(size, seed) {
    this.s = size;
    this.R = mulberry(seed);
    this.seed = seed;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
    this.cc = mk(); this.hc = mk();
    this.c = this.cc.getContext('2d', { willReadFrequently: true });
    this.h = this.hc.getContext('2d', { willReadFrequently: true });
    this.h.fillStyle = 'rgb(128,128,128)'; this.h.fillRect(0, 0, size, size);
  }
  rnd(a = 0, b = 1) { return a + (b - a) * this.R(); }
  // base colour: lerp between two colours by an fbm field
  base(colA, colB, cells = 4, oct = 5, contrast = 1) {
    const s = this.s, n = fbm(s, cells, oct, this.seed + 7), A = hex(colA), B = hex(colB);
    const img = this.c.createImageData(s, s), d = img.data;
    for (let i = 0; i < n.length; i++) {
      const t = Math.min(1, Math.max(0, 0.5 + (n[i] - 0.5) * 2 * contrast));
      d[i * 4] = A[0] + (B[0] - A[0]) * t; d[i * 4 + 1] = A[1] + (B[1] - A[1]) * t; d[i * 4 + 2] = A[2] + (B[2] - A[2]) * t; d[i * 4 + 3] = 255;
    }
    this.c.putImageData(img, 0, 0);
  }
  // multiply colour by fine grain and add it to height
  grain(colorAmt, heightAmt, cells = 32, oct = 3, seedOff = 3) {
    const s = this.s, n = fbm(s, cells, oct, this.seed + seedOff);
    if (colorAmt) {
      const img = this.c.getImageData(0, 0, s, s), d = img.data;
      for (let i = 0; i < n.length; i++) {
        const m = 1 + (n[i] - 0.5) * 2 * colorAmt;
        d[i * 4] = clamp255(d[i * 4] * m); d[i * 4 + 1] = clamp255(d[i * 4 + 1] * m); d[i * 4 + 2] = clamp255(d[i * 4 + 2] * m);
      }
      this.c.putImageData(img, 0, 0);
    }
    if (heightAmt) {
      const img = this.h.getImageData(0, 0, s, s), d = img.data;
      for (let i = 0; i < n.length; i++) { const v = clamp255(d[i * 4] + (n[i] - 0.5) * 255 * heightAmt); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
      this.h.putImageData(img, 0, 0);
    }
  }
  // per-pixel speckle, for gravel, aggregate and pits
  speckle(n, col, maxR, alpha, hval = null) {
    const { c, h, s } = this;
    for (let i = 0; i < n; i++) {
      const x = this.rnd(0, s), y = this.rnd(0, s), r = this.rnd(0.4, maxR);
      c.fillStyle = typeof col === 'function' ? col(this) : col;
      c.globalAlpha = alpha * this.rnd(0.4, 1);
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      if (hval !== null) { h.fillStyle = `rgb(${hval},${hval},${hval})`; h.globalAlpha = 0.8; h.beginPath(); h.arc(x, y, r, 0, 7); h.fill(); }
    }
    c.globalAlpha = 1; h.globalAlpha = 1;
  }
  // wandering crack lines, drawn dark and recessed
  cracks(n, len, width, alpha) {
    const { c, h, s } = this;
    for (let i = 0; i < n; i++) {
      let x = this.rnd(0, s), y = this.rnd(0, s), a = this.rnd(0, 6.28);
      const pts = [[x, y]];
      for (let j = 0; j < len; j++) { a += this.rnd(-0.7, 0.7); x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
      for (const [ctx, style, w] of [[c, `rgba(20,15,10,${alpha})`, width], [h, 'rgb(40,40,40)', width + 1]]) {
        ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath();
        pts.forEach(([px, py], k) => k ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
        ctx.stroke();
      }
    }
  }
  // blotchy stains
  stains(n, col, rMin, rMax, alpha) {
    const { c, s } = this;
    for (let i = 0; i < n; i++) {
      const x = this.rnd(0, s), y = this.rnd(0, s), r = this.rnd(rMin, rMax);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col.replace('A', alpha * this.rnd(0.5, 1))); g.addColorStop(1, col.replace('A', 0));
      c.fillStyle = g;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { c.save(); c.translate(ox, oy); c.fillRect(x - r, y - r, r * 2, r * 2); c.restore(); }
    }
  }
  // vertical drips (rain streaks, rust runs)
  streaks(n, col, alpha, wMax = 6) {
    const { c, s } = this;
    for (let i = 0; i < n; i++) {
      const x = this.rnd(0, s), y = this.rnd(0, s), l = this.rnd(s * 0.1, s * 0.5), w = this.rnd(1, wMax);
      const g = c.createLinearGradient(0, y, 0, y + l);
      g.addColorStop(0, col.replace('A', alpha)); g.addColorStop(1, col.replace('A', 0));
      c.fillStyle = g;
      c.fillRect(x, y, w, l); if (y + l > s) c.fillRect(x, y - s, w, l);
    }
  }
  // both canvases: rect in colour and height
  rect(x, y, w, hh, col, hv, alpha = 1) {
    const { c, h } = this;
    if (col) { c.globalAlpha = alpha; c.fillStyle = col; c.fillRect(x, y, w, hh); c.globalAlpha = 1; }
    if (hv !== null && hv !== undefined) { h.fillStyle = `rgb(${hv},${hv},${hv})`; h.fillRect(x, y, w, hh); }
  }
}

function normalFromHeight(hc, strength) {
  const s = hc.width, src = hc.getContext('2d').getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas'); out.width = out.height = s;
  const g = out.getContext('2d'), img = g.createImageData(s, s), d = img.data;
  const H = (x, y) => src[((((y + s) % s) * s) + ((x + s) % s)) * 4] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const o = (y * s + x) * 4;
    d[o] = (-dx / l * 0.5 + 0.5) * 255; d[o + 1] = (dy / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}

let anisotropy = 8;
export function setAnisotropy(a) { anisotropy = a; }

function toTex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const cache = new Map();
// Returns { map, normalMap, normalScale } for a recipe, cached by key.
export function surface(key, recipe, { size = 512, seed = 1, normal = 2 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const p = new Painter(size, seed);
  recipe(p);
  const set = { map: toTex(p.cc, true), normalMap: toTex(normalFromHeight(p.hc, normal * size / 256), false) };
  cache.set(key, set);
  return set;
}

// Grey tileable noise for breaking up texture repetition in world space.
let macro = null;
export function macroNoise() {
  if (macro) return macro;
  const s = 256, n = fbm(s, 4, 5, 999, 0.55);
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), img = g.createImageData(s, s);
  for (let i = 0; i < n.length; i++) { const v = n[i] * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  macro = toTex(c, false);
  return macro;
}

// ---------- recipes ----------
export const R = {
  plaster(col = 0xc9b48e, dark = 0xa89068) {
    return (p) => {
      p.base(dark, col, 3, 6, 1.3);
      p.stains(10, 'rgba(90,70,45,A)', 20, 90, 0.14);
      p.streaks(30, 'rgba(70,55,40,A)', 0.12, 8);
      p.grain(0.08, 0.35, 64, 3);
      p.cracks(5, 22, 1.2, 0.5);
      // chipped patches showing the brick under the render
      for (let i = 0; i < 3; i++) {
        const x = p.rnd(0, p.s), y = p.rnd(0, p.s);
        for (let r = 0; r < 3; r++) for (let b = 0; b < 3; b++) {
          if (p.R() < 0.4) continue;
          p.rect(x + b * 20 + (r % 2) * 10, y + r * 11, 18, 9, `hsl(${14 + p.rnd(0, 8)},40%,${34 + p.rnd(0, 8)}%)`, 90);
        }
      }
    };
  },
  concrete(col = 0xa29d93, dark = 0x86827a) {
    return (p) => {
      p.base(dark, col, 4, 6, 1.1);
      p.grain(0.1, 0.25, 96, 3);
      p.speckle(1400, 'rgb(60,58,54)', 1.4, 0.35, 90);
      p.stains(8, 'rgba(50,45,40,A)', 20, 70, 0.15);
      p.streaks(22, 'rgba(40,38,35,A)', 0.14, 5);
      const s = p.s;
      for (const y of [0, s / 2]) p.rect(0, y, s, 3, 'rgba(40,38,34,0.5)', 70);
      p.rect(s / 2, 0, 3, s, 'rgba(40,38,34,0.5)', 70);
      for (let y = s / 8; y < s; y += s / 4) for (let x = s / 8; x < s; x += s / 4) {
        p.c.fillStyle = 'rgba(30,28,26,0.7)'; p.c.beginPath(); p.c.arc(x, y, 4, 0, 7); p.c.fill();
        p.h.fillStyle = 'rgb(50,50,50)'; p.h.beginPath(); p.h.arc(x, y, 4, 0, 7); p.h.fill();
      }
      p.cracks(3, 16, 1, 0.45);
    };
  },
  brick(hue = 14, sat = 42, light = 38) {
    return (p) => {
      const s = p.s, rows = 16, bw = s / 8, bh = s / rows;
      p.base(0x8f8676, 0xb3a996, 8, 4);
      p.rect(0, 0, s, s, null, 60);
      for (let r = 0; r < rows; r++) for (let c = -1; c < 9; c++) {
        const x = c * bw + (r % 2) * bw / 2, y = r * bh;
        const l = light + p.rnd(-7, 7) - (p.R() < 0.08 ? 10 : 0);
        p.rect(x + 3, y + 3, bw - 5, bh - 5, `hsl(${hue + p.rnd(-4, 6)},${sat + p.rnd(-8, 8)}%,${l}%)`, 150 + p.rnd(-10, 10));
      }
      p.grain(0.16, 0.3, 64, 3);
      p.speckle(900, 'rgb(40,25,20)', 1.2, 0.35, 120);
      p.stains(8, 'rgba(60,50,40,A)', 30, 100, 0.2);
      p.streaks(20, 'rgba(50,40,30,A)', 0.14, 6);
    };
  },
  blocks(col = 0x958e81) {
    return (p) => {
      const s = p.s;
      p.base(0x6e685e, col, 4, 5);
      p.rect(0, 0, s, s, null, 70);
      for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
        const x = c * s / 2 + (r % 2) * s / 4, y = r * s / 4;
        p.rect(x + 4, y + 4, s / 2 - 7, s / 4 - 7, `rgba(${120 + p.rnd(-20, 20)},${114 + p.rnd(-20, 20)},${104 + p.rnd(-20, 20)},0.25)`, 150);
      }
      p.grain(0.14, 0.35, 48, 4);
      p.streaks(40, 'rgba(40,35,30,A)', 0.2, 8);
      p.cracks(4, 20, 1.2, 0.5);
    };
  },
  wood(col = 0x8a6a3c) {
    return (p) => {
      const s = p.s, n = 6, ph = s / n;
      const C = hex(col);
      for (let i = 0; i < n; i++) {
        const k = p.rnd(0.82, 1.1);
        p.rect(0, i * ph, s, ph, `rgb(${C[0] * k | 0},${C[1] * k | 0},${C[2] * k | 0})`, 140);
        for (let l = 0; l < 26; l++) {
          const y = i * ph + p.rnd(2, ph - 2);
          p.c.strokeStyle = `rgba(40,25,10,${p.rnd(0.05, 0.22)})`; p.c.lineWidth = p.rnd(0.6, 2);
          p.c.beginPath(); p.c.moveTo(0, y);
          for (let x = 0; x <= s; x += 32) p.c.lineTo(x, y + Math.sin(x * 0.02 + l) * p.rnd(0.5, 2.5));
          p.c.stroke();
        }
        p.rect(0, i * ph, s, 3, 'rgba(25,15,5,0.7)', 60);
      }
      p.grain(0.08, 0.2, 64, 3);
      const f = s * 0.085;
      for (const [x, y, w, h] of [[0, 0, s, f], [0, s - f, s, f], [0, 0, f, s], [s - f, 0, f, s]]) p.rect(x, y, w, h, `rgb(${C[0] * 0.72 | 0},${C[1] * 0.72 | 0},${C[2] * 0.72 | 0})`, 200);
      p.c.save(); p.h.save();
      for (const g of [p.c, p.h]) { g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); }
      p.rect(-s * 0.7, -f / 2, s * 1.4, f, `rgb(${C[0] * 0.76 | 0},${C[1] * 0.76 | 0},${C[2] * 0.76 | 0})`, 200);
      p.c.restore(); p.h.restore();
      p.speckle(40, 'rgb(60,60,60)', 3, 0.9, 230);
    };
  },
  planks(col = 0x7a5a38, vertical = false) {
    return (p) => {
      const s = p.s, n = 8, ph = s / n, C = hex(col);
      if (vertical) { p.c.save(); p.h.save(); for (const g of [p.c, p.h]) { g.translate(s, 0); g.rotate(Math.PI / 2); } }
      for (let i = 0; i < n; i++) {
        const k = p.rnd(0.75, 1.12);
        p.rect(0, i * ph, s, ph, `rgb(${C[0] * k | 0},${C[1] * k | 0},${C[2] * k | 0})`, 150);
        for (let l = 0; l < 20; l++) {
          const y = i * ph + p.rnd(2, ph - 2);
          p.c.strokeStyle = `rgba(30,20,10,${p.rnd(0.06, 0.25)})`; p.c.lineWidth = p.rnd(0.5, 1.6);
          p.c.beginPath(); p.c.moveTo(0, y);
          for (let x = 0; x <= s; x += 32) p.c.lineTo(x, y + Math.sin(x * 0.015 + l * 3) * 2);
          p.c.stroke();
        }
        p.rect(0, i * ph, s, 3, 'rgba(15,10,5,0.8)', 40);
        const jx = p.rnd(0, s); p.rect(jx, i * ph, 3, ph, 'rgba(15,10,5,0.7)', 50);
        for (const nx of [jx - 12, jx + 12]) p.rect(nx, i * ph + ph / 2 - 2, 4, 4, 'rgb(50,50,50)', 200);
      }
      if (vertical) { p.c.restore(); p.h.restore(); }
      p.grain(0.1, 0.2, 64, 3);
      p.stains(6, 'rgba(30,25,20,A)', 30, 90, 0.25);
    };
  },
  corrugated(col = 0x2d5870, rust = 0.25, faded = 0.1) {
    return (p) => {
      const s = p.s, C = hex(col);
      p.base(col, (C[0] * 0.8 << 16) | (C[1] * 0.8 << 8) | (C[2] * 0.8 | 0), 4, 5, 1.2);
      const period = s / 16;
      for (let x = 0; x < s; x++) {
        const ph = (x % period) / period;
        const v = ph < 0.2 ? 200 : ph < 0.5 ? 200 - (ph - 0.2) / 0.3 * 140 : ph < 0.7 ? 60 : 60 + (ph - 0.7) / 0.3 * 140;
        p.h.fillStyle = `rgb(${v},${v},${v})`; p.h.fillRect(x, 0, 1, s);
        const sh = (v - 130) / 130;
        p.c.fillStyle = sh > 0 ? `rgba(255,255,255,${sh * 0.07})` : `rgba(0,0,0,${-sh * 0.12})`; p.c.fillRect(x, 0, 1, s);
      }
      p.stains(Math.round(30 * rust), 'rgba(120,58,20,A)', 6, 40, 0.6);
      p.streaks(Math.round(80 * rust), 'rgba(110,55,20,A)', 0.4, 5);
      p.stains(10, 'rgba(230,230,220,A)', 30, 100, faded);
      p.grain(0.1, 0.1, 96, 3);
      p.speckle(200, 'rgb(90,45,20)', 2.5, 0.6);
    };
  },
  sandbag(col = 0x8a7a55) {
    return (p) => {
      const s = p.s, C = hex(col);
      p.base((C[0] * 0.7 << 16) | (C[1] * 0.7 << 8) | (C[2] * 0.7 | 0), col, 16, 3);
      p.rect(0, 0, s, s, null, 40);
      for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
        const x = c * s / 2 + (r % 2) * s / 4 + s / 4, y = r * s / 4 + s / 8;
        const rw = s / 4 - 4, rh = s / 8 - 4;
        const g = p.h.createRadialGradient(x, y, 0, x, y, rw);
        g.addColorStop(0, 'rgb(230,230,230)'); g.addColorStop(0.7, 'rgb(170,170,170)'); g.addColorStop(1, 'rgb(90,90,90)');
        p.h.fillStyle = g; p.h.beginPath(); p.h.ellipse(x, y, rw, rh, 0, 0, 7); p.h.fill();
        const k = p.rnd(0.85, 1.1);
        p.c.fillStyle = `rgba(${C[0] * k | 0},${C[1] * k | 0},${C[2] * k | 0},0.55)`; p.c.beginPath(); p.c.ellipse(x, y, rw, rh, 0, 0, 7); p.c.fill();
        p.c.strokeStyle = 'rgba(30,25,15,0.5)'; p.c.lineWidth = 3; p.c.stroke();
      }
      // weave
      for (let y = 0; y < s; y += 3) { p.c.fillStyle = 'rgba(0,0,0,0.05)'; p.c.fillRect(0, y, s, 1); }
      for (let x = 0; x < s; x += 3) { p.c.fillStyle = 'rgba(255,255,255,0.03)'; p.c.fillRect(x, 0, 1, s); }
      p.grain(0.08, 0.25, 128, 2);
    };
  },
  hesco() {
    return (p) => {
      const s = p.s;
      p.base(0x6f6448, 0x8c7f5d, 8, 4);
      p.rect(0, 0, s, s, null, 110);
      p.stains(14, 'rgba(60,50,30,A)', 20, 60, 0.3);
      p.grain(0.12, 0.35, 64, 3);
      for (let i = 0; i <= 8; i++) {
        const v = i * s / 8;
        p.rect(v - 2, 0, 4, s, 'rgb(120,122,118)', 210);
        p.rect(0, v - 2, s, 4, 'rgb(120,122,118)', 210);
      }
    };
  },
  metal(col = 0x6a625a) {
    return (p) => {
      p.base((hex(col)[0] * 0.8 << 16) | (hex(col)[1] * 0.8 << 8) | (hex(col)[2] * 0.8 | 0), col, 6, 5);
      p.grain(0.08, 0.1, 128, 2);
      p.stains(20, 'rgba(120,55,20,A)', 4, 26, 0.45);
      p.speckle(300, 'rgb(40,38,36)', 1.5, 0.3);
    };
  },
  diamond() {
    return (p) => {
      const s = p.s;
      p.base(0x5a5c5e, 0x7a7c7e, 8, 4);
      p.rect(0, 0, s, s, null, 100);
      for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) {
        for (const [ox, oy, a] of [[8, 8, 0.8], [24, 24, -0.8]]) {
          p.c.save(); p.h.save();
          for (const g of [p.c, p.h]) { g.translate(x + ox, y + oy); g.rotate(a); }
          p.rect(-9, -2.5, 18, 5, 'rgba(160,160,160,0.5)', 220);
          p.c.restore(); p.h.restore();
        }
      }
      p.stains(12, 'rgba(90,50,20,A)', 10, 50, 0.35);
      p.grain(0.08, 0.1, 64, 3);
    };
  },
  roof(col = 0x4f4640) {
    return (p) => {
      p.base((hex(col)[0] * 0.75 << 16) | (hex(col)[1] * 0.75 << 8) | (hex(col)[2] * 0.75 | 0), col, 4, 5);
      p.speckle(4000, (q) => `rgb(${q.rnd(60, 140) | 0},${q.rnd(55, 125) | 0},${q.rnd(50, 110) | 0})`, 1.8, 0.7, 170);
      p.grain(0.1, 0.25, 64, 3);
      p.stains(10, 'rgba(20,18,15,A)', 30, 90, 0.3);
    };
  },
  facade(col = 0xa39a8a, win = 0x3a3835) {
    return (p) => {
      const s = p.s;
      p.base((hex(col)[0] * 0.85 << 16) | (hex(col)[1] * 0.85 << 8) | (hex(col)[2] * 0.85 | 0), col, 4, 4);
      p.streaks(40, 'rgba(40,35,30,A)', 0.2, 6);
      for (let y = 20; y < s; y += 64) for (let x = 16; x < s; x += 64) {
        p.rect(x - 3, y - 3, 36, 44, 'rgba(230,225,215,0.35)', 170);
        const lit = p.R() < 0.12;
        p.rect(x, y, 30, 38, lit ? '#d9b36a' : `#${win.toString(16).padStart(6, '0')}`, 60);
        p.rect(x, y + 18, 30, 2, 'rgba(200,200,190,0.5)', 90);
        p.rect(x - 4, y + 40, 38, 4, 'rgba(210,205,195,0.5)', 190);
      }
      p.grain(0.08, 0.15, 64, 3);
    };
  },
  dirt(col = 0x9c8665, dark = 0x7a6548) {
    return (p) => {
      p.base(dark, col, 4, 6, 1.4);
      p.stains(24, 'rgba(60,45,30,A)', 20, 80, 0.18);
      p.speckle(2400, (q) => `rgb(${q.rnd(90, 170) | 0},${q.rnd(80, 150) | 0},${q.rnd(60, 120) | 0})`, 2.2, 0.8, 185);
      p.speckle(500, 'rgb(40,32,24)', 1.4, 0.5, 90);
      p.grain(0.12, 0.45, 48, 4);
      p.cracks(6, 14, 1, 0.35);
    };
  },
  asphalt() {
    return (p) => {
      p.base(0x3c3b39, 0x52504c, 4, 6, 1.2);
      p.speckle(6000, (q) => `rgb(${q.rnd(70, 140) | 0},${q.rnd(70, 135) | 0},${q.rnd(65, 125) | 0})`, 1.1, 0.6, 165);
      p.grain(0.08, 0.3, 128, 2);
      p.stains(10, 'rgba(15,14,12,A)', 20, 70, 0.3);
      p.cracks(8, 18, 1.4, 0.55);
    };
  },
  slab(col = 0x8e8b84) {
    return (p) => {
      const s = p.s;
      p.base((hex(col)[0] * 0.85 << 16) | (hex(col)[1] * 0.85 << 8) | (hex(col)[2] * 0.85 | 0), col, 4, 5, 1.2);
      p.grain(0.08, 0.2, 96, 3);
      p.stains(14, 'rgba(25,22,20,A)', 10, 60, 0.35);
      for (const v of [0, s / 2]) { p.rect(0, v, s, 3, 'rgba(30,30,28,0.7)', 50); p.rect(v, 0, 3, s, 'rgba(30,30,28,0.7)', 50); }
      p.cracks(4, 16, 1, 0.4);
    };
  },
  snow() {
    return (p) => {
      p.base(0xc9d3de, 0xf1f5fa, 4, 6, 1.2);
      p.grain(0.04, 0.7, 24, 5, 11);
      p.stains(10, 'rgba(150,165,185,A)', 20, 80, 0.2);
      p.speckle(500, 'rgb(255,255,255)', 1, 0.9);
    };
  },
  mud() {
    return (p) => {
      p.base(0x4a4036, 0x6b6052, 4, 6, 1.3);
      p.stains(20, 'rgba(230,235,245,A)', 8, 40, 0.5);
      p.grain(0.1, 0.5, 48, 4);
      // tyre tracks
      for (const x of [p.s * 0.25, p.s * 0.7]) for (let y = 0; y < p.s; y += 4) p.rect(x + Math.sin(y * 0.03) * 3, y, 30, 4, `rgba(30,25,20,${p.rnd(0.12, 0.3)})`, 90 + p.rnd(-10, 10));
    };
  },
  tile() {
    return (p) => {
      const s = p.s, n = 8, t = s / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const l = 52 + p.rnd(-5, 5);
        p.rect(x * t, y * t, t, t, `hsl(${28 + p.rnd(-4, 4)},22%,${l}%)`, 150);
        p.rect(x * t, y * t, t, 2, 'rgba(40,35,30,0.7)', 80); p.rect(x * t, y * t, 2, t, 'rgba(40,35,30,0.7)', 80);
      }
      p.grain(0.1, 0.1, 64, 3);
      p.stains(10, 'rgba(50,40,30,A)', 20, 80, 0.25);
    };
  },
};

// ship deck: worn teal-green paint over steel plates, weld seams, tie-down plates, rust
R.shipdeck = () => (p) => {
  const s = p.s;
  p.base(0x344d47, 0x4d6a61, 4, 5, 1.1);
  p.stains(40, 'rgba(34,36,38,A)', 20, 90, 0.55);
  p.stains(16, 'rgba(105,66,38,A)', 10, 50, 0.35);
  p.stains(10, 'rgba(160,170,160,A)', 20, 70, 0.08);
  for (let v = 0; v < s; v += s / 2) { p.rect(0, v, s, 3, 'rgba(22,25,25,0.8)', 60); p.rect(v, 0, 3, s, 'rgba(22,25,25,0.8)', 60); }
  for (let v = 0; v < s; v += s / 2) for (let x = 0; x < s; x += 7) { p.rect(x, v + 3, 5, 2, 'rgba(95,100,96,0.55)', 175); p.rect(v + 3, x, 2, 5, 'rgba(95,100,96,0.55)', 175); }
  for (let y = s / 8; y < s; y += s / 4) for (let x = s / 8; x < s; x += s / 4) {
    p.rect(x - 10, y - 7, 20, 14, 'rgba(58,40,30,0.95)', 195);
    p.rect(x - 6, y - 3, 12, 6, 'rgba(24,20,16,0.95)', 105);
  }
  p.speckle(3000, (q) => `rgb(${q.rnd(36, 86) | 0},${q.rnd(46, 92) | 0},${q.rnd(44, 88) | 0})`, 1.5, 0.5, 150);
  p.grain(0.1, 0.25, 96, 3);
  p.cracks(14, 8, 1, 0.3);
};

// painted deck walkway: navy with worn yellow edge lines, v runs along
R.walkway = () => (p) => {
  const s = p.s;
  p.base(0x1d2a40, 0x2a3a55, 4, 4, 1.1);
  p.stains(26, 'rgba(40,44,44,A)', 10, 60, 0.5);
  for (const x of [0, s - 40]) p.rect(x, 0, 40, s, 'rgba(196,158,40,0.95)', 150);
  p.stains(30, 'rgba(50,48,40,A)', 6, 30, 0.45);
  p.speckle(1600, 'rgb(40,42,44)', 1.6, 0.6, 140);
  p.grain(0.1, 0.2, 96, 3);
};

// yellow deck marking
R.stripe = () => (p) => {
  p.base(0xb08a24, 0xc9a232, 4, 4, 1);
  p.stains(24, 'rgba(45,50,48,A)', 6, 40, 0.6);
  p.speckle(900, 'rgb(50,52,50)', 1.8, 0.7, 140);
  p.grain(0.1, 0.1, 96, 3);
};

// dirt track through the countryside: two worn wheel ruts, v runs along
R.track = (col = 0x8a7355) => (p) => {
  const s = p.s, C = hex(col);
  p.base((C[0] * 0.85 << 16) | (C[1] * 0.85 << 8) | (C[2] * 0.85 | 0), col, 4, 5, 1.2);
  p.speckle(2000, (q) => `rgb(${q.rnd(80, 150) | 0},${q.rnd(70, 130) | 0},${q.rnd(55, 105) | 0})`, 2, 0.7, 180);
  for (const x of [s * 0.22, s * 0.68]) for (let y = 0; y < s; y += 4) p.rect(x + Math.sin(y * 0.02) * 4, y, s * 0.1, 4, `rgba(40,32,24,${p.rnd(0.1, 0.25)})`, 95 + p.rnd(-10, 10));
  p.stains(16, 'rgba(70,90,50,A)', 10, 30, 0.25);
  p.grain(0.1, 0.4, 48, 4);
};

// Stencilled company logos and markings for containers and walls: one 1024 x 2048 atlas,
// 16 rows of 8:1 text, white, weathered, so decals can tint them.
export const LOGOS = ['VOGEL', 'ROHAN', 'HANSA LINE', 'MERIDIAN', 'KORVAX', 'TRANSOCEAN', 'СЕВМОРПУТЬ', 'ATLAS CARGO',
  'NORDLINK', 'POLARIS', 'ОПАСНО', 'NO SMOKING', '2.6m  8\'6"', 'VGLU 402731 6', 'KRLU 118405 2', 'MAX GROSS 30480 KG'];
let atlas = null;
export function logoAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 2048;
  const g = c.getContext('2d'), R0 = mulberry(77);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  LOGOS.forEach((t, i) => {
    const small = i >= 12;
    let size = small ? 64 : 104;
    g.font = `900 ${size}px Impact, "Arial Black", "Arial Narrow", sans-serif`;
    while (g.measureText(t).width > 980 && size > 30) { size -= 4; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; }
    g.fillText(t, 512, i * 128 + 66);
    if (i === 1 || i === 4) { g.fillRect(512 - g.measureText(t).width / 2, i * 128 + 116, g.measureText(t).width, 6); }
  });
  // weather it: knock out flecks and scrapes
  g.globalCompositeOperation = 'destination-out';
  for (let n = 0; n < 9000; n++) { g.globalAlpha = 0.3 + R0() * 0.7; g.beginPath(); g.arc(R0() * 1024, R0() * 2048, 0.5 + R0() * 2.5, 0, 7); g.fill(); }
  for (let n = 0; n < 160; n++) { g.globalAlpha = 0.5; g.fillRect(R0() * 1024, R0() * 2048, 10 + R0() * 60, 2 + R0() * 3); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = anisotropy;
  return atlas;
}

// road tile: asphalt with a dashed centre line and solid edge lines, v runs along the road
R.road = () => (p) => {
  R.asphalt()(p);
  const s = p.s;
  for (let y = 0; y < s; y += 128) p.rect(s / 2 - 5, y + 16, 10, 72, 'rgba(214,190,110,0.85)', 150);
  for (const x of [18, s - 26]) p.rect(x, 0, 8, s, 'rgba(225,225,215,0.7)', 150);
  p.grain(0.06, 0, 64, 2, 17);
};

R.waves = () => (p) => {
  p.base(0x808080, 0x808080, 1, 1);
  const s = p.s, n = fbm(s, 8, 5, 4242, 0.55);
  const img = p.h.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < n.length; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = n[i] * 255;
  p.h.putImageData(img, 0, 0);
};

// fine surface noise for gun metal and polymer
R.fine = (base = 0x808080) => (p) => { p.base(base, base, 1, 1); p.grain(0.05, 0.6, 128, 2, 5); };
R.fabric = () => (p) => {
  p.base(0x808080, 0x8a8a8a, 8, 3);
  for (let y = 0; y < p.s; y += 4) p.rect(0, y, p.s, 2, null, 170);
  for (let x = 0; x < p.s; x += 4) p.rect(x, 0, 2, p.s, null, 100);
  p.grain(0.05, 0.25, 64, 3, 9);
};

// disruptive camo from three layered noise fields
R.camo = (a, b, c, d) => (p) => {
  const s = p.s, n1 = fbm(s, 4, 4, p.seed + 1), n2 = fbm(s, 6, 4, p.seed + 2), n3 = fbm(s, 8, 3, p.seed + 3);
  const C = [a, b, c, d].map(v => [(v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const img = p.c.createImageData(s, s);
  for (let i = 0; i < n1.length; i++) {
    const k = n3[i] > 0.62 ? 3 : n2[i] > 0.58 ? 2 : n1[i] > 0.5 ? 1 : 0;
    img.data[i * 4] = C[k][0]; img.data[i * 4 + 1] = C[k][1]; img.data[i * 4 + 2] = C[k][2]; img.data[i * 4 + 3] = 255;
  }
  p.c.putImageData(img, 0, 0);
  for (let y = 0; y < s; y += 3) p.rect(0, y, s, 1, 'rgba(0,0,0,0.06)', 150);
  p.grain(0.1, 0.3, 96, 2, 21);
};
