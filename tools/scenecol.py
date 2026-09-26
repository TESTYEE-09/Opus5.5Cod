# Collision for a map made from a mesh scene, shared by the Bistro and Downtown builders.
# Works in Blender coordinates (z up) on a 0.5 m grid over 0..SIZE (the game's x = Blender x,
# the game's z = -Blender y). For every cell: the floor (first surface hit from below), what is
# in the way at walking height, and what is overhead up to 12 m. The street is flood-filled
# from the seeds; unreached cells (inside buildings, off the edge) become solid columns.
# Writes collision.json: boxes [x0, z0, x1, z1, y0, y1], spawns for both teams, interest points.
import json, time
import numpy as np
import bpy
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

def bvh_of(filter_fn):
    verts, polys = [], []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or not filter_fn(o): continue
        mw = o.matrix_world
        base = len(verts)
        verts += [mw @ v.co for v in o.data.vertices]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys, all_triangles=False)

def collide(bvh, size, seeds, out_path, spawn_axis=(1, 1), lift=True, top=12.0):
    CELL, N = 0.5, int(size / 0.5)
    ground = np.full((N, N), np.nan, np.float32)
    occ = {}
    blocked = np.zeros((N, N), bool)
    up = Vector((0, 0, 1))
    steps = int(top / 0.5)
    for k in range(N):
        for i in range(N):
            bx, by = (i + 0.5) * CELL, -(k + 0.5) * CELL
            h = bvh.ray_cast(Vector((bx, by, -30)), up, 80)
            if not h[0]: continue
            g = h[0].z
            ground[k, i] = g
            cells = []
            for j in range(1, steps):
                y = g + 0.25 + j * 0.5
                if bvh.find_nearest(Vector((bx, by, y)), 0.3)[0] is not None: cells.append(round(y, 2))
            if cells: occ[(k, i)] = cells
            if any(g + 0.4 < y < g + 1.8 for y in cells): blocked[k, i] = True
    log('cells sampled')
    reach = np.zeros((N, N), bool)
    stack = []
    for sx, sz in seeds:
        i, k = int(sx / CELL), int(sz / CELL)
        if not np.isnan(ground[k, i]) and not blocked[k, i]: reach[k, i] = True; stack.append((k, i))
    log('seeds', stack)
    while stack:
        k, i = stack.pop()
        for dk, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = k + dk, i + di
            if a < 0 or b < 0 or a >= N or b >= N or reach[a, b] or blocked[a, b] or np.isnan(ground[a, b]): continue
            if abs(ground[a, b] - ground[k, i]) > 0.45: continue
            reach[a, b] = True; stack.append((a, b))
    log('reachable cells', int(reach.sum()))
    gmin = float(np.nanmin(np.where(reach, ground, np.nan))) if lift else 0.0
    ground -= gmin
    occ = {key: [round(y - gmin, 2) for y in v] for key, v in occ.items()}
    rows = []
    for k in range(N):
        def spans(i):
            if not reach[k, i]: return ((-30.0, 60.0),)
            out = [(-30.0, round(float(ground[k, i]), 2))]
            for y in occ.get((k, i), []):
                a, b = round(y - 0.25, 2), round(y + 0.25, 2)
                if len(out) > 1 and out[-1][1] >= a - 0.01: out[-1] = (out[-1][0], b)
                else: out.append((a, b))
            return tuple(out)
        cur = [spans(i) for i in range(N)]
        i = 0
        while i < N:
            j = i
            while j + 1 < N and cur[j + 1] == cur[i]: j += 1
            for (y0, y1) in cur[i]: rows.append([round(i * CELL, 2), round(k * CELL, 2), round((j + 1) * CELL, 2), round((k + 1) * CELL, 2), y0, y1])
            i = j + 1
    log('boxes', len(rows))
    pts = np.argwhere(reach)
    xs, zs = (pts[:, 1] + 0.5) * CELL, (pts[:, 0] + 0.5) * CELL
    def spread(sel, n, gap):
        out = []
        for idx in sel:
            x, z = float(xs[idx]), float(zs[idx])
            k, i = int(z / CELL), int(x / CELL)
            if not reach[max(0, k - 3):k + 4, max(0, i - 3):i + 4].all(): continue
            if all((x - a) ** 2 + (z - b) ** 2 > gap * gap for a, b in out): out.append((round(x, 1), round(z, 1)))
            if len(out) >= n: break
        return out
    order = np.argsort(xs * spawn_axis[0] + zs * spawn_axis[1])
    spawns = [spread(order, 8, 3.5), spread(order[::-1], 8, 3.5)]
    interest = spread(np.random.default_rng(7).permutation(len(pts)), 50, 9)
    json.dump({'size': size, 'boxes': rows, 'spawns': spawns, 'interest': interest,
               'range': [0.0, round(float(np.nanmax(np.where(reach, ground, np.nan))), 2)]}, open(out_path, 'w'), separators=(',', ':'))
    log('collision written', out_path)
    return gmin

def lift_scene(dz):
    for o in bpy.context.scene.objects:
        if o.type == 'MESH' and o.parent is None: o.location.z += dz
