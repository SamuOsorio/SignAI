# Avatar 3D — Especificación técnica del rig y animación

> Última actualización: 2026-09-09  
> Rig activo: **AutoRigPro** (`CopiaModelo.glb`) — rama `feature/nuevo-avatar-copiamodelo`  
> Rig anterior: Rigify (`Prueba2.glb`, ~50 MB) — en archivo, rama `master`  
> Shading/material: ver change `avatar-shading-material` (rama `feature/avatar-material-shading`)  
> Bisagra de falanges: ver change `avatar-bisagra-falange` (rama `feature/avatar-bisagra-falange`)

---

## Archivos fuente

| Archivo | Descripción |
|---------|-------------|
| `blender/ARP.blend` | Archivo Blender con rig AutoRigPro (fuente del GLB actual) |
| `app/static/avatar.glb` | GLB exportado desde ARP.blend (con fix_all_weights aplicado) |
| `blender/fix_all_weights.py` | Script Blender (puro `bpy.data`) para corregir weight painting antes de exportar |
| `app/static/app.js` | Animación Three.js: IK de brazos, retargeting de dedos, cara |
| `app/hand_corrector.py` | Corrector de landmarks de mano (CONTACT/HOLD/BLEND + filtro temporal One-Euro) |
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

### Huesos de dedos (`FINGER_LM` en app.js — antes `BONE_MAP`)
```
FINGER_LM = { thumb:[1,2,3,4], index:[5,6,7,8], middle:[9,10,11,12],
              ring:[13,14,15,16], pinky:[17,18,19,20] }   // [MCP,PIP,DIP,TIP]
Falanges 1/2/3 de cada familia → thumb1l/2l/3l … pinky1l/2l/3l (ídem "r"). 30 huesos.
HINGE_FINGERS = index/middle/ring/pinky → bisagra de 1 eje (ver abajo).
thumb → sigue en rotateBone libre (articulación de sillar, no bisagra).

Metacarpianos (index1_base…pinky1_base): en el rig pero NO se animan.
Se quitaron (change avatar-finger-bundle-arm-ik): orientarlos desde wrist→nudillo
abría la palma en abanico; sus pesos ya están en hand.l/r.
```

### Retargeting de falanges — bisagra anatómica (change `avatar-bisagra-falange`)

Cada falange de index/middle/ring/pinky gira sobre **un solo eje** (flexión, sin torsión
ni abducción). Reemplaza el `rotateBone(dir)` libre anterior (`setFromUnitVectors` en 3D →
eje arbitrario → dedos torcidos con el ruido).

**Eje de bisagra** (`measureFingerHinges()`, una vez al cargar el GLB):
```
palmN  = normalize((index1 − wrist) × (pinky1 − wrist))   // world, rest pose
hingeW = normalize(restDir × palmN) · sign                // ⊥ eje largo del dedo y ⊥ palma
hingeL = snapToCardinal(hingeW aplicado en frame local del hueso)  // ±X/±Y/±Z exacto
state.boneFlexAxis[name] = hingeL     // index1.axisLocal = (−1,0,0) en ambas manos
```
`sign` automático: `pc = palmN · (thumb1 → thumb3)`; `pc < 0` → +palmN es dorsal → `sign = −1`.
Da `l = −1`, `r = +1` (esqueletos espejados). Override: `FINGER_FLEX_SIGN {Left,Right}`
(0 = auto, ±1 = forzar).

**Ángulo** (loop de dedos en `applyFrame`, dos pasos — medir las 3 falanges, luego aplicar):
```
bend = _segP.angleTo(_segC) · FLEX_GAIN     // giro 2D previa→actual ; FLEX_GAIN = 1.25
                                            // (compensa el escorzo que subestima la flexión)
// falange proximal: _segP = wrist → MCP
// DIP: si su segmento no es fiable → bend[DIP] = bend[PIP] · DIP_PIP_COUPLING (0.66)
flexFinger(bone, bend, state.fingerAlpha):
  a = clamp(bend, FLEX_MIN_RAD −0.14, FLEX_MAX_RAD 1.75)
  bone.quaternion.slerp(restLocalQ ∘ axisAngle(boneFlexAxis, a), fingerAlpha)  // 0.18
```

