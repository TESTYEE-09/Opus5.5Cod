# Renders one fir sapling from the side, orthographic with a transparent background, into a
# branch-card texture (RGBA). Lit evenly so the card can be relit in game.
import bpy,sys,math
a=sys.argv[sys.argv.index('--')+1:]
src,dst,view=a[0],a[1],a[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs=[o for o in bpy.data.objects if o.type=='MESH']
pick=a[3] if len(a)>3 else None
keep=[o for o in objs if (pick is None and o is objs[0]) or pick=='all' or (pick and pick in o.name)]
for o in objs:
  if o not in keep: bpy.data.objects.remove(o)
if pick!='all': keep[0].location=(0,0,0)
bpy.context.view_layer.update()
import mathutils
bb=[o.matrix_world@mathutils.Vector(c) for o in keep for c in o.bound_box]
mn=mathutils.Vector([min(v[i] for v in bb) for i in range(3)]); mx=mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
c=(mn+mx)/2; size=max(mx-mn)
sc=bpy.context.scene
sc.render.engine='BLENDER_EEVEE'
sc.render.film_transparent=True
sc.render.resolution_x=sc.render.resolution_y=1024
sc.render.image_settings.file_format='PNG'; sc.render.image_settings.color_mode='RGBA'
sc.view_settings.view_transform='Standard'
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[1].default_value=1.6
bpy.ops.object.light_add(type='SUN',rotation=(0.3,0,0.4)); bpy.context.object.data.energy=2.0
if view=='top':
  bpy.ops.object.camera_add(location=(c.x,c.y,mx.z+5),rotation=(0,0,0))
else:
  bpy.ops.object.camera_add(location=(c.x,mn.y-5,c.z),rotation=(math.radians(90),0,0))
cam=bpy.context.object; cam.data.type='ORTHO'; cam.data.ortho_scale=size*1.02; sc.camera=cam
sc.render.filepath=dst; bpy.ops.render.render(write_still=True)
