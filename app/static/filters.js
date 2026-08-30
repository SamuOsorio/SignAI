import { state } from "./state.js";

// Filtro adaptativo a la velocidad: suaviza en reposo, mínimo lag en movimiento.
// Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter", CHI 2012.
export class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this._min  = minCutoff;
    this._beta = beta;
    this._dc   = dCutoff;
    this._x    = null;
    this._dx   = 0;
  }
  _alpha(dt, cutoff) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, dt) {
    if (this._x === null) { this._x = x; return x; }
    const ad  = this._alpha(dt, this._dc);
    this._dx  = ad * ((x - this._x) / dt) + (1 - ad) * this._dx;
    const cut = this._min + this._beta * Math.abs(this._dx);
    const a   = this._alpha(dt, cut);
    this._x   = a * x + (1 - a) * this._x;
    return this._x;
  }
  reset() { this._x = null; this._dx = 0; }
}

// Parámetros por tipo de junta. Dedos: más suavizado. Muñeca: más responsiva.
export const OEF_FINGER = { minCutoff: 1.0, beta: 0.007 };
export const OEF_WRIST  = { minCutoff: 1.5, beta: 0.020 };

// Umbral de bbox 2D por debajo del cual la mano se considera degenerada
// (MediaPipe emite todos los landmarks en (0,0) cuando cae la confianza).
const DEGENERATE_BBOX = 0.02;

export function initHandFilters() {
  const makeFilters = (p) =>
    Array.from({ length: 21 }, () => [
      new OneEuroFilter(p.minCutoff, p.beta),
      new OneEuroFilter(p.minCutoff, p.beta),
      new OneEuroFilter(p.minCutoff, p.beta),
    ]);
  state.handFilters = {
    Left:  makeFilters(OEF_FINGER),
    Right: makeFilters(OEF_FINGER),
  };
  // lm0 = muñeca: ancla de todo el sistema de dedos → parámetros más responsivos
  for (const side of ["Left", "Right"]) {
    state.handFilters[side][0] = [
      new OneEuroFilter(OEF_WRIST.minCutoff, OEF_WRIST.beta),
      new OneEuroFilter(OEF_WRIST.minCutoff, OEF_WRIST.beta),
      new OneEuroFilter(OEF_WRIST.minCutoff, OEF_WRIST.beta),
    ];
  }
}

export function isHandDegenerate(lms) {
  let minX = lms[0].x, maxX = lms[0].x, minY = lms[0].y, maxY = lms[0].y;
  for (let i = 1; i < lms.length; i++) {
    if (lms[i].x < minX) minX = lms[i].x;
    if (lms[i].x > maxX) maxX = lms[i].x;
    if (lms[i].y < minY) minY = lms[i].y;
    if (lms[i].y > maxY) maxY = lms[i].y;
  }
  return (maxX - minX) < DEGENERATE_BBOX && (maxY - minY) < DEGENERATE_BBOX;
}

export function filterHandLandmarks(lms, side, dt) {
  const fs = state.handFilters[side];
  return lms.map((lm, i) => ({
    x: fs[i][0].filter(lm.x, dt),
    y: fs[i][1].filter(lm.y, dt),
    z: fs[i][2].filter(lm.z, dt),
  }));
}
