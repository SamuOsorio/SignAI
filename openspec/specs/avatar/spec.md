# Avatar 3D — Especificación técnica del rig y animación

## Archivo fuente

- **Blender**: `blender/PruebaBlender2.blend` — archivo de producción del rig actual
- **GLB exportado**: `app/static/avatar.glb` (1.4 MB)
- **Script de export**: `scripts/export_avatar.py` — corre desde Blender

## Estado actual del GLB

| Aspecto            | Estado                                                      |
|--------------------|-------------------------------------------------------------|
| Meshes             | female_v006lowresUV (cuerpo), male_v008Eyes ×2 (globos)    |
| Vértices           | 12010 cuerpo + 2×2176 ojos = 16362 total                    |
| Material/Textura   | **NINGUNO** — se ve como maniquí gris                        |
| Skins              | rig (918 joints DEF-*) + metarig (174 joints)               |
| Morph targets      | Ninguno exportado                                           |
| Rig tipo           | Rigify completo (vertex weights asignados automáticamente)  |

**Prioridad**: Reemplazar mesh por uno con textura de piel. Recomendación: mantener el rig
Rigify actual y solo cambiar el mesh visual (opción más segura y rápida).

## Nombres de huesos — regla de oro

**Dedos y brazos: SIN puntos**
```
thumb01L, f_index01L, f_middle01L, f_ring01L, f_pinky01L
DEF-upper_armL, DEF-upper_armL001, DEF-forearmL, DEF-forearmL001, DEF-handL
(ídem con R)
```

**Cara: CON puntos (separador entre secciones)**
```
DEF-brow.T.L    DEF-brow.T.R     ← cejas superiores
DEF-brow.B.L    DEF-brow.B.R     ← cejas inferiores
DEF-lid.T.L     DEF-lid.T.R      ← párpado superior
DEF-lid.B.L     DEF-lid.B.R      ← párpado inferior
DEF-lip.T.L     DEF-lip.T.R      ← labio superior
DEF-lip.B.L     DEF-lip.B.R      ← labio inferior
DEF-jaw_master                   ← mandíbula (sin puntos — excepción)
DEF-eye.L       DEF-eye.R        ← globo ocular
DEF-eye_iris.L  DEF-eye_iris.R   ← iris
```

Verificar en browser console: `[..._signAI.bones.keys()].filter(n => n.includes('brow'))`

## Bugs conocidos del rig

### Bug 1 — Cejas nunca se mueven (app.js)
```js
// INCORRECTO (actual en app.js líneas 429/436):
state.bones.get("DEF-browTL")   // → undefined, no existe
state.bones.get("DEF-browTR")   // → undefined, no existe

// CORRECTO:
state.bones.get("DEF-brow.T.L")
state.bones.get("DEF-brow.T.R")
```

### Bug 2 — Ceja derecha casi estática (Blender, vertex weights)
- `DEF-brow.T.L`: 32 vértices pesados (correcto)
- `DEF-brow.T.R`: solo 4 vértices (pesos bajos ~0.12) → movimiento casi invisible
- Fix: abrir `PruebaBlender2.blend`, Weight Paint en `DEF-brow.T.R`, re-exportar

### Bug 3 — Face desfasada respecto a brazos (server.py)
```python
# INCORRECTO (actual en load_sign_landmarks):
if i < len(face_frames): frame["face"] = face_frames[i]

# CORRECTO (sincronizar por tiempo real):
face_idx = round(i * len(face_frames) / len(body_frames))
if face_idx < len(face_frames): frame["face"] = face_frames[face_idx]
```
Face landmarks vienen de video a 50fps; body/hands de video a 24fps → ratio ~2.9×.

## Estado de animación por parte del cuerpo

| Parte               | Estado      | Implementación                        |
|---------------------|-------------|---------------------------------------|
| Dedos (30 huesos)   | ✅ Funciona  | BONE_MAP + rotateBone()               |
| Muñeca roll (palma) | ✅ Funciona  | applyHandOrientation()                |
| Muñeca flex/ext     | ⚠️ Parcial   | Solo vía IK, no hueso independiente   |
| Codo                | ✅ Funciona  | IK 2-huesos (solveIKElbow)            |
| Hombro              | ✅ Funciona  | IK 2-huesos                           |
| Mandíbula (boca)    | ✅ Funciona  | DEF-jaw_master, FACE_ALPHA=1.0        |
| Cejas               | ❌ Bug nombre| DEF-browTL → corregir a DEF-brow.T.L  |
| Párpados            | ❌ No impl.  | Huesos existen, datos disponibles     |
| Labios (comisuras)  | ❌ No impl.  | DEF-lip.T.L/R existen, datos listos  |
| Cabeza (inclinación)| ❌ No impl.  | Pendiente (lm1/168 de FaceMesh)       |

## Expresiones faciales prioritarias

| Expresión  | Huesos principales               | Landmark fuente          |
|-----------|----------------------------------|--------------------------|
| Duda       | DEF-brow.T.L (asimétrico)        | lm70/107/55, lm300/336   |
| Felicidad  | DEF-brow.T.L/R + DEF-lip.T.L/R  | lm70/300 + lm78/308      |
| Pregunta   | DEF-brow.T.L/R + DEF-jaw_master  | lm70/300 + lm13/14       |

Todos los huesos faciales deben usar `FACE_ALPHA = 1.0` (sin slerp). Ver CLAUDE.md.

## Retargeting — fórmula correcta

```js
// rotateBone: alinea el eje Y del hueso a targetDir
// 1. deltaQ: rotación mínima desde restDir hasta targetDir
_dQ.setFromUnitVectors(restDir, targetDir.normalized());
// 2. targetWorldQ: aplicar delta sobre rest world quaternion
_tWQ.multiplyQuaternions(_dQ, restWorldQ);
// 3. localQ: convertir de world a espacio local del padre
bone.parent.getWorldQuaternion(_pWQ);
_tLQ.multiplyQuaternions(_pWQ.invert(), _tWQ);
bone.quaternion.slerp(_tLQ, alpha);
```

NUNCA hacer `quaternion.identity()` para resetear — rompe el avatar. Usar `boneRestLocalQ`.

## Conversión de ejes landmark → Three.js

```js
// Body landmarks (imagen normalizada, y=0 arriba):
lmDir(a, b) = Vector3(b.x-a.x, -(b.y-a.y), -(b.z-a.z))

// Hand landmarks (relativo a muñeca):
mpToThree(lm, wrist) = Vector3(lm.x-wrist.x, -(lm.y-wrist.y), -(lm.z-wrist.z))
```

## Escala de coordenadas de cuerpo

- `bodyScale()`: usa separación entre hombros (lm11-lm12) como ancla
- `Z_SCALE = 0.40`: factor empírico para profundidad del brazo (eje Z de imagen normalizada)
- Polo del IK: `pole.y -= (L1+L2)*0.35` (bias hacia abajo) + `pole.z += (L1+L2)*0.10` (frontal)
