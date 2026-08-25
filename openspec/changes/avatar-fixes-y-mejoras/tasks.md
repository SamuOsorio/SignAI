## 1. Fixes de código (app.js + server.py)

- [x] 1.1 ~~Corregir nombres de huesos de cejas~~ — CANCELADO: los nombres reales en el GLB son `DEF-browTL`/`DEF-browTR` (sin puntos). El código original era correcto. Verificado con `[..._signAI.bones.keys()]`.
- [x] 1.2 Corregir sincronización face/body en `server.py`: usar `face_idx = round(i * len(face_frames) / len(body_frames))` en lugar de `face[i]`
- [x] 1.3 Agregar animación de comisuras de boca en `applyFace()` usando `DEF-lipTL` / `DEF-lipTR` (nombres reales en GLB, sin puntos) y landmarks 78/308
- [x] 1.4 Verificar cejas visualmente con señas de emociones (0020–0027) — realizado. Reveló que los nombres de huesos en el GLB son sin puntos (`DEF-browTL`, no `DEF-brow.T.L`). El contexto del proyecto tenía la documentación incorrecta.

## 2. Avatar — mesh y textura (Blender)

- [ ] 2.1 Abrir `blender/PruebaBlender2.blend` y verificar si el mesh tiene material/textura asignada
- [ ] 2.2 Seleccionar o crear un mesh de mayor calidad con textura de piel (conservando el rig Rigify actual)
- [ ] 2.3 Corregir vertex weights de `DEF-browTR` en Weight Paint (actualmente solo 4 vértices vs 32 de la ceja izquierda)
- [ ] 2.4 Re-exportar `app/static/avatar.glb` desde `scripts/export_avatar.py` con texturas embebidas
- [ ] 2.5 Verificar que el GLB re-exportado no rompe la animación existente (dedos, brazos, mandíbula)

## 3. Captura de señas propias (pipeline)

- [ ] 3.1 Definir lista de señas faltantes que se van a grabar
- [ ] 3.2 Adaptar `scripts/process_videos.py` para procesar videos propios (no AVI del ZIP) en el mismo formato CSV
- [ ] 3.3 Validar que los CSVs generados tienen exactamente el mismo formato de columnas que LSC50
- [ ] 3.4 Asignar IDs a las señas propias (rango 0050+ o esquema separado)

## 4. Verificación Flutter/Filament

- [ ] 4.1 Probar cargar el avatar.glb actual en un proyecto Flutter con `flutter_filament`
- [ ] 4.2 Verificar soporte de skinning (animación por huesos) en Filament
- [ ] 4.3 Verificar que los materiales PBR del nuevo mesh son compatibles con Filament
- [ ] 4.4 Documentar restricciones o cambios necesarios para la migración mobile
