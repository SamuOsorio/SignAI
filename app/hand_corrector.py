"""
Corrección automática de landmarks de mano por frame.

Detecta y corrige cuatro tipos de error que produce MediaPipe con cualquier
dataset de lengua de señas (no depende de pre-análisis del dataset):

  CONTACT     — ambas manos demasiado juntas (prox_xy < umbral)
                → dedo por dedo: usa el landmark crudo si es plausible
                  (sigue visible), si no sostiene el último valor bueno de
                  ESE dedo (ver _contact_hand). No asume que todos los
                  dedos se ocluyen a la vez.

  HOLD        — mano que estaba presente desaparece (tracking loss)
                → mantiene la última pose válida hasta MAX_HOLD frames,
                  luego hace decay exponencial hacia pose de reposo.

  BLEND       — salto brusco de landmarks entre frames consecutivos
                → mezcla (alpha) con frame anterior para suavizar.

  FILTER      — jitter continuo de tracking (temblor frame a frame)
                → filtro temporal One-Euro por landmark/eje. En LSC50 la mano
                  ocupa ~3% del frame, así que los segmentos de falange (~5-9 px)
                  quedan al nivel del ruido de MediaPipe (~0.009/frame). One-Euro
                  suaviza fuerte en reposo y afloja en movimiento rápido → sube
                  el SNR sin el lag de un promedio móvil fijo.

Uso:
    corrector = HandCorrector()
    corrected_frames, stats = corrector.process_sequence(frames)
"""

import copy
import math
from typing import Optional


# ── Configuración ─────────────────────────────────────────────────────────────

CONTACT_THRESH  = 0.09   # prox_xy < este valor → manos en contacto/oclusión
NOISE_THRESH    = 0.10   # desplazamiento medio de landmarks > este valor → frame ruidoso
MAX_HOLD        = 8      # frames máximos para mantener pose tras pérdida de tracking
BLEND_ALPHA     = 0.40   # peso del frame actual en blend ruidoso (1-alpha = frame anterior)
HOLD_DECAY      = 0.85   # factor de decay en pose de reposo tras MAX_HOLD frames

# "Span" (wrist→MCP medio, tamaño de mano en imagen) mínimo aceptable como
# fracción de un baseline reciente, para aceptar un frame como referencia de
# congelado (last_valid) de CONTACT. Hallazgo (seña 0018, sesión 2026-09-12):
# el tracking de MediaPipe de AMBAS manos se degrada (span cae de ~0.05 a
# ~0.01, un colapso de 4x) en los ~4 frames PREVIOS a que prox_xy cruce
# CONTACT_THRESH — la oclusión mutua ya afecta la calidad del landmark antes
# de que las palmas se consideren "en contacto". Sin este chequeo, el corrector
# congela una pose ya corrupta (segmentos de falange casi nulos → ángulos 2D
# dominados por ruido, ej. DIP midiendo 100-200° con PIP casi en 0°, algo
# biomecánicamente imposible) y la arrastra rígidamente durante TODO el
# contacto (el rebase solo traslada, no corrige la forma).
SPAN_MIN_RATIO  = 0.9
SPAN_EMA_ALPHA  = 0.05

# Índices de landmarks por familia de dedo (MediaPipe Hands) — igual a
# FINGER_LM en app.js. Usado por el chequeo de continuidad por dedo durante
# CONTACT (ver _contact_hand).
_FINGER_IDX = {
    "thumb":  (1, 2, 3, 4),
    "index":  (5, 6, 7, 8),
    "middle": (9, 10, 11, 12),
    "ring":   (13, 14, 15, 16),
    "pinky":  (17, 18, 19, 20),
}

# Cambio de ángulo (grados) máximo plausible de un frame al siguiente (24
# fps) en el nudillo proximal de un dedo, antes de tratar el dato crudo
# como un salto de oclusión puntual en vez de movimiento real. Calibrado
# con datos reales de 0018 (ver _contact_hand): ahí el ruido de oclusión
# salta >40-50° con signo inconsistente frame a frame (ej. 44°→12°→54°→
# 107°→46°...); el cierre real, aunque rápido, es más gradual.
FINGER_JUMP_MAX_DEG = 45.0

