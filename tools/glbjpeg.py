# Re-encodes the images inside a GLB as JPEG (quality 80, or PNG where there is real alpha)
# and repacks the binary chunk. Blender's exporter writes them far larger than needed.
#   python3 tools/glbjpeg.py file.glb [max_size]
import json, struct, sys, io
from PIL import Image

path = sys.argv[1]
cap = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
d = open(path, 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20 + jl])
bin0 = 20 + jl + 8
blob = d[bin0:bin0 + struct.unpack('<I', d[20 + jl:24 + jl])[0]]
views = j['bufferViews']
data = [blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
before = sum(len(data[i['bufferView']]) for i in j.get('images', []))
for img in j.get('images', []):
    vi = img['bufferView']
    im = Image.open(io.BytesIO(data[vi]))
    alpha = im.mode in ('RGBA', 'LA') and im.getchannel('A').getextrema()[0] < 250
    if max(im.size) > cap: im.thumbnail((cap, cap))
    out = io.BytesIO()
    if alpha: im.save(out, 'PNG', optimize=True); img['mimeType'] = 'image/png'
    else: im.convert('RGB').save(out, 'JPEG', quality=80, optimize=True); img['mimeType'] = 'image/jpeg'
    data[vi] = out.getvalue()
buf = bytearray()
for v, b in zip(views, data):
    while len(buf) % 4: buf.append(0)
    v['byteOffset'] = len(buf); v['byteLength'] = len(b)
    buf += b
while len(buf) % 4: buf.append(0)
j['buffers'][0]['byteLength'] = len(buf)
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(buf), 0x004E4942) + bytes(buf)
open(path, 'wb').write(out)
print(f'{path}: images {before / 1e6:.1f} MB -> {sum(len(data[i["bufferView"]]) for i in j.get("images", [])) / 1e6:.1f} MB, file {len(out) / 1e6:.1f} MB')
