"""
Filtro temporal One-Euro para landmarks de CUERPO (MediaPipe Pose, 33 puntos).

Mismo problema que ya se resolvió para manos (ver `hand_corrector.py`), pero
más abajo en la cadena cinemática y sin ningún filtro aplicado hasta ahora:
`server.py` pasaba `BODY_LANDMARKS/*.csv` crudo al frontend, directo al IK de
brazos.

Medido sobre las 50 señas de LSC50 (1 video por seña, desplazamiento medio
frame a frame de hombro/codo/muñeca):

    jitter hombro : 0.0005   (mediana; casi estático — buen ancla de escala)
    jitter codo   : 0.0015   (~3× el hombro)
    jitter muñeca : 0.0061   (~4× el codo, ~12× el hombro)

El ruido crece hacia la periferia de la cadena tal como es de esperar
biomecánicamente, pero antes de este módulo nada lo atenuaba antes de
`applyArmIK` (app.js) — de ahí buena parte del "codo no pulido" reportado.

Diferencia clave con la z de MediaPipe Hands (que se recorta con
`Z_HAND=0.3` en app.js por ser ruido puro, span ~0.014): la z de Pose en
codo/muñeca tiene un rango real de 0.14-0.35 → es señal (profundidad real
del gesto), no solo ruido. Por eso se filtra con el mismo esquema adaptativo
(más agresivo en reposo, casi transparente en movimiento rápido) en vez de
un promedio fijo que aplastaría esa profundidad.

Parámetros validados con un barrido sobre las 50 señas (métrica: jitter del
ángulo hombro-codo-muñeca frame a frame, y cuánto de un movimiento rápido
REAL sobrevive al filtro — top 10% de deltas más grandes por señal cruda):

    MIN_CUTOFF=1.0 BETA=18 (= manos): jitter -23%, retiene 65% del rápido
    MIN_CUTOFF=0.5 BETA=6           : jitter -34%, retiene 46%
    MIN_CUTOFF=0.5 BETA=3           : jitter -41%, retiene 37%

Bajar BETA gana poco jitter extra a cambio de mucho lag en gestos rápidos
(mismo patrón de tuning ya observado con el filtro de manos: "más mushy/lag
→ subir MIN_CUTOFF/BETA; más tembloroso → bajar MIN_CUTOFF"). Se deja
BETA=18 (igual que manos) porque prioriza no introducir lag — si en vivo se
ve tembloroso, el primer ajuste es bajar `POSE_MIN_CUTOFF` (p.ej. a 0.7),
NO `POSE_BETA`.
"""

import math

# ── Configuración ─────────────────────────────────────────────────────────────
POSE_FPS        = 24.0   # LSC50 BODY = 24 fps, igual que HANDS
POSE_MIN_CUTOFF = 1.0    # Hz — más bajo = más suavizado con el brazo quieto
POSE_BETA       = 18.0   # acopla |velocidad| al cutoff = menos lag en gestos rápidos
POSE_D_CUTOFF   = 1.0    # Hz — suavizado de la derivada (estabiliza el cutoff)

N_POSE_LANDMARKS = 33


def _lp_alpha(cutoff: float, dt: float) -> float:
    """Coeficiente de un pasa-bajos de 1er orden para un cutoff (Hz) y paso dt (s)."""
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class _OneEuro:
    """Filtro One-Euro escalar. Suaviza más en reposo, menos en movimiento rápido.

    Idéntico en forma al de `hand_corrector.py` (no se comparte el módulo a
    propósito: ese filtro ya está validado en producción y no conviene
    arriesgar una regresión ahí por un refactor de bajo valor).
    """

    __slots__ = ("min_cutoff", "beta", "d_cutoff", "dt", "_x", "_dx")

    def __init__(self, min_cutoff: float, beta: float, d_cutoff: float, fps: float):
        self.min_cutoff = min_cutoff
        self.beta       = beta
        self.d_cutoff   = d_cutoff
        self.dt         = 1.0 / fps
        self._x  = None
        self._dx = 0.0

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


class PoseFilter:
    """
    Banco de filtros One-Euro para los 33 landmarks (x, y, z) de MediaPipe
    Pose. Instanciar uno por secuencia/video (el estado es por secuencia,
    igual que `HandCorrector`).
    """

    def __init__(
        self,
        min_cutoff: float = POSE_MIN_CUTOFF,
        beta:       float = POSE_BETA,
        d_cutoff:   float = POSE_D_CUTOFF,
        fps:        float = POSE_FPS,
    ):
        self._min_cutoff = min_cutoff
        self._beta       = beta
        self._d_cutoff   = d_cutoff
        self._fps        = fps
        self._f = None   # se crea al primer frame

    def reset(self):
        self._f = None

    def apply(self, landmarks: list[dict]) -> list[dict]:
        """landmarks: lista de {x,y,z} (33 puntos). Devuelve la lista filtrada."""
        if self._f is None or len(self._f) != len(landmarks):
            self._f = [
                tuple(
                    _OneEuro(self._min_cutoff, self._beta, self._d_cutoff, self._fps)
                    for _ in range(3)
                )
                for _ in range(len(landmarks))
            ]
        out = []
        for p, (fx, fy, fz) in zip(landmarks, self._f):
            out.append({"x": fx(p["x"]), "y": fy(p["y"]), "z": fz(p["z"])})
        return out
