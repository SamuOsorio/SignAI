# SignAI — Scripts de extracción de landmarks

Pipeline: video → MediaPipe Hands → landmarks 3D (JSON) → retargeting en Blender.

## Requisitos

- Python 3.10+
- Virtualenv en `../signai_env` (ya creado)
- Modelo MediaPipe en `hand_landmarker.task` (ya descargado)
- ZIP de videos en `../VIDEOS.zip`

## Estructura

```
scripts/
├── run.sh                  # punto de entrada principal
├── hand_landmarker.task    # modelo MediaPipe (no editar)
├── capture_landmarks.py    # captura desde webcam
├── process_videos.py       # procesa videos del ZIP
├── visualize_landmarks.py  # visualiza landmarks en 3D
├── retarget_blender.py     # corre dentro de Blender
└── landmarks/              # JSONs generados (uno por video)
    ├── 0000_0000_0000.json
    └── ...
```

---

## 1. Procesar videos del ZIP

```bash
# Muestra rápida: 1 video por seña (50 videos, ángulo 0, repetición 0)
./scripts/run.sh process

# Todos los 1000 videos COLOR_BODY
./scripts/run.sh process --all

# Una seña específica (todas sus repeticiones y ángulos)
./scripts/run.sh process --sign 5

# Un video exacto
./scripts/run.sh process --sign 5 --rep 2 --angle 1

# Con overlay de landmarks en MP4 (guarda en scripts/annotated/)
./scripts/run.sh process --sign 5 --annotate
```

Los JSON se guardan en `scripts/landmarks/XXXX_XXXX_XXXX.json`.
El nombre sigue la convención del ZIP: `{seña}_{repetición}_{ángulo}`.

Si un JSON ya existe, se omite automáticamente (reanudable).

---

## 2. Visualizar landmarks en 3D

```bash
# Listar todos los JSONs disponibles con tasa de detección
./scripts/run.sh visualize

# Ver frame 0 de una seña
./scripts/run.sh visualize 0005_0000_0000

# Ver un frame específico
./scripts/run.sh visualize 0005_0000_0000 15

# Animar todos los frames al FPS original
./scripts/run.sh visualize 0005_0000_0000 --all

# Atajo: solo el número de seña (toma rep 0, ángulo 0)
./scripts/run.sh visualize 5
```

---

## 3. Captura desde webcam

```bash
./scripts/run.sh capture
```

- `r` — iniciar / pausar grabación
- `q` — salir y guardar

Guarda en `scripts/landmarks_webcam.json`.

---

## 4. Setup del rig en Blender

### Requisitos previos
- Blender instalado (`sudo pacman -S blender`)
- Bundle de mallas extraído en `Tesis/human-base-meshes-bundle-v1.4.1/` (ya hecho)

### Pasos

**a) Crear el metarig y cargar la malla**

1. Abre Blender
2. Text Editor → abre `scripts/setup_rig.py` → Run Script

El script habilita Rigify, limpia la escena, importa la malla estilizada y crea el Human Meta-Rig.

**b) Ajustar los huesos a mano (paso lento, ~1-2h la primera vez)**

3. Selecciona el armature `SignAI_MetaRig`
4. Entra en Edit Mode (`Tab`)
5. Activa X-Ray (`Alt+Z`) para ver los huesos a través de la malla
6. Mueve cada hueso para que su `head` y `tail` coincidan con las articulaciones de la malla
7. Los más críticos para LSC son los **15 huesos de dedos por mano**:

| Hueso | Articulación |
|-------|-------------|
| `thumb.01.L/R` | CMC del pulgar |
| `thumb.02.L/R` | MCP del pulgar |
| `thumb.03.L/R` | IP del pulgar |
| `f_index.01.L/R` | MCP del índice |
| `f_index.02.L/R` | PIP del índice |
| `f_index.03.L/R` | DIP del índice |
| *(idem para medio, anular, meñique)* | |

**c) Generar el rig**

8. Vuelve a Object Mode
9. Properties panel → Armature (icono de muñeco) → **Generate Rig**
10. Blender genera el rig final con controles IK/FK

**d) Probar el retargeting**

11. Selecciona el rig generado (no el metarig)
12. Text Editor → abre `scripts/retarget_blender.py`
13. Ajusta `LANDMARKS_PATH` al JSON que quieras animar
14. Run Script → los dedos se animan automáticamente

---

## 5. Retargeting en Blender

Corre el script `retarget_blender.py` **desde dentro de Blender**:

1. Abre Blender con el rig de Rigify ya generado
2. Selecciona el armature
3. Text Editor → abre `scripts/retarget_blender.py`
4. Ajusta las variables al inicio del archivo:

```python
LANDMARKS_PATH = Path("...") / "landmarks" / "0005_0000_0000.json"
HAND_SIDE = "L"   # "L" o "R"
FPS = 30
```

5. Run Script

El script inserta keyframes en los 15 huesos de dedos por cada frame del JSON.
Si algún hueso no se encuentra, lo imprime en consola con los nombres disponibles.

---

## Estructura del JSON de salida

```json
{
  "stem": "0005_0000_0000",
  "fps": 30.0,
  "total_frames": 80,
  "frames_with_hand": 80,
  "detection_rate": 1.0,
  "frames": [
    {
      "hands": [
        {
          "hand": "Right",
          "landmarks": [
            {"x": 0.012, "y": -0.003, "z": 0.001},
            ...
          ]
        }
      ]
    }
  ]
}
```

21 landmarks por mano, coordenadas en metros con origen en la muñeca (landmark 0).

| Índices | Dedo    |
|---------|---------|
| 0       | Muñeca  |
| 1–4     | Pulgar  |
| 5–8     | Índice  |
| 9–12    | Medio   |
| 13–16   | Anular  |
| 17–20   | Meñique |

---

## Notas

- **No editar los JSON a mano.** Los frames con oclusión (dedos cruzados) tienen valores predichos por el modelo, no medidos. Las correcciones se hacen visualmente sobre el rig en Blender.
- Los videos de tipo `COLOR_FACE`, `GRAY_DEPTH` y `GRAY_IR` del ZIP no se usan — solo `COLOR_BODY`.
- La detección global en la muestra de 50 videos fue **98.2%**. La seña `0049` tuvo 69% (revisar manualmente).
