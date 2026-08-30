import * as THREE from "three";
import { state } from "./state.js";

// ── Mapeo landmarks MediaPipe → huesos DEF de Rigify ─────────────────────────
// [nombre_hueso, idx_landmark_inicio, idx_landmark_fin]
export const BONE_MAP = [
  ["thumb01L",    1, 2],  ["thumb02L",    2, 3],  ["thumb03L",    3, 4],
  ["f_index01L",  5, 6],  ["f_index02L",  6, 7],  ["f_index03L",  7, 8],
  ["f_middle01L", 9,10],  ["f_middle02L",10,11],  ["f_middle03L",11,12],
  ["f_ring01L",  13,14],  ["f_ring02L",  14,15],  ["f_ring03L",  15,16],
  ["f_pinky01L", 17,18],  ["f_pinky02L", 18,19],  ["f_pinky03L", 19,20],
  ["thumb01R",    1, 2],  ["thumb02R",    2, 3],  ["thumb03R",    3, 4],
  ["f_index01R",  5, 6],  ["f_index02R",  6, 7],  ["f_index03R",  7, 8],
  ["f_middle01R", 9,10],  ["f_middle02R",10,11],  ["f_middle03R",11,12],
  ["f_ring01R",  13,14],  ["f_ring02R",  14,15],  ["f_ring03R",  15,16],
  ["f_pinky01R", 17,18],  ["f_pinky02R", 18,19],  ["f_pinky03R", 19,20],
];

// Z se amplifica ×5 porque los valores Z de MediaPipe Hands son ~10x más pequeños que XY
// en video monocular. Sin esta amplificación el cierre de dedos es invisible.
export const FINGER_Z_SCALE = 5.0;

export function mpToThree(lm, wrist) {
  return new THREE.Vector3(
     (lm.x - wrist.x),
    -(lm.y - wrist.y),
    -(lm.z - wrist.z) * FINGER_Z_SCALE,
  );
}

// ── Constraints biomecánicos ─────────────────────────────────────────────────
// Fuente: Lin, Wu & Huang (2000) "Modeling the Constraints of Human Hand Motion",
// IEEE HUMO 2000. Acoplamiento DIP-PIP: Oikonomidis 2011.
export const BIOMECH_CONSTRAINTS_ENABLED = true;
const _D = Math.PI / 180;

const HAND_JOINT_LIMITS = {
  MCP:      { max: 90  * _D },
  PIP:      { max: 110 * _D },
  DIP:      { max: 90  * _D },
  CMC:      { max: 80  * _D },
  TMCP:     { max: 60  * _D },
  THUMB_IP: { max: 80  * _D },
};

export const FINGER_BONE_LIMITS = new Map([
  ['f_index01',  90 * _D], ['f_index02', 110 * _D], ['f_index03',  90 * _D],
  ['f_middle01', 90 * _D], ['f_middle02', 110 * _D], ['f_middle03', 90 * _D],
  ['f_ring01',   90 * _D], ['f_ring02',  110 * _D], ['f_ring03',   90 * _D],
  ['f_pinky01',  90 * _D], ['f_pinky02', 110 * _D], ['f_pinky03',  90 * _D],
  ['thumb01',    80 * _D], ['thumb02',    60 * _D], ['thumb03',    80 * _D],
]);

function _jointBendAngle(lms, ai, bi, ci) {
  const A = lms[ai], B = lms[bi], C = lms[ci];
  const v1x = B.x-A.x, v1y = B.y-A.y, v1z = B.z-A.z;
  const v2x = C.x-B.x, v2y = C.y-B.y, v2z = C.z-B.z;
  const d1 = Math.sqrt(v1x*v1x + v1y*v1y + v1z*v1z);
  const d2 = Math.sqrt(v2x*v2x + v2y*v2y + v2z*v2z);
  if (d1 < 1e-8 || d2 < 1e-8) return 0;
  return Math.acos(THREE.MathUtils.clamp((v1x*v2x + v1y*v2y + v1z*v2z) / (d1*d2), -1, 1));
}

function _clampJointAngle(lms, ai, bi, childStart, childEnd, maxAngle) {
  const angle = _jointBendAngle(lms, ai, bi, childStart);
  if (angle <= maxAngle) return;

  const A = lms[ai], B = lms[bi], C = lms[childStart];
  const v1x = B.x-A.x, v1y = B.y-A.y, v1z = B.z-A.z;
  const v2x = C.x-B.x, v2y = C.y-B.y, v2z = C.z-B.z;

  let ax = v1y*v2z - v1z*v2y;
  let ay = v1z*v2x - v1x*v2z;
  let az = v1x*v2y - v1y*v2x;
  const al = Math.sqrt(ax*ax + ay*ay + az*az);
  if (al < 1e-8) return;
  ax /= al; ay /= al; az /= al;

  const delta = angle - maxAngle;
  const s = Math.sin(-delta), c = Math.cos(-delta);

  for (let i = childStart; i <= childEnd; i++) {
    const p = lms[i];
    const qx = p.x - B.x, qy = p.y - B.y, qz = p.z - B.z;
    const dot = ax*qx + ay*qy + az*qz;
    const crx = ay*qz - az*qy, cry = az*qx - ax*qz, crz = ax*qy - ay*qx;
    lms[i] = {
      x: B.x + qx*c + crx*s + ax*dot*(1-c),
      y: B.y + qy*c + cry*s + ay*dot*(1-c),
      z: B.z + qz*c + crz*s + az*dot*(1-c),
    };
  }
}

