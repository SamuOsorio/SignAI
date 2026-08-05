# SignAI — Guía técnica del proyecto

Proyecto de grado: traducción de español hablado a Lengua de Señas Colombiana (LSC) mediante un avatar 3D animado en tiempo real. El pipeline actual anima el avatar con landmarks del dataset LSC50 (sin inferencia en tiempo real aún).

---

## Estructura del repositorio

```
Tesis/
├── app/
│   ├── server.py          # Servidor Flask (API + servir archivos estáticos)
│   ├── static/
│   │   ├── index.html     # UI (two-panel: video + avatar)
│   │   ├── style.css
│   │   ├── app.js         # Three.js + animación de huesos (módulo ES)
│   │   └── avatar.glb     # Rig exportado desde Blender (1.4 MB, 1092 huesos)
│   └── video_cache/       # MP4s cacheados extraídos de VIDEOS.zip
├── assets/
│   └── human-base-meshes-bundle-v1.4.1/
│       └── human_base_meshes_bundle.blend   # Bundle Blender con mallas base
├── blender/               # Archivos .blend de trabajo/prueba
├── data/
│   ├── LANDMARKS/
│   │   ├── HANDS_LANDMARKS/
│   │   │   ├── LEFT_HAND_LANDMARKS/   # 1000 CSVs, 21 landmarks mano izquierda
│   │   │   └── RIGHT_HAND_LANDMARKS/  # 1000 CSVs, 21 landmarks mano derecha
│   │   ├── BODY_LANDMARKS/            # 1000 CSVs, 33 landmarks de cuerpo (Pose)
│   │   └── FACE_LANDMARKS/            # 1000 CSVs (no usados aún)
│   ├── IMU/               # Datos IMU del dataset (no usados actualmente)
│   └── VIDEOS.zip         # 1000 videos AVI — leídos por server.py en tiempo real
├── docs/                  # PDFs y docx de documentación de tesis
├── scripts/
│   ├── run.sh             # Entry point: activa venv y lanza el script indicado
│   ├── capture_landmarks.py    # Captura webcam con MediaPipe Tasks API
│   ├── process_videos.py       # Procesa VIDEOS.zip → JSONs en scripts/landmarks/
│   ├── visualize_landmarks.py  # Visualización 3D matplotlib de los landmarks
│   ├── retarget_blender.py     # Aplica landmarks a rig en Blender (genera keyframes)
│   ├── setup_rig.py            # Importa bundle + crea meta-rig en Blender
│   ├── export_avatar.py        # Exporta rig a app/static/avatar.glb
│   ├── hand_landmarker.task    # Modelo MediaPipe (binario)
│   ├── landmarks/              # JSONs intermedios generados por process_videos.py
│   └── README.md
└── signai_env/            # Virtualenv Python
```

---

## Cómo correr

```bash
# Iniciar servidor Flask (puerto 5000)
./scripts/run.sh app
# → http://localhost:5000

# Otras tareas
./scripts/run.sh process           # procesar 1 video por seña (50 videos, prueba)
./scripts/run.sh process --all     # procesar los 1000 videos
./scripts/run.sh visualize 0049_0000_0000 --all   # animación matplotlib
./scripts/run.sh capture           # captura landmarks desde webcam
```

