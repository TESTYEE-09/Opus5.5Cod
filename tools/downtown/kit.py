# Assembles buildings from Poly Haven's CC0 modular facade kits (urban apartments: 3 m bays and
# floors; factory: 4 m) in Blender. A kit's pieces are laid out in a showcase; each piece is
# placed by its bay origin (the wall grid cell it belongs to). Window and door inserts share
# the origin of their wall piece. Pieces are simplified first (flat faces dissolved), so a wall
# bay is a few dozen triangles instead of thousands.
import bpy, bmesh, math
from mathutils import Vector, Matrix

class Kit:
    def __init__(self, path, name):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        self.name = name
        self.P = {}
        for o in new:
            if o.type != 'MESH': continue
            o.data.transform(o.matrix_world)
            o.parent = None
            o.matrix_world = Matrix.Identity(4)
            n = o.name.split('.')[0]
            simplify(o, 0.16 if n.startswith(('window_', 'door_')) else 0.3 if n.startswith('crown_') else 1)
            self.P[n] = o
            o.hide_render = True; o.hide_viewport = True
        for o in new:
            if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
        ws = self.P['wall_standard_standard_01']
        lo, hi = bounds(ws)
        self.bay = round(hi.x - lo.x, 2)
        self.floor = round(hi.z - lo.z, 2)

    def has(self, n): return n in self.P

    def origin(self, n):
        lo, hi = bounds(self.P[n])
        if '_pier_' in n: return Vector((lo.x - lo.y, 0, math.floor(lo.z + 0.05)))
        return Vector((math.floor(lo.x + 0.05), 0, math.floor(lo.z + 0.05)))

    # a copy of piece n with its origin at local (x, z) of the facade frame F
    def put(self, F, n, x, z, ref=None, coll=None):
        if n not in self.P: return None
        src = self.P[n]
        o0 = self.origin(ref or n)
        o = bpy.data.objects.new(n, src.data)
        (coll or bpy.context.scene.collection).objects.link(o)
        o.matrix_world = F @ Matrix.Translation((x - o0.x, 0, z - o0.z))
        return o

def bounds(o):
    vs = [v.co for v in o.data.vertices]
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))

def simplify(o, ratio=1):
    if ratio < 1 and len(o.data.polygons) > 200:
        m = o.modifiers.new('d', 'DECIMATE'); m.ratio = ratio; m.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear(); old = o.data; o.data = me
        if old.users == 0: bpy.data.meshes.remove(old)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.5), verts=bm.verts, edges=bm.edges, delimit={'NORMAL', 'MATERIAL', 'SEAM', 'UV'})
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()

# the frame of one side of a building: local x along the side, local -y facing out
def frame(corner, outward):
    a = math.atan2(outward[0], -outward[1])
    return Matrix.Translation((corner[0], corner[1], 0)) @ Matrix.Rotation(a, 4, 'Z')

# A building on the rectangle x0..x1, z0..z1 (game coordinates: Blender y = -z).
# style: dict(win=[...insert names per floor], ground=callable(bay index, bays) -> wall name,
# floors, tint). Returns the list of new objects.
def building(kit, x0, z0, x1, z1, floors, style, coll):
    out = []
    sides = [((x0, -z1), (0, -1), x1 - x0, 'front'), ((x1, -z0), (0, 1), x1 - x0, 'back'),
             ((x1, -z1), (1, 0), z1 - z0, 'side'), ((x0, -z0), (-1, 0), z1 - z0, 'side')]
    H, B = kit.floor, kit.bay
    for corner, n, length, role in sides:
        if style.get('only') and role not in style['only']: continue
        F = frame(corner, n)
        bays = int(round(length / B))
        facing = style.get('faces', {}).get(role, role)
        for b in range(bays):
            x = b * B
            # ground floor
            g = style['ground'](b, bays, facing)
            if isinstance(g, tuple):
                out.append(kit.put(F, g[0], x, 0, coll=coll))
                if g[1]: out.append(kit.put(F, g[1], x, 0, ref=g[0], coll=coll))
            else: out.append(kit.put(F, g, x, 0, coll=coll))
            out.append(kit.put(F, style.get('base', 'base_standard_standard_01' if kit.has('base_standard_standard_01') else 'base_standard_01'), x, 0, coll=coll))
            out.append(kit.put(F, style.get('cornice', 'cornice_standard_standard_01'), x, H, coll=coll))
            for f in range(1, floors):
                w, i = style['upper'](b, bays, f, floors, facing)
                out.append(kit.put(F, w, x, f * H, coll=coll))
                if i: out.append(kit.put(F, i, x, f * H, ref=w, coll=coll))
            out.append(kit.put(F, style.get('crown', 'crown_standard_standard_01'), x, floors * H, coll=coll))
        # corner piers wrap the corner this side starts from
        for p, z in (('wall_pier_corner_01', 0), ('dado_pier_corner_01', 0), ('cornice_pier_corner_01', H), ('crown_pier_corner_01', floors * H)):
            if kit.has(p):
                for f in (range(floors) if p == 'wall_pier_corner_01' else [0]):
                    out.append(kit.put(F, p, 0, z + f * H if p == 'wall_pier_corner_01' else z, coll=coll))
    # flat roof over the top
    bpy.ops.mesh.primitive_plane_add(size=1, location=((x0 + x1) / 2, -(z0 + z1) / 2, floors * H + 0.05))
    r = bpy.context.active_object
    r.scale = (x1 - x0, z1 - z0, 1)
    bpy.ops.object.transform_apply(scale=True)
    for c in r.users_collection: c.objects.unlink(r)
    coll.objects.link(r)
    r.data.materials.append(bpy.data.materials.get('roof'))
    out.append(r)
    return [o for o in out if o]
