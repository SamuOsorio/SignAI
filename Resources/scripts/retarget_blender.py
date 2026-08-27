"""
Retargeting: landmarks MediaPipe → rotaciones de huesos de dedos.

Corre DENTRO de Blender: Text Editor → Run Script
Asume:
  - Un armature seleccionado y activo en la escena
  - Rig exportado desde el bundle de Blender (nombres: thumb01L, f_index01L, etc.)
  - Un JSON de landmarks generado por process_videos.py en scripts/landmarks/

Flujo:
  1. Lee el JSON (estructura: frames[i].hands[j].landmarks)
  2. Para cada frame: busca la mano izquierda y derecha
  3. Calcula el vector de dirección de cada falange
  4. Rota el hueso correspondiente e inserta keyframe
"""

import bpy
import json
import mathutils
from pathlib import Path

# ── Configuracion ──────────────────────────────────────────────────────────────

# JSON generado por process_videos.py (ajustar al stem deseado)
LANDMARKS_PATH = Path(__file__).parent / "landmarks" / "0000_0000_0000.json"
ARMATURE_NAME  = ""   # dejar vacio para usar el armature activo
FPS            = 30

# Mapeo: nombre_bone → (idx_landmark_inicio, idx_landmark_fin)
# MediaPipe: 0=muñeca, 1-4=pulgar, 5-8=índice, 9-12=medio, 13-16=anular, 17-20=meñique
FINGER_MAP = [
    ("thumb01",    1, 2),  ("thumb02",    2, 3),  ("thumb03",    3, 4),
    ("f_index01",  5, 6),  ("f_index02",  6, 7),  ("f_index03",  7, 8),
    ("f_middle01", 9,10),  ("f_middle02",10,11),  ("f_middle03",11,12),
    ("f_ring01",  13,14),  ("f_ring02",  14,15),  ("f_ring03",  15,16),
    ("f_pinky01", 17,18),  ("f_pinky02", 18,19),  ("f_pinky03", 19,20),
]

# Nombres completos: base + sufijo L/R
# Ej: "thumb01" → "thumb01L" y "thumb01R"
BONE_MAP = {
    f"{base}{side}": (lm_s, lm_e)
    for base, lm_s, lm_e in FINGER_MAP
    for side in ("L", "R")
}

# Conversión de ejes MediaPipe world → Blender
# MediaPipe world: x=derecha, y=arriba, z=hacia_cámara
# Blender:         x=derecha, y=profundidad, z=arriba
def mp_to_blender(lm):
    return mathutils.Vector((lm["x"], -lm["z"], lm["y"]))


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_armature():
    obj = bpy.data.objects.get(ARMATURE_NAME) if ARMATURE_NAME else bpy.context.active_object
    if obj is None or obj.type != 'ARMATURE':
        raise RuntimeError("Selecciona un armature antes de correr el script")
    return obj


def bone_rest_direction(arm_obj, bone_name):
    """Dirección del hueso en rest pose, en espacio mundo."""
    bone = arm_obj.data.bones.get(bone_name)
    if bone is None:
        return None
    dir_local = (bone.tail_local - bone.head_local).normalized()
    mat = arm_obj.matrix_world @ bone.matrix_local
    return (mat.to_3x3() @ dir_local).normalized()


def align_quaternion(from_vec, to_vec):
    """Cuaternion que rota from_vec para apuntar como to_vec."""
    f = mathutils.Vector(from_vec).normalized()
    t = mathutils.Vector(to_vec).normalized()
    if f.dot(t) > 0.9999:
        return mathutils.Quaternion()
    return f.rotation_difference(t)


# ── Main ───────────────────────────────────────────────────────────────────────

def retarget():
    with open(LANDMARKS_PATH) as f:
        data = json.load(f)

    frames = data.get("frames", [])
    print(f"[SignAI] {len(frames)} frames desde {LANDMARKS_PATH.name}")

    arm_obj = get_armature()
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='POSE')

    # Precomputar rest directions y verificar huesos existentes
    rest_dirs   = {}
    missing     = []
    for bone_name in BONE_MAP:
        d = bone_rest_direction(arm_obj, bone_name)
        if d is None:
            missing.append(bone_name)
        else:
            rest_dirs[bone_name] = d

    if missing:
        print(f"[SignAI] Huesos no encontrados: {missing}")
        print("[SignAI] Huesos disponibles con 'thumb' o 'f_':")
        for b in arm_obj.data.bones:
            if "thumb" in b.name or "f_" in b.name:
                print(f"  {b.name}")

    found = len(rest_dirs)
    print(f"[SignAI] Huesos listos: {found}/{len(BONE_MAP)}")

    # Modo de rotación en cuaternion para todos los pose bones animados
    for bone_name in rest_dirs:
        pb = arm_obj.pose.bones.get(bone_name)
        if pb:
            pb.rotation_mode = 'QUATERNION'

    scene = bpy.context.scene
    scene.render.fps = FPS

    animated = 0
    for frame_idx, frame_data in enumerate(frames):
        blender_frame = frame_idx + 1
        scene.frame_set(blender_frame)

        # Construir mapa de landmarks por mano ("Left" / "Right")
        hands = {}
        for hand_entry in frame_data.get("hands", []):
            label = hand_entry.get("hand")   # "Left" o "Right"
            lms   = hand_entry.get("landmarks", [])
            if label and lms:
                hands[label] = [mp_to_blender(lm) for lm in lms]

        if not hands:
            continue  # frame sin detección, dejar en rest pose

        animated += 1
        for bone_name, (lm_start, lm_end) in BONE_MAP.items():
            if bone_name not in rest_dirs:
                continue
            pb = arm_obj.pose.bones.get(bone_name)
            if pb is None:
                continue

            # Determinar de qué mano tomar los landmarks
            side  = "Left" if bone_name.endswith("L") else "Right"
            pts   = hands.get(side)
            if pts is None:
                continue

            target_dir = (pts[lm_end] - pts[lm_start]).normalized()
            if target_dir.length < 1e-6:
                continue

            q = align_quaternion(rest_dirs[bone_name], target_dir)
            pb.rotation_quaternion = q
            pb.keyframe_insert(data_path="rotation_quaternion", frame=blender_frame)

        if frame_idx % 30 == 0:
            print(f"[SignAI] Frame {frame_idx+1}/{len(frames)}  ({len(hands)} manos detectadas)")

    scene.frame_start = 1
    scene.frame_end   = len(frames)
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f"[SignAI] Listo — {animated}/{len(frames)} frames animados")


retarget()
