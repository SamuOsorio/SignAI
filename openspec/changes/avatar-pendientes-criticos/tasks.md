# Pendientes críticos del avatar — consolidado

> Creado: 2026-09-12
> Consolida los pendientes vigentes que estaban dispersos en 7 changes de OpenSpec
> (`avatar-bisagra-falange`, `avatar-finger-bundle-arm-ik`, `avatar-fixes-y-mejoras`,
> `avatar-hand-temporal-filter`, `avatar-shading-material`, `copiamodelo-rig-ik-contacto`,
> `mejoras-animacion-manos` — todos movidos a `openspec/changes/archive/`) + la memoria de
> la sesión 2026-09-11. Este es el único doc a mirar para saber "qué falta" del avatar.
>
> Rig activo: CopiaModelo.glb (AutoRigPro). Rama activa: `feature/avatar-wrist-roll-fix`
> (sale de `feature/nuevo-avatar-copiamodelo`, aún sin mergear a `master`).

---

## 1. Crítico — bloquea calidad visual

- [ ] **1.1 Roll de muñeca en CONTACT** (Foco A). Las palmas se juntan en vertical en vez de
  horizontal en señas de contacto; el giro alrededor del eje "hacia dónde apunta la mano"
  sigue viniendo de landmarks congelados sin re-orientar.
  - Dos intentos revertidos (heredar orientación mano-antebrazo, reactivo y cacheado
    continuo) → ambos daban manos deformadas tipo "garra".
  - Hallazgo con `window._dumpArm()` (queda en `app.js`, solo lectura): en un frame de
    CONTACT de la seña 0018, la mano izquierda necesita ~116° de giro local vs ~7° la
    derecha en una seña simétrica — sospechoso, cerca de la zona inestable de
    `setFromUnitVectors` (~180°). No confirmado como causa raíz.
  - **Investigado 2026-09-12**: la rest pose de `hand.l`/`hand.r` (y de todo el brazo,
    hombro→antebrazo) SÍ es un mirror exacto (verificado parseando `avatar.glb` directo,
    sin three.js: ángulo entre `handr` y `mirrorX(handl)` = 0.00°, igual en `arm_stretch`,
    `forearm_stretch`, `forearm_twist`, `shoulder`). **Descartada la hipótesis de rig
    asimétrico.**
  - **Causa real encontrada (lectura de código)**: el paso 2 (roll) de `applyHandOrientation`
    usaba `THREE.Quaternion.setFromUnitVectors(_hSide, _hNorm)`. La implementación de
    three.js, cuando los dos vectores están cerca de antiparalelos (roll pendiente ≈ 180°),
    cae a un eje **arbitrario** derivado solo de `_hSide` — no necesariamente `_hUp`, que es
    el único eje correcto ahí (ambos vectores ya están proyectados ⊥ a él). Con un roll
    pendiente grande en una mano y chico en la otra (116° vs 7°), es la mano con el roll
    grande la que cae en esa zona inestable → coincide con la asimetría observada.
  - **Fix aplicado** (`app/static/app.js`, `applyHandOrientation`): reemplazado por ángulo
    con signo entre `_hSide`/`_hNorm` alrededor de `_hUp` (`atan2` + `setFromAxisAngle`) —
    el eje de giro es siempre `_hUp` exacto, sin discontinuidad cerca de 180°. Afecta el
    roll en general (CONTACT y normal), no solo el caso de contacto.
  - **Verificado visualmente 2026-09-12** (0018 y 0000 — las dos señas donde los intentos
    anteriores mostraban la garra): revisadas las dos manos en cada frame de CONTACT, en
    las transiciones de entrada/salida y en los dos segmentos de contacto de 0018 — sin
    deformación tipo garra en ningún punto muestreado. Se agregó `window._stepTo(idx)` /
    `window._stepFrom0(idx)` a `app.js` (debug, mismo patrón que `_dumpArm`) para poder
    inspeccionar frames puntuales sin depender de `requestAnimationFrame` (Chrome lo pausa
    en pestañas automatizadas/en background).
  - **Nota**: la asimetría de magnitud (ángulo real de cuaternión ~95° en la mano izquierda
    vs ~7° en la derecha en un frame de CONTACT de 0018) sigue midiéndose así — pero ya no
    se traduce en deformación visible, así que probablemente reflejaba en parte una lectura
    de Euler distorsionada por gimbal-lock (Y local cerca de −90°) más que un giro roto en
    sí. No se investigó más a fondo porque el síntoma visual (lo que importa) desapareció.
  - **Sigue en observación**: no se probó con el resto de las ~1000 señas, solo 0018 y 0000.
    Si reaparece la garra en otra seña, retomar la idea de interpolación offline pre/post-
    contacto que se había planteado como alternativa.
  - **Continuación 2026-09-12 (tras el fix de 1.2)**: con el fix de dedo-por-dedo (ver 1.2),
    el índice de la mano "Right" empezó a extenderse de verdad en 0018 — y ahí el usuario
    notó que apunta en **dirección errónea** (y que la otra mano ni siquiera extiende).
    Comparado contra el frame real del video (extraído con ffmpeg): la seña es las DOS manos
    con índice extendido, **enganchados hacia abajo**, tocándose — no "hacia el frente".
  - **Causa (paso 1 de `applyHandOrientation`, "hacia dónde apunta la mano")**: ese paso
    todavía usaba, en CONTACT, el eje Y del antebrazo en vivo como proxy — código y
    comentario de cuando `hand_corrector.py` congelaba la mano ENTERA (ya no es así desde el
    fix de 1.2: el landmark 9, familia "middle", puede ser dato real). **Fix aplicado**: se
    quitó el caso especial de CONTACT en el paso 1 — ahora usa `rawLms[9]` (real o sostenido
    por dedo) igual que en NORMAL, con el eje del antebrazo solo como respaldo si el dato es
    degenerado. Cambio correcto y sin regresión, pero **no resolvió la dirección**: medido en
    el frame real, el vector crudo wrist→dedo-medio es casi nulo en 2D (0.023 de longitud
    vs ~0.045-0.05 de tamaño de mano normal) — en esta pose la mano está rotada de forma que
    la señal real está mayormente en profundidad (Z), que se atenúa a propósito
    (`Z_HAND=0.3`) porque el Z crudo de MediaPipe Hands es puro ruido (span ~0.014, hallazgo
    de sesión anterior). No hay de dónde sacar una señal 2D limpia para este tipo de pose.
  - **Diagnóstico**: esto ES el núcleo de Foco A que faltaba nombrar con precisión — no es
    un bug puntual, es un límite de fondo del enfoque 2D+Z-atenuado para poses de muñeca
    rotadas fuera del plano de la imagen (mano "vertical"/enganchada, en vez de mirando a
    cámara). Decisión del usuario: anotarlo así y seguir con 1.3/1.4 — no forzar una
    heurística parche hoy.
  - **Ideas para retomar** (ninguna intentada): (a) usar `wrist→index_MCP` (landmark 5) en
    vez de `wrist→middle_MCP` (landmark 9) cuando el vector principal es casi nulo — probar
    si da más señal en este tipo de pose; (b) subir `Z_HAND` solo en CONTACT (el Z ahí es de
    landmarks ya filtrados por continuidad, podría ser menos ruidoso que en NORMAL — sin
    verificar); (c) la salida de fondo sigue siendo profundidad 3D real (WiLoR, `scripts/
    wilor_colab.ipynb` ya anotado en sesiones anteriores) — resolvería esto de raíz en vez de
    parchearlo.

