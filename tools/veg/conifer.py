# Builds low-poly conifers from branch cards (fir_card.png: spray | top) and the scanned fir
# bark, three sizes as separate objects, exported as one GLB.
import bpy,bmesh,sys,math,random
from mathutils import Vector,Matrix
a=sys.argv[sys.argv.index('--')+1:]
card,bark,barknor,dst=a
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,img,nor=None,alpha=False):
  m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree; b=nt.nodes['Principled BSDF']
  t=nt.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(img)
  nt.links.new(t.outputs['Color'],b.inputs['Base Color']); b.inputs['Roughness'].default_value=0.85
  if alpha:
    nt.links.new(t.outputs['Alpha'],b.inputs['Alpha']); m.blend_method='CLIP' if hasattr(m,'blend_method') else None
    m.surface_render_method='DITHERED'; m.use_backface_culling=False
  if nor:
    n=nt.nodes.new('ShaderNodeTexImage'); n.image=bpy.data.images.load(nor); n.image.colorspace_settings.name='Non-Color'
    nm=nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs['Normal'],b.inputs['Normal'])
  return m
mb=mat('fir_bark',bark,barknor); mc=mat('fir_needles',card,alpha=True)
def tree(name,H,seed,x):
  random.seed(seed)
  me=bpy.data.meshes.new(name); bm=bmesh.new(); uv=bm.loops.layers.uv.new('UVMap')
  normals=[]
  # trunk: tapered 10-sided tube
  seg=10; rings=[(0,0.32),(H*0.3,0.2),(H*0.7,0.1),(H,0.02)]
  vs=[]
  for (y,r) in rings:
    vs.append([bm.verts.new((math.cos(i/seg*2*math.pi)*r,math.sin(i/seg*2*math.pi)*r,y)) for i in range(seg+1)])
  for j in range(len(rings)-1):
    for i in range(seg):
      f=bm.faces.new((vs[j][i],vs[j][i+1],vs[j+1][i+1],vs[j+1][i])); f.material_index=0
      for l,(u,v) in zip(f.loops,[(i/seg,rings[j][0]/2),((i+1)/seg,rings[j][0]/2),((i+1)/seg,rings[j+1][0]/2),(i/seg,rings[j+1][0]/2)]): l[uv].uv=(u*2,v)
  # branch whorls
  y=H*0.16
  while y<H-0.6:
    t=(y-H*0.16)/(H*0.84)
    L=(1-t)**0.9*H*0.23+0.5; n=7 if t<0.7 else 5
    yaw0=random.random()*6.28
    for k in range(n):
      yaw=yaw0+k/n*2*math.pi+random.uniform(-0.3,0.3)
      droop=math.radians(random.uniform(12,30)+t*10)
      for roll in (0.0,math.radians(random.choice([-55,55]))):
        w=L*0.62
        # card in local frame: x along the branch, y across; then droop, roll, yaw
        M=Matrix.Translation((0,0,y+random.uniform(-0.1,0.1)))@Matrix.Rotation(yaw,4,'Z')@Matrix.Rotation(droop,4,'Y')@Matrix.Rotation(roll,4,'X')
        cs=[(0.05,-w/2),(L,-w/2),(L,w/2),(0.05,w/2)]
        vv=[bm.verts.new((M@Vector((cx,cy,0))).to_3d()) for cx,cy in cs]
        f=bm.faces.new(vv); f.material_index=1
        for l,(u,v) in zip(f.loops,[(0,0),(512/768,0),(512/768,1),(0,1)]): l[uv].uv=(u,v)
    y+=random.uniform(0.38,0.55)*(1-t*0.35)
  # crown: two crossed upright cards from the side render
  for rot in (0,math.pi/2):
    M=Matrix.Translation((0,0,H-1.9))@Matrix.Rotation(rot,4,'Z')
    cs=[(-0.55,0),(0.55,0),(0.55,2.2),(-0.55,2.2)]
    vv=[bm.verts.new((M@Vector((cx,0,cz)))) for cx,cz in cs]
    f=bm.faces.new(vv); f.material_index=1
    for l,(u,v) in zip(f.loops,[(512/768,0),(1,0),(1,1),(512/768,1)]): l[uv].uv=(u,v)
  bm.to_mesh(me); bm.free()
  me.materials.append(mb); me.materials.append(mc)
  # soft foliage lighting: needle normals point away from the trunk axis (and up a little)
  cn=[]
  for l in me.loops:
    p=me.vertices[l.vertex_index].co; pol=me.polygons[0]
    cn.append(None)
  lnor=[]
  for poly in me.polygons:
    for li in poly.loop_indices:
      p=me.vertices[me.loops[li].vertex_index].co
      if poly.material_index==1:
        d=Vector((p.x,p.y,0)); d=d.normalized() if d.length>1e-3 else Vector((0,0,1))
        lnor.append((d*0.8+Vector((0,0,0.6))).normalized())
      else: lnor.append(poly.normal.copy())
  me.normals_split_custom_set(lnor)
  o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.location.x=x
  return o
for i,(H,s) in enumerate([(10,1),(13.5,2),(17,3)]): tree(f'fir_{i}',H,s,i*8)
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_image_format='AUTO')
for o in bpy.data.objects: print('TRIS',o.name,len(o.data.polygons)*2)
