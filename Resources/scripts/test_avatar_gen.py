#!/usr/bin/env python3
"""
Genera test_avatar.glb con:
- Cubo 2x2x2 centrado en origen, color naranja sólido.
- Plano horizontal (piso) 20x20 a y=-1, con textura procedural de cuadrícula.
"""
import json
import struct
import io
import numpy as np
from PIL import Image, ImageDraw


def make_grid_texture(size=512, cells=10):
    """Textura procedural: cuadrícula blanca sobre fondo gris."""
    img = Image.new('RGB', (size, size), (50, 50, 50))
    draw = ImageDraw.Draw(img)
    step = size // cells
    for i in range(cells + 1):
        color = (200, 200, 200) if i % 5 == 0 else (120, 120, 120)
        draw.line([(i * step, 0), (i * step, size)], fill=color, width=2)
        draw.line([(0, i * step), (size, i * step)], fill=color, width=2)
    # Borde rojo para orientarse
    draw.rectangle([(0, 0), (size - 1, size - 1)], outline=(255, 80, 80), width=4)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def write_glb(path, gltf, bin_data):
    json_data = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
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
    with open(path, 'wb') as f:
        f.write(out)


# --- Cubo 5x5x5 centrado en origen (grande para verse bien) ---
s = 2.5
cube_positions = np.array([
    # -Z (back)
    -s, -s, -s,   s, -s, -s,   s,  s, -s,  -s,  s, -s,
    # +Z (front)
    -s, -s,  s,   s, -s,  s,   s,  s,  s,  -s,  s,  s,
    # -Y (bottom)
    -s, -s, -s,   s, -s, -s,   s, -s,  s,  -s, -s,  s,
    # +Y (top)
    -s,  s, -s,   s,  s, -s,   s,  s,  s,  -s,  s,  s,
    # -X (left)
    -s, -s, -s,  -s,  s, -s,  -s,  s,  s,  -s, -s,  s,
    # +X (right)
     s, -s, -s,   s,  s, -s,   s,  s,  s,   s, -s,  s,
], dtype=np.float32)

cube_normals = np.array([
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    0, 0,  1,  0, 0,  1,  0, 0,  1,  0, 0,  1,
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
    0,  1, 0,  0,  1, 0,  0,  1, 0,  0,  1, 0,
   -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
], dtype=np.float32)

cube_indices = np.array([
    0, 1, 2,  0, 2, 3,        # -Z
    4, 6, 5,  4, 7, 6,        # +Z
    8, 10, 9,  8, 11, 10,     # -Y
    12, 13, 14,  12, 14, 15,  # +Y
    16, 18, 17,  16, 19, 18,  # -X
    20, 21, 22,  20, 22, 23,  # +X
], dtype=np.uint16)

# --- Plano horizontal (piso) 20x20 a y=-1 ---
half = 10.0
floor_positions = np.array([
    -half, -1, -half,
     half, -1, -half,
     half, -1,  half,
    -half, -1,  half,
], dtype=np.float32)

floor_normals = np.array([
    0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
], dtype=np.float32)

floor_uvs = np.array([
    0.0, 0.0,
    1.0, 0.0,
    1.0, 1.0,
    0.0, 1.0,
], dtype=np.float32)

floor_indices = np.array([0, 1, 2,  0, 2, 3], dtype=np.uint16)

# --- Textura de cuadrícula ---
grid_png = make_grid_texture(size=512, cells=10)

# --- Layout del buffer binario ---
bin_data = bytearray()
buf_offsets = {}

def add_buffer(name, data_bytes):
    while len(bin_data) % 4 != 0:
        bin_data.append(0)
    buf_offsets[name] = (len(bin_data), len(data_bytes))
    bin_data.extend(data_bytes)

add_buffer('cube_pos', cube_positions.tobytes())
add_buffer('cube_norm', cube_normals.tobytes())
add_buffer('cube_idx', cube_indices.tobytes())
add_buffer('floor_pos', floor_positions.tobytes())
add_buffer('floor_norm', floor_normals.tobytes())
add_buffer('floor_uv', floor_uvs.tobytes())
add_buffer('floor_idx', floor_indices.tobytes())
add_buffer('grid_png', grid_png)

gltf = {
    "asset": {"version": "2.0"},
    "scene": 0,
    "scenes": [{"nodes": [0, 1]}],
    "nodes": [
        {"name": "Cube", "mesh": 0},
        {"name": "Floor", "mesh": 1},
    ],
    "meshes": [
        {"name": "Cube", "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1},
            "indices": 2,
            "material": 0,
        }]},
        {"name": "Floor", "primitives": [{
            "attributes": {"POSITION": 3, "NORMAL": 4, "TEXCOORD_0": 5},
            "indices": 6,
            "material": 1,
        }]},
    ],
    "materials": [
        {"name": "CubeMat", "pbrMetallicRoughness": {
            "baseColorFactor": [1.0, 0.4, 0.2, 1.0],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.7,
        }},
        {"name": "FloorMat", "pbrMetallicRoughness": {
            "baseColorFactor": [1.0, 1.0, 1.0, 1.0],
            "metallicFactor": 0.0,
            "roughnessFactor": 0.9,
        }, "doubleSided": True},
    ],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": 24, "type": "VEC3"},
        {"bufferView": 1, "componentType": 5126, "count": 24, "type": "VEC3"},
        {"bufferView": 2, "componentType": 5123, "count": 36, "type": "SCALAR"},
        {"bufferView": 3, "componentType": 5126, "count": 4, "type": "VEC3"},
        {"bufferView": 4, "componentType": 5126, "count": 4, "type": "VEC3"},
        {"bufferView": 5, "componentType": 5126, "count": 4, "type": "VEC2"},
        {"bufferView": 6, "componentType": 5123, "count": 6, "type": "SCALAR"},
    ],
    "bufferViews": [
        {"buffer": 0, "byteOffset": buf_offsets['cube_pos'][0],   "byteLength": buf_offsets['cube_pos'][1]},
        {"buffer": 0, "byteOffset": buf_offsets['cube_norm'][0],  "byteLength": buf_offsets['cube_norm'][1]},
        {"buffer": 0, "byteOffset": buf_offsets['cube_idx'][0],   "byteLength": buf_offsets['cube_idx'][1]},
        {"buffer": 0, "byteOffset": buf_offsets['floor_pos'][0],  "byteLength": buf_offsets['floor_pos'][1]},
        {"buffer": 0, "byteOffset": buf_offsets['floor_norm'][0], "byteLength": buf_offsets['floor_norm'][1]},
        {"buffer": 0, "byteOffset": buf_offsets['floor_uv'][0],   "byteLength": buf_offsets['floor_uv'][1]},
        {"buffer": 0, "byteOffset": buf_offsets['floor_idx'][0],  "byteLength": buf_offsets['floor_idx'][1]},
        {"buffer": 0, "byteOffset": buf_offsets['grid_png'][0],   "byteLength": buf_offsets['grid_png'][1]},
    ],
    "buffers": [{"byteLength": len(bin_data)}],
    "images": [{"bufferView": 7, "mimeType": "image/png"}],
    "textures": [{"source": 0, "sampler": 0}],
    "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
}

write_glb('/home/diegocachy/tesisTesteos/SignAI/appKotlin/app/src/main/assets/test_avatar.glb',
          gltf, bin_data)
print(f"Written test_avatar.glb (bin: {len(bin_data)} bytes, texture: {len(grid_png)} bytes)")