- [x] **1.2 Mano izquierda de la seña 0018 no flexiona en CONTACT** — MCP/PIP casi en 0°
  (4-7°) mientras DIP se dispara a 100-200° (biomecánicamente raro: DIP depende de PIP).
  **Resuelto 2026-09-12.**
  - **Causa encontrada (datos reales, `data/LANDMARKS/HANDS_LANDMARKS/*/0018_0000_0000.csv`)**:
    era "mal momento de freeze", confirmado — el `span` (wrist→MCP medio) de **ambas** manos
    se derrumba de ~0.05 a ~0.01 (colapso de 4x) en los ~4 frames previos a que `prox_xy`
    cruce `CONTACT_THRESH` (0.09): la oclusión mutua degrada el tracking de MediaPipe ANTES
    de que las palmas se consideren oficialmente "en contacto". El corrector congelaba el
    frame N-1 sin verificar su calidad → freeze de una pose ya corrupta (segmentos de
    falange casi nulos, ángulos 2D dominados por ruido) que el rebase solo traslada, nunca
    corrige, durante TODO el contacto. Confirmado con el frame limpio (17, antes del
    colapso): ángulos PIP/DIP sanos (25°-55°) en los 4 dedos, vs. 100-200° espurios usando
    el frame 21 que el corrector viejo congelaba.
  - **Primer fix (insuficiente, corregido en el mismo día)**: `_is_good_frame()` — exigir que
    el `span` de referencia no cayera más de `SPAN_MIN_RATIO=0.9` respecto a un baseline EMA
    antes de aceptar un frame como `last_valid`. Movió el freeze de 0018-izq del frame 21
    (span 0.012, corrupto) al 17 (span 0.050, sano) y dejó los ángulos estables — pero el
    usuario notó viendo la app que el puño quedaba TOTALMENTE cerrado cuando el video real
    muestra el índice extendido apuntando al frente (dos dedos, no puño cerrado). Analizando
    los datos crudos (sin corrector) de la mano DERECHA en 0018 se ve que el índice se
    mantiene bajo y estable (~0-24°, extendido) mientras middle/ring/pinky se mantienen altos
    (~50-176°, cerrados) de forma consistente durante TODOS los ~25 frames marcados CONTACT —
    señal real de MediaPipe, no ruido. **El freeze de mano entera (aunque eligiera un buen
    frame de referencia) siempre iba a tapar esto**: congela una foto de ANTES de que la mano
    termine de formar la pose final (índice aún no extendido en el frame 17), y la sostiene
    fija todo el contacto — el puño nunca llega a la forma real porque el dato que SÍ la
    muestra (frames 22-46, ya en CONTACT) se descarta por completo.
  - **Fix real aplicado** (`app/hand_corrector.py`): se reemplazó el freeze de mano entera por
    una decisión **por dedo, cada frame**: `_update_finger_refs()` seguimiento continuo
    (NORMAL y CONTACT) del ángulo del nudillo proximal de cada dedo; si el ángulo crudo de
    este frame no saltó más de `FINGER_JUMP_MAX_DEG=45°` respecto al último bueno conocido de
    ESE dedo, se acepta como nueva referencia. `_contact_hand()` sirve, dedo por dedo: el dato
    crudo si fue aceptado este frame (el dedo sigue siendo visible), o la última referencia
    buena de ese dedo trasladada rígidamente al wrist actual si no (oclusión puntual real de
    ese dedo específico). `_is_good_frame`/`SPAN_MIN_RATIO` se mantienen tal cual, pero ahora
    solo para `last_valid` (usado por HOLD, pérdida total de la mano — un caso distinto).
  - **Verificado**: (a) offline, reproduciendo `HandCorrector` real sobre 0018 — la mano
    derecha mantiene el índice extendido (0-24°) y el resto cerrado (50-176°) estable en los
    ~25 frames de CONTACT; la izquierda mejora (sin los picos de 100-200°) aunque sigue más
    ruidosa — esa mano tiene peor tracking real en este tramo específico, no es algo que un
    corrector pueda inventar; (b) las 1000 señas procesadas sin excepciones y mismo conteo de
    frames CONTACT que antes (38 739 — la detección no se tocó); (c) visualmente en el
    navegador — el índice derecho se ve extendido apuntando al frente en 0018, coincidiendo
    con el video real; 0000 sigue sin regresión (mismo aspecto natural ya validado en 1.1).

