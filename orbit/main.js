// Orbit: a tiny gravity-slingshot arcade game on a 2D canvas.
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const $ = (id) => document.getElementById(id);
const G = 9000;

let W, H, ship, planets, stars, particles, score, fuel, alive, started = false;
let best = 0;
try { best = +localStorage.getItem('orbit-best') || 0; } catch {}
const ptr = { x: 0, y: 0, down: false };
const bg = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 }));

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function reset() {
  const n = 3 + Math.floor(Math.random() * 2);
  planets = [];
  for (let i = 0; i < n * 20 && planets.length < n; i++) {
    const r = 22 + Math.random() * 26;
    const p = { x: r + 40 + Math.random() * (W - 2 * r - 80), y: r + 60 + Math.random() * (H - 2 * r - 120), r,
                hue: Math.floor(Math.random() * 360) };
    if (planets.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r + 90)) planets.push(p);
  }
  ship = { x: W / 2, y: 40, vx: 60, vy: 0, a: 0 };
  stars = []; particles = [];
  for (let i = 0; i < 3; i++) spawnStar();
  score = 0; fuel = 100; alive = true;
}

function spawnStar() {
  for (let t = 0; t < 50; t++) {
    const s = { x: 30 + Math.random() * (W - 60), y: 50 + Math.random() * (H - 100), t: Math.random() * 6 };
    if (planets.every((p) => Math.hypot(s.x - p.x, s.y - p.y) > p.r + 30)) { stars.push(s); return; }
  }
}

function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * speed;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
  }
}

function update(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.5; }
  particles = particles.filter((p) => p.life > 0);
  for (const s of stars) s.t += dt;
  if (!alive || !started) return;

  let ax = 0, ay = 0;
  for (const p of planets) {
    const dx = p.x - ship.x, dy = p.y - ship.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
    if (d < p.r + 5) return crash();
    const f = (G * p.r / 30) / Math.max(d2, 400);
    ax += dx / d * f; ay += dy / d * f;
  }
  if (ptr.down && fuel > 0) {
    const dx = ptr.x - ship.x, dy = ptr.y - ship.y, d = Math.hypot(dx, dy) || 1;
    ax += dx / d * 220; ay += dy / d * 220;
    fuel = Math.max(0, fuel - dt * 12);
    ship.a = Math.atan2(dy, dx);
    particles.push({ x: ship.x, y: ship.y, vx: -dx / d * 120 + (Math.random() - .5) * 40,
                     vy: -dy / d * 120 + (Math.random() - .5) * 40, life: .6, color: '#ffb347' });
  } else if (Math.hypot(ship.vx, ship.vy) > 1) ship.a = Math.atan2(ship.vy, ship.vx);

  ship.vx += ax * dt; ship.vy += ay * dt;
  ship.x += ship.vx * dt; ship.y += ship.vy * dt;
  // wrap around the screen edges
  ship.x = (ship.x + W) % W; ship.y = (ship.y + H) % H;

  for (let i = stars.length - 1; i >= 0; i--) {
    if (Math.hypot(stars[i].x - ship.x, stars[i].y - ship.y) < 18) {
      burst(stars[i].x, stars[i].y, '#fff7a8', 24, 160);
      stars.splice(i, 1); score++; fuel = Math.min(100, fuel + 20); spawnStar();
    }
  }
  $('score').textContent = `Stars ${score}`;
  $('fuel').textContent = `Fuel ${Math.ceil(fuel)}`;
}

function crash() {
  alive = false;
  burst(ship.x, ship.y, '#ff6b6b', 60, 260);
  if (score > best) { best = score; try { localStorage.setItem('orbit-best', best); } catch {} }
  $('best').textContent = `Best ${best}`;
  $('msg').innerHTML = `<h1>CRASHED</h1><p>${score} star${score === 1 ? '' : 's'}</p><p>Click or tap to fly again</p>`;
  $('msg').style.display = 'flex';
}

function draw() {
  ctx.fillStyle = '#05060d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#8fa8d8';
  for (const s of bg) { ctx.globalAlpha = .3 + s.r * .4; ctx.fillRect(s.x * W, s.y * H, s.r, s.r); }
  ctx.globalAlpha = 1;

  for (const p of planets) {
    const g = ctx.createRadialGradient(p.x - p.r * .4, p.y - p.r * .4, p.r * .1, p.x, p.y, p.r);
    g.addColorStop(0, `hsl(${p.hue} 80% 70%)`); g.addColorStop(1, `hsl(${p.hue} 60% 22%)`);
    ctx.fillStyle = `hsla(${p.hue} 80% 60% / .08)`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, 7); ctx.fill();
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  for (const s of stars) {
    const r = 7 + Math.sin(s.t * 4) * 1.5;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.t);
    ctx.fillStyle = '#fff3a0'; ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, a = i * Math.PI / 5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.fill(); ctx.restore();
  }
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  ctx.globalAlpha = 1;
  if (alive) {
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.a);
    ctx.fillStyle = '#e8f1ff'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, 7); ctx.lineTo(-4, 0); ctx.lineTo(-8, -7); ctx.fill();
    ctx.restore();
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(.033, (now - last) / 1000); last = now;
  update(dt); draw();
  requestAnimationFrame(frame);
}

function setPtr(e) { ptr.x = e.clientX; ptr.y = e.clientY; }
cv.addEventListener('pointermove', setPtr);
cv.addEventListener('pointerdown', (e) => {
  setPtr(e);
  if (!started || !alive) { reset(); started = true; $('msg').style.display = 'none'; return; }
  ptr.down = true;
});
addEventListener('pointerup', () => { ptr.down = false; });
addEventListener('resize', () => { resize(); if (!started) reset(); });

resize(); reset();
$('best').textContent = `Best ${best}`;
requestAnimationFrame(frame);
