# Pipeline SignAI — Especificación del flujo de datos

## Flujo general

```
┌─────────────┐    ┌─────────────────────────────┐    ┌──────────────┐
│   LSC50     │    │   Videos propios (futuro)   │    │              │
│  landmarks  │    │  mov / mp4 / avi            │    │              │
│  (CSVs)     │    │         │                   │    │              │
└──────┬──────┘    │   Mediapipe / MMPose        │    │              │
       │           │   (mismo formato CSV LSC50) │    │              │
       │           └──────────────┬──────────────┘    │              │
       │                          │                   │              │
       └──────────────────────────┘                   │              │
                        │                             │              │
                        ▼                             │              │
              ┌──────────────────┐                    │              │
              │   Flask server   │                    │  Flutter /   │
              │  /api/landmarks  │                    │  Filament    │
              │  /api/video      │   ─── .glb ───►    │  (mobile)    │
              └────────┬─────────┘                    │              │
                       │ JSON frames                  │              │
                       ▼                              └──────────────┘
              ┌──────────────────┐
              │   Three.js       │
              │   app.js         │
              │   avatar.glb     │
              └──────────────────┘
```

## API del servidor Flask

| Endpoint                    | Descripción                                        |
|-----------------------------|----------------------------------------------------|
| `GET /`                     | Sirve index.html                                   |
| `GET /api/signs`            | Lista señas disponibles (JSON array)               |
| `GET /api/landmarks/<id>`   | Landmarks combinados (hands+body+face) en JSON     |
| `GET /api/video/<id>`       | Video MP4 (extrae AVI del ZIP, cachea en disco)    |
| `GET /avatar.glb`           | Archivo estático del avatar                        |

## Formato JSON de landmarks (output del servidor, input de app.js)

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
        { "hand": "Left",  "landmarks": [{"x":0.01,"y":-0.05,"z":0.003}, ...] },
        { "hand": "Right", "landmarks": [...] }
      ],
      "body": [ {"x":0.45,"y":0.32,"z":-0.01}, ... ],
      "face": { "13": {"x":0.5,"y":0.6,"z":0.01}, "14": {...}, ... }
    }
  ]
}
```

- `body`: lista de 33 dicts, indexada directamente (body[11] = hombro izquierdo)
- `face`: dict con keys = string del índice de landmark (solo los de FACE_KEY_LMS)
- `hands`: lista de hasta 2 elementos, `hand` es "Left" o "Right"

## Sincronización face/body (bug pendiente)

La corrección correcta en `server.py → load_sign_landmarks()`:
```python
# Ratio real por archivo (más preciso que ratio teórico 50/24):
if len(body_frames) > 0:
    face_ratio_per_file = len(face_frames) / len(body_frames)
else:
    face_ratio_per_file = 1.0

for i in range(n):
    face_idx = round(i * face_ratio_per_file)
    if face_idx < len(face_frames):
        frame["face"] = face_frames[face_idx]
```

## Captura de señas propias — requisitos

Para que los videos propios sean compatibles con el pipeline actual:

1. **Herramienta**: Usar MediaPipe con los mismos modelos que usó LSC50:
   - `mediapipe.solutions.holistic` o MediaPipe Tasks API
   - Modelos: Pose (33 lm), Hands (21 lm), FaceMesh (468 lm)

2. **Output CSV**: Exactamente el mismo formato de columnas que LSC50
   ```
   ,landmark_0_x,landmark_0_y,landmark_0_z,landmark_1_x,...
   0,0.521,0.434,-0.290,...
   ```

3. **Estructura de carpetas**: Los CSVs deben ir en:
   ```
   data/LANDMARKS/BODY_LANDMARKS/<id>.csv
   data/LANDMARKS/HANDS_LANDMARKS/LEFT_HAND_LANDMARKS/<id>.csv
   data/LANDMARKS/HANDS_LANDMARKS/RIGHT_HAND_LANDMARKS/<id>.csv
   data/LANDMARKS/FACE_LANDMARKS/<id>.csv
   ```

4. **ID format**: Usar el mismo formato `SSSS_VVVV_RRRR` para consistencia,
   o un rango nuevo de IDs (ej. 0050+ para señas propias).

5. **Script base**: `scripts/process_videos.py` ya hace esto para videos AVI del ZIP.
   Adaptar para videos propios en otras rutas/formatos.

## Migración a Flutter/Filament (pendiente de verificar)

Estado: no verificado. Puntos a revisar:
- Compatibilidad del GLB actual con `flutter_filament`
- Soporte de skinning (bone animation) en Filament
- Requisitos de material: Filament requiere PBR materials (actualmente el GLB no tiene)
- Posibles restricciones de cantidad de joints por skin
- Formato de animación: Filament soporta glTF animations pero tiene límites

## Herramientas de desarrollo

```bash
# Servidor Flask (puerto 5000)
./scripts/run.sh app

# Procesar 1 video por seña (50 videos)
./scripts/run.sh process

# Procesar todos los 1000 videos
./scripts/run.sh process --all

# Captura desde webcam
./scripts/run.sh capture
```

## Variables de configuración en app.js

| Variable       | Valor actual | Descripción                                    |
|----------------|-------------|------------------------------------------------|
| `smoothAlpha`  | 0.7         | Fracción de slerp por frame (1.0 = snap)       |
| `FACE_ALPHA`   | 1.0         | Alpha para huesos faciales (siempre snap)      |
| `Z_SCALE`      | 0.40        | Factor empírico para profundidad del brazo     |
| `FACE_REF_BROW`| 0.47        | Altura de ceja neutra normalizada              |
| `FACE_BROW_SCALE`| 6.0      | Amplificación del movimiento de ceja           |
| `FACE_JAW_MAX` | 1.2 rad     | Apertura máxima de mandíbula (~70°)            |
