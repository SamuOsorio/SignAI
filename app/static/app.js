import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ── Mapeo landmarks MediaPipe → huesos DEF de Rigify ────────────────────────
// [nombre_hueso, idx_landmark_inicio, idx_landmark_fin]
const BONE_MAP = [
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

// Índices de landmarks MediaPipe Pose relevantes para cada brazo
// 11=hombro_izq, 12=hombro_der, 13=codo_izq, 14=codo_der
// 15=muñeca_izq, 16=muñeca_der, 19=índice_izq, 20=índice_der

// LSC50: coordenadas normalizadas de imagen (x,y en 0-1, z relativo muy pequeño).
// Dirección entre dos landmarks → convertida a ejes Three.js:
//   imagen-x → +X  |  imagen-y (0=arriba) → -Y  |  imagen-z → -Z
function lmDir(a, b) {
  return new THREE.Vector3(b.x - a.x, -(b.y - a.y), -(b.z - a.z));
}

// Para dedos: resta la muñeca antes de calcular la dirección
function mpToThree(lm, wrist) {
  return new THREE.Vector3(
     (lm.x - wrist.x),
    -(lm.y - wrist.y),
    -(lm.z - wrist.z),
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
  // 1.0 = sin suavizado (snap instantáneo). 0.1 = muy suavizado (lento).
  smoothAlpha: 0.7,
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

  // Recopilar todos los huesos y guardar su estado de rest
  gltf.scene.traverse(obj => {
    if (!obj.isBone) return;
    state.bones.set(obj.name, obj);

    // Quaternion LOCAL en rest → para restaurar en resetPose()
    state.boneRestLocalQ.set(obj.name, obj.quaternion.clone());

    // Quaternion WORLD en rest y dirección Y en world → para retargeting
    const wq = new THREE.Quaternion();
    obj.getWorldQuaternion(wq);
    state.boneRestWorldQ.set(obj.name, wq.clone());
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(wq).normalize();
    state.boneRestDir.set(obj.name, dir);
  });

  const fingerBones = [...state.bones.keys()].filter(n =>
    /^(thumb|f_index|f_middle|f_ring|f_pinky)\d+[LR]$/.test(n));
  const nDEF = fingerBones.length;

  // Medir rest pose de los brazos para el solver IK
  measureArmRest();

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
  const bSL = state.bones.get("DEF-upper_armL"), bEL = state.bones.get("DEF-forearmL"), bWL = state.bones.get("DEF-handL");
  const bSR = state.bones.get("DEF-upper_armR"), bER = state.bones.get("DEF-forearmR"), bWR = state.bones.get("DEF-handR");
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
  // z del landmark es "proporcional al ancho de imagen" — usar el mismo scale xy amplifica
  // demasiado (delta_z≈0.387 * scale≈3.13 = 1.21, pero el brazo mide 0.52).
  // Factor empírico 0.12 da extensión razonable (~0.15 u) sin salir del alcance del brazo.
  // Signo: MediaPipe z disminuye cuando la muñeca está frente al cuerpo (más cerca cámara).
  // -(delta_z) es positivo cuando la mano está adelante → Three.js +z = hacia la cámara = correcto.
  const Z_SCALE = 0.20;
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

function applyArmIK(body) {
  if (!state.armRest.L_upperL) return; // measureArmRest aún no corrió
  const scale = bodyScale(body);
  const g = state.armRest;

  _applyOneArm(body, 11, 13, 15, 19,
    "DEF-upper_armL", "DEF-upper_armL001", "DEF-forearmL", "DEF-forearmL001", "DEF-handL",
    g.shoulderL, g.L_upperL, g.L_foreL, scale);

  _applyOneArm(body, 12, 14, 16, 20,
    "DEF-upper_armR", "DEF-upper_armR001", "DEF-forearmR", "DEF-forearmR001", "DEF-handR",
    g.shoulderR, g.L_upperR, g.L_foreR, scale);
}

function _applyOneArm(body, iS, iE, iW, iIdx,
    nUA, nUA1, nFA, nFA1, nH, shoulderWorld, L1, L2, scale) {
  if (L1 < 1e-6 || L2 < 1e-6) return;

  lmWorldOffset(body[iW], body[iS], scale, shoulderWorld, _ikWrist);
  lmWorldOffset(body[iE], body[iS], scale, shoulderWorld, _ikEHint);

  // El vector hacia el codo hint es el vector de polo
  _ikPole.subVectors(_ikEHint, shoulderWorld);

  solveIKElbow(shoulderWorld, _ikWrist, _ikPole, L1, L2);
  // _ikElbow ← posición del codo resuelto por IK

  const dirUA = _ikTT.subVectors(_ikElbow, shoulderWorld);
  const dirFA = _ikEHint.subVectors(_ikWrist, _ikElbow); // reutilizar _ikEHint

  const bUA  = state.bones.get(nUA),  bUA1 = state.bones.get(nUA1);
  const bFA  = state.bones.get(nFA),  bFA1 = state.bones.get(nFA1);
  const bH   = state.bones.get(nH);

  if (bUA)  rotateBone(bUA,  dirUA);
  if (bUA1) rotateBone(bUA1, dirUA);
  if (bFA)  rotateBone(bFA,  dirFA);
  if (bFA1) rotateBone(bFA1, dirFA);
  if (bH)   rotateBone(bH,   lmDir(body[iW], body[iIdx]));
}

// ── Retargeting ───────────────────────────────────────────────────────────────

// Aplica la rotación de un hueso para que apunte de lmA → lmB
const _dQ  = new THREE.Quaternion();
const _tWQ = new THREE.Quaternion();
const _pWQ = new THREE.Quaternion();
const _tLQ = new THREE.Quaternion(); // quaternion local objetivo (scratch)
const _dir = new THREE.Vector3();

function rotateBone(bone, targetDir) {
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
  // Slerp desde la pose actual hacia el objetivo — suaviza el ruido de landmarks.
  // alpha=1 → snap instantáneo; alpha<1 → interpolación progresiva.
  bone.quaternion.slerp(_tLQ, state.smoothAlpha);
  bone.updateMatrixWorld(true);
}

function applyFrame(frameData) {
  // ── Brazos: IK de 2 huesos hacia la posición real de la muñeca ───────────
  if (frameData.body) {
    applyArmIK(frameData.body);
  }

  // ── Dedos: hand landmarks ─────────────────────────────────────────────────
  if (!frameData.hands?.length) return;
  const handsMap = {};
  for (const h of frameData.hands) handsMap[h.hand] = h.landmarks;

  for (const [boneName, lmStart, lmEnd] of BONE_MAP) {
    const bone = state.bones.get(boneName);
    if (!bone) continue;

    const side   = boneName.endsWith("L") ? "Left" : "Right";
    const rawLms = handsMap[side];
    if (!rawLms) continue;

    const wrist = rawLms[0];
    rotateBone(bone,
      mpToThree(rawLms[lmEnd], wrist).sub(mpToThree(rawLms[lmStart], wrist)));
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

// ── Control de suavizado ──────────────────────────────────────────────────────
const smoothSlider = document.getElementById("smooth-slider");
const smoothValEl  = document.getElementById("smooth-val");
smoothSlider.addEventListener("input", () => {
  const pct = parseFloat(smoothSlider.value);
  state.smoothAlpha = 1 - pct;
  smoothValEl.textContent = `${Math.round(pct * 100)}%`;
});

// ── Utilidad ──────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className   = `status ${type ?? ""}`;
}
