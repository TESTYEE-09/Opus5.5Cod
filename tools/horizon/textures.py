# Generates tileable ground textures for Horizon: asphalt, grass, sand (albedo + normal).
#   python3 tools/horizon/textures.py
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import os
OUT = os.path.join(os.path.dirname(__file__), '../../public/hz/tex')
os.makedirs(OUT, exist_ok=True)
S = 1024
rng = np.random.default_rng(7)

def pnoise(scale, power=2.0, seed=0):
    # periodic noise: white noise shaped in the frequency domain
    r = np.random.default_rng(seed)
    w = r.standard_normal((S, S))
    f = np.fft.fft2(w)
    ky = np.fft.fftfreq(S)[:, None]; kx = np.fft.fftfreq(S)[None, :]
    k = np.sqrt(kx * kx + ky * ky) * S / scale
    k[0, 0] = 1
    f *= 1.0 / (1 + k ** power)
    n = np.real(np.fft.ifft2(f))
    n -= n.min(); n /= n.max()
    return n

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def save(name, arr, q=90):
    Image.fromarray(arr).save(os.path.join(OUT, name), quality=q)

# ---------------------------------------------------------------- asphalt
base = 0.55 * pnoise(6, 2, 1) + 0.3 * pnoise(40, 2, 2) + 0.15 * pnoise(180, 1.5, 3)
stones = np.zeros((S, S))
img = Image.new('L', (S, S), 0); d = ImageDraw.Draw(img)
for i in range(26000):
    x, y = rng.integers(0, S, 2); r = rng.uniform(0.6, 2.4); v = int(rng.uniform(40, 255))
    for ox in (-S, 0, S):
        for oy in (-S, 0, S):
            d.ellipse([x + ox - r, y + oy - r, x + ox + r, y + oy + r], fill=v)
stones = np.asarray(img.filter(ImageFilter.GaussianBlur(0.6))) / 255.0
h = 0.5 * base + 0.8 * stones
alb = 0.16 + 0.06 * base + 0.14 * stones * (0.6 + 0.4 * pnoise(3, 2, 4))
wear = pnoise(2.5, 2, 5)
alb *= 0.85 + 0.3 * wear
a = np.clip(np.stack([alb, alb * 0.99, alb * 0.97], -1) * 255, 0, 255).astype(np.uint8)
save('asphalt_diff.jpg', a)
save('asphalt_nor.jpg', normal_from_height(h, 2.2))
rough = np.clip((0.78 + 0.12 * base - 0.2 * stones * 0.5) * 255, 0, 255).astype(np.uint8)
save('asphalt_rough.jpg', np.stack([rough] * 3, -1))

# ---------------------------------------------------------------- grass
img = Image.new('RGB', (S, S), (54, 78, 30)); d = ImageDraw.Draw(img)
patch = pnoise(4, 2, 11); patch2 = pnoise(18, 2, 12)
for i in range(120000):
    x, y = rng.uniform(0, S, 2)
    ang = rng.normal(-1.57, 0.6); ln = rng.uniform(4, 13)
    p = patch[int(y) % S, int(x) % S]; q = patch2[int(y) % S, int(x) % S]
    g = rng.uniform(0.6, 1.25)
    col = (int((40 + 60 * p + 30 * q) * g), int((70 + 70 * p + 25 * q) * g), int((22 + 25 * q) * g))
    x2, y2 = x + np.cos(ang) * ln, y + np.sin(ang) * ln
    for ox in (-S, 0, S):
        for oy in (-S, 0, S):
            if -20 < x + ox < S + 20 and -20 < y + oy < S + 20:
                d.line([x + ox, y + oy, x2 + ox, y2 + oy], fill=col, width=int(rng.integers(1, 3)))
img = img.filter(ImageFilter.GaussianBlur(0.4))
ga = np.asarray(img).astype(np.float32)
ga *= (0.85 + 0.3 * pnoise(3, 2, 13))[..., None]
save('grass_diff.jpg', np.clip(ga, 0, 255).astype(np.uint8))
lum = ga.mean(-1) / 255.0
save('grass_nor.jpg', normal_from_height(lum, 3.0))

# ---------------------------------------------------------------- sand
yy, xx = np.mgrid[0:S, 0:S] / S
warp = pnoise(3, 2, 21)
ripple = 0.5 + 0.5 * np.sin((yy * 22 + xx * 6 + warp * 3.0) * 2 * np.pi)
grain = pnoise(300, 1.2, 22)
hs = 0.6 * ripple + 0.3 * grain + 0.4 * pnoise(5, 2, 23)
al = 0.64 + 0.08 * grain - 0.05 * ripple + 0.06 * pnoise(4, 2, 24)
sand = np.stack([al * 0.93, al * 0.84, al * 0.66], -1)
save('sand_diff.jpg', np.clip(sand * 255, 0, 255).astype(np.uint8))
save('sand_nor.jpg', normal_from_height(hs, 1.2))
print('ok')
