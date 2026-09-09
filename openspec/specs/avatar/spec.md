# Avatar 3D — Especificación técnica del rig y animación

> Última actualización: 2026-09-09  
> Rig activo: **AutoRigPro** (`CopiaModelo.glb`) — rama `feature/nuevo-avatar-copiamodelo`  
> Rig anterior: Rigify (`Prueba2.glb`, ~50 MB) — en archivo, rama `master`  
> Shading/material: ver change `avatar-shading-material` (rama `feature/avatar-material-shading`)

---

## Archivos fuente

| Archivo | Descripción |
|---------|-------------|
| `blender/ARP.blend` | Archivo Blender con rig AutoRigPro (fuente del GLB actual) |
| `app/static/avatar.glb` | GLB exportado desde ARP.blend (con fix_all_weights aplicado) |
| `blender/fix_all_weights.py` | Script Blender (puro `bpy.data`) para corregir weight painting antes de exportar |
| `app/static/app.js` | Animación Three.js: IK de brazos, retargeting de dedos, cara |
| `app/hand_corrector.py` | Corrector de landmarks de mano (CONTACT/HOLD/BLEND) |
| `app/server.py` | Flask: sirve landmarks corregidos con HandCorrector |

---

## Estado actual del GLB (CopiaModelo.glb)

| Aspecto | Estado |
|---------|--------|
| Rig | AutoRigPro (Blender) |
| Nombres de huesos | Sin puntos en Three.js (ver sección siguiente) |
| Materiales / texturas | **0 en el GLB** (`material: null`, sin imágenes; `COLOR_0` blanco plano). Skinning de piernas sano (pesos normalizados). Malla: 1 sola, low-poly en piernas (pelvis/muslo 380–1920 verts vs cabeza ~3870) |
| Material en runtime | `MeshStandardMaterial {color:0xa9785d, roughness:0.85, metalness:0}` aplicado en `app.js` a todas las mallas (reemplaza el default metálico de GLTFLoader) |
| Iluminación | `scene.environment` = `RoomEnvironment` vía `PMREMGenerator`, `environmentIntensity 0.45`; `ACESFilmicToneMapping` exp `0.85`; `AmbientLight 0.2`, key `0.9`, fill `0.4` |
| Normales | Se usan las del GLB. `computeVertexNormals()` detrás de `const RECOMPUTE_NORMALS = false` — recalcular creaba costura vertical en el plano de simetría (mirror sin soldar) |
| Dedos animados | ✅ 30 huesos (5 dedos × 3 falanges × 2 lados) |
| Twist bones | ❌ NO se animan (causarían doble rotación) |

---

## Nombres de huesos AutoRigPro — regla de oro

**Three.js elimina puntos** de los nombres de huesos al cargar el GLB:
`arm_stretch.l` → `arm_stretchl`, `hand.l` → `handl`, etc.

### Jerarquía de brazo izquierdo (ídem derecho con `r`)
```
shoulderl
  └─ arm_stretchl
       ├─ arm_twistl          ← hijo de arm_stretchl, NO animar (double rotation)
       └─ forearm_stretchl
            ├─ forearm_twistl ← hijo de forearm_stretchl, NO animar
            └─ handl
                 ├─ index1_basel → index1l → index2l → index3l
                 ├─ middle1_basel → middle1l → middle2l → middle3l
                 ├─ ring1_basel → ring1l → ring2l → ring3l
                 ├─ pinky1_basel → pinky1l → pinky2l → pinky3l
                 └─ thumb1l → thumb2l → thumb3l
```

### Twist bones — CRÍTICO
`arm_twistl` y `forearm_twistl` son HIJOS de los stretch bones. Al animar twist bones
directamente, heredan la rotación del padre MÁS la aplicada → **doble rotación → muñeca torcida**.
Fix: pasar `null` en la posición del twist bone en `_applyOneArm`:
```js
_applyOneArm(body, 11, 13, 15,
  "arm_stretchl", null,          // null = no animar arm_twistl
  "forearm_stretchl", null, ...) // null = no animar forearm_twistl
```

### Huesos de dedos (BONE_MAP en app.js)
```
Metacarpianos (palma → nudillo):
  index1_basel [lm0→5]  middle1_basel [lm0→9]
  ring1_basel  [lm0→13] pinky1_basel  [lm0→17]
  (ídem con "r")

Falanges (proximal → distal por dedo):
  thumb1l[1→2]  thumb2l[2→3]  thumb3l[3→4]
  index1l[5→6]  index2l[6→7]  index3l[7→8]
  middle1l[9→10] middle2l[10→11] middle3l[11→12]
  ring1l[13→14]  ring2l[14→15]  ring3l[15→16]
  pinky1l[17→18] pinky2l[18→19] pinky3l[19→20]
  (ídem con "r")
```

