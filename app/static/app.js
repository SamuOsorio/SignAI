import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ── Mapeo landmarks MediaPipe → huesos AutoRigPro ────────────────────────────
// [nombre_hueso, idx_landmark_inicio, idx_landmark_fin]
// Convención AutoRigPro: thumb1/2/3, index1/2/3, middle1/2/3, ring1/2/3, pinky1/2/3
// NOTA: Three.js elimina los puntos de los nombres (arm_stretch.l → arm_stretchl)
// [nombre_hueso, idx_lm_inicio, idx_lm_fin]
// index1_base / middle1_base / ring1_base / pinky1_base = metacarpianos de ARP.
// Sus pesos fueron transferidos a hand.l/r en Blender, pero animarlos aquí hace
// que los nudillos acompañen la dirección de cada dedo (palma más expresiva).
// El vector wrist→lm5 orienta el metacarpiano del índice, etc.
const BONE_MAP = [
  // Metacarpianos (dirección palma → nudillo)
  ["index1_basel",  0, 5],  ["middle1_basel",  0, 9],
  ["ring1_basel",   0,13],  ["pinky1_basel",   0,17],
  ["index1_baser",  0, 5],  ["middle1_baser",  0, 9],
  ["ring1_baser",   0,13],  ["pinky1_baser",   0,17],
  // Falanges izquierda
  ["thumb1l",  1, 2],  ["thumb2l",  2, 3],  ["thumb3l",  3, 4],
  ["index1l",  5, 6],  ["index2l",  6, 7],  ["index3l",  7, 8],
  ["middle1l", 9,10],  ["middle2l",10,11],  ["middle3l",11,12],
  ["ring1l",  13,14],  ["ring2l",  14,15],  ["ring3l",  15,16],
  ["pinky1l", 17,18],  ["pinky2l", 18,19],  ["pinky3l", 19,20],
  // Falanges derecha
  ["thumb1r",  1, 2],  ["thumb2r",  2, 3],  ["thumb3r",  3, 4],
  ["index1r",  5, 6],  ["index2r",  6, 7],  ["index3r",  7, 8],
  ["middle1r", 9,10],  ["middle2r",10,11],  ["middle3r",11,12],
  ["ring1r",  13,14],  ["ring2r",  14,15],  ["ring3r",  15,16],
  ["pinky1r", 17,18],  ["pinky2r", 18,19],  ["pinky3r", 19,20],
];

// Índices de landmarks MediaPipe Pose relevantes para cada brazo
// 11=hombro_izq, 12=hombro_der, 13=codo_izq, 14=codo_der
// 15=muñeca_izq, 16=muñeca_der, 19=índice_izq, 20=índice_der

// LSC50: coordenadas normalizadas de imagen (x,y en 0-1, z relativo muy pequeño).
// Dirección entre dos landmarks → convertida a ejes Three.js:
//   imagen-x → +X  |  imagen-y (0=arriba) → -Y  |  imagen-z → -Z
function lmDir(a, b) {
  return new THREE.Vector3(b.x - a.x, -(b.y - a.y), -(b.z - a.z));
}

// Para dedos: resta la muñeca antes de calcular la dirección.
// Z se suprime (×0) porque los valores de profundidad de MediaPipe Hands son ruidosos
// en video monocular frontal y causan torsiones laterales en las falanges.
function mpToThree(lm, wrist) {
  return new THREE.Vector3(
     (lm.x - wrist.x),
    -(lm.y - wrist.y),
    0,
  );
}