# ── Filtro temporal One-Euro (Casiez, Roussel & Vogel, CHI 2012) ─────────────
# Se aplica como último paso, sobre los landmarks ya corregidos por
# CONTACT/HOLD/BLEND. Los parámetros dependen de la ESCALA de las coordenadas:
# aquí son normalizadas 0-1 y la mano es diminuta, por eso BETA es grande
# (para que el cutoff suba de verdad durante el movimiento).
FILTER_ENABLED    = True
FILTER_FPS        = 24.0   # LSC50 BODY/HANDS = 24 fps
FILTER_MIN_CUTOFF = 1.0    # Hz — más bajo = más suavizado cuando la mano está quieta
FILTER_BETA       = 18.0   # acopla |velocidad| al cutoff = menos lag en señas rápidas
FILTER_D_CUTOFF   = 1.0    # Hz — suavizado de la derivada (estabiliza el cutoff)

# Índices de la palma para calcular el centro (MediaPipe Hands)
_PALM_IDX = [0, 5, 9, 13, 17]


# ── Utilidades de landmarks ───────────────────────────────────────────────────

def _palm_center(lm: list[dict]) -> tuple[float, float]:
    x = sum(lm[i]["x"] for i in _PALM_IDX) / len(_PALM_IDX)
    y = sum(lm[i]["y"] for i in _PALM_IDX) / len(_PALM_IDX)
    return x, y


def _prox_xy(lm_r: list[dict], lm_l: list[dict]) -> float:
    cx, cy = _palm_center(lm_r)
    dx, dy = _palm_center(lm_l)
    return math.sqrt((cx - dx) ** 2 + (cy - dy) ** 2)


def _hand_span(lm: list[dict]) -> float:
    """Tamaño de mano en imagen (wrist→MCP medio, 2D). Proxy barato de calidad
    de detección: colapsa cuando MediaPipe empieza a perder los landmarks por
    oclusión (ver SPAN_MIN_RATIO)."""
    return math.hypot(lm[9]["x"] - lm[0]["x"], lm[9]["y"] - lm[0]["y"])


def _mean_disp(prev: list[dict], curr: list[dict]) -> float:
    """Desplazamiento medio de landmarks entre dos frames consecutivos."""
    return sum(
        math.sqrt((p["x"] - c["x"]) ** 2 + (p["y"] - c["y"]) ** 2)
        for p, c in zip(prev, curr)
    ) / len(prev)


def _blend_lm(prev: list[dict], curr: list[dict], alpha: float) -> list[dict]:
    """alpha·curr + (1-alpha)·prev para cada landmark."""
    b = 1.0 - alpha
    return [
        {
            "x": alpha * c["x"] + b * p["x"],
            "y": alpha * c["y"] + b * p["y"],
            "z": alpha * c["z"] + b * p["z"],
        }
        for p, c in zip(prev, curr)
    ]


def _translate(points: list[dict], old_ref: dict, new_ref: dict) -> list[dict]:
    """
    Traslada rígidamente `points` por el delta (new_ref − old_ref).

    Bug corregido en su día (histórico — ver _contact_hand para el diseño
    actual): pegar landmarks congelados en coordenadas absolutas de un frame
    anterior directamente sobre el wrist del frame actual, sin trasladar,
    hacía que la forma de la mano quedara flotando en el lugar equivocado
    apenas la muñeca se movía (típico: moviéndose hacia la otra mano). Eso
    encogía el "span" (wrist→MCP) frame a frame en vez de quedarse
    constante, desincronizando el deadzone de flexión de dedos del tamaño
    real (constante) de los segmentos — la mano no cerraba el puño en
    CONTACT (seña 0018). Aquí se traslada rígidamente por el delta de
    referencia, preservando la forma pero siguiendo la posición real.
    """
    dx = new_ref["x"] - old_ref["x"]
    dy = new_ref["y"] - old_ref["y"]
    dz = new_ref["z"] - old_ref["z"]
    return [{"x": p["x"] + dx, "y": p["y"] + dy, "z": p["z"] + dz} for p in points]


