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

// MediaPipe Pose landmarks relevantes para el brazo:
// 11=hombro_izq, 12=hombro_der, 13=codo_izq, 14=codo_der
// 15=muñeca_izq, 16=muñeca_der, 19=índice_izq, 20=índice_der
// Rigify DEF bones: DEF-upper_armL/L001, DEF-forearmL/L001, DEF-handL
const BODY_BONE_MAP = [
  ["DEF-upper_armL",    11, 13],
  ["DEF-upper_armL001", 11, 13],
  ["DEF-forearmL",      13, 15],
  ["DEF-forearmL001",   13, 15],
  ["DEF-handL",         15, 19],
  ["DEF-upper_armR",    12, 14],
  ["DEF-upper_armR001", 12, 14],
  ["DEF-forearmR",      14, 16],
  ["DEF-forearmR001",   14, 16],
  ["DEF-handR",         16, 20],
];

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

  window._signAI = state;

  setStatus(`Avatar listo — ${state.bones.size} huesos (${nDEF} dedos)`, "ok");
  document.getElementById("avatar-meta").textContent = `${state.bones.size} huesos · ${nDEF} dedos`;

}, (xhr) => {
  setStatus(`Cargando avatar... ${Math.round(xhr.loaded / xhr.total * 100)}%`, "");
}, (err) => {
  setStatus("Error cargando avatar.glb", "err");
  console.error(err);
});

// ── Retargeting ───────────────────────────────────────────────────────────────

// Aplica la rotación de un hueso para que apunte de lmA → lmB
const _dQ  = new THREE.Quaternion();
const _tWQ = new THREE.Quaternion();
const _pWQ = new THREE.Quaternion();
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
    bone.quaternion.multiplyQuaternions(_pWQ.invert(), _tWQ);
  } else {
    bone.quaternion.copy(_tWQ);
  }
  bone.updateMatrixWorld(true);
}

function applyFrame(frameData) {
  // ── Brazos: body landmarks ────────────────────────────────────────────────
  if (frameData.body) {
    const b = frameData.body;
    for (const [boneName, iA, iB] of BODY_BONE_MAP) {
      const bone = state.bones.get(boneName);
      if (!bone) continue;
      rotateBone(bone, lmDir(b[iA], b[iB]));
    }
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

// ── Utilidad ──────────────────────────────────────────────────────────────────
function setStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className   = `status ${type ?? ""}`;
}