// ── Estado global ─────────────────────────────────────────────────────────────
const state = {
  bones:         new Map(),   // name → THREE.Bone
  boneRestLocalQ: new Map(),  // name → Quaternion local en rest (para resetPose)
  boneRestWorldQ: new Map(),  // name → Quaternion world en rest (para retargeting)
  boneRestDir:   new Map(),   // name → Vector3 dirección Y en world en rest
  frames: [],
  fps: 30,
  frameIdx: 0,
  playing: false,
  lastTime: null,
  animHandle: null,
  // Fracción [0,1] que avanza hacia el quaternion objetivo cada tick de rAF.
  // 0.12 ≈ convergencia en ~6 frames a 60fps (~100ms), buen balance suavidad/lag.
  smoothAlpha: 0.12,
  // Normal de palma por mano, actualizada cada frame en applyHandOrientation.
  // Usada por el loop de dedos para proyectar direcciones sobre el plano de la palma.
  palmNormalL: new THREE.Vector3(0, 0, 1),
  palmNormalR: new THREE.Vector3(0, 0, 1),
  // Posiciones world de hombros y longitudes de segmentos de brazo en rest pose.
  // Se calcula una vez al cargar el GLB y se usa para el IK de brazos.
  armRest: {
    shoulderL: new THREE.Vector3(), shoulderR: new THREE.Vector3(),
    L_upperL: 0, L_foreL: 0,
    L_upperR: 0, L_foreR: 0,
  },
};

// ── Three.js setup ────────────────────────────────────────────────────────────
const canvas   = document.getElementById("avatar-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f1a);
scene.fog = new THREE.Fog(0x0d0f1a, 8, 20);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 1.2, 2.8);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
camera.lookAt(controls.target);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(2, 4, 3);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8090ff, 0.4);
fill.position.set(-2, 2, -2);
scene.add(fill);
scene.add(new THREE.GridHelper(4, 8, 0x1e2130, 0x1e2130));

function resizeRenderer() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
function renderLoop() {
  requestAnimationFrame(renderLoop);
  resizeRenderer();
  controls.update();
  renderer.render(scene, camera);
}
renderLoop();

// ── Carga del avatar GLB ──────────────────────────────────────────────────────
setStatus("Cargando avatar.glb...", "");
new GLTFLoader().load("/avatar.glb", (gltf) => {
  // Ocultar (no eliminar) WGT- y metarig — son helpers de Blender, no malla
  gltf.scene.traverse(obj => {
    if (obj.name.startsWith("WGT-") || obj.name === "metarig") obj.visible = false;
  });

  scene.add(gltf.scene);

  // Recalcular normales suaves en todas las mallas para eliminar costuras duras
  // (split normals del GLB causan líneas negras en cuello, hombros, cintura, antebrazos)
  gltf.scene.traverse(obj => {
    if (obj.isMesh && obj.geometry) {
      obj.geometry.computeVertexNormals();
    }
  });

  // Centrar y escalar usando SOLO la geometría de las mallas visibles
  const meshBox = new THREE.Box3();
  gltf.scene.traverse(obj => { if (obj.isMesh && obj.visible) meshBox.expandByObject(obj); });
  if (!meshBox.isEmpty()) {
    const h = meshBox.getSize(new THREE.Vector3()).y;
    const s = 1.7 / h;
    gltf.scene.scale.setScalar(s);
    const c = meshBox.getCenter(new THREE.Vector3());
    gltf.scene.position.set(-c.x * s, -meshBox.min.y * s, -c.z * s);
  }

  // Forzar actualización de matrices del mundo
  gltf.scene.updateWorldMatrix(true, true);

  // Helper: registrar un objeto bone en el state
  function registerBone(obj) {
    if (state.bones.has(obj.name)) return;
    state.bones.set(obj.name, obj);
    state.boneRestLocalQ.set(obj.name, obj.quaternion.clone());
    const wq = new THREE.Quaternion();
    obj.getWorldQuaternion(wq);
    state.boneRestWorldQ.set(obj.name, wq.clone());
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(wq).normalize();
    state.boneRestDir.set(obj.name, dir);
  }

  // Método 1: traverse estándar (funciona en la mayoría de modelos Rigify/Mixamo)
  gltf.scene.traverse(obj => {
    if (obj.isBone) registerBone(obj);
  });

  // Método 2: fallback via SkinnedMesh.skeleton.bones
  // (necesario para AutoRigPro y otros rigs donde isBone puede ser false)
  gltf.scene.traverse(obj => {
    if (obj.isSkinnedMesh && obj.skeleton) {
      for (const bone of obj.skeleton.bones) registerBone(bone);
    }
  });

  console.log("[SignAI] Bones encontrados:", state.bones.size);
  console.log("[SignAI] Bone names:\n" + [...state.bones.keys()].sort().join("\n"));

  const fingerBones = [...state.bones.keys()].filter(n =>
    /^(thumb|index|middle|ring|pinky)\d+[lr]$/.test(n));
  const nDEF = fingerBones.length;
  console.log("[SignAI] Finger bones:", nDEF, fingerBones);

  // Medir rest pose de los brazos para el solver IK
  measureArmRest();
  console.log("[SignAI] armRest:", JSON.stringify({
    L_upperL: state.armRest.L_upperL, L_foreL: state.armRest.L_foreL,
    L_upperR: state.armRest.L_upperR, L_foreR: state.armRest.L_foreR,
  }));

  window._signAI = state;

  setStatus(`Avatar listo — ${state.bones.size} huesos (${nDEF} dedos)`, "ok");
  document.getElementById("avatar-meta").textContent = `${state.bones.size} huesos · ${nDEF} dedos`;

}, (xhr) => {
  setStatus(`Cargando avatar... ${Math.round(xhr.loaded / xhr.total * 100)}%`, "");
}, (err) => {
  setStatus("Error cargando avatar.glb", "err");
  console.error(err);
});

