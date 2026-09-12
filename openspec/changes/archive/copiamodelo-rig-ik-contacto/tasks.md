> **Archivado 2026-09-12** — pendientes vigentes consolidados en `openspec/changes/avatar-pendientes-criticos`. Este doc queda como registro histórico.

# CopiaModelo — Rig AutoRigPro, Weight Painting, IK y Contacto

> Sesión: 2026-09-08  
> Rama: `feature/nuevo-avatar-copiamodelo`  
> Commits base: `2986e87` (feat: reemplazar avatar por CopiaModelo.glb), `afa9404` (fix: adaptar nombres de huesos AutoRigPro)

---

## 1. Nuevo avatar: CopiaModelo.glb (AutoRigPro)

- [x] **1.1 Reemplazar avatar.glb** — se sustituyó el modelo anterior (Rigify/Prueba2.glb, ~50 MB) por
  `CopiaModelo.glb` (AutoRigPro, Blender). El rig AutoRigPro tiene convención de nombres distinta
  a Rigify: sin prefijo DEF-, con sufijo `.l`/`.r` que Three.js convierte a `l`/`r` (elimina puntos).

- [x] **1.2 Jerarquía de huesos de brazo (AutoRigPro)** — verificada en consola del navegador:
  ```
  shoulderl → arm_stretchl → arm_twistl        (hijo de arm_stretchl)
                           → forearm_stretchl → forearm_twistl (hijo)
                                              → handl → index1_basel → index1l → index2l → index3l
  ```
  Three.js strip de puntos: `arm_stretch.l` → `arm_stretchl`, `hand.l` → `handl`, etc.

- [x] **1.3 BONE_MAP actualizado** — se agregaron metacarpianos (`index1_basel`, `middle1_basel`,
  `ring1_basel`, `pinky1_basel`, ídem `r`) y las 3 falanges de los 5 dedos en ambos lados (30 huesos
  de dedos en total). Verificado con log `[SignAI] Finger bones: 30`.

---

## 2. Weight Painting — script Blender (fix_all_weights.py)

> Archivo: `blender/fix_all_weights.py`  
> Requiere: Blender con `ARP.blend` (rig AutoRigPro) abierto → Text Editor → Run Script

- [x] **2.1 Script puro `bpy.data`** — no usa ningún `bpy.ops`. Evita el error
  `RuntimeError: Operator bpy.ops.paint.vert_select_all.poll() failed, context is incorrect`
  que ocurre cuando no hay un 3D Viewport activo.

