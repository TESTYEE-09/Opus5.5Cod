# Builds the Bistro map from Amazon Lumberyard Bistro (CC-BY 4.0, NVIDIA ORCA):
#   blender -b --python tools/bistro/build_bistro.py -- <BistroExterior.fbx> <out dir>
# Cuts the dense decoration (flower beds, string lights, rooftop aerials), decimates the rest,
# shrinks the textures, merges by material, moves the street to the game's coordinates and
# exports a Draco GLB. It also works out collision from the mesh: the street height in every
# 0.5 m cell, what blocks walking, and what is overhead, as boxes in collision.json.
# then: python3 tools/glbjpeg.py <the glb>  (re-encodes the embedded images, about a third the size)
import bpy, bmesh, sys, os, json, math, time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils import Matrix
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import scenecol

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
log('imported')

# ---------- cut and decimate ----------
DROP = ('Flowers_01a', 'flowers_01', 'StringLight', 'Stringlights', 'Lantern_Wind', 'Aerial', 'NapkinHolder', 'Spotlights', 'Ashtray', 'MenuSign')
RATIO = [('Cypress', 0.22), ('Ivy', 0.18), ('StreetLight', 0.12), ('Linde_Tree', 0.35), ('Chair', 0.2), ('Table', 0.35), ('Vespa', 0.25),
         ('paris_building', 0.26), ('Building', 0.35), ('Awning', 0.5), ('Balcony', 0.45), ('hedge', 0.35), ('PlantPot', 0.3), ('TrashCan', 0.3),
         ('Bollard', 0.4), ('SidewalkBarrier', 0.3), ('ShopSign', 0.5)]
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in objs:
    if any(k.lower() in o.name.lower() for k in DROP): bpy.data.objects.remove(o, do_unlink=True)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in objs:
    n = len(o.data.polygons)
    r = next((v for k, v in RATIO if k.lower() in o.name.lower()), 0.4 if n > 4000 else 1)
    if r < 1 and n > 300:
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = r; m.use_collapse_triangulate = True
log('decimate set on', len(objs))

# apply modifiers and transforms, one depsgraph evaluation per object
dg = bpy.context.evaluated_depsgraph_get()
for o in objs:
    if o.modifiers:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        o.modifiers.clear()
        old = o.data; o.data = me
        if old.users == 0: bpy.data.meshes.remove(old)
for o in objs:
    if o.data.users > 1: o.data = o.data.copy()
    mw = o.matrix_world.copy()
    o.data.transform(mw)
    o.parent = None
    o.matrix_world.identity()
log('applied')

# ---------- place: street at y = 0, the map in 0..SIZE ----------
OX, OZ, SIZE = 70.0, 96.0, 200
bvh_all = None
def build_bvh(filter_fn):
    verts, polys = [], []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or not filter_fn(o): continue
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys, all_triangles=False)

# street level: the lowest surface under the middle of the plaza
probe = build_bvh(lambda o: True)
hit = probe.ray_cast(Vector((75, -40, -50)), Vector((0, 0, 1)))
street = hit[0].z if hit[0] else 0.0
log('street z', street)
for o in bpy.context.scene.objects:
    if o.type == 'MESH':
        o.data.transform(__import__('mathutils').Matrix.Translation((OX, -OZ, -street)))

# ---------- collision (shared with the Downtown builder) ----------
SOFT = ('foliage_leaves', 'orange_leaves', 'green_leaves', 'ivy_leaf', 'flowers', 'glass')
def solid(o):
    mats = [m.name.lower() for m in o.data.materials if m]
    return not (mats and all(any(s in m for s in SOFT) for m in mats))
gmin = scenecol.collide(scenecol.bvh_of(solid), SIZE, [(141, 135), (63, 99), (40, 57)], os.path.join(OUT, 'collision.json'))
for o in bpy.context.scene.objects:
    if o.type == 'MESH': o.data.transform(Matrix.Translation((0, 0, -gmin)))
log('lifted by', -gmin)