// ── IK de brazos ─────────────────────────────────────────────────────────────

// Captura posiciones y longitudes de los brazos desde la rest pose del GLB.
function measureArmRest() {
  const g  = state.armRest;
  const bSL = state.bones.get("arm_stretchl"), bEL = state.bones.get("forearm_stretchl"), bWL = state.bones.get("handl");
  const bSR = state.bones.get("arm_stretchr"), bER = state.bones.get("forearm_stretchr"), bWR = state.bones.get("handr");
  if (!bSL || !bEL || !bWL || !bSR || !bER || !bWR) return;
  const eL = new THREE.Vector3(), wL = new THREE.Vector3();
  const eR = new THREE.Vector3(), wR = new THREE.Vector3();
  bSL.getWorldPosition(g.shoulderL); bEL.getWorldPosition(eL); bWL.getWorldPosition(wL);
  bSR.getWorldPosition(g.shoulderR); bER.getWorldPosition(eR); bWR.getWorldPosition(wR);
  g.L_upperL = g.shoulderL.distanceTo(eL); g.L_foreL = eL.distanceTo(wL);
  g.L_upperR = g.shoulderR.distanceTo(eR); g.L_foreR = eR.distanceTo(wR);
}

// Convierte posición de landmark relativa a lmRef → posición world relativa a worldRef.
// La conversión de ejes sigue la misma convención que lmDir / mpToThree.
const _ikWrist = new THREE.Vector3();
const _ikEHint = new THREE.Vector3();
const _ikElbow = new THREE.Vector3();
const _ikTT    = new THREE.Vector3(); // toTarget (scratch IK)
const _ikPole  = new THREE.Vector3();

function lmWorldOffset(lm, lmRef, scale, worldRef, out) {
  // Análisis de datos reales (sign 0005, frame 20 — manos juntas):
  //   Pose wrist z relativo a hombro ≈ -0.40. Con Z_SCALE=0.40 y scale≈3 → 0.48 u forward.
  //   Pero el brazo mide solo 0.507 u → casi todo el alcance se va en z, las manos
  //   no pueden llegar al centro del cuerpo en x,y. Reducir a 0.15 libera ~0.47 u de
  //   alcance en x,y manteniendo presencia 3D para señas con manos hacia la cámara.
  const Z_SCALE = 0.15;
  return out.set(
    (lm.x - lmRef.x) * scale,
    -(lm.y - lmRef.y) * scale,
    -(lm.z - lmRef.z) * scale * Z_SCALE,
  ).add(worldRef);
}

// Escala para convertir landmark coords (imagen normalizada) → unidades world del avatar.
// Ancla: separación hombro-hombro, estable entre frames.
function bodyScale(body) {
  const a = body[11], b = body[12];
  const lmSep = Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
  if (lmSep < 1e-6) return 1;
  return state.armRest.shoulderL.distanceTo(state.armRest.shoulderR) / lmSep;
}

