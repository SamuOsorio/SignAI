# Dataset LSC50 — Especificación técnica

## Estructura del dataset

**ID de video**: `SSSS_VVVV_RRRR`
- `SSSS` = número de seña (0000–0049)
- `VVVV` = número de voluntario (0000–0004)
- `RRRR` = repetición (0000–0003)

Total: 50 señas × 5 voluntarios × 4 repeticiones = **1000 videos**

Los 5 voluntarios son 3 nativos + 2 no nativos de LSC. Todos certificados por intérpretes profesionales.

## Las 50 señas (Table 2 del paper)

| N    | Seña         | N    | Seña         | N    | Seña       |
|------|-------------|------|-------------|------|-----------|
| 0000 | GRACIAS     | 0017 | TÍO         | 0034 | BIENVENIDO |
| 0001 | BUENOS DÍAS | 0018 | HERMANO     | 0035 | PERDÓN     |
| 0002 | BUENAS TARDES | 0019 | HAMBRE    | 0036 | PERMISO    |
| 0003 | BUENAS NOCHES | 0020 | FELIZ     | 0037 | NUNCA      |
| 0004 | SEÑA        | 0021 | CONTENTO    | 0038 | YO         |
| 0005 | NOMBRE      | 0022 | TRISTE      | 0039 | TÚ         |
| 0006 | TRABAJAR    | 0023 | ABURRIDO    | 0040 | USTEDES    |
| 0007 | COMER       | 0024 | BIEN        | 0041 | ¿QUÉ?      |
| 0008 | VIVIR       | 0025 | MAL         | 0042 | ¿CUÁNDO?   |
| 0009 | POCO        | 0026 | ¿CÓMO ESTÁS?| 0043 | ¿DÓNDE?    |
| 0010 | FAMILIA     | 0027 | MÁS O MENOS | 0044 | ¿CÓMO?    |
| 0011 | PERSONAS    | 0028 | SENTIR      | 0045 | ¿POR QUÉ?  |
| 0012 | MUJER       | 0029 | JUCIOSO     | 0046 | ¿QUIÉN?    |
| 0013 | HOMBRE      | 0030 | HOLA        | 0047 | DIFERENTE  |
| 0014 | NIÑO        | 0031 | ADIÓS       | 0048 | TODOS      |
| 0015 | NIÑA        | 0032 | POR FAVOR   | 0049 | MUCHO      |
| 0016 | ABUELO      | 0033 | CON GUSTO   |      |            |

Señas útiles para probar expresión facial: **0020–0027** (emociones).
Señas útiles para probar brazos/muñecas: **0030–0033**, **0041–0044** (preguntas).

## Videos disponibles

El ZIP `data/VIDEOS.zip` contiene solo `COLOR_BODY` (cuerpo completo, 1920×1080, 24fps).
Los otros tipos (COLOR_FACE 50fps, GRAY_DEPTH, GRAY_IR) **no están en el ZIP**.

## Landmark sources y FPS

| Tipo       | Carpeta                              | FPS fuente   | Landmarks | Detección |
|------------|--------------------------------------|-------------|-----------|-----------|
| BODY       | data/LANDMARKS/BODY_LANDMARKS/       | 24fps        | 33 (Pose) | ~100%     |
| LEFT_HAND  | data/LANDMARKS/HANDS_LANDMARKS/LEFT  | 24fps        | 21 (Hands)| ~100%     |
| RIGHT_HAND | data/LANDMARKS/HANDS_LANDMARKS/RIGHT | 24fps        | 21 (Hands)| ~100%     |
| FACE       | data/LANDMARKS/FACE_LANDMARKS/       | 50fps        | 468 (FaceMesh)| ~100% |

**FACE tiene ~2.9× más frames que BODY/HANDS** porque viene del video de cara a 50fps.

## Formato CSV de landmarks

Todas las columnas: `landmark_0_x, landmark_0_y, landmark_0_z, landmark_1_x, ...`
La primera columna es el índice de fila (sin header propio).

### BODY (33 landmarks MediaPipe Pose)
- `x`, `y`: normalizados a imagen (0.0–1.0), `y=0` es arriba
- `z`: profundidad relativa, misma escala que `x`. Pequeño y ruidoso — usar con escala empírica.
- Landmarks relevantes para animación:
  - 11/12 = hombro izq/der (ancla de escala)
  - 13/14 = codo izq/der
  - 15/16 = muñeca izq/der
  - 19/20 = índice izq/der (referencia de mano)

### HANDS LEFT/RIGHT (21 landmarks MediaPipe Hands)
- `x`, `y`: normalizados a imagen (0.0–1.0)
- `z`: profundidad relativa a la muñeca (lm0), misma escala que x/y
- lm0 = muñeca (origen), lm4 = punta pulgar, lm8 = índice, lm12 = medio, lm16 = anular, lm20 = meñique
- Bases de dedos: lm5 (índice), lm9 (medio), lm13 (anular), lm17 (meñique)

### FACE (468 landmarks MediaPipe FaceMesh)
- 1405 columnas (468 × 3 + 1 índice)
- `x`, `y`: normalizados, `z`: profundidad relativa a la cabeza
- Landmarks clave para animación (ya en FACE_KEY_LMS del servidor):
  - 13/14 = labio superior/inferior (mandíbula)
  - 78/308 = comisura boca izq/der
  - 70/107/55 = ceja izq (exterior/centro/interior)
  - 300/336/285 = ceja der
  - 159/145 = párpado izq sup/inf
  - 386/374 = párpado der sup/inf
  - 1/168 = punta nariz / puente (referencia estable)

## Señas propias — requisitos para captura

Los videos propios deben procesarse con **los mismos modelos MediaPipe** y producir CSVs con:
- Exactamente el mismo formato de columnas que LSC50
- Los mismos índices de landmarks (mismos modelos de MediaPipe)
- Herramientas válidas: MediaPipe Tasks API (ya instalado), MMPose u otras compatibles

El pipeline de captura existente (`scripts/process_videos.py`) puede usarse como base.

## IMU data (disponible pero no integrado en el avatar)

5 voluntarios, sensores XSENSE XDOT en 7 segmentos: hand_r, humerus_l/r, radius_l/r, torso.
Archivos `.mot` de OpenSim en `data/IMU/OUT_OPENSIM/` dan ángulos articulares en grados:
- `arm_flex_r/l`, `arm_add_r/l`, `arm_rot_r/l` — hombro
- `elbow_flex_r/l` — codo
- `pro_sup_r/l` — pronación/supinación del antebrazo
- `wrist_flex_r/l` — flexión/extensión de muñeca
- `wrist_dev_r/l` — desviación radial/cubital

Requiere `data/IMU/INFO/Timestamps.xlsx` para mapear cada seña al segmento temporal del .mot.