# ---------- textures: shrink, fix two-channel normal maps, JPEG unless it needs alpha ----------
BIG = ('pavement', 'street', 'concrete', 'plaster', 'building', 'facade', 'wall', 'roof', 'cobble', 'curb')
ALPHA = ('foliage', 'masked', 'leaves', 'ivy', 'hedge', 'doublesided')
done = {}
def convert(src, name, size, needs_alpha):
    im = bpy.data.images.load(src, check_existing=False)
    w, h = im.size
    if w == 0: raise RuntimeError('no data')
    sc = min(1, size / max(w, h))
    if sc < 1: im.scale(max(4, int(w * sc)), max(4, int(h * sc)))
    px = np.empty(im.size[0] * im.size[1] * 4, np.float32); im.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    nm = name.lower()
    if 'normal' in nm and px[:, 2].mean() < 0.2:
        nx, ny = px[:, 0] * 2 - 1, px[:, 1] * 2 - 1
        px[:, 2] = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1)) * 0.5 + 0.5
        im.pixels.foreach_set(px.ravel())
    keep_alpha = needs_alpha and 'basecolor' in nm and px[:, 3].min() < 0.9
    path = os.path.join(OUT, 'tex', f'{name}.{"png" if keep_alpha else "jpg"}')
    im.filepath_raw = path
    im.file_format = 'PNG' if keep_alpha else 'JPEG'
    im.save()
    bpy.data.images.remove(im)
    out = bpy.data.images.load(path, check_existing=True)
    if 'normal' in nm or 'specular' in nm: out.colorspace_settings.name = 'Non-Color'
    return out
for m in bpy.data.materials:
    if not m.use_nodes: continue
    needs_alpha = any(a in m.name.lower() for a in ALPHA)
    for n in m.node_tree.nodes:
        if n.type != 'TEX_IMAGE' or not n.image: continue
        src = bpy.path.abspath(n.image.filepath)
        name = os.path.splitext(os.path.basename(src))[0]
        if name not in done:
            nm = name.lower()
            size = 1024 if any(b in nm for b in BIG) and 'normal' not in nm else 512
            try: done[name] = convert(src, name, size, needs_alpha)
            except Exception as e: log('texture failed', name, e); continue
        n.image = done[name]
log('textures', len(done))

# spec maps (occlusion, roughness, metalness) drive roughness and metalness, as glTF packs them
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    spec = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and 'specular' in n.image.name.lower()), None)
    for l in list(nt.links):
        if l.to_node == bsdf and l.to_socket.name in ('Specular IOR Level', 'Specular', 'Roughness', 'Metallic'): nt.links.remove(l)
    if spec:
        spec.image.colorspace_settings.name = 'Non-Color'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(spec.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    else:
        bsdf.inputs['Roughness'].default_value = 0.8; bsdf.inputs['Metallic'].default_value = 0
    if not any(a in m.name.lower() for a in ALPHA):
        for l in list(nt.links):
            if l.to_node == bsdf and l.to_socket.name == 'Alpha': nt.links.remove(l)
        bsdf.inputs['Alpha'].default_value = 1

# ---------- merge by material ----------
bpy.ops.object.select_all(action='DESELECT')
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
groups = {}
for o in bpy.context.scene.objects:
    if o.type != 'MESH' or not o.data.materials or not len(o.data.polygons): continue
    groups.setdefault(o.data.materials[0].name, []).append(o)
for name, os_ in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in os_: o.select_set(True)
    bpy.context.view_layer.objects.active = os_[0]
    if len(os_) > 1: bpy.ops.object.join()
    os_[0].name = name
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH')
log('merged into', len(groups), 'meshes,', tris, 'triangles')
for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']: bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'bistro.glb'), export_format='GLB', export_image_format='AUTO',
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                          export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
                          export_lights=False, export_cameras=False, export_apply=True)
import shutil; shutil.rmtree(os.path.join(OUT, 'tex'), ignore_errors=True)
log('exported')