// Solver analítico de IK de 2 huesos (ley de cosenos).
// Resultado: _ikElbow ← posición world del codo.
// 'pole' es modificado in-place como vector auxiliar.
function solveIKElbow(shoulder, target, pole, L1, L2) {
  _ikTT.subVectors(target, shoulder);
  const D = Math.min(_ikTT.length(), L1 + L2 - 1e-4);
  _ikTT.normalize();

  const cosA = THREE.MathUtils.clamp((L1*L1 + D*D - L2*L2) / (2*L1*D), -1, 1);
  const sinA  = Math.sqrt(1 - cosA*cosA);

  // Componente de 'pole' perpendicular a la dirección shoulder→target
  pole.addScaledVector(_ikTT, -pole.dot(_ikTT));
  if (pole.lengthSq() < 1e-8) {
    // Pole paralelo al target: usar perpendicular arbitraria
    pole.set(0, 1, 0).addScaledVector(_ikTT, -_ikTT.y).normalize();
  } else {
    pole.normalize();
  }

  _ikElbow.copy(shoulder)
    .addScaledVector(_ikTT, cosA * L1)
    .addScaledVector(pole, sinA * L1);
}

// Scratch para IK de contacto
const _ikContactMid = new THREE.Vector3();
const _ikWristL     = new THREE.Vector3();
const _ikWristR     = new THREE.Vector3();

// Factor de fusión durante CONTACT: 0 = sin efecto, 1 = ambas muñecas al midpoint exacto.
// 0.8 lleva las muñecas al 80% del camino hacia el punto medio → manos casi juntas.
const CONTACT_BLEND = 0.8;

function applyArmIK(body, handsArr, frameState) {
  if (!state.armRest.L_upperL) return; // measureArmRest aún no corrió
  const scale = bodyScale(body);
  const g = state.armRest;

  // Calcular targets base de muñeca (relativo a su propio hombro — comportamiento natural)
  lmWorldOffset(body[15], body[11], scale, g.shoulderL, _ikWristL);
  lmWorldOffset(body[16], body[12], scale, g.shoulderR, _ikWristR);

  // ── CONTACT: fundir ambas muñecas hacia su punto medio ────────────────────
  // En señas de contacto, las muñecas están a ~0.32 u de separación aún cuando las
  // palmas se tocan. Aquí las acercamos explícitamente al midpoint cuando el corrector
  // detecta CONTACT, de modo que las manos se "junten" visualmente en el avatar.
  if (frameState === 'CONTACT') {
    _ikContactMid.addVectors(_ikWristL, _ikWristR).multiplyScalar(0.5);
    _ikWristL.lerp(_ikContactMid, CONTACT_BLEND);
    _ikWristR.lerp(_ikContactMid, CONTACT_BLEND);
  }

  _applyOneArm(body, 11, 13, _ikWristL,
    "arm_stretchl", null, "forearm_stretchl", null,
    g.shoulderL, g.L_upperL, g.L_foreL, scale);

  _applyOneArm(body, 12, 14, _ikWristR,
    "arm_stretchr", null, "forearm_stretchr", null,
    g.shoulderR, g.L_upperR, g.L_foreR, scale);
}

function _applyOneArm(body, iS, iE, wristTarget,
    nUA, nUA1, nFA, nFA1, shoulderWorld, L1, L2, scale) {
  if (L1 < 1e-6 || L2 < 1e-6) return;

  // El target de la muñeca ya viene calculado (y posiblemente ajustado por CONTACT).
  // El codo se calcula relativo al hombro propio (solo sirve de dirección para el polo).
  _ikWrist.copy(wristTarget);
  lmWorldOffset(body[iE], body[iS], scale, shoulderWorld, _ikEHint);

  // Vector de polo = dirección del codo desde el hombro.
  // Problema: cuando la mano está por encima del hombro, el vector codo→hombro
  // y el vector hombro→muñeca son casi paralelos → después de proyectar, el polo
  // residual es ≈0 y el solver pone el codo en dirección arbitraria.
  // Fix: añadir un componente descendente fuerte para que el codo siempre cuelgue
  // por debajo de la línea hombro-muñeca (posición anatómica en LSC),
  // más un pequeño bias frontal para compensar la subestimación de z normalizado.
  _ikPole.subVectors(_ikEHint, shoulderWorld);
  _ikPole.y -= (L1 + L2) * 0.35; // codo hacia abajo (anatómico)
  _ikPole.z += (L1 + L2) * 0.10; // leve bias frontal

  solveIKElbow(shoulderWorld, _ikWrist, _ikPole, L1, L2);
  // _ikElbow ← posición del codo resuelto por IK

  const dirUA = _ikTT.subVectors(_ikElbow, shoulderWorld);
  const dirFA = _ikEHint.subVectors(_ikWrist, _ikElbow); // reutilizar _ikEHint

  const bUA  = state.bones.get(nUA),  bUA1 = state.bones.get(nUA1);
  const bFA  = state.bones.get(nFA),  bFA1 = state.bones.get(nFA1);

  if (bUA)  rotateBone(bUA,  dirUA);
  if (bUA1) rotateBone(bUA1, dirUA);
  if (bFA)  rotateBone(bFA,  dirFA);
  if (bFA1) rotateBone(bFA1, dirFA);
  // La orientación de DEF-handL/R (incluye roll de muñeca) se aplica en applyFrame
  // usando applyHandOrientation con los landmarks completos de la mano.
}

