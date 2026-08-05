"""
Setup del rig SignAI en Blender 5.2.
Lanzar desde terminal:
    blender --python /home/samu/Universidad/Tesis/scripts/setup_rig.py

O desde Blender: Text Editor > Open > este archivo > Run Script.

Que hace:
  1. Habilita Rigify
  2. Limpia la escena
  3. Importa cuerpo + manos estilizadas del bundle
  4. Agrega el Human Meta-Rig centrado en la malla
  5. Imprime guia de huesos a ajustar manualmente
"""

import bpy
from pathlib import Path

BUNDLE = (
    Path(__file__).parent.parent
    / "assets"
    / "human-base-meshes-bundle-v1.4.1"
    / "human_base_meshes_bundle.blend"
)

# Objetos a importar del bundle
MESH_NAMES = [
    "stylized_body_male",
    "stylized_hand",   # manos con mas detalle de dedos
    "stylized_head",
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def enable_rigify():
    if not bpy.context.preferences.addons.get("rigify"):
        bpy.ops.preferences.addon_enable(module="rigify")
    print("[SignAI] Rigify listo")


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_meshes():
    if not BUNDLE.exists():
        raise FileNotFoundError(f"Bundle no encontrado: {BUNDLE}")

    with bpy.data.libraries.load(str(BUNDLE), link=False) as (src, dst):
        available = set(src.objects)
        to_load = [n for n in MESH_NAMES if n in available]
        missing  = [n for n in MESH_NAMES if n not in available]
        dst.objects = to_load

    if missing:
        print(f"[SignAI] Advertencia — no encontrados en bundle: {missing}")

    imported = []
    for obj in dst.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            imported.append(obj)
            print(f"[SignAI] Importado: {obj.name}")

    return imported


def add_metarig(meshes):
    # Calcular centro aproximado de la malla para posicionar el metarig
    if meshes:
        body = next((m for m in meshes if "body" in m.name), meshes[0])
        loc = body.location.copy()
    else:
        loc = (0, 0, 0)

    bpy.ops.object.armature_human_metarig_add()
    metarig = bpy.context.active_object
    metarig.name = "SignAI_MetaRig"
    metarig.location = loc

    # Mostrar huesos en viewport encima de la malla
    metarig.show_in_front = True
    print(f"[SignAI] MetaRig creado en {tuple(round(v,3) for v in loc)}")
    return metarig


def print_guide():
    print("""
[SignAI] ══════════════════════════════════════════════════════
  PROXIMOS PASOS EN BLENDER
══════════════════════════════════════════════════════════════

  1. Selecciona SignAI_MetaRig → Tab (Edit Mode)
  2. Alt+Z para ver huesos a traves de la malla (X-Ray)
  3. Ajusta cada hueso para que calce con la malla:

     TORSO / CABEZA (aprox 20 min)
       spine, spine.001, spine.002, spine.003, spine.004, spine.005
       spine.006 (cuello), face (cabeza)

     BRAZOS (aprox 15 min)
       shoulder.L/R → upper_arm.L/R → forearm.L/R → hand.L/R

     DEDOS — los mas criticos para LSC (aprox 45-60 min)
     Por cada mano (.L y .R):
       thumb.01   thumb.02   thumb.03
       f_index.01  f_index.02  f_index.03
       f_middle.01 f_middle.02 f_middle.03
       f_ring.01   f_ring.02   f_ring.03
       f_pinky.01  f_pinky.02  f_pinky.03

  4. Tab (vuelve a Object Mode)
  5. Properties > Armature (icono muñeco) > Generate Rig
  6. Selecciona el rig generado (RIG-SignAI_MetaRig)
  7. Corre retarget_blender.py con cualquier JSON de landmarks/

  TIP: empieza por los dedos de UNA mano, genera el rig,
       y corre el retargeting para ver si funciona antes
       de ajustar el resto del cuerpo.
══════════════════════════════════════════════════════════════
""")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    enable_rigify()
    clean_scene()
    meshes = import_meshes()
    metarig = add_metarig(meshes)
    print_guide()


main()
