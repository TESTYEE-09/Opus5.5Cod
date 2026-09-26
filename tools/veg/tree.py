# Game-ready tree from a Poly Haven scan: bark/branches decimated to `wood` triangles, leaves
# thinned to a random subset of whole leaves (each enlarged to keep the canopy full) and then
# simplified to `leaf` triangles. Textures 512 px, exported as GLB.
import bpy,bmesh,sys,random,math
from mathutils import Vector
a=sys.argv[sys.argv.index('--')+1:]
src,dst,wood,leaf=a[0],a[1],int(a[2]),int(a[3])
keep=float(a[4]) if len(a)>4 else 0.06
random.seed(3)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
tris=lambda o: sum(len(p.vertices)-2 for p in o.data.polygons)
for o in [o for o in bpy.data.objects if o.type=='MESH']:
  bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
  if len(o.data.materials)>1: bpy.ops.mesh.separate(type='MATERIAL')
parts=[o for o in bpy.data.objects if o.type=='MESH']
for o in parts:
  isleaf=any(k in o.data.materials[0].name.lower() for k in ('leaves','leaf','twig','needle')) if o.data.materials else False
  if isleaf:
    bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    seen=set(); drop=[]
    for f in bm.faces:
      if f.index in seen: continue
      isl=[]; st=[f]; seen.add(f.index)
      while st:
        g=st.pop(); isl.append(g)
        for e in g.edges:
          for h in e.link_faces:
            if h.index not in seen: seen.add(h.index); st.append(h)
      if random.random()>keep: drop.extend(isl)
      else:
        vs={v for g in isl for v in g.verts}; c=sum((v.co for v in vs),Vector())/len(vs)
        s=min(3.2,1/math.sqrt(keep)*0.75)
        for v in vs: v.co=c+(v.co-c)*s
    bmesh.ops.delete(bm,geom=list(set(drop)),context='FACES'); bm.to_mesh(o.data); bm.free()
    target=leaf
  else: target=wood
  t=tris(o)
  if t>target:
    m=o.modifiers.new('d','DECIMATE'); m.ratio=target/t
    bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier='d')
  print('PART',o.data.materials[0].name if o.data.materials else '-',t,'->',tris(o))
for img in bpy.data.images:
  if img.size[0]>512: img.scale(512,512)
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_image_format='JPEG',export_jpeg_quality=85)