// ── Retargeting ───────────────────────────────────────────────────────────────

// Aplica la rotación de un hueso para que apunte de lmA → lmB
const _dQ      = new THREE.Quaternion();
const _tWQ     = new THREE.Quaternion();
const _pWQ     = new THREE.Quaternion();
const _tLQ     = new THREE.Quaternion();
const _dir     = new THREE.Vector3();
const _xAxis   = new THREE.Vector3(1, 0, 0);
const _faceDir = new THREE.Vector3();

// Scratch para orientación completa de la muñeca (incluye roll)
const _hUp   = new THREE.Vector3();
const _hIdxV = new THREE.Vector3();
const _hPnkV = new THREE.Vector3();
const _hNorm = new THREE.Vector3();
const _hSide = new THREE.Vector3();
const _hMat  = new THREE.Matrix4();
const _hQ    = new THREE.Quaternion();

function rotateBone(bone, targetDir, alpha = state.smoothAlpha) {
  const restDir    = state.boneRestDir.get(bone.name);
  const restWorldQ = state.boneRestWorldQ.get(bone.name);
  if (!restDir || !restWorldQ) return;

  _dir.copy(targetDir);
  if (_dir.lengthSq() < 1e-6) return;
  _dir.normalize();

  _dQ.setFromUnitVectors(restDir, _dir);
  _tWQ.multiplyQuaternions(_dQ, restWorldQ);

  if (bone.parent) {
    bone.parent.getWorldQuaternion(_pWQ);
    _tLQ.multiplyQuaternions(_pWQ.invert(), _tWQ);
  } else {
    _tLQ.copy(_tWQ);
  }
  bone.quaternion.slerp(_tLQ, alpha);
  bone.updateMatrixWorld(true);
}