**Deadzone adaptativo** (`state.fingerDeadzone = 0.12`): `|_segC| < handSpan · fingerDeadzone`
(`handSpan = |mpToThree(lm9, lm0)|`) o segmento padre degenerado → señal NO fiable →
**relajar** `slerp(restLocalQ, fingerAlpha·0.5)` (antes: `continue` → congelaba → mano "en
garra" al bajar a reposo).

`rotateBone` queda **intacto** (brazos, cara, roll de muñeca, pulgar). El pulgar y
`FINGER_HINGE = false` (A/B) usan `rotateBone(seg, fingerAlpha)` con el segmento crudo.
`applyHandOrientation` sigue escalando el `z` crudo por `Z_HAND = 0.3`.

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
// shoulder → target, pole da dirección del codo. reach = L1 + L2
_ikPole.subVectors(elbow_hint, shoulder)
_ikPole.y -= reach * 0.35        // codo cuelga debajo de hombro-muñeca (anatómico)
_ikPole.z += reach * 0.10        // leve sesgo hacia la cámara

// Codo hacia afuera (despega el brazo del torso en señas frente al pecho),
// atenuado cuando la muñeca sube — si no, "ala de pollo" con el brazo en alto.
raise = clamp(1 - (wristY - shoulderY + reach*0.1) / (reach*0.4), 0.1, 1)
_ikPole.x += sign(shoulderX) * reach * ELBOW_OUT * raise   // ELBOW_OUT = 0.18
```

### Anti-clip de torso
```js
// Con Z_SCALE = 0.15 el offset frontal de la muñeca casi se anula → mano/antebrazo
// atravesaban el pecho al subir hacia la cara. Empuje hacia la cámara si el target
// está cerca de la línea media Y a la altura del pecho o más arriba.
nearBody = clamp(1 - |wristX - shoulderX| / (reach*0.6), 0, 1)
chestUp  = clamp((wristY - (shoulderY - reach*0.5)) / (reach*0.7), 0, 1)
_ikWrist.z += nearBody * chestUp * reach * TORSO_CLEAR     // TORSO_CLEAR = 0.30
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
| `FILTER` | siempre (último paso) | Filtro temporal One-Euro por landmark/eje, sobre la pose ya corregida |

**CRÍTICO**: en CONTACT, lm0 (muñeca) SÍ se preserva actual (lo usa el IK de brazo).
Solo lm1-20 (dedos) se congelan. Versión anterior congelaba todo → IK de brazo no se actualizaba.

```python
r_lm = [r_lm[0]] + r_frozen[1:]   # wrist actual + dedos pre-contacto
l_lm = [l_lm[0]] + l_frozen[1:]
```

### Filtro temporal One-Euro (paso 3b, change `avatar-hand-temporal-filter`)

Motivo: la mano ocupa ~3% del frame en las 50 señas → los segmentos de falange (~5–9 px)
quedan al nivel del jitter de MediaPipe (~0.009/frame) → dedos y muñeca tiemblan.

- `_OneEuro` (Casiez et al. 2012): pasa-bajos con `cutoff = min_cutoff + beta·|dx_filtrado|`.
- `_HandFilter`: banco de 21×3 filtros por mano; `reset()` al perder la mano.
- Se aplica en `_process_frame` **después** de CONTACT/HOLD/BLEND, sobre `r_lm`/`l_lm`.
- Parámetros (escala coords 0–1, por eso `beta` grande): `MIN_CUTOFF=1.0`, `BETA=18.0`,
  `D_CUTOFF=1.0`, `FPS=24`. Flag `filter_enabled` en el constructor.
- Resultado (50 señas): jitter angular de falange distal ↓ ~61%, trayectoria real ↓ ~12%,
  lag ~0 frames. Tuning: más mushy → subir `MIN_CUTOFF`/`BETA`; más tembloroso → bajar `MIN_CUTOFF`.

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
| Dedos index/middle/ring/pinky (24 huesos) | ✅ Funciona | Bisagra anatómica de 1 eje: `flexFinger` (ángulo 2D × FLEX_GAIN, clamp, axisAngle sobre `boneFlexAxis`) + acoplamiento DIP→PIP + deadzone que relaja a rest. fingerAlpha=0.18 (change `avatar-bisagra-falange`) |
| Pulgar (6 huesos) | ✅ Funciona | `rotateBone(seg, fingerAlpha)` libre — articulación de sillar, no bisagra |
| Metacarpianos (4 por mano) | ❌ No animar | Quitados de FINGER_LM (abrían la palma en abanico) |
| Muñeca roll (palma) | ✅ Funciona | applyHandOrientation() con cross(idx,pnk), z crudo × Z_HAND=0.3 |
| Codo | ✅ Funciona | IK 2-huesos (solveIKElbow) + ELBOW_OUT con gate de altura + anti-clip torso |
| Hombro (arm_stretch) | ✅ Funciona | IK 2-huesos. El hueso `shoulder` NO se anima → tears de pectoral con brazo muy alto (ver P1b) |
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
| ~~P1~~ | ~~Falanges: rotación de arco más corto (sin bisagra) → se tuercen/abren de costado~~ | **Resuelto** en change `avatar-bisagra-falange`: `flexFinger` gira cada falange sobre un solo eje (`boneFlexAxis`), rango acotado, sin torsión. `rotateBone` con `setFromUnitVectors` solo se usa ya para brazos/cara/muñeca/pulgar | — |
| P1b | "Se abre el pecho" al subir mucho el brazo | Artefacto de skinning: pesos flojos de hombro/pectoral (ver `copiamodelo-rig-ik-contacto` §2/§8) + el hueso `shoulder` no se anima → todo el giro va a `arm_stretch`. Mitigado al no forzar codo-afuera con brazo alto; fix = weight painting o animar `shoulder` | Media |
| P2 | Avatar sin textura de piel (color plano) | GLB sin material/textura; mitigado con material mate + IBL en runtime (change `avatar-shading-material`). Textura UV real requiere re-export desde Blender | Baja |
| P3 | Piernas low-poly (poco detalle) | Malla original con baja resolución en pelvis/piernas; solo se corrige re-exportando con subdivisión | Baja |
| P4 | Ceja derecha casi estática | Weight painting asimétrico (si aplica al nuevo rig) | Baja |

---

## Retargeting — fórmula correcta

> Usado por brazos, cara, roll de muñeca y pulgar. Las falanges index/middle/ring/pinky
> ya NO usan esto — ver `flexFinger` (bisagra de 1 eje) más arriba.

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