Instalar dependencias por primera vez:
```bash
python3 -m venv signai_env
signai_env/bin/pip install mediapipe opencv-python-headless numpy matplotlib flask
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend 3D | Three.js r169 (ES modules, CDN jsDelivr) |
| Carga GLB | `GLTFLoader` + `OrbitControls` |
| Servidor | Flask (Python), puerto 5000 |
| Landmarks origen | Dataset LSC50 — CSVs con landmarks MediaPipe |
| Extracción de video | `zipfile` + `ffmpeg` (AVI → MP4 cacheado) |
| Landmark capture | MediaPipe Tasks API (`hand_landmarker.task`) |
| Rig | Rigify (Blender 5.2) exportado como GLB |
| Visualización offline | matplotlib + mpl_toolkits.mplot3d |

---

## Dataset LSC50

- **1000 videos** de 50 señas LSC (20 repeticiones × 50 señas, múltiples ángulos)
- **ID de seña**: `SSSS_RRRR_AAAA` (ej: `0003_0001_0002` = seña 3, rep 1, ángulo 2)
- **Landmarks ya extraídos** en `data/LANDMARKS/` (no hace falta re-procesar)
- Videos en `data/VIDEOS.zip` bajo `VIDEOS/COLOR_BODY/`

### Formato CSV de landmarks

Cada CSV = 1 video. Cada fila = 1 frame.

**Manos** (21 landmarks):
```
landmark_0_x, landmark_0_y, landmark_0_z, landmark_1_x, ... landmark_20_z
```
MediaPipe world coords: metros centrados en la muñeca. `x` = derecha, `y` = arriba, `z` = hacia cámara.

**Cuerpo** (33 landmarks MediaPipe Pose):
```
landmark_0_x, landmark_0_y, ..., landmark_32_z
```
Coordenadas de imagen normalizadas (0–1). `y` = 0 arriba.

### Landmarks de cuerpo relevantes para brazos

```
11 = hombro izquierdo    12 = hombro derecho
13 = codo izquierdo      14 = codo derecho
15 = muñeca izquierda    16 = muñeca derecha
19 = índice izquierdo    20 = índice derecho
```

### Formato JSON que produce process_videos.py / consume app.js

```json
{
  "stem": "0003_0001_0002",
  "fps": 30,
  "total_frames": 60,
  "frames_with_hand": 58,
  "detection_rate": 0.97,
  "source": "lsc50",
  "frames": [
    {
      "hands": [
        {
          "hand": "Left",
          "landmarks": [{"x": 0.01, "y": -0.05, "z": 0.003}, ...]
        },
        {
          "hand": "Right",
          "landmarks": [...]
        }
      ],
      "body": [
        {"x": 0.45, "y": 0.32, "z": -0.01},
        ...
      ]
    }
  ]
}
```

`body` es una lista de 33 dicts (uno por landmark), indexada directamente.

---

## Avatar GLB — estructura del rig

- **1092 huesos totales**: 918 huesos DEF (deforman la malla) + 174 huesos de control
- Exportado con `export_def_bones=False` → exporta TODOS los huesos, no solo DEF
- Los objetos `WGT-*` son widgets visuales de Blender; se ocultan con `obj.visible = false` (NO `removeFromParent()`, rompe el skin)

### Nombres de huesos — CRÍTICO

El rig Rigify exportado usa nombres **sin prefijo `DEF-` para dedos**, sin puntos, con `L`/`R` pegado al final:

**Dedos** (30 huesos, huesos de control):
```
thumb01L   thumb02L   thumb03L
f_index01L f_index02L f_index03L
f_middle01L f_middle02L f_middle03L
f_ring01L  f_ring02L  f_ring03L
f_pinky01L f_pinky02L f_pinky03L
(ídem con R)
```

**Brazos** (10 huesos DEF — estos sí tienen prefijo `DEF-`):
```
DEF-upper_armL    DEF-upper_armL001
DEF-forearmL      DEF-forearmL001
DEF-handL
(ídem con R)
```

Forma de descubrir nombres en browser console:
```js
[..._signAI.bones.keys()].filter(n => n.includes("thumb"))
[..._signAI.bones.keys()].filter(n => n.startsWith("DEF-"))
```

---

## Pipeline de retargeting (app.js)

### Problema central

Los huesos Rigify tienen **rest pose no-identidad** — `bone.quaternion` es rotación *local* relativa al padre, y en rest no es `(0,0,0,1)`. Resetear con `identity()` destruye la pose y deforma el avatar.

### Solución implementada

Al cargar el GLB se guarda el estado de rest de cada hueso:
```js
state.boneRestLocalQ  // Quaternion local en rest → para resetPose()
state.boneRestWorldQ  // Quaternion world en rest → para retargeting
state.boneRestDir     // Vector3(0,1,0) rotado al world → dirección Y en rest
```

### Fórmula de retargeting

```js
function rotateBone(bone, targetDir) {
  // 1. deltaQ: rotación mínima desde restDir hasta targetDir
  _dQ.setFromUnitVectors(restDir, targetDir.normalized());

  // 2. targetWorldQ: aplicar delta encima del rest world
  _tWQ.multiplyQuaternions(_dQ, restWorldQ);

  // 3. localQ: pasar de world a espacio local del padre
  bone.parent.getWorldQuaternion(_pWQ);
  bone.quaternion.multiplyQuaternions(_pWQ.invert(), _tWQ);

  bone.updateMatrixWorld(true);
}
```

**NUNCA** hacer `bone.quaternion = parentWQ_inv * deltaQ` — ignora el rest y produce torsión acumulada.

### Conversión de ejes landmark → Three.js

**Manos** (world coords de MediaPipe):
```js
function mpToThree(lm, wrist) {
  return new THREE.Vector3(lm.x - wrist.x, -(lm.y - wrist.y), -(lm.z - wrist.z));
}
// Dirección del hueso: mpToThree(rawLms[lmEnd], wrist).sub(mpToThree(rawLms[lmStart], wrist))
```

**Cuerpo** (coords normalizadas de imagen, y=0 arriba):
```js
function lmDir(a, b) {
  return new THREE.Vector3(b.x - a.x, -(b.y - a.y), -(b.z - a.z));
}
```

### Mapeo landmarks → huesos

`BONE_MAP` en `app.js`: 30 entradas `[boneName, lmStart, lmEnd]` para dedos.
`BODY_BONE_MAP`: 10 entradas para huesos de brazo (hombro→codo→muñeca→índice).

---

## API del servidor Flask

| Endpoint | Descripción |
|----------|-------------|
| `GET /` | Sirve `index.html` |
| `GET /api/signs` | Lista todas las señas disponibles (JSON array) |
| `GET /api/landmarks/<sign_id>` | Devuelve landmarks combinados (hands + body) |
| `GET /api/video/<sign_id>` | Extrae AVI del ZIP, convierte a MP4 (cachea en `video_cache/`) |
| `GET /avatar.glb` | Servido como archivo estático |

El servidor usa `@functools.lru_cache(maxsize=256)` en `load_sign_landmarks` — al reiniciar el servidor se limpia la caché.

---

## Blender — workflow del rig

1. **Abrir el bundle**: `assets/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend`
2. **Correr `setup_rig.py`** desde Blender para importar mallas y crear meta-rig
3. Ajustar el meta-rig manualmente a la malla (alinear huesos a articulaciones)
4. **Generar rig Rigify**: `Generate Rig` en las propiedades del armature
5. **Correr `export_avatar.py`** para exportar a `app/static/avatar.glb`

Para animar en Blender con landmarks reales:
- Correr `retarget_blender.py` desde el Text Editor de Blender
- Leer un JSON de `scripts/landmarks/` (ajustar `LANDMARKS_PATH` en el script)
- El script inserta keyframes en los huesos de dedos de ambas manos

---

## Errores resueltos (no reinventar)

### Avatar se deforma después del primer uso
**Causa**: `resetPose()` llamaba `bone.quaternion.identity()`.
**Fix**: guardar `boneRestLocalQ` al cargar el GLB y restaurar en `resetPose()`.

### Dedos no se mueven
**Causa**: BONE_MAP usaba nombres con formato incorrecto (`DEF-thumb.01.L`).
**Fix**: los nombres reales son `thumb01L`, `f_index01L` (sin puntos, sin `DEF-`).

### Objetos WGT- desaparecen y rompen el skin
**Causa**: `removeFromParent()` desconecta los nodos de la escena rompiendo referencias del skin.
**Fix**: `obj.visible = false` únicamente.

### Retargeting produce torsión acumulada
**Causa**: fórmula incorrecta ignoraba el rest world quaternion.
**Fix**: `targetWorldQ = deltaQ * restWorldQ`, luego `localQ = parentWQ_inv * targetWorldQ`.

---

## Estado actual del proyecto (agosto 2026)

- [x] Avatar 3D cargando y visible en browser
- [x] Animación de dedos con hand landmarks LSC50
- [x] Animación de brazos con body landmarks LSC50
- [x] Video del señante sincronizado con la animación del avatar
- [x] Selector de 1000 señas LSC50 en la UI
- [ ] Animación de hombros (traslación, no solo rotación)
- [ ] Landmarks de rostro (expresión facial)
- [ ] Inferencia en tiempo real (TTS → LSC en vivo)
- [ ] Calibración de coordenadas cuerpo (posible inversión en eje X por espejo de cámara)