// Orienta la muñeca con roll completo (giro alrededor del eje del dedo).
//
// Dos pasos:
//   1. rotateBone alinea el eje Y del hueso al dedo medio (como siempre, con slerp).
//   2. Se calcula la normal de la palma desde los landmarks y se hace girar
//      el hueso alrededor del eje Y hasta que su eje Z local coincida con esa normal.
//      Esto captura el roll (palma arriba/abajo/hacia cámara/etc.).
//
// normalSign: +1 si cross(idx,pnk) apunta hacia la palma en world-space (mano izquierda),
//             -1 si apunta en sentido contrario (mano derecha — los dedos aparecen
//             en orden inverso en la imagen porque la mano está espejada).
function applyHandOrientation(bone, rawLms, normalSign) {
  const w = rawLms[0];

  // ── Paso 1: alinear eje Y del hueso al dedo medio ───────────────────────
  _hUp.set(rawLms[9].x - w.x, -(rawLms[9].y - w.y), -(rawLms[9].z - w.z));
  if (_hUp.lengthSq() < 1e-8) return;
  _hUp.normalize();
  rotateBone(bone, _hUp); // slerp incluido

  // ── Paso 2: roll — girar el hueso para que su Z apunte a la normal de palma ──
  _hIdxV.set(rawLms[5].x  - w.x, -(rawLms[5].y  - w.y), -(rawLms[5].z  - w.z));
  _hPnkV.set(rawLms[17].x - w.x, -(rawLms[17].y - w.y), -(rawLms[17].z - w.z));
  _hNorm.crossVectors(_hIdxV, _hPnkV).multiplyScalar(normalSign);
  if (_hNorm.lengthSq() < 1e-8) return;
  _hNorm.normalize();
  // Proyectar la normal para que sea perpendicular al eje Y (dedo)
  _hNorm.addScaledVector(_hUp, -_hNorm.dot(_hUp)).normalize();
  if (_hNorm.lengthSq() < 1e-8) return;

  // Quaternion world actual del hueso (post paso 1)
  bone.getWorldQuaternion(_hQ);

  // Eje Z actual del hueso en world space, proyectado ⊥ al eje Y
  _hSide.set(0, 0, 1).applyQuaternion(_hQ);
  _hSide.addScaledVector(_hUp, -_hSide.dot(_hUp)).normalize();
  if (_hSide.lengthSq() < 1e-8) return;

  // Delta de roll: rotar el Z actual hacia la normal objetivo
  _dQ.setFromUnitVectors(_hSide, _hNorm);

  // Nuevo quaternion world = roll_delta * current_world_Q
  _tWQ.multiplyQuaternions(_dQ, _hQ);

  // Convertir a local respecto al padre
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_pWQ);
    _tLQ.multiplyQuaternions(_pWQ.invert(), _tWQ);
  } else {
    _tLQ.copy(_tWQ);
  }
  bone.quaternion.slerp(_tLQ, state.smoothAlpha); // roll suavizado igual que Y
  bone.updateMatrixWorld(true);

  // Guardar normal de palma para que el loop de dedos proyecte sobre este plano
  if (bone.name === "handl") state.palmNormalL.copy(_hNorm);
  else                           state.palmNormalR.copy(_hNorm);
}

// ── Animación facial ─────────────────────────────────────────────────────────
// face = dict {lm_index_str: {x,y,z}} con los landmarks clave de FaceMesh 468.
// Mapeo:
//   lm13/14   → apertura de boca  → DEF-jaw_master (rotación X)
//   lm107/336 → altura de cejas   → DEF-browTL / DEF-browTR (rotación X)
// Referencia: IOD (distancia interocular lm159.x↔lm386.x) normaliza las medidas.
const FACE_REF_BROW   = 0.47; // browHt / IOD en neutro (mediana empírica LSC50)
const FACE_BROW_SCALE = 6.0;  // factor browHt-delta → radianes (duplicado para mayor visibilidad)
const FACE_JAW_MAX    = 1.2;  // radianes máx apertura mandíbula (~70°)
const FACE_LIP_SCALE  = 4.0;  // factor corner-delta / mouthW → radianes
const FACE_LIP_MAX    = 0.5;  // radianes máx comisura

// Los huesos faciales usan alpha=1 (snap instantáneo) para no quedarse rezagados
// con respecto al slider de suavizado — el suavizado es para las extremidades.
const FACE_ALPHA = 1.0;

