import json,subprocess,sys,os
out=sys.argv[1]
for id in sys.argv[2:]:
  g=json.loads(subprocess.check_output(['curl','-s','--http1.1',f'https://api.polyhaven.com/files/{id}']))['gltf']['1k']['gltf']
  d=f'{out}/{id}'; os.makedirs(d,exist_ok=True)
  subprocess.run(['curl','-s','--http1.1','--retry','5','-o',f'{d}/{id}.gltf',g['url']])
  for rel,v in g['include'].items():
    os.makedirs(os.path.dirname(f'{d}/{rel}'),exist_ok=True)
    subprocess.run(['curl','-s','--http1.1','--retry','5','--retry-all-errors','-o',f'{d}/{rel}',v['url']])