### Medidas del rig (verificadas en runtime)
```
shoulderL_world = (+0.185, 1.336, −0.058) u
shoulderR_world = (−0.191, 1.336, −0.058) u
L_upper = 0.266 u   L_fore = 0.241 u   alcance total = 0.507 u
separación hombros = 0.376 u
scale típico (seña 0005) ≈ 3.07
```

---

## Conversión de ejes landmark → Three.js

```
Imagen MediaPipe: x=0 izquierda, y=0 arriba, z crece alejándose
Three.js world:   +X derecha, +Y arriba, +Z hacia cámara
```

```js
// Body landmarks (dirección entre dos puntos):
lmDir(a, b) = Vector3(b.x−a.x, −(b.y−a.y), −(b.z−a.z))

// Hand landmarks (relativo a muñeca, z suprimido por ruido):
mpToThree(lm, wrist) = Vector3(lm.x−wrist.x, −(lm.y−wrist.y), 0)
```

---

## IK de brazos — diseño completo

### bodyScale
```js
// Ancla estable: separación hombro-hombro (lm11-lm12)
scale = shoulderL.distanceTo(shoulderR) / lmDist(body[11], body[12])
```

### lmWorldOffset — conversión landmark → world
```js
// Z_SCALE = 0.15 (reducido de 0.40 en sesión 2026-09-08)
// Con 0.40: z consumía casi todo el alcance del brazo (0.48/0.507 u) → manos no llegaban al centro
// Con 0.15: z consume 0.18 u → 0.47 u libres en x,y → manos pueden juntarse
out = Vector3(
  (lm.x − lmRef.x) * scale,
  −(lm.y − lmRef.y) * scale,
  −(lm.z − lmRef.z) * scale * 0.15,
).add(worldRef)
```

### Solver IK de 2 huesos (ley de cosenos)
```js
// shoulder → target, pole da dirección del codo
// Polo: codo hacia abajo (anatómico) + leve bias frontal
_ikPole.subVectors(elbow_hint, shoulder)
_ikPole.y -= (L1 + L2) * 0.35   // codo cuelga debajo de hombro-muñeca
_ikPole.z += (L1 + L2) * 0.10   // leve sesgo hacia la cámara
```

### CONTACT_BLEND — manos en contacto
Cuando `_corrector_state === 'CONTACT'`, ambas muñecas se fusionan al 80% hacia su punto medio:
```js
// Problema: muñecas siempre separadas ~0.32 u en señas de contacto (wrists en lados opuestos)
// Fix: convergencia explícita al midpoint durante CONTACT
_ikContactMid = (_ikWristL + _ikWristR) / 2
_ikWristL.lerp(_ikContactMid, 0.8)  // CONTACT_BLEND = 0.8
_ikWristR.lerp(_ikContactMid, 0.8)
```

---

## HandCorrector — corrección de landmarks

> `app/hand_corrector.py` — instanciar uno por seña

| Estado | Condición | Acción |
|--------|-----------|--------|
| `CONTACT` | prox_xy(palmL, palmR) < 0.09 | Preservar lm0 (wrist real), congelar lm1-20 (dedos pre-contacto) |
| `HOLD` | Mano desaparece (tracking loss) | Mantener última pose válida hasta 8 frames, luego decay×0.85 |
| `BLEND` | mean_disp entre frames > 0.10 | Mezclar alpha=0.40 con frame anterior |

**CRÍTICO**: en CONTACT, lm0 (muñeca) SÍ se preserva actual (lo usa el IK de brazo).
Solo lm1-20 (dedos) se congelan. Versión anterior congelaba todo → IK de brazo no se actualizaba.

```python
r_lm = [r_lm[0]] + r_frozen[1:]   # wrist actual + dedos pre-contacto
l_lm = [l_lm[0]] + l_frozen[1:]
```

Stats incluidos en JSON de `/api/landmarks/<id>`:
```json
"corrector_stats": {"contact": 21, "hold_l": 0, "hold_r": 0, "blend": 4}
```

---

## Weight Painting — fix_all_weights.py

> Corre en Blender: Text Editor → Open → Run Script. Solo `bpy.data`, sin `bpy.ops`.

### TRANSFER_MAP — solo metacarpianos (seguro)
```python
# SOLO estos — NO tocar shoulder/arm_twist/forearm_twist (tienen pesos en torso)
TRANSFER_MAP = {
    "index1_base.l": "hand.l",  "middle1_base.l": "hand.l",
    "ring1_base.l":  "hand.l",  "pinky1_base.l":  "hand.l",
    "index1_base.r": "hand.r",  "middle1_base.r": "hand.r",
    "ring1_base.r":  "hand.r",  "pinky1_base.r":  "hand.r",
}
```