function applyFace(face) {
  // ─── Mandíbula (boca abierta) ───────────────────────────────────────────
  const lipT = face["13"], lipB = face["14"];
  const cL   = face["78"], cR   = face["308"];
  if (lipT && lipB && cL && cR) {
    const mouthW  = Math.abs(cR.x - cL.x);
    const jawFactor = mouthW > 1e-4
      ? THREE.MathUtils.clamp((lipB.y - lipT.y) / mouthW, 0, 0.6)
      : 0;
    const bJaw = state.bones.get("DEF-jaw_master");
    if (bJaw) {
      const rd = state.boneRestDir.get("DEF-jaw_master");
      if (rd) {
        _faceDir.copy(rd).applyAxisAngle(_xAxis, jawFactor * FACE_JAW_MAX);
        rotateBone(bJaw, _faceDir, FACE_ALPHA);
      }
    }
  }

  // ─── Cejas ──────────────────────────────────────────────────────────────
  const lidTL = face["159"], lidTR = face["386"];
  const browL  = face["107"], browR  = face["336"];
  if (lidTL && lidTR && browL && browR) {
    const iod = Math.abs(lidTR.x - lidTL.x);
    if (iod > 0.01) {
      const browHtL = (lidTL.y - browL.y) / iod;
      const browHtR = (lidTR.y - browR.y) / iod;
      const raiseL  = THREE.MathUtils.clamp((browHtL - FACE_REF_BROW) * FACE_BROW_SCALE, -0.6, 0.6);
      const raiseR  = THREE.MathUtils.clamp((browHtR - FACE_REF_BROW) * FACE_BROW_SCALE, -0.6, 0.6);

      const bBL = state.bones.get("DEF-browTL");
      if (bBL) {
        const rd = state.boneRestDir.get("DEF-browTL");
        if (rd) { _faceDir.copy(rd).applyAxisAngle(_xAxis, -raiseL); rotateBone(bBL, _faceDir, FACE_ALPHA); }
      }
      const bBR = state.bones.get("DEF-browTR");
      if (bBR) {
        const rd = state.boneRestDir.get("DEF-browTR");
        if (rd) { _faceDir.copy(rd).applyAxisAngle(_xAxis, -raiseR); rotateBone(bBR, _faceDir, FACE_ALPHA); }
      }
    }
  }

  // ─── Comisuras de boca (labios) ─────────────────────────────────────────
  // cL (lm78) y cR (lm308) ya declarados; mouthCY = centro vertical de la boca.
  // En MediaPipe y aumenta hacia abajo: si cL.y < mouthCY → comisura sube → sonrisa.
  if (lipT && lipB && cL && cR) {
    const mouthW  = Math.abs(cR.x - cL.x);
    if (mouthW > 1e-4) {
      const mouthCY = (lipT.y + lipB.y) * 0.5;
      const raiseL  = THREE.MathUtils.clamp((mouthCY - cL.y) / mouthW * FACE_LIP_SCALE, -FACE_LIP_MAX, FACE_LIP_MAX);
      const raiseR  = THREE.MathUtils.clamp((mouthCY - cR.y) / mouthW * FACE_LIP_SCALE, -FACE_LIP_MAX, FACE_LIP_MAX);

      const bLL = state.bones.get("DEF-lipTL");
      if (bLL) {
        const rd = state.boneRestDir.get("DEF-lipTL");
        if (rd) { _faceDir.copy(rd).applyAxisAngle(_xAxis, -raiseL); rotateBone(bLL, _faceDir, FACE_ALPHA); }
      }
      const bLR = state.bones.get("DEF-lipTR");
      if (bLR) {
        const rd = state.boneRestDir.get("DEF-lipTR");
        if (rd) { _faceDir.copy(rd).applyAxisAngle(_xAxis, -raiseR); rotateBone(bLR, _faceDir, FACE_ALPHA); }
      }
    }
  }
}

function applyFrame(frameData) {
  // ── Brazos: IK de 2 huesos hacia la posición real de la muñeca ───────────
  if (frameData.body) {
    applyArmIK(frameData.body, frameData.hands, frameData._corrector_state ?? 'NORMAL');
  }
  // ── Cara: mandíbula y cejas ───────────────────────────────────────────────
  if (frameData.face) {
    applyFace(frameData.face);
  }

  // ── Muñecas y dedos: hand landmarks ──────────────────────────────────────
  if (!frameData.hands?.length) return;
  const handsMap = {};
  for (const h of frameData.hands) handsMap[h.hand] = h.landmarks;

  // Orientación completa de la muñeca (incluye roll) antes de animar dedos
  const bHL = state.bones.get("handl");
  const bHR = state.bones.get("handr");
  // normalSign +1 para mano izquierda (cross(idx,pnk) apunta hacia la palma),
  // -1 para mano derecha (los dedos aparecen en orden inverso → normal al revés).
  if (bHL && handsMap["Left"])  applyHandOrientation(bHL, handsMap["Left"],   1);
  if (bHR && handsMap["Right"]) applyHandOrientation(bHR, handsMap["Right"], -1);

  for (const [boneName, lmStart, lmEnd] of BONE_MAP) {
    const bone = state.bones.get(boneName);
    if (!bone) continue;

    const side      = boneName.endsWith("l") ? "Left" : "Right";
    const rawLms    = handsMap[side];
    if (!rawLms) continue;

    const palmNorm  = side === "Left" ? state.palmNormalL : state.palmNormalR;
    const wrist     = rawLms[0];
    const dir = mpToThree(rawLms[lmEnd], wrist).sub(mpToThree(rawLms[lmStart], wrist));

    // Proyectar sobre el plano de la palma: elimina la componente perpendicular
    // a la palma que en video monocular es ruido puro.
    dir.addScaledVector(palmNorm, -dir.dot(palmNorm));

    rotateBone(bone, dir);
  }
}

