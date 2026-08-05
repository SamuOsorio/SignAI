"""
Exporta el avatar con rig como GLB en T-pose (sin animacion).
Lanzar desde terminal:
    blender tu_archivo.blend --python scripts/export_avatar.py

O desde Blender: Text Editor > Run Script (con el .blend del rig abierto).

El GLB se guarda en app/static/avatar.glb
"""

import bpy
from pathlib import Path

OUTPUT = Path(__file__).parent.parent / "app" / "static" / "avatar.glb"


def export():
    # Deseleccionar todo
    bpy.ops.object.select_all(action='DESELECT')

    # Seleccionar mesh(es) y armature del avatar
    exported = []
    for obj in bpy.context.scene.objects:
        if obj.type in ('MESH', 'ARMATURE'):
            obj.select_set(True)
            exported.append(obj.name)

    print(f"[SignAI] Exportando: {exported}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        use_selection=True,
        export_format='GLB',
        export_draco_mesh_compression_enable=False,
        export_apply=False,         # NO aplicar modificadores — preservar shape keys
        export_morph=True,          # exportar morph targets (expresiones faciales)
        export_morph_normal=False,
        export_skins=True,          # exportar el rig (skinning)
        export_all_influences=False,
        export_def_bones=False,     # exportar TODOS los huesos, no solo deform
        export_animations=False,    # T-pose, sin animacion (la anima Three.js)
        export_yup=True,            # GLTF usa Y-up
    )

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"[SignAI] Exportado: {OUTPUT}  ({size_kb:.0f} KB)")
    print("[SignAI] Listo — abre la app con: ./scripts/run.sh app")


export()