def _finger_joint_angle_deg(lm: list[dict], mcp: int, pip: int, dip: int) -> Optional[float]:
    """
    Ángulo 2D (grados) entre el segmento mcp→pip y pip→dip — el mismo
    cálculo de "flexión" que hace app.js. Se usa aquí solo como señal de
    PLAUSIBILIDAD frame a frame (¿este dedo sigue siendo el mismo dedo
    visible, o el dato saltó a algo implausible?), no para animar nada.
    """
    seg_p = (lm[pip]["x"] - lm[mcp]["x"], lm[pip]["y"] - lm[mcp]["y"])
    seg_c = (lm[dip]["x"] - lm[pip]["x"], lm[dip]["y"] - lm[pip]["y"])
    n_p, n_c = math.hypot(*seg_p), math.hypot(*seg_c)
    if n_p < 1e-9 or n_c < 1e-9:
        return None
    cos_a = max(-1.0, min(1.0, (seg_p[0]*seg_c[0] + seg_p[1]*seg_c[1]) / (n_p * n_c)))
    return math.degrees(math.acos(cos_a))


def _decay_toward_wrist(lm: list[dict], factor: float) -> list[dict]:
    """
    Hace decay exponencial de todos los landmarks hacia la muñeca (lm[0]).
    Simula una mano que se "relaja" cuando pierde tracking.
    """
    wx, wy, wz = lm[0]["x"], lm[0]["y"], lm[0]["z"]
    result = []
    for i, p in enumerate(lm):
        if i == 0:
            result.append(dict(p))
        else:
            result.append({
                "x": wx + (p["x"] - wx) * factor,
                "y": wy + (p["y"] - wy) * factor,
                "z": wz + (p["z"] - wz) * factor,
            })
    return result


# ── Filtro temporal One-Euro ─────────────────────────────────────────────────

def _lp_alpha(cutoff: float, dt: float) -> float:
    """Coeficiente de un pasa-bajos de 1er orden para un cutoff (Hz) y paso dt (s)."""
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class _OneEuro:
    """Filtro One-Euro escalar. Suaviza más en reposo, menos en movimiento rápido."""

    __slots__ = ("min_cutoff", "beta", "d_cutoff", "dt", "_x", "_dx")

    def __init__(self, min_cutoff: float, beta: float, d_cutoff: float, fps: float):
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.d_cutoff   = d_cutoff
        self.dt         = 1.0 / fps
        self._x  = None   # último valor filtrado
        self._dx = 0.0    # última derivada filtrada

    def reset(self):
        self._x  = None
        self._dx = 0.0

    def __call__(self, x: float) -> float:
        if self._x is None:          # primer sample → sin filtrar
            self._x = x
            return x
        dx = (x - self._x) / self.dt
        a_d = _lp_alpha(self.d_cutoff, self.dt)
        dx_hat = a_d * dx + (1.0 - a_d) * self._dx
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a = _lp_alpha(cutoff, self.dt)
        x_hat = a * x + (1.0 - a) * self._x
        self._x, self._dx = x_hat, dx_hat
        return x_hat


class _HandFilter:
    """Banco de filtros One-Euro para los 21 landmarks (x, y, z) de una mano."""

    def __init__(self):
        self._f: Optional[list] = None   # se crea al primer frame

    def reset(self):
        self._f = None

    def apply(self, lm: list[dict]) -> list[dict]:
        if self._f is None or len(self._f) != len(lm):
            self._f = [
                tuple(
                    _OneEuro(FILTER_MIN_CUTOFF, FILTER_BETA, FILTER_D_CUTOFF, FILTER_FPS)
                    for _ in range(3)
                )
                for _ in range(len(lm))
            ]
        out = []
        for p, (fx, fy, fz) in zip(lm, self._f):
            out.append({"x": fx(p["x"]), "y": fy(p["y"]), "z": fz(p["z"])})
        return out