// Restaura la rest pose usando los quaterniones locales guardados al cargar
function resetPose() {
  state.bones.forEach((bone, name) => {
    const restQ = state.boneRestLocalQ.get(name);
    if (restQ) bone.quaternion.copy(restQ);
    bone.updateMatrixWorld(true);
  });
}

// ── Animación sincronizada con video ─────────────────────────────────────────
const video = document.getElementById("video");

function animTick(now) {
  if (!state.playing) return;
  state.animHandle = requestAnimationFrame(animTick);
  if (state.lastTime === null) { state.lastTime = now; return; }

  state.frameIdx += (now - state.lastTime) / 1000 * state.fps;
  state.lastTime  = now;

  const idx = Math.floor(state.frameIdx);
  if (idx >= state.frames.length) {
    state.frameIdx = 0;
    state.lastTime = null;
    video.currentTime = 0;
    return;
  }
  applyFrame(state.frames[idx]);
}

function startAnim() {
  if (state.playing) return;
  state.playing = true;
  state.lastTime = null;
  video.play();
  state.animHandle = requestAnimationFrame(animTick);
  document.getElementById("btn-play").textContent = "⏸ Pausar";
}

function pauseAnim() {
  state.playing = false;
  video.pause();
  if (state.animHandle) cancelAnimationFrame(state.animHandle);
  document.getElementById("btn-play").textContent = "▶ Reproducir";
}

function resetAnim() {
  pauseAnim();
  state.frameIdx = 0;
  video.currentTime = 0;
  resetPose();
}

document.getElementById("btn-play").addEventListener("click", () =>
  state.playing ? pauseAnim() : startAnim());
document.getElementById("btn-reset").addEventListener("click", resetAnim);

// ── Carga de señas ────────────────────────────────────────────────────────────
async function loadSign(signId) {
  resetAnim();
  setStatus("Cargando landmarks...", "");
  try {
    const data = await fetch(`/api/landmarks/${signId}`).then(r => r.json());
    state.frames   = data.frames ?? [];
    state.fps      = data.fps ?? 30;
    state.frameIdx = 0;

    const rate = Math.round((data.detection_rate ?? 0) * 100);
    document.getElementById("avatar-meta").innerHTML =
      `${data.total_frames} frames · <span class="badge ${rate >= 95 ? 'green' : 'yellow'}">${rate}% detección</span>`;

    video.src = `/api/video/${signId}`;
    video.load();
    const [s, r, a] = signId.split("_");
    document.getElementById("video-meta").textContent = `seña ${s} · rep ${r} · ángulo ${a}`;
    setStatus(`Seña ${signId} lista — presiona Reproducir`, "ok");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "err");
  }
}

// ── Selector de señas ─────────────────────────────────────────────────────────
const select = document.getElementById("sign-select");

fetch("/api/signs").then(r => r.json()).then(signs => {
  const bySign = {};
  for (const s of signs) {
    const n = parseInt(s.sign);
    (bySign[n] ??= []).push(s);
  }
  for (const n of Object.keys(bySign).sort((a, b) => a - b)) {
    const g = document.createElement("optgroup");
    g.label = `Seña ${n}`;
    for (const s of bySign[n]) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = `Rep ${parseInt(s.rep)} · Ángulo ${parseInt(s.angle)}`;
      g.appendChild(o);
    }
    select.appendChild(g);
  }
  if (signs.length) loadSign(signs[0].id);
  setStatus(`${signs.length} videos LSC50 disponibles`, "ok");
}).catch(() => setStatus("Error al obtener señas", "err"));

select.addEventListener("change", () => { if (select.value) loadSign(select.value); });


// ── Utilidad ──────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className   = `status ${type ?? ""}`;
}