export function clampHandLandmarks(lms) {
  if (!BIOMECH_CONSTRAINTS_ENABLED) return lms;
  const out = lms.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
  const L = HAND_JOINT_LIMITS;

  const chains = [
    [0,  5,  6,  7,  8],
    [0,  9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20],
  ];
  for (const [w, mcp, pip, dip, tip] of chains) {
    _clampJointAngle(out, w,   mcp, pip, tip, L.MCP.max);
    _clampJointAngle(out, mcp, pip, dip, tip, L.PIP.max);
    const pipAngle = _jointBendAngle(out, mcp, pip, dip);
    _clampJointAngle(out, pip, dip, tip, tip, Math.min(L.DIP.max, (2/3) * pipAngle));
  }
  _clampJointAngle(out, 0, 1, 2, 4, L.CMC.max);
  _clampJointAngle(out, 1, 2, 3, 4, L.TMCP.max);
  _clampJointAngle(out, 2, 3, 4, 4, L.THUMB_IP.max);

  return out;
}

// ── Spring-damper por hueso ───────────────────────────────────────────────────
// Reemplaza el lerp/slerp fijo por un resorte críticamente amortiguado.
// Cada hueso tiene su propia velocidad angular, lo que produce aceleración
// natural al inicio y asentamiento suave al llegar al target.
//
// Parámetros:
//   stiffness  — qué tan fuerte es el resorte (Hz²·4π²). Más alto = más rápido.
//   damping    — amortiguación. √(stiffness) = crítica (sin rebote).
//                Menor que crítica → rebota. Mayor → más lento sin rebote.
//
// Valores empíricos:
//   dedos  : stiffness=80, damping=18  → converge en ~3 frames a 60fps, leve overshoot
//   muñeca : stiffness=60, damping=15  → un poco más suave que los dedos
//   cuerpo : stiffness=40, damping=12  → brazos y resto del cuerpo
export const SPRING_PARAMS = {
  finger: { stiffness: 80, damping: 18 },
  wrist:  { stiffness: 60, damping: 15 },
  body:   { stiffness: 40, damping: 12 },
};

// Un resorte de quaternion por hueso. Se inicializa lazy en el primer frame.
const _springs = new Map(); // boneName → { vel: Quaternion, params }

export function initSprings() {
  _springs.clear();
}

function _getSpring(boneName, params) {
  if (!_springs.has(boneName)) {
    _springs.set(boneName, { vel: new THREE.Quaternion(0, 0, 0, 0), params });
  }
  return _springs.get(boneName);
}

// Avanza el resorte de quaternion un paso dt hacia targetQ.
// Implementación: spring semi-implícito en espacio de eje-ángulo.
// La velocidad se expresa como quaternion de velocidad angular (eje × velocidad_escalar / 2).
const _axisAngle = new THREE.Vector3();
const _deltaQ    = new THREE.Quaternion();

function _stepSpring(spring, currentQ, targetQ, dt) {
  const { stiffness, damping } = spring.params;

  // Error: quaternion que va de current a target (en espacio local)
  _deltaQ.copy(currentQ).conjugate().multiply(targetQ);
  // Normalizar al hemisferio positivo (camino mínimo)
  if (_deltaQ.w < 0) { _deltaQ.x *= -1; _deltaQ.y *= -1; _deltaQ.z *= -1; _deltaQ.w *= -1; }

  // Convertir a eje-ángulo escalado (≈ log del quaternion para ángulos pequeños)
  _axisAngle.set(_deltaQ.x, _deltaQ.y, _deltaQ.z);
  const sinHalf = _axisAngle.length();
  const angle = sinHalf > 1e-6 ? 2 * Math.atan2(sinHalf, _deltaQ.w) : 0;
  if (sinHalf > 1e-6) _axisAngle.multiplyScalar(angle / sinHalf);
  else _axisAngle.set(0, 0, 0);

  // Velocidad en formato eje-ángulo
  const vx = spring.vel.x, vy = spring.vel.y, vz = spring.vel.z;

  // Aceleración: resorte + amortiguación
  const ax = stiffness * _axisAngle.x - damping * vx;
  const ay = stiffness * _axisAngle.y - damping * vy;
  const az = stiffness * _axisAngle.z - damping * vz;

  // Integración semi-implícita (estable para dt grandes)
  const nvx = vx + ax * dt;
  const nvy = vy + ay * dt;
  const nvz = vz + az * dt;
  spring.vel.set(nvx, nvy, nvz, 0);

  // Aplicar desplazamiento: convertir velocidad × dt a quaternion incremental
  const dx = nvx * dt * 0.5, dy = nvy * dt * 0.5, dz = nvz * dt * 0.5;
  const dLen = Math.sqrt(dx*dx + dy*dy + dz*dz);
  let incQ;
  if (dLen > 1e-8) {
    const s = Math.sin(dLen) / dLen;
    incQ = new THREE.Quaternion(dx * s, dy * s, dz * s, Math.cos(dLen));
  } else {
    incQ = new THREE.Quaternion(dx, dy, dz, 1).normalize();
  }
  return currentQ.clone().multiply(incQ).normalize();
}