- [ ] **1.3 Manos atraviesan el torso al bajar delante del cuerpo** — `TORSO_CLEAR` solo
  actúa a la altura del pecho o más arriba. Medido sobre las 1000 señas: mediana 21.6%, máx
  52.1% de frames con la muñeca cruzando la línea media sin corregir. Recalibrar con esos
  datos reales (Foco B, casi no tocado todavía).
  - **Investigado 2026-09-12**: mismo límite de fondo que 1.1 (ver ahí). Midiendo con datos
    reales de las 1000 señas (`data/LANDMARKS/BODY_LANDMARKS`), la muñeca cae "dentro del
    ancho del torso" (|x|<0.19u desde el centro) en el 79.6% de los frames — pero la
    distribución por altura tiene un pico enorme muy por debajo del hombro (-1.0 a -1.4 ×
    alcance del brazo), que es la zona de **brazo relajado colgando al costado**, no manos
    cruzando el torso activamente. Un brazo colgando también cae cerca del centro en X sin
    estar realmente "delante" del cuerpo — distinguir eso de un cruce real requiere
    profundidad (Z), que en 2D es ambiguo en este rango (mismo problema que la orientación de
    muñeca en 1.1, aplicado aquí al IK de brazo).
  - **Por qué no se extendió `chestUp` sin más**: el riesgo concreto medido es que brazos en
    reposo (a los costados, que pasan por esta franja de altura en casi todas las señas al
    empezar/terminar) empezarían a empujarse hacia la cámara innecesariamente — una regresión
    nueva y muy visible, no una mejora.
  - **Idea con más chance, no probada**: gatear el empuje también por qué tan "activo"/
    extendido está el brazo desde el hombro (no solo por altura) — patrón similar al
    `degenerate`/`raise` que ya existen en el código para otros sesgos del IK. Requiere
    diseñar y validar con datos reales antes de tocar `app.js`, no se intentó esta sesión.