# ── Corrector ─────────────────────────────────────────────────────────────────

class HandCorrector:
    """
    Procesador stateful de secuencias de frames de landmarks de mano.
    Instanciar uno por cada seña/video (el estado es por secuencia).
    """

    def __init__(
        self,
        contact_thresh: float = CONTACT_THRESH,
        noise_thresh:   float = NOISE_THRESH,
        max_hold:       int   = MAX_HOLD,
        blend_alpha:    float = BLEND_ALPHA,
        filter_enabled: bool  = FILTER_ENABLED,
    ):
        self.contact_thresh = contact_thresh
        self.noise_thresh   = noise_thresh
        self.max_hold       = max_hold
        self.blend_alpha    = blend_alpha
        self.filter_enabled = filter_enabled
        self._reset()

    def _reset(self):
        self._last_valid: dict[str, list] = {}   # lado → landmarks pre-contacto válidos
        self._prev_frame: dict[str, list] = {}   # lado → landmarks del frame anterior
        self._hold_count: dict[str, int]  = {}   # lado → frames que lleva en HOLD
        self._span_baseline: dict[str, float] = {}  # lado → EMA del span en frames aceptados
        self._finger_ref: dict[str, dict[str, dict]] = {}  # lado → familia → último dato bueno
        self._in_contact  = False
        self._filter = {"Right": _HandFilter(), "Left": _HandFilter()}

    def _is_good_frame(self, side: str, lm: list[dict]) -> bool:
        """
        ¿Sirve este frame como referencia de congelado (last_valid)? Rechaza
        frames donde el span de la mano se derrumbó respecto al baseline
        reciente — señal de oclusión mutua degradando el tracking ANTES de
        que prox_xy cruce CONTACT_THRESH (ver SPAN_MIN_RATIO). El baseline
        solo avanza con frames aceptados, así que una racha de frames
        degradados no lo arrastra hacia abajo.
        """
        span = _hand_span(lm)
        baseline = self._span_baseline.get(side)
        if baseline is None:
            self._span_baseline[side] = span
            return True
        if span < baseline * SPAN_MIN_RATIO:
            return False
        self._span_baseline[side] = (1 - SPAN_EMA_ALPHA) * baseline + SPAN_EMA_ALPHA * span
        return True

    def _update_finger_refs(self, side: str, lm: Optional[list[dict]]) -> dict[str, bool]:
        """
        Mantiene "caliente" la última referencia buena conocida de cada dedo
        de `side`, comparando el ángulo crudo de este frame con el de la
        referencia (ver FINGER_JUMP_MAX_DEG). Se llama SIEMPRE — en NORMAL y
        en CONTACT — para que la referencia ya esté lista apenas empieza un
        contacto; si solo se actualizara durante CONTACT, el primer frame de
        cada contacto se aceptaría a ciegas (sin nada contra qué compararlo),
        reintroduciendo el bug de "congelar un frame ya degradado" que esto
        reemplaza. No toca el render en NORMAL — ahí los landmarks crudos se
        usan tal cual los devuelva este frame, se llame o no a este método.

        Devuelve, por familia de dedo, si el dato crudo de ESTE frame fue
        aceptado como nueva referencia (dato plausible, dedo visible).
        """
        accepted: dict[str, bool] = {}
        if lm is None:
            return accepted
        ref = self._finger_ref.setdefault(side, {})
        for fam, idx in _FINGER_IDX.items():
            mcp, pip, dip, _tip = idx
            ang = _finger_joint_angle_deg(lm, mcp, pip, dip)
            prev = ref.get(fam)
            ok = ang is not None and (prev is None or abs(ang - prev["angle"]) <= FINGER_JUMP_MAX_DEG)
            if ok:
                ref[fam] = {
                    "angle": ang,
                    "pts": [dict(lm[i]) for i in idx],
                    "wrist": dict(lm[0]),
                }
            accepted[fam] = ok
        return accepted

    def _contact_hand(self, side: str, raw_lm: list[dict], accepted: dict[str, bool]) -> list[dict]:
        """
        Landmarks de una mano durante CONTACT, dedo por dedo — reemplaza el
        freeze anterior (toda la mano congelada de una vez al entrar en
        contacto). Ese enfoque asumía que TODOS los dedos se ocluyen a la
        vez apenas las palmas se acercan; midiendo datos reales (seña 0018)
        no es así: el índice derecho se mantiene bajo y estable ~25 frames
        durante lo que el corrector marcaba "CONTACT" mientras el resto de
        los dedos ya cerraron en puño — señal real de MediaPipe, no ruido —
        y el freeze la tapaba con una foto vieja de antes de que la mano
        terminara de formar esa pose (el rebase solo traslada, nunca
        corrige la forma; si se congela demasiado pronto, el puño nunca
        llega a cerrar del todo aunque el dato real sí lo muestre).

        lm0 (wrist) siempre es el real de este frame — visible y preciso
        incluso en contacto. Para cada dedo: si `accepted` (ver
        _update_finger_refs) dice que el dato crudo de este frame es
        plausible, se usa tal cual — el dedo sigue siendo visible. Si no
        (oclusión puntual real de ESE dedo), se sirve la última referencia
        buena, trasladada rígidamente al wrist actual — igual que el freeze
        viejo, pero por dedo en vez de por mano entera.
        """
        out = [dict(raw_lm[0])]
        ref_all = self._finger_ref.get(side, {})
        for fam, idx in _FINGER_IDX.items():
            if accepted.get(fam):
                out.extend(dict(raw_lm[i]) for i in idx)
                continue
            ref = ref_all.get(fam)
            if ref is not None:
                out.extend(_translate(ref["pts"], ref["wrist"], raw_lm[0]))
            else:
                out.extend(dict(raw_lm[i]) for i in idx)  # sin referencia aún → crudo
        return out

    # ── API pública ──────────────────────────────────────────────────────────

    def process_sequence(
        self, frames: list[dict]
    ) -> tuple[list[dict], dict]:
        """
        Procesa una secuencia completa de frames.

        Args:
            frames: lista de dicts con al menos la clave "hands" (formato server.py)

        Returns:
            (corrected_frames, stats) donde stats es un dict con:
              - "states": lista de str (estado de cada frame)
              - "contact_frames": conteo
              - "hold_frames":    conteo
              - "blend_frames":   conteo
        """
        self._reset()
        corrected, states = [], []

        for frame in frames:
            cf, state = self._process_frame(frame)
            corrected.append(cf)
            states.append(state)

        stats = {
            "states":         states,
            "contact_frames": states.count("CONTACT"),
            "hold_r_frames":  states.count("HOLD_Right"),
            "hold_l_frames":  states.count("HOLD_Left"),
            "blend_frames":   sum(1 for s in states if s.startswith("BLEND")),
            "normal_frames":  states.count("NORMAL"),
            "total_frames":   len(states),
            "filter":         "one-euro" if self.filter_enabled else None,
        }
        return corrected, stats

    # ── Procesamiento por frame ──────────────────────────────────────────────

    def _process_frame(self, frame: dict) -> tuple[dict, str]:
        hands_in = frame.get("hands", [])
        by_side  = {h["hand"]: list(h["landmarks"]) for h in hands_in}

        r_lm: Optional[list] = by_side.get("Right")
        l_lm: Optional[list] = by_side.get("Left")

        state = "NORMAL"

        # 1. Detección de contacto/oclusión
        if r_lm and l_lm:
            prox = _prox_xy(r_lm, l_lm)
            if prox < self.contact_thresh:
                # Manos en contacto / oclusión mutua.
                # lm0 (wrist) sí es visible y preciso incluso en contacto → conservar.
                # lm1-20 (dedos): decisión POR DEDO, no por mano entera — ver
                # _contact_hand (algunos dedos siguen siendo visibles aunque
                # las palmas ya se consideren "en contacto").
                state = "CONTACT"
                self._in_contact = True
                r_acc = self._update_finger_refs("Right", r_lm)
                l_acc = self._update_finger_refs("Left",  l_lm)
                r_lm = self._contact_hand("Right", r_lm, r_acc)
                l_lm = self._contact_hand("Left",  l_lm, l_acc)
            else:
                self._in_contact = False
                # Mantener "caliente" la referencia por dedo (ver
                # _update_finger_refs) aunque no estemos en contacto, para
                # que ya esté lista apenas empiece el próximo.
                self._update_finger_refs("Right", r_lm)
                self._update_finger_refs("Left",  l_lm)
                # Actualizar last_valid (usado solo por HOLD, pérdida total
                # de la mano) solo fuera de contacto, y solo si el frame no
                # viene ya degradado (ver _is_good_frame).
                if self._is_good_frame("Right", r_lm):
                    self._last_valid["Right"] = r_lm
                if self._is_good_frame("Left", l_lm):
                    self._last_valid["Left"] = l_lm
                self._hold_count.pop("Right", None)
                self._hold_count.pop("Left",  None)
        elif not self._in_contact:
            # Si no hay contacto, actualizar last_valid con las que sí detectó
            for side, lm in [("Right", r_lm), ("Left", l_lm)]:
                if lm:
                    self._update_finger_refs(side, lm)
                    if self._is_good_frame(side, lm):
                        self._last_valid[side] = lm

        # 2. Detección de salto brusco (BLEND) — solo fuera de contacto
        if state == "NORMAL":
            for side, lm in [("Right", r_lm), ("Left", l_lm)]:
                if lm is None:
                    continue
                prev = self._prev_frame.get(side)
                if prev:
                    disp = _mean_disp(prev, lm)
                    if disp > self.noise_thresh:
                        blended = _blend_lm(prev, lm, self.blend_alpha)
                        if side == "Right":
                            r_lm = blended
                        else:
                            l_lm = blended
                        state = f"BLEND_{side}"

        # 3. Detección de pérdida de tracking (HOLD)
        for side, lm in [("Right", r_lm), ("Left", l_lm)]:
            if lm is not None:
                continue
            if side not in self._last_valid:
                continue

            hold = self._hold_count.get(side, 0)
            last = self._last_valid[side]

            if hold < self.max_hold:
                # Mantener pose congelada
                recovered = last
            else:
                # Decay hacia la muñeca (relajación progresiva)
                extra = hold - self.max_hold
                factor = HOLD_DECAY ** (extra + 1)
                recovered = _decay_toward_wrist(last, factor)

            self._hold_count[side] = hold + 1
            if side == "Right":
                r_lm = recovered
            else:
                l_lm = recovered
            state = f"HOLD_{side}"

        # 3b. Filtro temporal One-Euro — último paso, sobre landmarks ya corregidos.
        #     Sube el SNR antes del retargeting (jitter ≈ señal en falanges distales).
        if self.filter_enabled:
            for side in ("Right", "Left"):
                lm = r_lm if side == "Right" else l_lm
                if lm is None:
                    self._filter[side].reset()   # hueco → no interpolar a través de él
                    continue
                smoothed = self._filter[side].apply(lm)
                if side == "Right":
                    r_lm = smoothed
                else:
                    l_lm = smoothed

        # 4. Actualizar frame anterior (con los valores ya corregidos)
        for side, lm in [("Right", r_lm), ("Left", l_lm)]:
            if lm:
                self._prev_frame[side] = lm

        # 5. Reconstruir lista de manos en el mismo orden que el frame original
        out_hands = []
        seen = set()
        for h in hands_in:
            side = h["hand"]
            seen.add(side)
            lm_out = r_lm if side == "Right" else l_lm
            if lm_out is not None:
                out_hands.append({"hand": side, "landmarks": lm_out})

        # Agregar manos recuperadas por HOLD que no estaban en el frame original
        for side, lm_out in [("Right", r_lm), ("Left", l_lm)]:
            if side not in seen and lm_out is not None:
                out_hands.append({"hand": side, "landmarks": lm_out})

        corrected_frame = {**frame, "hands": out_hands, "_corrector_state": state}
        return corrected_frame, state
