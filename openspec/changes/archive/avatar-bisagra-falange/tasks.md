> **Archivado 2026-09-12** — pendientes vigentes consolidados en `openspec/changes/avatar-pendientes-criticos`. Este doc queda como registro histórico.

# Bisagra anatómica por falange (flexión 1 eje, sin torsión ni abducción)

> Sesión: 2026-09-09
> Rama: `feature/avatar-bisagra-falange` (sale de `feature/nuevo-avatar-copiamodelo`)
> Solo `app/static/app.js`. No toca el GLB ni el server.

Resuelve el **pendiente #1** (P1 en la spec): las falanges usaban `rotateBone` con
`setFromUnitVectors` en 3D → rotación de arco más corto, con eje arbitrario → los dedos
se torcían y se abrían de costado con el ruido de MediaPipe. Ahora cada falange gira
sobre **un solo eje** (bisagra), con rango acotado y sin torsión.

Landmarks usados: MediaPipe Hands `LEFT`/`RIGHT` de LSC50 (21 lm/mano). Nada del body.

---

## 1. Modelo de bisagra (`measureFingerHinges` + `flexFinger`)

- [x] **1.1 `FINGER_LM`** reemplaza a `BONE_MAP`: `{thumb,index,middle,ring,pinky: [MCP,PIP,DIP,TIP]}`.
  `HINGE_FINGERS = ["index","middle","ring","pinky"]` (el pulgar NO — su articulación es un
  sillar, no una bisagra; sigue en `rotateBone` libre).

- [x] **1.2 `measureFingerHinges()`** — corre una vez al cargar el GLB (después de
  `measureArmRest()`). Por cada falange de los 4 dedos:
  - `palmN` = `normalize((index1 − wrist) × (pinky1 − wrist))` en world (rest pose).
  - `hingeW` = `normalize(restDir × palmN) · sign` — ⊥ al eje largo del dedo y ⊥ a la palma
    → girar `+ángulo` sobre él flexiona hacia la palma.
  - Se pasa al frame local del hueso (`applyQuaternion(restWorldQ⁻¹)`) y se fija al eje
    cardinal más cercano (`snapToCardinal`, ±X/±Y/±Z) → bisagra de 1 eje exacto, sin
    residuo oblicuo. Resultó `index1.axisLocal = (−1,0,0)` en ambas manos.
  - Guardado en `state.boneFlexAxis` (name → Vector3 local).

- [x] **1.3 Signo automático.** Los esqueletos de las dos manos están espejados → el `cross()`
  de `palmN` sale con signo opuesto. Se deduce del pulgar: `pc = palmN · (thumb1 → thumb3)`;
  si `pc < 0`, `+palmN` es dorsal → `sign = −1`. Dio `l = −1`, `r = +1` (pc ≈ ∓0.025).
  Override manual `FINGER_FLEX_SIGN = {Left:0, Right:0}` (0 = auto, ±1 = forzar).

- [x] **1.4 `flexFinger(bone, angle, alpha)`**:
  ```js
  a = clamp(angle, FLEX_MIN_RAD, FLEX_MAX_RAD)          // −0.14 … 1.75 rad (~−8°…100°)
  bone.quaternion.slerp(restLocalQ ∘ axisAngle(axis, a), alpha)
  ```
  Garantiza: 1 solo eje, sin torsión, rango acotado. `rotateBone` queda intacto (brazos,
  cara, roll de muñeca, pulgar).

## 2. Ángulo de flexión (loop de dedos en `applyFrame`, dos pasos)

- [x] **2.1 Ángulo** = giro 2D en el plano de imagen entre el segmento de la falange previa
  y el actual: `bend = _segP.angleTo(_segC)`. Para la falange proximal el "padre" es el
  metacarpo `wrist → MCP`. Es un buen proxy de la flexión total cuando la mano mira a
  cámara; se subestima con el dedo en escorzo.

