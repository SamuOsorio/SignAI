> **Archivado 2026-09-12** — pendientes vigentes consolidados en `openspec/changes/avatar-pendientes-criticos`. Este doc queda como registro histórico.

# Bundle de dedos + ajustes de IK de brazo (menos deformación, brazos despegados del torso)

> Sesión: 2026-09-09
> Rama: `feature/avatar-hand-temporal-filter` (encima del filtro One-Euro, commit `72119cf`)
> Solo `app/static/app.js`. No toca el GLB ni el server.

Continúa el **punto 2** del reporte (dedos/muñeca se deforman). El filtro temporal
(`avatar-hand-temporal-filter`) atacó el ruido en la fuente; esto arregla cómo `app.js`
convierte esos landmarks en rotación de huesos. Además el usuario pidió que los brazos no
se peguen tanto al torso.

---

## 1. Bundle de dedos (loop de `applyFrame` + `applyHandOrientation`)

- [x] **A — no animar los metacarpianos.** Se quitaron las 8 entradas `*1_base*` de
  `BONE_MAP`. Se orientaban desde `wrist→nudillo` (ruidoso) y abrían la palma en abanico;
  sus pesos ya están en `hand.l/r`, aportan poco al mesh.

- [x] **C — suavizado propio de falanges.** `state.fingerAlpha = 0.06` (vs `smoothAlpha = 0.12`
  de brazos); el loop de dedos llama `rotateBone(bone, dir, state.fingerAlpha)`.

- [x] **D — sin proyección al plano de palma.** La normal se calculaba con `cross()` de dos
  vectores casi coplanares (mano ~plana en imagen) → dirección aleatoria entre frames →
  proyectar metía ruido. Se eliminó, junto con `state.palmNormalL/R` (quedaba sin uso).

- [x] **E — `Z_HAND = 0.3` en `applyHandOrientation`.** El `z` crudo de MediaPipe (span
  ~0.014 en toda la mano, ruidoso) se escala ×0.3 en `_hUp/_hIdxV/_hPnkV` en vez de ×1.0.
  Conserva la señal de "palma hacia/desde cámara" con ~3× menos temblor de muñeca.
  (No se puso a 0: eso mataría todo el roll.)

- [x] **B — deadzone adaptativo.** `handSpan[side]` = largo de palma (`mpToThree(lm9, lm0)`).
  Si `dir.length() < handSpan × state.fingerDeadzone` (0.12) → se omite ese hueso ese frame
  (queda en su última pose). Adaptativo al tamaño de mano, no umbral fijo (la falange distal
  mediana 0.0067 está bajo cualquier umbral fijo razonable).

Knobs: `state.fingerAlpha` (0.06), `state.fingerDeadzone` (0.12), `Z_HAND` (0.3).

## 2. IK de brazo — brazos despegados del torso, sin atravesarlo

- [x] **2.1 `ELBOW_OUT` (sesgo lateral del codo).** `_ikPole.x += sign(shoulder.x) · reach · ELBOW_OUT`.
  En señas frente al pecho los targets de muñeca caen cerca de la línea media → sin esto los
  codos colapsan contra las costillas. Base **0.18**.

- [x] **2.2 Gate de altura (`raise`).** `ELBOW_OUT` se atenúa según la altura de la muñeca:
  `raise = clamp(1 - (wristY - shoulderY + reach·0.1) / (reach·0.4), 0.1, 1)`.
  Con la mano baja → `raise = 1` (codo afuera). Con la mano a la altura de la cara →
  `raise ≈ 0.1` (el codo real ya define la pose; forzar "afuera" producía **ala de pollo** —
  visible en la seña 0007).

- [x] **2.3 Anti-clip torso (`TORSO_CLEAR = 0.30`).** Si el target de muñeca está cerca de la
  línea media **y** a la altura del pecho o más arriba, se empuja hacia la cámara:
  ```js
  nearBody = clamp(1 - |wristX - shoulderX| / (reach·0.6), 0, 1)
  chestUp  = clamp((wristY - (shoulderY - reach·0.5)) / (reach·0.7), 0, 1)
  _ikWrist.z += nearBody · chestUp · reach · TORSO_CLEAR
  ```
  Con `Z_SCALE = 0.15` el offset frontal de la muñeca casi se anula → la mano/antebrazo
  atravesaban el pecho al subir hacia la cara. Esto los hace pasar por delante.

Verificado con landmarks reales (0007, frame 20 — brazo izq. levantado, muñeca 0.04 sobre el
hombro y casi centrada): `raise ≈ 0.10` (codo-afuera casi off), anti-clip ≈ +0.14 u hacia
cámara (mano frente al pecho). Seña al pecho (muñeca bajo el hombro): `raise = 1`,
anti-clip = 0 → no cambia lo que ya funcionaba.

Knobs: `ELBOW_OUT` (0.18), `TORSO_CLEAR` (0.30) — arriba de `applyArmIK`.

## 3. Verificación

- [x] 3.1 Usuario: dedos/muñeca "se ve" (bundle) — OK en 0005.
- [x] 3.2 Usuario: brazos separados del torso — OK.
- [x] 3.3 Usuario: seña 0007 (brazo a la cara) — "se ve", ya no atraviesa el modelo ni hace
  ala de pollo.
- [ ] 3.4 Barrer 10+ señas variadas (una mano / dos manos separadas / contacto) y anotar.
- [ ] 3.5 "Se abre el pecho" al subir mucho el brazo: **artefacto de skinning** del
  hombro/pectoral (pesos flojos del GLB, ver `copiamodelo-rig-ik-contacto` §2/§8). Mitigado
  al no forzar el codo afuera; arreglo de fondo = weight painting en Blender o animar el
  hueso `shoulder`.

## 4. Pendiente

- [ ] 4.1 Bisagra anatómica por falange (flexión en 1 eje, 0–90°, sin torsión ni desviación
  lateral) — reescribir `rotateBone` para dedos. El "paso 2 de verdad".
- [ ] 4.2 Weight painting del hombro/pectoral en Blender (o animar `shoulder.l/r`).
- [ ] 4.3 Merge de las ramas a `feature/nuevo-avatar-copiamodelo`.