### Regla de no-propagación en smooth_vg
```python
# Vértices con peso=0 se quedan en 0. Equivale a expand=0 del operador de Blender.
if old_w < 1e-5:
    new_weights[v.index] = 0.0
    continue
```

### Flujo de exportación
1. Abrir `blender/ARP.blend` en Blender
2. Text Editor → Open `blender/fix_all_weights.py` → Run Script
3. File → Export → glTF 2.0 (.glb)
   - Format: glTF Binary (.glb)
   - Armature: **desactivar** "Export Deform Bones Only" (necesitamos todos)
   - Mesh: Apply Modifiers ✓
4. Guardar como `app/static/avatar.glb`

---

## Estado de animación por parte del cuerpo

| Parte | Estado | Implementación |
|-------|--------|----------------|
| Dedos (30 huesos) | ✅ Funciona | BONE_MAP + rotateBone() + proyección palmNorm |
| Metacarpianos (4 por mano) | ✅ Funciona | BONE_MAP con lm0→5, lm0→9, lm0→13, lm0→17 |
| Muñeca roll (palma) | ✅ Funciona | applyHandOrientation() con cross(idx,pnk) |
| Codo | ✅ Funciona | IK 2-huesos (solveIKElbow) |
| Hombro | ✅ Funciona | IK 2-huesos |
| Arm/forearm twist | ❌ No animar | Hijos heredan rotación → doble giro si se animan |
| Mandíbula (boca) | ✅ Funciona | DEF-jaw_master, FACE_ALPHA=1.0 |
| Cejas | ✅ Funciona | DEF-browTL / DEF-browTR (sin puntos en este GLB) |
| Comisuras boca | ✅ Funciona | DEF-lipTL / DEF-lipTR |
| Párpados | ❌ No impl. | Huesos existen, datos disponibles |
| Cabeza (inclinación) | ❌ No impl. | Pendiente |

> **Nota rig anterior (Rigify)**: en Prueba2.glb los huesos de cara usaban puntos (`DEF-brow.T.L`).
> En el rig actual (AutoRigPro CopiaModelo.glb) NO hay huesos de cara con puntos — la cara del
> avatar es diferente. Los huesos `DEF-browTL`, `DEF-lipTL`, `DEF-jaw_master` son del rig anterior.

---

## Problemas conocidos pendientes

| # | Problema | Causa probable | Prioridad |
|---|---------|----------------|-----------|
| P1 | Dedos en "claw" durante CONTACT | palmNorm incorrecto cuando palma muy rotada en oclusión | Alta |
| P2 | Avatar sin textura de piel (color plano) | GLB sin material/textura; mitigado con material mate + IBL en runtime (change `avatar-shading-material`). Textura UV real requiere re-export desde Blender | Baja |
| P3 | Piernas low-poly (poco detalle) | Malla original con baja resolución en pelvis/piernas; solo se corrige re-exportando con subdivisión | Baja |
| P4 | Ceja derecha casi estática | Weight painting asimétrico (si aplica al nuevo rig) | Baja |

### P1 — Fix tentativo para dedos durante CONTACT
```js
// Desactivar proyección sobre palmNorm durante CONTACT:
const palmNorm = state === 'CONTACT'
  ? new THREE.Vector3(0, 0, 1)   // normal frontal neutra → sin restricción de plano
  : (side === 'Left' ? state.palmNormalL : state.palmNormalR)
dir.addScaledVector(palmNorm, -dir.dot(palmNorm));
```

---

## Retargeting — fórmula correcta

```js
// rotateBone(bone, targetDir, alpha = state.smoothAlpha)
// 1. Delta: rotación mínima desde rest hasta target
_dQ.setFromUnitVectors(restDir, targetDir.normalized())
// 2. Target world = delta × rest_world
_tWQ.multiplyQuaternions(_dQ, restWorldQ)
// 3. Local = inv(parent_world) × target_world
bone.parent.getWorldQuaternion(_pWQ)
_tLQ.multiplyQuaternions(_pWQ.invert(), _tWQ)
bone.quaternion.slerp(_tLQ, alpha)
bone.updateMatrixWorld(true)
```

**NUNCA** usar `quaternion.identity()` para resetear. Usar `boneRestLocalQ` guardado al cargar.

```js
// smoothAlpha = 0.12
// Convergencia por frame de animación (24fps, 60fps rAF):
// 1 anim frame = 2.5 rAF frames → convergencia ≈ 28% por frame de seña
```