- [x] **2.2 `FLEX_GAIN = 1.25`** — multiplica el ángulo 2D antes del clamp para compensar el
  escorzo (la falange se acorta en imagen al doblarse hacia/desde la cámara; sin ganancia
  los dedos quedaban a medio cerrar). Subir si cierran poco, bajar si sobre-flexionan.

- [x] **2.3 Acoplamiento DIP→PIP (`DIP_PIP_COUPLING = 0.66`).** La falange distal tiene el
  segmento más corto y ruidoso → casi siempre caía bajo el deadzone y no llegaba a cerrar
  ("no termina de flexionar la punta"). Si su señal propia no es fiable, se deriva de la
  media: `bend[DIP] = bend[PIP] · 0.66` (acoplamiento tendinoso real). Por eso el loop
  ahora es de dos pasos: (a) medir `bend`/`rel` de las 3 falanges, (b) aplicar.

- [x] **2.4 Deadzone adaptativo** (se mantiene, `state.fingerDeadzone = 0.12`): falange más
  corta que `handSpan · fingerDeadzone`, o segmento padre degenerado → señal NO fiable.

- [x] **2.5 Relajar hacia el rest en señal no fiable.** Antes se hacía `continue` → el hueso
  se **congelaba** en la última pose → la mano quedaba "en garra" al bajar a reposo (los
  frames de reposo tienen los dedos en escorzo, no superan el deadzone). Ahora:
  `bone.quaternion.slerp(restLocalQ, fingerAlpha · 0.5)` → la mano se abre sola.

- [x] **2.6 `state.fingerAlpha` 0.06 → 0.18.** El 0.06 era para el retargeting libre (jittery);
  la bisagra de 1 eje + clamp es estable y no necesita tanto suavizado — con 0.06 los dedos
  se quedaban rígidos a medio converger.

Knobs: `FLEX_GAIN` (1.25), `FLEX_MAX_RAD` (1.75), `DIP_PIP_COUPLING` (0.66),
`FINGER_FLEX_SIGN` (auto), `FINGER_HINGE` (true → A/B con el retargeting libre anterior),
`state.fingerAlpha` (0.18), `state.fingerDeadzone` (0.12).

## 3. Verificación

- [x] 3.1 Usuario: 0007 — las dos manos cierran hacia la palma, control individual por dedo.
- [x] 3.2 Usuario: signo automático correcto sin tocar `FINGER_FLEX_SIGN` (consola:
  `hinge l: sign=-1`, `hinge r: sign=1`).
- [x] 3.3 Usuario: al bajar las manos ya no quedan "en garra" (relajan hacia rest).
- [x] 3.4 Usuario: barrido de varias señas — "en su mayoría bien, cada dedo tiene su propio
  control"; quedaban señas donde no cerraba del todo → se agregó `FLEX_GAIN` + acoplamiento DIP.
- [ ] 3.5 Reconfirmar el barrido con `FLEX_GAIN`/DIP: que no haya sobre-flexión (dedos
  clavados en la palma) en las que ya estaban bien.

## 4. Fuera de alcance (visto en la seña 0000, va en otra rama)

- [ ] 4.1 En señas de contacto las palmas se juntan en vertical y no en horizontal
  (roll de muñeca con landmarks ocluidos; `CONTACT_BLEND` solo acerca posiciones, no
  orientaciones).
- [ ] 4.2 Al bajar las manos por delante del cuerpo lo atraviesan (`TORSO_CLEAR` solo actúa
  a la altura del pecho o más arriba; `Z_SCALE = 0.15` aplasta la profundidad).
- [ ] 4.3 En reposo las manos muestran la pose rest del GLB (dedos algo estirados/separados).
  Opción: relajar hacia una mano levemente cerrada en vez del rest crudo.

## 5. Pendiente global

- [ ] 5.1 Weight painting del hombro/pectoral en Blender (o animar `shoulder.l/r`) — P1b.
- [ ] 5.2 Merge de las ramas a `feature/nuevo-avatar-copiamodelo`.
