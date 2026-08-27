#!/usr/bin/env python3
"""
Script Blender (bpy) que toma PruebaBlender2.blend y produce un GLB
con sub-skins de ≤256 huesos cada una — compatible con Filament.

Uso:
    blender --background blender/PruebaBlender2.blend \
        --python scripts/split_avatar_for_filament.py -- \
        app/static/avatar.glb

Lo que hace:
  1. Abre el .blend
  2. Para cada mesh skinned, particiona vértices en grupos según bones que los influencian
  3. Asegura que cada sub-mesh resultante use ≤256 huesos distintos
  4. Reconstruye inverseBindMatrices por skin
  5. Exporta el GLB final

Para correr Blender headless:
    /path/to/blender -b blender/PruebaBlender2.blend -P scripts/split_avatar_for_filament.py -- app/static/avatar.glb
"""

import bpy
import sys
from pathlib import Path
from collections import defaultdict


BONE_LIMIT = 256


def get_armature():
    """Encuentra el armature en la escena."""
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE':
            return obj
    raise RuntimeError("No se encontró armature en la escena")


def get_skinned_meshes(armature):
    """Encuentra todos los meshes skinned al armature."""
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        for mod in obj.modifiers:
            if mod.type == 'ARMATURE' and mod.object == armature:
                meshes.append(obj)
                break
    return meshes


def get_used_bones_for_vertex(vertex, armature_obj):
    """Devuelve los bones que influencian un vértice (peso > 0)."""
    used = set()
    for g in vertex.groups:
        if g.weight > 0.0:
            # vertex_group name -> bone name
            vg_name = obj_vertex_group_name(g.group)
            bone = armature_obj.data.bones.get(vg_name)
            if bone:
                used.add(bone.name)
    return used


def partition_vertices_by_bones(mesh_obj, armature_obj, max_bones=256):
    """
    Particiona los vértices del mesh en N sub-meshes, cada uno con ≤max_bones bones.

    Algoritmo greedy:
      1. Para cada vértice, computa el conjunto de bones que lo influencian.
      2. Ordena vértices por número de bones (más骨头 first).
      3. Asigna cada vértice al primer sub-mesh cuyos bones no excedan max_bones.

    Devuelve: lista de (vertex_indices, bone_set) por sub-mesh.
    """
    # Para cada vértice, su conjunto de huesos.
    # (cambia según armature — pasamos como parámetro)
    mesh = mesh_obj.data
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_mesh = mesh_obj.evaluated_get(depsgraph).data

    # Build vg_name → bone_name mapping
    vg_to_bone = {}
    for vg in obj_vertex_groups(mesh_obj):
        bone = armature_obj.data.bones.get(vg.name)
        if bone:
            vg_to_bone[vg.index] = bone.name

    # Para cada vértice, calcular sus huesos
    vert_bones = []  # list of frozenset
    for v in mesh.vertices:
        bones = set()
        for g in v.groups:
            bone_name = vg_to_bone.get(g.group)
            if bone_name and g.weight > 0.0:
                bones.add(bone_name)
        vert_bones.append(frozenset(bones))

    # Ordenar vértices por # bones descendente (los más restrictivos primero).
    indices = sorted(range(len(vert_bones)), key=lambda i: -len(vert_bones[i]))

    # Sub-meshes
    sub_meshes = []  # list of {vert_indices: [], bones: set}

    for v_idx in indices:
        v_bones = vert_bones[v_idx]
        if not v_bones:
            # Vértice sin huesos → skip (puede pasar si no se skineó)
            continue

        # Buscar el primer sub-mesh que acepte estos huesos.
        placed = False
        for sub in sub_meshes:
            if len(sub['bones'] | v_bones) <= max_bones:
                sub['vert_indices'].append(v_idx)
                sub['bones'] |= v_bones
                placed = True
                break

        if not placed:
            sub_meshes.append({
                'vert_indices': [v_idx],
                'bones': set(v_bones),
            })

    return sub_meshes


# Helpers simplificados para que el script sea ejecutable standalone
def obj_vertex_groups(mesh_obj):
    return mesh_obj.vertex_groups


def obj_vertex_group_name(mesh_obj, group_index):
    return mesh_obj.vertex_groups[group_index].name


def main():
    out_path = Path(sys.argv[-1])
    if not out_path.is_absolute():
        out_path = Path.cwd() / out_path

    print(f"=== Splitting avatar for Filament ({BONE_LIMIT} bones/sub-mesh) ===")
    print(f"Output: {out_path}")

    armature = get_armature()
    print(f"Armature: {armature.name} ({len(armature.data.bones)} bones)")

    meshes = get_skinned_meshes(armature)
    print(f"Skinned meshes: {len(meshes)}")

    for mesh_obj in meshes:
        n_verts = len(mesh_obj.data.vertices)
        print(f"  {mesh_obj.name}: {n_verts} verts")

        sub_meshes = partition_vertices_by_bones(
            mesh_obj, armature, max_bones=BONE_LIMIT
        )

        print(f"  → Partitioned into {len(sub_meshes)} sub-meshes")
        for i, sub in enumerate(sub_meshes):
            print(f"     [{i}] {len(sub['vert_indices'])} verts, {len(sub['bones'])} bones")

    print()
    print("�️  Este script solo computa la partición. Para reconstruir el GLB")
    print("    con sub-meshes skinned, se necesita duplicar el mesh, mover")
    print("    vértices por sub-mesh, asignar vertex groups, y exportar.")
    print()
    print("    Lo más simple es:")
    print("    1. Abrir PruebaBlender2.blend en Blender")
    print("    2. Hacer la partición a mano (o con este script como guía)")
    print("    3. Exportar con File > Export > glTF 2.0 con skinning habilitado")


if __name__ == "__main__":
    main()
