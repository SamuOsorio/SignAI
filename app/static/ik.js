import * as THREE from "three";
import { state } from "./state.js";
import { rotateBone, SPRING_PARAMS } from "./hands.js";

// Distancia wrist-wrist (coords normalizadas 0-1) por debajo de la cual se considera
// que las manos están en cruce. En ese caso se ignoran los landmarks de Hands
// y se usan los de Pose (lm15/16) que son más robustos al solapamiento.
export const CROSS_HAND_THRESHOLD = 0.18;

const _ikWrist = new THREE.Vector3();
const _ikEHint = new THREE.Vector3();
const _ikElbow = new THREE.Vector3();
const _ikTT    = new THREE.Vector3();
const _ikPole  = new THREE.Vector3();

// Convierte posición de landmark relativa a lmRef → posición world relativa a worldRef.
function lmWorldOffset(lm, lmRef, scale, worldRef, out) {
  // Factor 0.40 para Z: el Z normalizado de Pose sobreestima la profundidad real.
  const Z_SCALE = 0.40;
  return out.set(
    (lm.x - lmRef.x) * scale,
    -(lm.y - lmRef.y) * scale,
    -(lm.z - lmRef.z) * scale * Z_SCALE,
  ).add(worldRef);
}

// Escala landmarks (imagen normalizada) → unidades world del avatar.
// Ancla: separación hombro-hombro, estable entre frames.
function bodyScale(body) {
  const a = body[11], b = body[12];
  const lmSep = Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
  if (lmSep < 1e-6) return 1;
  return state.armRest.shoulderL.distanceTo(state.armRest.shoulderR) / lmSep;
}

// Solver analítico de IK de 2 huesos (ley de cosenos).
// Resultado: _ikElbow ← posición world del codo.
function solveIKElbow(shoulder, target, pole, L1, L2) {
  _ikTT.subVectors(target, shoulder);
  const D = Math.min(_ikTT.length(), L1 + L2 - 1e-4);
  _ikTT.normalize();

  const cosA = THREE.MathUtils.clamp((L1*L1 + D*D - L2*L2) / (2*L1*D), -1, 1);
  const sinA  = Math.sqrt(1 - cosA*cosA);

  pole.addScaledVector(_ikTT, -pole.dot(_ikTT));
  if (pole.lengthSq() < 1e-8) {
    // Polo paralelo al target: doble fallback para evitar NaN en normalize()
    pole.set(0, 1, 0).addScaledVector(_ikTT, -_ikTT.y);
    if (pole.lengthSq() < 1e-8) pole.set(1, 0, 0).addScaledVector(_ikTT, -_ikTT.x);
    pole.normalize();
  } else {
    pole.normalize();
  }

  _ikElbow.copy(shoulder)
    .addScaledVector(_ikTT, cosA * L1)
    .addScaledVector(pole, sinA * L1);
}

export function applyArmIK(body, handsMap) {
  if (!state.armRest.L_upperL) return;
  const scale = bodyScale(body);
  const g = state.armRest;

  const lW = handsMap?.["Left"]?.[0], lR = handsMap?.["Right"]?.[0];
  let handsOverlap = false;
  if (lW && lR) {
    const dx = lW.x - lR.x, dy = lW.y - lR.y;
    handsOverlap = dx*dx + dy*dy < CROSS_HAND_THRESHOLD * CROSS_HAND_THRESHOLD;
  }
  const ikTargetL = handsOverlap ? null : lW;
  const ikTargetR = handsOverlap ? null : lR;

  _applyOneArm(body, 11, 13, 15,
    "DEF-upper_armL", "DEF-upper_armL001", "DEF-forearmL", "DEF-forearmL001",
    g.shoulderL, g.L_upperL, g.L_foreL, scale, ikTargetL);

  _applyOneArm(body, 12, 14, 16,
    "DEF-upper_armR", "DEF-upper_armR001", "DEF-forearmR", "DEF-forearmR001",
    g.shoulderR, g.L_upperR, g.L_foreR, scale, ikTargetR);
}

function _applyOneArm(body, iS, iE, iW,
    nUA, nUA1, nFA, nFA1, shoulderWorld, L1, L2, scale, handWrist) {
  if (L1 < 1e-6 || L2 < 1e-6) return;

  // Si hay landmark de mano disponible, su xy es más estable que Pose lm15/16.
  // Conservamos z de Pose (hands lm0.z siempre es 0 por definición de MediaPipe).
  const wristLm = handWrist
    ? { x: handWrist.x, y: handWrist.y, z: body[iW].z }
    : body[iW];

  lmWorldOffset(wristLm,   body[iS], scale, shoulderWorld, _ikWrist);
  lmWorldOffset(body[iE],  body[iS], scale, shoulderWorld, _ikEHint);

  // Bias de polo: codo anatómico siempre cuelga por debajo de la línea hombro-muñeca
  // + leve componente frontal para compensar subestimación de z normalizado.
  _ikPole.subVectors(_ikEHint, shoulderWorld);
  _ikPole.y -= (L1 + L2) * 0.35;
  _ikPole.z += (L1 + L2) * 0.10;

  solveIKElbow(shoulderWorld, _ikWrist, _ikPole, L1, L2);

  const dirUA = _ikTT.subVectors(_ikElbow, shoulderWorld);
  const dirFA = _ikEHint.subVectors(_ikWrist, _ikElbow);

  const bUA  = state.bones.get(nUA),  bUA1 = state.bones.get(nUA1);
  const bFA  = state.bones.get(nFA),  bFA1 = state.bones.get(nFA1);

  if (bUA)  rotateBone(bUA,  dirUA);
  if (bUA1) rotateBone(bUA1, dirUA);
  if (bFA)  rotateBone(bFA,  dirFA);
  if (bFA1) rotateBone(bFA1, dirFA);
}
