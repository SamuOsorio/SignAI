#!/usr/bin/env python3
"""Modifica cube.glb: pone el mesh en origen sin transformaciones raras."""
import json
import struct


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack('<III', data[:12])
    chunks = data[12:]
    json_data = b''
    bin_data = bytearray()
    i = 0
    while i < len(chunks):
        cl, ct = struct.unpack('<II', chunks[i:i+8])
        if ct == 0x4E4F534A:
            json_data = chunks[i+8:i+8+cl]
        elif ct == 0x004E4942:
            bin_data.extend(chunks[i+8:i+8+cl])
        i += 8 + cl
    return json.loads(json_data.decode()), bin_data


def write_glb(out_path, gltf_dict, bin_data):
    json_data = json.dumps(gltf_dict, separators=(',', ':')).encode('utf-8')
    while len(json_data) % 4 != 0:
        json_data += b' '
    while len(bin_data) % 4 != 0:
        bin_data += b'\x00'

    total = 12 + 8 + len(json_data) + 8 + len(bin_data)
    out = bytearray()
    out += struct.pack('<4sII', b'glTF', 2, total)
    out += struct.pack('<II', len(json_data), 0x4E4F534A)
    out += json_data
    out += struct.pack('<II', len(bin_data), 0x004E4942)
    out += bin_data
    with open(out_path, 'wb') as f:
        f.write(out)


gltf, bin_data = read_glb('/home/diegocachy/tesisTesteos/SignAI/appKotlin/cubeExample/cube.glb')

# Reemplaza la jerarquía de nodos por un único nodo con el mesh directo, sin transform.
gltf['nodes'] = [{
    'mesh': 0,
    'name': 'Cube',
}]
gltf['scenes'] = [{
    'name': 'Scene',
    'nodes': [0]
}]
gltf['scene'] = 0

# Mantiene el material, pero agrega un color base para que se vea claramente.
if 'materials' in gltf and len(gltf['materials']) > 0:
    mat = gltf['materials'][0]
    if 'pbrMetallicRoughness' not in mat:
        mat['pbrMetallicRoughness'] = {}
    mat['pbrMetallicRoughness']['baseColorFactor'] = [1.0, 0.4, 0.2, 1.0]
    mat['pbrMetallicRoughness']['metallicFactor'] = 0.0
    mat['pbrMetallicRoughness']['roughnessFactor'] = 0.5

# Re-centra el cubo en el origen. Las posiciones están en (0..9.53), trasladamos a (-4.77..4.77).
# Encuentra bufferView de POSITION (accessor 0 según el GLB original).
# En este GLB, los bufferViews son: 0=indices (uint32), 1=uv, 2=pos+normal interleaved?
# El accessor 0 (POSITION) usa bufferView 2 con byteOffset 0.
# Vamos a asumir que POSITION está en bufferView 2 (el más grande).

pos_buffer_view = None
for i, bv in enumerate(gltf['bufferViews']):
    if bv.get('byteStride', 0) == 12 and bv.get('byteLength', 0) == 576:
        pos_buffer_view = i
        break

if pos_buffer_view is None:
    # Fallback: buscar el BV con length 576
    for i, bv in enumerate(gltf['bufferViews']):
        if bv.get('byteLength', 0) == 576:
            pos_buffer_view = i
            break

if pos_buffer_view is not None:
    bv = gltf['bufferViews'][pos_buffer_view]
    offset = bv.get('byteOffset', 0)
    stride = bv.get('byteStride', 12)
    count = 24  # 24 verts (4 por cara × 6 caras)
    # Re-centrar: shift cada posición en -4.766
    for j in range(count):
        px = struct.unpack_from('<f', bin_data, offset + j*stride)[0] - 4.766
        py = struct.unpack_from('<f', bin_data, offset + j*stride + 4)[0] - 4.766
        pz = struct.unpack_from('<f', bin_data, offset + j*stride + 8)[0] - 4.766
        struct.pack_into('<f', bin_data, offset + j*stride, px)
        struct.pack_into('<f', bin_data, offset + j*stride + 4, py)
        struct.pack_into('<f', bin_data, offset + j*stride + 8, pz)
    print(f"Re-centered {count} positions in bufferView {pos_buffer_view}")
else:
    print("WARNING: no position bufferView found, cube will be at original position")

# Actualiza min/max del accessor de POSITION
for acc in gltf['accessors']:
    if acc.get('type') == 'VEC3' and acc.get('count') == 24:
        if 'max' in acc:
            del acc['max']
        if 'min' in acc:
            del acc['min']

write_glb(
    '/home/diegocachy/tesisTesteos/SignAI/appKotlin/app/src/main/assets/test_avatar.glb',
    gltf, bin_data
)
print("Written re-centered test_avatar.glb")