// ── Retargeting ───────────────────────────────────────────────────────────────

// Scratch compartido entre rotateBone y applyHandOrientation
const _dQ          = new THREE.Quaternion();
const _tWQ         = new THREE.Quaternion();
const _pWQ         = new THREE.Quaternion();
const _tLQ         = new THREE.Quaternion();
const _dir         = new THREE.Vector3();
const _hUp         = new THREE.Vector3();
const _hIdxV       = new THREE.Vector3();
const _hPnkV       = new THREE.Vector3();
const _hNorm       = new THREE.Vector3();
const _hSide       = new THREE.Vector3();
const _hQ          = new THREE.Quaternion();
const _lateralAxis = new THREE.Vector3();

// dt en segundos. springParams: uno de SPRING_PARAMS.finger/wrist/body.
// Si dt es null/0 se hace snap instantáneo (comportamiento del lerp original).
export function rotateBone(bone, targetDir, springParams = SPRING_PARAMS.body, dt = 0) {
  const restDir    = state.boneRestDir.get(bone.name);
  const restWorldQ = state.boneRestWorldQ.get(bone.name);
  if (!restDir || !restWorldQ) return;

  _dir.copy(targetDir);
  if (_dir.lengthSq() < 1e-6) return;
  _dir.normalize();

  // Quaternion local objetivo
  _dQ.setFromUnitVectors(restDir, _dir);
  _tWQ.multiplyQuaternions(_dQ, restWorldQ);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_pWQ);
    _tLQ.multiplyQuaternions(_pWQ.invert(), _tWQ);
  } else {
    _tLQ.copy(_tWQ);
  }

  if (dt > 0) {
    const spring = _getSpring(bone.name, springParams);
    bone.quaternion.copy(_stepSpring(spring, bone.quaternion, _tLQ, dt));
  } else {
    bone.quaternion.copy(_tLQ);
  }
  bone.updateMatrixWorld(true);
}

// Orienta la muñeca con roll completo (giro alrededor del eje del dedo).
// normalSign: +1 mano izquierda, -1 mano derecha.
export function applyHandOrientation(bone, rawLms, normalSign, dt = 0) {
  const w = rawLms[0];

  _hUp.set(rawLms[9].x - w.x, -(rawLms[9].y - w.y), -(rawLms[9].z - w.z) * FINGER_Z_SCALE);
  if (_hUp.lengthSq() < 1e-8) return;
  _hUp.normalize();
  rotateBone(bone, _hUp, SPRING_PARAMS.wrist, dt);

  _hIdxV.set(rawLms[5].x  - w.x, -(rawLms[5].y  - w.y), -(rawLms[5].z  - w.z) * FINGER_Z_SCALE);
  _hPnkV.set(rawLms[17].x - w.x, -(rawLms[17].y - w.y), -(rawLms[17].z - w.z) * FINGER_Z_SCALE);
  _hNorm.crossVectors(_hIdxV, _hPnkV).multiplyScalar(normalSign);
  if (_hNorm.lengthSq() < 1e-8) return;
  _hNorm.normalize();
  _hNorm.addScaledVector(_hUp, -_hNorm.dot(_hUp)).normalize();
  if (_hNorm.lengthSq() < 1e-8) return;

  bone.getWorldQuaternion(_hQ);

  _hSide.set(0, 0, 1).applyQuaternion(_hQ);
  _hSide.addScaledVector(_hUp, -_hSide.dot(_hUp)).normalize();
  if (_hSide.lengthSq() < 1e-8) return;

  _dQ.setFromUnitVectors(_hSide, _hNorm);
  _tWQ.multiplyQuaternions(_dQ, _hQ);

  if (bone.parent) {
    bone.parent.getWorldQuaternion(_pWQ);
    _tLQ.multiplyQuaternions(_pWQ.invert(), _tWQ);
  } else {
    _tLQ.copy(_tWQ);
  }

  if (dt > 0) {
    const spring = _getSpring(bone.name + "_roll", SPRING_PARAMS.wrist);
    bone.quaternion.copy(_stepSpring(spring, bone.quaternion, _tLQ, dt));
  } else {
    bone.quaternion.copy(_tLQ);
  }
  bone.updateMatrixWorld(true);

  if (bone.name === "DEF-handL") state.palmNormalL.copy(_hNorm);
  else                           state.palmNormalR.copy(_hNorm);
}

