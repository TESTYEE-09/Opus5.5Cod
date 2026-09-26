# Builds the Downtown map from Poly Haven CC0 assets (hidden alley collection):
#   blender -b --python tools/downtown/build_downtown.py -- <ground texture dir> <out dir>
# A 160 m city block: an avenue and a cross street, apartment houses and brick factories
# assembled from the modular facade kits, a courtyard and alleys, a factory yard, a parking
# lot and a plaza, street lamps, covered cars, barriers, bins and hydrants. Exports a Draco GLB
# and collision.json (tools/scenecol.py).
# then: python3 tools/glbjpeg.py <the glb>  (re-encodes the embedded images, about a third the size)
import bpy, bmesh, sys, os, math, random
from mathutils import Matrix, Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
import kit as K
import scenecol

argv = sys.argv[sys.argv.index('--') + 1:]
TEX, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
MODELS = os.path.join(HERE, '..', '..', 'public', 'models')
SIZE = 160
rnd = random.Random(12)
bpy.ops.wm.read_factory_settings(use_empty=True)
city = bpy.data.collections.new('city'); bpy.context.scene.collection.children.link(city)

# ---------- materials for the ground ----------
def pbr(name, tid, tile):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    def img(kind, cs):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = bpy.data.images.load(os.path.join(TEX, f'{tid}_{kind}_1k.jpg'))
        n.image.colorspace_settings.name = cs
        return n
    d = img('diff', 'sRGB'); nt.links.new(d.outputs['Color'], b.inputs['Base Color'])
    nm = nt.nodes.new('ShaderNodeNormalMap'); nn = img('nor_gl', 'Non-Color')
    nt.links.new(nn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    a = img('arm', 'Non-Color'); sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(a.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    m['tile'] = tile
    return m
ROAD = pbr('road', 'asphalt_03', 6)
WALK = pbr('sidewalk', 'concrete_pavement', 3)
YARD = pbr('yard', 'damaged_concrete_floor', 4)
ROOF = pbr('roof', 'concrete_floor_02', 4)

# a box x0..x1, z0..z1 (game coordinates), y0..y1, UVs in world metres / tile
def slab(x0, z0, x1, z1, y0, y1, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = -z1 if v.co.y < 0 else -z0
        v.co.z = y0 if v.co.z < 0 else y1
    uv = bm.loops.layers.uv.new()
    t = mat['tile']
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            c = l.vert.co
            l[uv].uv = (c.x / t, c.y / t) if abs(n.z) > 0.5 else ((c.x + c.y) / t, c.z / t)
    me = bpy.data.meshes.new('slab'); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new('slab', me); city.objects.link(o)
    return o

# road everywhere (and out past the edges, under the backdrop), raised blocks with sidewalks
slab(-40, -40, SIZE + 40, SIZE + 40, -0.3, 0, ROAD)
for (x0, z0, x1, z1) in [(-40, -40, 72, 74), (88, -40, SIZE + 40, 74), (-40, 86, 72, SIZE + 40), (88, 86, SIZE + 40, SIZE + 40)]:
    slab(x0, z0, x1, z1, 0, 0.15, WALK)
# yards and courtyards: worn concrete just over the paving
for (x0, z0, x1, z1) in [(6, 24, 66, 41), (33, 41, 39, 68), (94, 42, 156, 68), (94, 92, 130, 128), (6, 119, 66, 154), (130, 6, 136, 42)]:
    slab(x0, z0, x1, z1, 0.15, 0.16, YARD)
# lane markings: dashed centre lines and zebra crossings
paint = bpy.data.materials.new('paint'); paint.diffuse_color = (0.85, 0.83, 0.75, 1)
pb = paint.node_tree.nodes['Principled BSDF'] if paint.use_nodes else None
paint.use_nodes = True; paint.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.8, 0.78, 0.7, 1); paint.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
paint['tile'] = 4
for z in range(-30, SIZE + 30, 6):
    if 66 < z < 94: continue
    slab(79.85, z, 80.15, z + 3, 0, 0.012, paint)
for x in range(-30, SIZE + 30, 6):
    if 66 < x < 94: continue
    slab(x, 79.85, x + 3, 80.15, 0, 0.012, paint)
for i in range(7):
    slab(73 + i * 2.1, 64.5, 74.2 + i * 2.1, 67.5, 0, 0.012, paint); slab(73 + i * 2.1, 92.5, 74.2 + i * 2.1, 95.5, 0, 0.012, paint)
    slab(64.5, 75 + i * 1.7, 67.5, 75.9 + i * 1.7, 0, 0.012, paint); slab(92.5, 75 + i * 1.7, 95.5, 75.9 + i * 1.7, 0, 0.012, paint)

# ---------- buildings ----------
APT = K.Kit(os.path.join(MODELS, 'modular_urban_apartments_facade/modular_urban_apartments_facade.gltf'), 'apt')
FAC = K.Kit(os.path.join(MODELS, 'modular_factory_facade/modular_factory_facade.gltf'), 'fac')
roofm = bpy.data.materials.get('roof')

def apt_style(win, door='centered_large'):
    def ground(b, n, face):
        if face == 'front' and b in (n // 2, 1): return (f'wall_door_{door}_01', f'door_{door}_01')
        return (f'wall_window_{win}_01', f'window_{win}_01') if (b % 3) != 2 else 'wall_standard_standard_01'
    def upper(b, n, f, fl, face):
        k = 3 if f == fl - 1 else 1 + (f - 1) % 2
        return f'wall_window_{win}_0{k}', f'window_{win}_0{k}'
    return {'ground': ground, 'upper': upper}
def fac_style(win):
    def ground(b, n, face):
        if b % 4 == 1: return ('wall_door_garage_centered_01', 'door_garage_centered_01')
        if face == 'front' and b == n - 2: return ('wall_door_centered_large_01', 'door_centered_large_01')
        return 'wall_standard_standard_01'
    def upper(b, n, f, fl, face):
        return f'wall_window_{win}_0{min(f, 4)}', f'window_{win}_0{min(f, 4)}'
    return {'ground': ground, 'upper': upper, 'cornice': 'cornice02_standard_standard_01'}

# (kit, x0, z0, x1, z1, floors, style, faces: which side counts as the street front)
B = [
    (APT, 39, 41, 66, 68, 5, apt_style('centered_large'), {'front': 'front'}),
    (APT, 6, 41, 33, 68, 4, apt_style('centered_double'), {}),
    (APT, 21, 6, 66, 24, 4, apt_style('centered_small'), {'side': 'front'}),
    (APT, 6, 6, 18, 24, 3, apt_style('offset_small', 'centered_small'), {}),
    (FAC, 94, 6, 130, 42, 4, fac_style('tall_large'), {}),
    (FAC, 136, 6, 154, 42, 3, fac_style('centered_large'), {}),
    (APT, 39, 92, 66, 119, 6, apt_style('centered_large'), {'back': 'front'}),
    (APT, 6, 92, 33, 119, 4, apt_style('centered_small'), {'back': 'front'}),
    (FAC, 136, 92, 154, 155, 3, fac_style('tall_large'), {}),
    (APT, 94, 131, 130, 155, 5, apt_style('centered_double'), {'back': 'front'}),
    # the view at each end of the streets
    (APT, 3, 158, 69, 170, 5, apt_style('centered_large'), {'back': 'front', 'only': ['back']}),
    (APT, 66, -15, 96, -3, 5, apt_style('centered_small'), {'front': 'back', 'back': 'front', 'only': ['front']}),
    (APT, 66, 163, 96, 175, 5, apt_style('centered_double'), {'back': 'front', 'only': ['back']}),
    (APT, -15, 66, -3, 96, 4, apt_style('centered_large'), {'only': ['side']}),
    (FAC, 163, 66, 175, 96, 4, fac_style('tall_large'), {'only': ['side']}),
    (APT, 94, 158, 157, 170, 4, apt_style('offset_small', 'centered_small'), {'back': 'front', 'only': ['back']}),
]
for (kit, x0, z0, x1, z1, fl, st, faces) in B:
    st = dict(st); st['only'] = faces.pop('only', None) if 'only' in faces else None; st['faces'] = faces
    objs = K.building(kit, x0, z0, x1, z1, fl, st, city)
    for o in objs:
        if o.name.startswith('Plane') or o.data.name.startswith('Plane'):
            o.data.materials.clear(); o.data.materials.append(ROOF)
            me = o.data
            uvl = me.uv_layers.active or me.uv_layers.new()
            for poly in me.polygons:
                for li in poly.loop_indices:
                    c = me.vertices[me.loops[li].vertex_index].co
                    uvl.data[li].uv = (c.x / 4, c.y / 4)
print('buildings done', flush=True)

# ---------- props ----------
PROPS = {}
def prop(name, pieces=None, file=None):
    if name in PROPS: return PROPS[name]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, file or name, f'{file or name}.gltf'))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = []
    for o in new:
        if o.type == 'MESH' and (pieces is None or o.name.split('.')[0] in pieces):
            o.data = o.data.copy(); o.data.transform(o.matrix_world); o.parent = None; o.matrix_world = Matrix.Identity(4); meshes.append(o)
    for o in new:
        if o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    p = bpy.context.view_layer.objects.active
    n = sum(len(f.vertices) - 2 for f in p.data.polygons)
    if n > 2000:
        m = p.modifiers.new('d', 'DECIMATE'); m.ratio = 2000 / n; m.use_collapse_triangulate = True
        me = bpy.data.meshes.new_from_object(p.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        p.modifiers.clear(); p.data = me
    p.hide_render = True; p.hide_viewport = True
    PROPS[name] = p
    return p
def put(name, x, z, rot=0, y=0.15, **kw):
    src = prop(name, **kw)
    o = bpy.data.objects.new(name, src.data); city.objects.link(o)
    o.matrix_world = Matrix.Translation((x, -z, y)) @ Matrix.Rotation(rot, 4, 'Z')
    return o
CAR = dict(pieces=None, file='covered_car')
# lamps along both streets
for z in list(range(8, 64, 16)) + list(range(100, 156, 16)):
    put('street_lamp_01', 67.2, z, -math.pi / 2); put('street_lamp_01', 92.8, z, math.pi / 2)
for x in list(range(8, 64, 16)) + list(range(100, 156, 16)):
    put('street_lamp_01', x, 69.2, 0); put('street_lamp_01', x, 90.8, math.pi)
# parked cars along the kerbs, and the lot
for z in (18, 36, 108, 128, 146): put('covered_car', 74.2, z, 0, 0, **CAR)
for z in (12, 50, 100, 120, 140): put('covered_car', 85.8, z, math.pi, 0, **CAR)
for x in (18, 46, 112, 146): put('covered_car', x, 75.8, math.pi / 2, 0, **CAR)
for x in (28, 124, 140): put('covered_car', x, 84.2, -math.pi / 2, 0, **CAR)
for x in (100, 108, 116, 124):
    for z in (98, 110, 122):
        if rnd.random() < 0.75: put('covered_car', x, z, rnd.choice([0, math.pi]), 0.16, **CAR)
# concrete barriers: cover at the crossing and roadblocks at the street ends
for (x, z, r) in [(80, 60, 0), (76, 100, 0.3), (84, 101, -0.2), (60, 80, 1.57), (101, 79, 1.4), (78, 72, 0.1), (83, 88, 0.1), (74, 82, 1.2), (86, 77, 1.9),
                  (80, 30, 0.2), (77, 45, -0.3), (82, 125, 0.25), (79, 140, -0.1), (30, 81, 1.5), (45, 78, 1.7), (120, 79, 1.5), (135, 82, 1.6)]:
    put('concrete_road_barrier_02', x, z, r, 0)
for i in range(8):
    put('concrete_road_barrier_02', 73 + i * 2, 2, 0, 0); put('concrete_road_barrier_02', 73 + i * 2, 158, 0, 0)
    put('concrete_road_barrier_02', 2, 75 + i * 1.6, math.pi / 2, 0); put('concrete_road_barrier_02', 158, 75 + i * 1.6, math.pi / 2, 0)
# street clutter on the sidewalks
for i in range(26):
    side = rnd.choice(['w', 'e', 'n', 's'])
    if side in 'we': x, z = (69.5 if side == 'w' else 90.5), rnd.choice([rnd.uniform(4, 62), rnd.uniform(98, 156)])
    else: x, z = rnd.choice([rnd.uniform(4, 62), rnd.uniform(98, 156)]), (71.5 if side == 'n' else 88.5)
    kind = rnd.choice(['metal_trash_can', 'utility_box_01', 'fire_hydrant', 'utility_box_02', 'metal_trash_can'])
    pieces = {'metal_trash_can': ['metal_trash_can', 'metal_trash_can_lid', 'metal_trash_can_handle_left', 'metal_trash_can_handle_right'],
              'fire_hydrant': ['fire_hydrant', 'fire_hydrant_cap_01', 'fire_hydrant_cap_02', 'fire_hydrant_cap_03', 'fire_hydrant_chain']}.get(kind)
    put(kind, x, z, rnd.uniform(0, 6.28), pieces=pieces)
# courtyard, alleys, yard and plaza
for (x, z) in [(20, 30), (48, 34), (36, 52), (110, 55), (140, 60), (30, 130), (50, 140), (133, 20)]:
    put('barrel_stove', x, z, rnd.uniform(0, 6)); put('metal_trash_can', x + 1.6, z + 0.8, rnd.uniform(0, 6), pieces=['metal_trash_can_rust', 'metal_trash_can_rust_lid', 'metal_trash_can_rust_handle_left', 'metal_trash_can_rust_handle_right'])
for (x, z, r) in [(15, 128, 0), (40, 135, 1.2), (55, 125, 0.4), (25, 146, 2.2), (60, 148, 0.9), (104, 50, 1.6), (125, 60, 0.3), (145, 50, 2.6), (12, 34, 0.5)]:
    put('covered_car', x, z, r, 0.16, **CAR)
for (x, z, r) in [(22, 138, 0.3), (46, 128, 1.1), (35, 150, 0.1), (118, 48, 0.6), (150, 64, 1.3), (30, 28, 0.2), (58, 30, 1.0)]:
    put('concrete_road_barrier_02', x, z, r, 0.16)
for (x, z) in [(80, 20), (80, 140), (20, 80), (140, 80)]: put('water_manhole_cover', x + 3, z, 0, 0.005)
print('props done', flush=True)

# ---------- collision, then merge by material and export ----------
def solid(o): return o.type == 'MESH' and not o.hide_render and not any(m and 'glass' in m.name.lower() for m in o.data.materials[:1])
for o in list(bpy.context.scene.objects):
    if o.hide_render: bpy.data.objects.remove(o, do_unlink=True)
bvh = scenecol.bvh_of(solid)
scenecol.collide(bvh, SIZE, [(80, 80), (80, 30), (80, 130), (30, 80)], os.path.join(OUT, 'collision.json'), spawn_axis=(0, 1), lift=False)

bpy.ops.object.select_all(action='DESELECT')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:
    o.data = o.data.copy()
    o.data.transform(o.matrix_world); o.matrix_world = Matrix.Identity(4)
groups = {}
for o in meshes:
    if len(o.data.materials) > 1:
        o.select_set(True)
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o.data.materials and len(o.data.polygons): groups.setdefault(o.data.materials[0].name, []).append(o)
for name, os_ in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in os_: o.select_set(True)
    bpy.context.view_layer.objects.active = os_[0]
    if len(os_) > 1: bpy.ops.object.join()
    os_[0].name = name
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH')
print('merged', len(groups), 'meshes', tris, 'triangles', flush=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'downtown.glb'), export_format='GLB', export_image_format='JPEG', export_jpeg_quality=82,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
                          export_lights=False, export_cameras=False)
print('exported', flush=True)