- [ ] **1.4 Weight painting hombro/pectoral** — "se abre el pecho" con el brazo muy alto es
  artefacto de skinning (no de animación). Pendiente en Blender (weight painting) o animar
  el hueso `shoulder.l/r`. Repetido sin resolver en `avatar-bisagra-falange` (5.1),
  `avatar-finger-bundle-arm-ik` (4.2) y `copiamodelo-rig-ik-contacto`.
  - **Nota**: es trabajo manual en Blender (weight painting), no hay automatización de
    Blender disponible en este entorno — requiere que el usuario lo haga directamente, o
    la alternativa de animar `shoulder.l/r` desde `app.js` (código, sí abordable acá) en vez
    de corregir el skinning.

## 2. Menor / cosmético — causa entendida, no bloqueante

- [ ] **2.1** Meñique con jitter visible en la seña 0007 — ruido real de MediaPipe en el
  dedo más chico/ocluido de un puño, ahora más correlacionado por `MCP_PIP_COUPLING` (antes
  quedaba decorrelacionado y se notaba menos). Candidato a Foco C (suavizado), no es bug de
  lógica de retargeting.
- [ ] **2.2** En reposo las manos muestran la pose rest del GLB (dedos algo estirados/
  separados). Opción: relajar hacia una mano levemente cerrada en vez del rest crudo.
- [ ] **2.3** Vibración/temblor general (Foco C) — casi no se atacó más allá del filtro
  One-Euro ya aplicado a manos (`hand_corrector.py`) y cuerpo (`pose_filter.py`).

## 3. Housekeeping — no son bugs, cierre de trabajo ya hecho

- [ ] **3.1** `feature/nuevo-avatar-copiamodelo` acumula todo el trabajo (bisagra, filtros,
  shading, IK) mergeado desde sus sub-ramas pero nunca se mergeó/pusheó a `master`.
- [ ] **3.2** Validación con más señas pendiente en varios changes archivados: barrer 10+
  señas variadas (una mano / dos manos separadas / contacto) con el finger bundle + IK de
  brazo, y confirmar que el material shading no rompió la animación existente (dedos,
  brazos, mandíbula, CONTACT_BLEND).
- [ ] **3.3** Re-exportar `CopiaModelo.glb` desde Blender si se hacen nuevos ajustes de
  weight painting (relacionado con 1.4).

## 4. Referencia — changes archivados y su estado real

Todos movidos a `openspec/changes/archive/`. Se dejan como registro histórico; sus
pendientes reales vigentes ya están en las secciones 1-3 de arriba, no hace falta volver a
leerlos para saber "qué falta".

| Change archivado | Estado real |
|---|---|
| `avatar-bisagra-falange` | Resuelto y mergeado (`f94445d`). Quedaban 3.5 (revalidar barrido), 4.1-4.3 y 5.1-5.2 → migrados a este doc. |
| `avatar-finger-bundle-arm-ik` | Resuelto y aprobado por usuario. Quedaban 3.4-3.5 y 4.1-4.3 → migrados. |
| `avatar-hand-temporal-filter` | Resuelto (filtro One-Euro validado, jitter ↓61%). Quedaban 3.2-3.3 (revalidación) y 5.2 (bisagra, ya resuelta en otro change) → 3.2/3.3 migrados a 3.2 de este doc. |
| `avatar-shading-material` | Resuelto y commiteado (`e3fb1ea`). Quedaba 3.6-3.7 (verificación + commit, el commit ya se hizo) → migrado a 3.2. |
| `copiamodelo-rig-ik-contacto` | **Obsoleto**: el tuning de `CONTACT_BLEND` que pedía (10.1-10.2) ya se hizo y se corrigió después con datos reales (0.8 → 0.35, sesión 2026-09-11). El resto (10.4-10.5) es housekeeping ya cubierto en 3.1/3.3. |
| `avatar-fixes-y-mejoras` | **Parcialmente obsoleto**: sección 2 (material/Blender para el rig Rigify anterior) reemplazada por `avatar-shading-material` con otro enfoque. Secciones 3 (dataset propio) y 4 (migración Flutter/Filament) son iniciativas separadas del pipeline, no bugs del avatar — quedan fuera de este doc, revivir como change propio si se retoman. |
| `mejoras-animacion-manos` | **Obsoleto**: era para el rig anterior; su enfoque (proyección a plano de palma, `z=0`) fue reemplazado por la bisagra anatómica y `Z_HAND=0.3`. |