// Factor de pinza [0=cerrada, 1=abierta] normalizado por el tamaño de la palma.
const PINCH_OPEN_RATIO = 0.30;
function _pinchFactor(lms) {
  const px = lms[9].x - lms[0].x, py = lms[9].y - lms[0].y;
  const palmSz = Math.sqrt(px * px + py * py);
  if (palmSz < 1e-6) return 1;
  const dx = lms[4].x - lms[8].x, dy = lms[4].y - lms[8].y;
  return THREE.MathUtils.clamp(Math.sqrt(dx * dx + dy * dy) / palmSz / PINCH_OPEN_RATIO, 0, 1);
}

// ── Pipeline de animación de dedos ───────────────────────────────────────────
// Punto de entrada central para animar muñecas y dedos a partir de handsMap
// (landmarks ya filtrados, congelados y con constraints aplicados).
// Para modificar la naturaleza del movimiento (spring, delay, ruido), editar aquí.
export function applyFingers(handsMap, dt = 0) {
  const bHL = state.bones.get("DEF-handL");
  const bHR = state.bones.get("DEF-handR");
  if (bHL && handsMap["Left"])  applyHandOrientation(bHL, handsMap["Left"],   1, dt);
  if (bHR && handsMap["Right"]) applyHandOrientation(bHR, handsMap["Right"], -1, dt);

  const pinchL = handsMap["Left"]  ? _pinchFactor(handsMap["Left"])  : 1;
  const pinchR = handsMap["Right"] ? _pinchFactor(handsMap["Right"]) : 1;

  for (const [boneName, lmStart, lmEnd] of BONE_MAP) {
    const bone = state.bones.get(boneName);
    if (!bone) continue;

    const side    = boneName.endsWith("L") ? "Left" : "Right";
    const rawLms  = handsMap[side];
    if (!rawLms) continue;

    const palmNorm = side === "Left" ? state.palmNormalL : state.palmNormalR;
    const wrist    = rawLms[0];
    const dir = mpToThree(rawLms[lmEnd], wrist).sub(mpToThree(rawLms[lmStart], wrist));

    // Proyectar sobre el plano sagital del dedo (elimina ruido de abducción lateral).
    // El pulgar se excluye: su eje CMC es oblicuo al plano de palma.
    // El índice se excluye proporcionalmente cuando está en pinza (movimiento real).
    const restDir = state.boneRestDir.get(boneName);
    if (!boneName.startsWith("thumb") && restDir && palmNorm.lengthSq() > 1e-8) {
      _lateralAxis.crossVectors(restDir, palmNorm);
      if (_lateralAxis.lengthSq() > 1e-8) {
        _lateralAxis.normalize();
        const pinch = side === "Left" ? pinchL : pinchR;
        const suppressScale = boneName.startsWith("f_index") ? pinch : 1;
        dir.addScaledVector(_lateralAxis, -dir.dot(_lateralAxis) * suppressScale);
      }
    }

    // Clamp de rotación articular en espacio 3D del hueso (post-proyección).
    if (BIOMECH_CONSTRAINTS_ENABLED && restDir && dir.lengthSq() > 1e-8) {
      const limit = FINGER_BONE_LIMITS.get(boneName.slice(0, -1));
      if (limit !== undefined) {
        dir.divideScalar(dir.length());
        const cosLimit = Math.cos(limit);
        const cosA = THREE.MathUtils.clamp(dir.dot(restDir), -1, 1);
        if (cosA < cosLimit) {
          const px = dir.x - cosA * restDir.x;
          const py = dir.y - cosA * restDir.y;
          const pz = dir.z - cosA * restDir.z;
          const pLen = Math.sqrt(px*px + py*py + pz*pz);
          if (pLen > 1e-8) {
            const sinL = Math.sin(limit), sc = sinL / pLen;
            dir.set(
              cosLimit * restDir.x + px * sc,
              cosLimit * restDir.y + py * sc,
              cosLimit * restDir.z + pz * sc,
            );
          }
        }
      }
    }

    rotateBone(bone, dir, SPRING_PARAMS.finger, dt);
  }
}
