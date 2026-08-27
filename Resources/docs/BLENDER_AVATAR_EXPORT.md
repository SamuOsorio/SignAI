# Re-exportar avatar.glb para Filament (≤256 huesos por skin)

## Contexto

El `avatar.glb` original (`app/static/avatar.glb`) tiene **918 joints** en un solo skin.
Filament aborta con `Precondition: bone count > 256` porque su shader de skinning tiene
un array uniforme hard-coded de tamaño 256.

Three.js (la versión web) NO tiene esta restricción — por eso funciona allí.

## Solución

Partir el mesh skinned en **N sub-meshs**, cada uno con un sub-skin de ≤256 huesos.
Filament renderiza cada sub-mesh con su propio skinning buffer. La animación de los
huesos sigue funcionando — los huesos que se animan son los mismos.

## Opción A — Manual en Blender (más fiable)

1. Abrí `blender/PruebaBlender2.blend`
2. Identificá el mesh del cuerpo (probablemente `female_v006lowresUV` o similar)
3. En **Object Mode**:
   - Seleccioná el mesh
   - `Ctrl+A` → Apply Visual Geometry to Mesh (para que las deformaciones se vean)
4. En **Edit Mode**:
   - Seleccioná todos los vértices (`A`)
   - `Mesh > Vertices > Separate > By Material` o `By Loose Parts`
   - **NO** — esto separa por material. Necesitamos separar por bones.

### El truco: vertex groups partitioning

1. En **Object Mode**, seleccioná el mesh
2. En **Properties > Object Data > Vertex Groups**, identificá cuántos groups hay
3. Vamos a crear 4 sub-meshes basados en zonas del cuerpo:
   - **Sub-mesh 1 (cabeza/cara)**: ~50 huesos de cara + cabeza + cuello
   - **Sub-mesh 2 (torso)**: ~50 huesos del torso + hombros
   - **Sub-mesh 3 (brazo izquierdo)**: ~50 huesos del brazo + mano izq + dedos izq
   - **Sub-mesh 4 (brazo derecho)**: ~50 huesos del brazo + mano der + dedos der
   - **Sub-mesh 5 (piernas)**: ~50 huesos de caderas + piernas

Para cada sub-mesh:
1. Duplicá el mesh original (`Shift+D`)
2. En **Edit Mode**, seleccioná los vértices del resto del cuerpo
3. `Delete > Vertices` (queda solo la zona)
4. En **Properties > Object Data > Vertex Groups > Remove Unused** para limpiar
5. Repetir hasta tener 5 sub-meshes

5. Asigná cada sub-mesh a un armature modifier apuntando al mismo armature
6. **File > Export > glTF 2.0**:
   - Format: glTF Binary (.glb)
   - Enable: Skinning
   - En **Mesh > Skinning**: dejá los defaults
   - Output path: `app/static/avatar_filament.glb`

## Opción B — Script `scripts/split_avatar_for_filament.py`

Hay un esqueleto de script Python con bpy que computa la partición pero **NO reescribe
el GLB**. Solo te dice cuántos sub-meshes harían falta y qué vértices van a cada uno.

```bash
blender --background blender/PruebaBlender2.blend \
    --python scripts/split_avatar_for_filament.py -- \
    /tmp/partition.txt
```

Si querés que lo complete (que modifique el .blend in-place o genere un nuevo GLB),
avisame y lo termino — pero es 1-2 horas de trabajo.

## Verificación

Cuando tengas `avatar_filament.glb` reemplazalo en `app/src/main/assets/` y corré:

```bash
cd appKotlin && ./gradlew installDebug
adb shell am start -n com.signai.app/.MainActivity
adb logcat -d | grep -iE "filament|avatarloader"
```

Deberías ver:
- `FEngine resolved backend: OpenGL`
- `Loaded avatar: ~NNN bones` (donde NNN puede ser >256 si son múltiples sub-skins,
   pero cada skin individual ≤256)
- Sin `SIGABRT` ni `Precondition: bone count > 256`