- [x] **2.2 TRANSFER_MAP** — solo transfiere pesos de metacarpianos (`index1_base.l/r`,
  `middle1_base.l/r`, `ring1_base.l/r`, `pinky1_base.l/r`) hacia `hand.l/r`.
  **NO** incluye `shoulder.l/r`, `arm_twist.l/r`, `forearm_twist.l/r` porque esos huesos
  tienen pesos en el torso/espalda y transferirlos a `arm_stretch` causó deformación catastrófica
  del torso (imagen #33 en sesión).

- [x] **2.3 Bug de propagación en smooth_vg** — corregido. La función `smooth_vg` promediaba
  pesos con vecinos sin restricción → propagaba pesos de `arm_stretch` al torso.
  Fix: saltar vértices con `old_w < 1e-5`:
  ```python
  if old_w < 1e-5:
      new_weights[v.index] = 0.0  # no propagar
      continue
  ```

- [x] **2.4 normalize_affected_weights** — reemplaza `normalize_all_weights` que normalizaba
  TODOS los vértices del mesh incluyendo torso/columna. La nueva función solo normaliza
  vértices que pertenecen a los vertex groups modificados.

---

## 3. Twist bones — doble rotación

- [x] **3.1 Diagnóstico** — `arm_twistl` y `forearm_twistl` son hijos de `arm_stretchl` y
  `forearm_stretchl` respectivamente. Al animar los twist bones, heredan la rotación del padre
  MÁS la animación aplicada → doble rotación → muñeca torcida.

- [x] **3.2 Fix** — pasar `null` para los twist bones en `_applyOneArm`:
  ```js
  _applyOneArm(body, 11, 13, 15,
    "arm_stretchl", null, "forearm_stretchl", null, ...)
  //               ^^^^                       ^^^^  twist bones = null → no se animan
  ```

---

## 4. Normales — costuras oscuras en el avatar

- [x] **4.1 computeVertexNormals()** — las split normals del GLB generaban líneas negras
  en cuello, hombros, cintura y antebrazos. Fix: recalcular normales suaves en Three.js
  al cargar el GLB:
  ```js
  gltf.scene.traverse(obj => {
    if (obj.isMesh && obj.geometry) obj.geometry.computeVertexNormals();
  });
  ```

---

## 5. IK de brazos — Z_SCALE y análisis de coordenadas

- [x] **5.1 Z_SCALE: 0.40 → 0.15** — análisis con datos reales (seña 0005, frame 20):
  - Pose wrist z relativo a hombro ≈ −0.40
  - Con Z_SCALE=0.40 y scale≈3.07 → 0.48 u solo en z
  - Brazo mide 0.507 u total → casi todo el alcance consumido en z
  - Con Z_SCALE=0.15 → solo 0.18 u en z → 0.47 u libres para x,y → manos llegan al centro

- [x] **5.2 Referencia de IK — análisis del centro vs hombro propio**
  - Problema: con referencia por hombro propio (`lmWorldOffset(lm15, lm11, scale, shoulderL, _ikWrist)`),
    cuando las muñecas están en el centro de la imagen (lm15≈lm16≈0.52 en x), los targets 3D
    quedan anclados a lados opuestos (shoulderL=+0.185, shoulderR=−0.191 → gap de 0.32 u)
  - Datos reales (frame 0): OLD target_L=(0.249, 0.398), NEW centro=(0.238, 0.392) → diferencia
    de solo 0.011 u. La referencia centro es esencialmente neutral para poses normales.
  - **Conclusión**: el gap no se puede eliminar solo con cambio de referencia porque las muñecas
    en el video SUEELEN estar en lados opuestos (lm15.x=0.560, lm16.x=0.474 en frame 20 de 0005).

- [x] **5.3 Mediciones de rig** — `measureArmRest()` usa huesos `arm_stretchl/r`,
  `forearm_stretchl/r`, `handl/r` (sin puntos). Valores reales del avatar:
  ```
  shoulderL = (+0.185, 1.336, −0.058)
  shoulderR = (−0.191, 1.336, −0.058)
  L_upper = 0.266 u, L_fore = 0.241 u → alcance total = 0.507 u
  separación hombros 3D = 0.376 u
  scale = 3.067 (para seña 0005)
  ```

---

## 6. HandCorrector — corrección de landmarks en contacto

> Archivo: `app/hand_corrector.py`  
> Integrado en: `app/server.py`

- [x] **6.1 HandCorrector implementado** — detecta y corrige tres estados:
  - `CONTACT` (prox_xy < 0.09): ambas palmas muy juntas → dedos pueden estar ocluidos
  - `HOLD` (hasta 8 frames): mano desaparece → mantiene última pose válida
  - `BLEND` (noise_thresh > 0.10): salto brusco → mezcla (alpha=0.40) con frame anterior

- [x] **6.2 Fix estado CONTACT** — versión inicial congelaba TODOS los landmarks incluyendo
  la muñeca (lm0), causando que el IK de brazo no se actualizara. Fix: preservar lm0 (wrist)
  y congelar solo lm1-20 (dedos):
  ```python
  r_lm = [r_lm[0]] + r_frozen[1:]   # wrist actual + dedos pre-contacto
  l_lm = [l_lm[0]] + l_frozen[1:]
  ```

- [x] **6.3 Integración en server.py** — `HandCorrector().process_sequence(frames)` aplicado
  en `load_sign_landmarks()` antes de retornar. Stats incluidos en JSON:
  ```json
  "corrector_stats": {"contact": 21, "hold_l": 0, "hold_r": 0, "blend": 4}
  ```

- [x] **6.4 HandCorrector verificado** — seña 0005_0000_0000: 80 frames, 21 CONTACT (frames 15-30),
  4 BLEND, 0 HOLD.

---

## 7. IK de contacto — CONTACT_BLEND

- [x] **7.1 Problema** — en señas de contacto, las muñecas en imagen tienen lm15.x≈0.560 y
  lm16.x≈0.474. Con IK relativo a hombro propio, los targets 3D quedan a ±0.160 u del centro
  → gap de 0.320 u entre muñecas → manos nunca se ven juntas aunque el video las muestre juntas.

- [x] **7.2 Fix — CONTACT_BLEND = 0.8** — cuando `_corrector_state === 'CONTACT'`, se fusionan
  ambos targets de muñeca al 80% hacia su punto medio:
  ```js
  if (frameState === 'CONTACT') {
    _ikContactMid.addVectors(_ikWristL, _ikWristR).multiplyScalar(0.5);
    _ikWristL.lerp(_ikContactMid, 0.8);
    _ikWristR.lerp(_ikContactMid, 0.8);
  }
  ```
  Resultado: en frames de contacto ambas muñecas convergen a ≈3.2 cm del punto medio → manos juntas.
  Frames normales no se ven afectados.

- [x] **7.3 frameState desde corrector** — `applyFrame` pasa `frameData._corrector_state` a
  `applyArmIK`:
  ```js
  applyArmIK(frameData.body, frameData.hands, frameData._corrector_state ?? 'NORMAL');
  ```

---

## 8. Registro de errores investigados

| Error / imagen | Diagnóstico | Fix aplicado |
|----------------|-------------|--------------|
| Torso deformado (img #33) | TRANSFER_MAP incluía shoulder/arm_twist/forearm_twist con pesos en torso | Eliminar esos huesos del TRANSFER_MAP |
| Muñeca torcida (img #27) | Twist bones hijos de stretch → doble rotación al animar directo | null para twist bones |
| Brazo roto (img #35) | Override de Hand lm0.z≈0 para IK (z relativo a muñeca) vs Body z global → offset masivo | Revertir a usar body[iW] para IK |
| Manos no juntas (img #32) | Z_SCALE=0.40 consume todo el alcance del brazo en eje z | Z_SCALE=0.15 |
| Costuras oscuras (img #26) | Split normals del GLB de Blender | computeVertexNormals() en carga |
| Dedos en claw (img #42) | HandCorrector congelando landmarks incluyendo wrist | Fix: preservar lm0, congelar lm1-20 |
| Manos no juntan a pesar del fix | Gap estructural: muñecas siempre separadas en señas de contacto | CONTACT_BLEND = 0.8 midpoint |

---

## 9. Estado final de archivos modificados

| Archivo | Cambios |
|---------|---------|
| `app/static/app.js` | BONE_MAP+30 dedos, Z_SCALE=0.15, null twist bones, computeVertexNormals, applyArmIK con CONTACT_BLEND=0.8, measureArmRest con nombres ARP |
| `app/hand_corrector.py` | Nuevo archivo: CONTACT/HOLD/BLEND logic, fix lm0 preservado |
| `app/server.py` | HandCorrector integrado en load_sign_landmarks, corrector_stats en JSON |
| `blender/fix_all_weights.py` | Nuevo script: transferencia+suavizado de pesos puro bpy.data, sin bpy.ops |

---

## 10. Pendiente

- [ ] **10.1** Verificar visualmente CONTACT_BLEND en más señas de contacto (0004, etc.)
- [ ] **10.2** Afinar `CONTACT_BLEND` si 0.8 es muy agresivo (ambas muñecas demasiado juntas)
  o muy suave (gap aún visible). Rango razonable: 0.6–0.9.
- [ ] **10.3** Dedos durante CONTACT siguen mostrando formas extrañas (claw). Causa probable:
  proyección sobre palmNorm incorrecto cuando la palma está muy rotada durante contacto.
  Posible fix: desactivar proyección palmNorm durante CONTACT (usar raw direction).
- [ ] **10.4** Hacer commit de todos los cambios a `feature/nuevo-avatar-copiamodelo`.
- [ ] **10.5** Re-exportar CopiaModelo.glb si se hacen nuevos ajustes en Blender.
