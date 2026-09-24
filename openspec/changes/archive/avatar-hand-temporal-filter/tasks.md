> **Archivado 2026-09-12** — pendientes vigentes consolidados en `openspec/changes/avatar-pendientes-criticos`. Este doc queda como registro histórico.

# Filtro temporal One-Euro para landmarks de mano (fix "dedos y muñeca tiemblan")

> Sesión: 2026-09-09
> Rama: `feature/avatar-hand-temporal-filter` (sale de `feature/avatar-material-shading`)
> Commit base: `e3fb1ea`
> Solo código: `app/hand_corrector.py`. No toca `app.js` ni el GLB. Requiere reiniciar
> el server (hay `lru_cache` en `load_sign_landmarks`).

---

## 0. Problema

Punto 2 del reporte del usuario: en movimiento, los 5 dedos y la muñeca del avatar se
deforman/tiemblan (imagen — círculo rojo).

## 1. Diagnóstico (datos reales, medido sobre las 50 señas · rep 0 · vol 0)

**Es estructural, afecta a las 50 señas — no es algo de la seña 5.**

| Métrica (mediana sobre 50 señas) | Valor |
|----------------------------------|-------|
| Ancho de la mano en el frame | **0.029** (rango 0.027–0.040) — siempre ~3% del ancho |
| Vector de falange distal (lm7→lm8) | ~0.0067 (rango 0.0045–0.0096) |
| Jitter frame-a-frame de un landmark | ~0.009 en `y`, ~0.0015 en `x` |
| SNR de la falange distal (segmento / jitter) | mediana **4.7**, rango **0.8 – 31** |
| Rango de `z` en toda la mano | ~0.014 (casi plano en las 50) |

El señante está lejos y centrado → la mano ocupa ~3% del frame en todas las señas → los
segmentos de falange (~5–9 px) quedan al nivel del ruido de MediaPipe. Cada frame, la
dirección que alimenta a cada hueso de dedo es casi puro ruido → el hueso lo sigue.

Peores casos (SNR < 1.5): **0001, 0010, 0021, 0034** (señas dinámicas).

## 2. Fix aplicado en `app/hand_corrector.py`

- [x] **2.1 `_OneEuro`** — filtro One-Euro escalar (Casiez, Roussel & Vogel, CHI 2012).
  Pasa-bajos de 1er orden con cutoff adaptativo a la velocidad:
  `cutoff = min_cutoff + beta·|dx_filtrado|`. Suaviza fuerte en reposo, afloja en
  movimiento rápido → casi sin lag (a diferencia de un promedio móvil fijo).

- [x] **2.2 `_HandFilter`** — banco de 21×3 filtros `_OneEuro` (un landmark × eje) por mano.
  Se crea al primer frame; `reset()` cuando la mano desaparece (para no interpolar a
  través del hueco).

- [x] **2.3 Integración** — nuevo paso **3b** en `_process_frame`, DESPUÉS de
  CONTACT/HOLD/BLEND, sobre `r_lm` / `l_lm` ya corregidos. Estado del filtro por lado en
  `_reset` (`self._filter = {"Right": _HandFilter(), "Left": _HandFilter()}`).

- [x] **2.4 Config** — constantes al inicio del archivo (dependen de la escala 0–1 de las
  coords: `BETA` es grande a propósito):
  ```python
  FILTER_ENABLED    = True
  FILTER_FPS        = 24.0
  FILTER_MIN_CUTOFF = 1.0    # Hz
  FILTER_BETA       = 18.0
  FILTER_D_CUTOFF   = 1.0    # Hz
  ```
  Flag `filter_enabled` en el constructor de `HandCorrector`; `stats["filter"]` =
  `"one-euro"` / `None`.

## 3. Evaluación (script en scratchpad, 50 señas × 2 manos)

| Métrica | Mediana |
|---------|---------|
| Reducción de jitter (2ª diferencia de lm8 xy) | **38%** |
| Reducción de jitter angular de la falange distal (lm7→lm8) | **61%** |
| Trayectoria real de lm8 preservada (manos con movimiento) | **~88%** |
| Lag introducido (correlación cruzada de velocidad) | **~0 frames** |

- [x] 3.1 Verificado en runtime (usuario): "ya no tiembla tanto" en la seña 0005.
- [ ] 3.2 Verificar señas dinámicas ruidosas (0001, 0010, 0021, 0034) — mejoran ~30% pero
  siguen siendo el peor caso (ruido ≈ señal).
- [ ] 3.3 Confirmar que no hay lag perceptible en señas rápidas; si lo hay, subir
  `FILTER_MIN_CUTOFF`→1.3 y `FILTER_BETA`→25.

## 4. Barrido de parámetros (referencia para tuning)

| `min_cutoff` | `beta` | `d_cutoff` | jitter ang. ↓ | travel preservado |
|---|---|---|---|---|
| **1.0** | **18** | **1.0** | 61% | 48% (elegido) |
| 0.7 | 12 | 1.0 | 63% | 44% |
| 0.5 | 10 | 1.0 | 67% | 42% |
| 1.3 | 25 | 1.5 | 55% | 54% (más conservador) |

(`travel` = suma de |1ª diferencia| del ángulo distal = señal + ruido; en este dataset la
falange distal casi no lleva señal intencional, por eso retener ~48% ahí es aceptable.)

## 5. Siguiente

- [x] 5.1 Bundle en `app.js` (A/C/D/E + B) → hecho en el change `avatar-finger-bundle-arm-ik`
  (que además ajustó la IK de brazo: `ELBOW_OUT` con gate de altura + anti-clip de torso).
- [ ] 5.2 Paso 2 "de verdad": convertir cada falange en bisagra anatómica (flexión en 1 eje,
  0–90°, sin torsión ni desviación lateral) — reescribir `rotateBone` para dedos.
