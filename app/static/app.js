import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ── Dedos: landmarks MediaPipe Hands por familia ────────────────────────────
// [MCP, PIP, DIP, TIP]. Las falanges 1/2/3 de cada familia mapean a los huesos
// AutoRigPro thumb1/2/3, index1/2/3, … (Three.js quita los puntos: index1.l → index1l).
// Los metacarpianos (*1_base*) NO se animan: sus pesos ya viven en hand.l/r y
// orientarlos desde wrist→nudillo abría la palma en abanico. (bundle dedos, punto A)
const FINGER_LM = {
  thumb:  [1,  2,  3,  4],
  index:  [5,  6,  7,  8],
  middle: [9, 10, 11, 12],
  ring:   [13, 14, 15, 16],
  pinky:  [17, 18, 19, 20],
};

// Familias tratadas como bisagra pura: flexión en 1 solo eje, sin torsión ni
// abducción. El pulgar queda fuera — su articulación es un sillar, no una bisagra,
// y el eje derivado de la normal de palma no lo modela → sigue en retargeting libre.
const HINGE_FINGERS = ["index", "middle", "ring", "pinky"];

// Rango de flexión por falange: 0 = recta … ~100°. Se permite algo de
// hiperextensión (−8°) para que la mano relajada no se vea agarrotada.
const FLEX_MIN_RAD = -0.14;
const FLEX_MAX_RAD =  1.75;

// Ganancia sobre el ángulo de flexión 2D antes del clamp. El giro medido en el
// plano de imagen subestima la flexión real por escorzo (la falange se acorta al
// doblarse hacia/desde la cámara) → 1.0 deja los dedos a medio cerrar. >1 compensa.
const FLEX_GAIN = 1.25;

// La falange distal (DIP) tiene el segmento más corto y ruidoso → suele caer bajo
// el deadzone y no llega a cerrar ("no termina de flexionar la punta"). Cuando su
// señal propia no es fiable se deriva de la falange media (PIP) por acoplamiento
// tendinoso: DIP ≈ 2/3 · PIP.
const DIP_PIP_COUPLING = 0.66;

// El nudillo (MCP, falange proximal) NO se mide con el mismo método que PIP/DIP:
// su "segmento padre" es wrist→MCP, que en 3D apunta a través del ancho de la
// palma — NO es paralelo a MCP→PIP (el eje del dedo) ni siquiera con la mano
// extendida en reposo. PIP→DIP y DIP→TIP sí son ~paralelos entre sí (mismo dedo),
// así que su ángulo 2D es estable bajo rotación 3D de brazo/muñeca; wrist→MCP vs
// MCP→PIP no lo es: cualquier rotación fuera del plano de cámara (gesto de
// acercar la mano a la otra) desalinea la proyección sin que el dedo se haya
// flexionado. Validado con datos LSC50: en una seña de contacto (solo rotación,
// sin cierre real) el ángulo wrist-MCP se dispara a 75-100°; en una seña de puño
// real se queda en 8-14° pese a que PIP mide 100-120°. Es ruido, no señal.
// Se deriva de PIP por el mismo acoplamiento tendinoso que DIP, en vez de
// medirse — MCP flexiona algo menos que PIP en la mayoría de agarres.
const MCP_PIP_COUPLING = 0.8;

// Override del signo del giro de flexión por mano:
//   0  → automático (se deduce del rig: hacia qué lado se curva el pulgar = palmar)
//   ±1 → forzar ese signo (usar solo si el automático se equivoca; ver consola)
// Los esqueletos de las dos manos están espejados, por eso se resuelve por mano.
const FINGER_FLEX_SIGN = { Left: 0, Right: 0 };

// true  → bisagra anatómica (flexión 1 eje por falange).
// false → retargeting libre anterior (setFromUnitVectors por segmento), para A/B.
const FINGER_HINGE = true;

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
  boneFlexAxis:  new Map(),   // name → Vector3 eje bisagra en frame local (falanges)
  frames: [],
  fps: 30,
  frameIdx: 0,
  playing: false,
  lastTime: null,
  animHandle: null,
  // Fracción [0,1] que avanza hacia el quaternion objetivo cada tick de rAF.
  // 0.12 ≈ convergencia en ~6 frames a 60fps (~100ms), buen balance suavidad/lag.
  smoothAlpha: 0.12,
  // Suavizado propio de las falanges. Con el retargeting libre (jittery) valía 0.06;
  // la bisagra de 1 eje + clamp es mucho más estable → se puede subir sin temblor
  // y así los dedos no se quedan "rígidos" a medio converger. (subir → más responsivo)
  fingerAlpha: 0.18,
  // Deadzone adaptativo: se ignora la rotación de una falange cuando su vector de
  // segmento es más corto que fingerDeadzone × (largo de palma wrist→MCP medio).
  // Evita rotar hacia ruido puro cuando el dedo casi no se mueve. (bundle dedos, punto B)
  fingerDeadzone: 0.12,
  // Deadzone durante CONTACT: mucho más chico. El propósito del deadzone es
  // rechazar RUIDO de tracking en vivo — pero en CONTACT hand_corrector.py ya
  // congeló la pose (mismos landmarks repetidos frame a frame, cero jitter por
  // construcción), así que un segmento corto ahí no es ruido: es un dedo
  // genuinamente flexionado (se acorta en la proyección 2D al doblarse). Con
  // el deadzone normal (0.12), un puño real queda marcado "no confiable" y se
  // relaja al rest — la mano no cierra durante el contacto (seña 0018).
  fingerDeadzoneContact: 0.02,
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
// Tone mapping: comprime las altas luces, evita el look "lavado" del IBL.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f1a);
scene.fog = new THREE.Fog(0x0d0f1a, 8, 20);

// Environment map (image-based lighting): sin esto el material glTF por defecto
// (metalness=1) se ve plano y sin volumen. RoomEnvironment es un IBL sintético
// que no requiere descargar un HDR.
const _pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = _pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;  // el IBL era la fuente dominante → cuerpo lavado

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 1.2, 2.8);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
camera.lookAt(controls.target);

// Ambient bajo: con scene.environment activo, un ambient alto aplana la forma.
scene.add(new THREE.AmbientLight(0xffffff, 0.2));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
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

  // A/B test de la costura vertical central:
  //   true  → recalcula normales suaves (tapa costuras oscuras de split normals,
  //           pero puede crear una arista en la línea de simetría si las mitades
  //           del mesh no están soldadas).
  //   false → usa las normales originales del GLB.
  const RECOMPUTE_NORMALS = false;
  if (RECOMPUTE_NORMALS) {
    gltf.scene.traverse(obj => {
      if (obj.isMesh && obj.geometry) obj.geometry.computeVertexNormals();
    });
  }

  // El GLB no trae materiales ni texturas: GLTFLoader asigna un material por
  // defecto con metalness=1 que se ve plano. Lo reemplazamos por una piel mate.
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xa9785d,
    roughness: 0.85,
    metalness: 0.0,
  });
  gltf.scene.traverse(obj => {
    if (obj.isMesh) obj.material = skinMat;
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

  // Derivar el eje de bisagra local de cada falange (flexión 1 eje)
  measureFingerHinges();

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
const _ikTargetDir = new THREE.Vector3(); // dirección hombro→muñeca (scratch, bias de codo)
const _ikPoleHat   = new THREE.Vector3(); // codo real normalizado (scratch, bias de codo)
const _ikPerp      = new THREE.Vector3(); // componente ⊥ del codo real (scratch, bias de codo)

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
// Con 0.8, medido en datos reales (seña 0018, contacto lateral mano-a-mano, no
// solapado): la separación real entre muñecas es ~0.22-0.36 u (bodyScale
// aplicado), y 0.8 la reducía a ~0.04-0.07 u — MENOS que el ancho de una mano
// (~0.075 u estimado) → no queda espacio físico para las dos manos lado a lado,
// los brazos se cruzan en vez de acercarse (seña 0018: "debería ponerlas una al
// lado de la otra"). 0.35 deja ~0.15-0.25 u — se ven claramente juntas sin
// forzar un solapamiento que la geometría no puede resolver sin cruzarse.
const CONTACT_BLEND = 0.35;

// Sesgo lateral del codo hacia afuera (fracción del alcance del brazo). En señas
// frente al pecho los targets de muñeca caen cerca de la línea media → sin esto
// los codos colapsan contra las costillas y los antebrazos se pegan al torso.
// Se atenúa cuando la mano sube (con el brazo en alto el codo real ya define
// bien la pose y forzar "afuera" produce un ala de pollo).
const ELBOW_OUT = 0.18;

// Empuje del target de muñeca hacia la cámara cuando queda cerca del torso y a la
// altura del pecho o más arriba → la mano/antebrazo pasan POR DELANTE del cuerpo
// en vez de atravesarlo (fracción del alcance del brazo).
const TORSO_CLEAR = 0.30;

// Umbral de "confiabilidad" del codo real (landmark 13/14) para decidir si el
// sesgo anatómico de abajo (cuelgue + frontal) hace falta. Se mide como
// sin(ángulo) entre el codo real y la línea hombro→muñeca: 0 = colineal
// (degenerado, el solver no puede derivar giro), 1 = perpendicular (dato
// pleno). Validado sobre las 1000 señas de LSC50: el caso colineal
// (sin<0.3) es raro — mediana 0% de frames, máx ~22% en la peor seña — así
// que antes el sesgo se aplicaba a full fuerza siempre, ahogando el dato
// real de codo el resto del tiempo. Con este umbral el sesgo solo entra
// cuando el dato real no alcanza para definir el giro.
const ELBOW_POLE_PURITY_THRESH = 0.3;

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

  const reach = L1 + L2;

  // Anti-clip: mano cerca de la línea media + a la altura del pecho o más arriba
  // → empujar el target hacia la cámara para que pase por delante del torso.
  const nearBody = THREE.MathUtils.clamp(
    1 - Math.abs(_ikWrist.x - shoulderWorld.x) / (reach * 0.6), 0, 1);
  const chestUp  = THREE.MathUtils.clamp(
    (_ikWrist.y - (shoulderWorld.y - reach * 0.5)) / (reach * 0.7), 0, 1);
  _ikWrist.z += nearBody * chestUp * reach * TORSO_CLEAR;

  // Vector de polo = dirección del codo desde el hombro (dato real de MediaPipe).
  // Problema original: cuando la mano está por encima del hombro, el vector
  // codo→hombro y el vector hombro→muñeca son casi paralelos → después de
  // proyectar, el polo residual es ≈0 y el solver pone el codo en dirección
  // arbitraria. El fix (bias descendente + frontal) es necesario ahí, pero
  // se aplicaba SIEMPRE a full fuerza — `degenerate` lo escala por qué tan
  // colineal está el dato real, así que el codo real domina el resto del
  // tiempo (ver ELBOW_POLE_PURITY_THRESH).
  _ikPole.subVectors(_ikEHint, shoulderWorld);

  _ikTargetDir.subVectors(_ikWrist, shoulderWorld).normalize();
  let degenerate = 1;
  const poleLen = _ikPole.length();
  if (poleLen > 1e-6) {
    _ikPoleHat.copy(_ikPole).divideScalar(poleLen);
    const par = _ikPoleHat.dot(_ikTargetDir);
    _ikPerp.copy(_ikPoleHat).addScaledVector(_ikTargetDir, -par);
    const purity = _ikPerp.length(); // sin(ángulo): 0 colineal … 1 perpendicular
    degenerate = THREE.MathUtils.clamp(1 - purity / ELBOW_POLE_PURITY_THRESH, 0, 1);
  }

  _ikPole.y -= reach * 0.35 * degenerate;  // codo hacia abajo — solo si el dato real es ambiguo
  _ikPole.z += reach * 0.10 * degenerate;  // leve bias frontal — idem

  // Codo hacia afuera, atenuado a medida que la muñeca sube por encima del hombro
  // (raise: 1 con la mano baja → 0.1 con la mano bien alta).
  const raise = THREE.MathUtils.clamp(
    1 - (_ikWrist.y - shoulderWorld.y + reach * 0.1) / (reach * 0.4), 0.1, 1);
  _ikPole.x += Math.sign(shoulderWorld.x) * reach * ELBOW_OUT * raise;

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

// Scratch para la bisagra de falanges
const _flexDelta   = new THREE.Quaternion();
const _flexTargetL = new THREE.Quaternion();
const _segP        = new THREE.Vector3();
const _segC        = new THREE.Vector3();

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

// ── Bisagra anatómica por falange ────────────────────────────────────────────

// Fija un vector al eje cardinal (±X/±Y/±Z) más cercano. Limpia el eje bisagra
// de residuos oblicuos → la falange gira sobre 1 solo eje exacto.
function snapToCardinal(v) {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  if (ax >= ay && ax >= az)      v.set(Math.sign(v.x) || 1, 0, 0);
  else if (ay >= ax && ay >= az) v.set(0, Math.sign(v.y) || 1, 0);
  else                           v.set(0, 0, Math.sign(v.z) || 1);
  return v;
}

// Deriva, una vez cargado el rig, el eje de bisagra local de cada falange de
// index/middle/ring/pinky. El eje es ⊥ al eje largo del dedo y ⊥ a la normal de
// la palma (rest pose): girar +ángulo sobre él flexiona la falange hacia la palma.
function measureFingerHinges() {
  state.boneFlexAxis.clear();
  for (const side of ["l", "r"]) {
    const wristB = state.bones.get("hand" + side);
    const idxB   = state.bones.get("index1" + side);
    const pnkB   = state.bones.get("pinky1" + side);
    if (!wristB || !idxB || !pnkB) continue;

    const w = new THREE.Vector3(), i = new THREE.Vector3(), p = new THREE.Vector3();
    wristB.getWorldPosition(w); idxB.getWorldPosition(i); pnkB.getWorldPosition(p);

    // Normal del plano de la palma en world (wrist→index × wrist→pinky). Su signo
    // es arbitrario (dorsal o palmar); girar +ángulo sobre hinge = restDir × palmN
    // hace que la punta de la falange se mueva hacia +palmN.
    const palmN = new THREE.Vector3()
      .crossVectors(i.clone().sub(w), p.clone().sub(w))
      .normalize();
    if (palmN.lengthSq() < 1e-10) continue;

    // ¿Hacia qué lado del plano de palma está +palmN, dorsal o palmar? El pulgar
    // se curva hacia la palma → la dirección thumb1→thumb3 tiene componente palmar.
    const tb = new THREE.Vector3(), tt = new THREE.Vector3();
    const tbB = state.bones.get("thumb1" + side), ttB = state.bones.get("thumb3" + side);
    let auto = 1, pc = 0;
    if (tbB && ttB) {
      tbB.getWorldPosition(tb); ttB.getWorldPosition(tt);
      pc = palmN.dot(tt.sub(tb));       // >0 → +palmN es palmar ; <0 → es dorsal
      auto = pc >= 0 ? 1 : -1;
    }
    const override = side === "l" ? FINGER_FLEX_SIGN.Left : FINGER_FLEX_SIGN.Right;
    const sign = override !== 0 ? override : auto;

    for (const fam of HINGE_FINGERS) {
      for (let k = 1; k <= 3; k++) {
        const name    = `${fam}${k}${side}`;
        const restWQ  = state.boneRestWorldQ.get(name);
        const restDir = state.boneRestDir.get(name); // eje largo (Y local) en world
        if (!state.bones.has(name) || !restWQ || !restDir) continue;

        const hingeW = new THREE.Vector3()
          .crossVectors(restDir, palmN)
          .multiplyScalar(sign);
        if (hingeW.lengthSq() < 1e-10) continue;
        hingeW.normalize();

        // A frame local del hueso y snap a eje cardinal → bisagra de 1 eje exacto.
        const hingeL = hingeW.applyQuaternion(restWQ.clone().invert());
        snapToCardinal(hingeL);
        state.boneFlexAxis.set(name, hingeL);
      }
    }

    console.log(`[SignAI] hinge ${side}: sign=${sign} (auto=${auto}, pc=${pc.toFixed(3)}, override=${override})`);
  }
  console.log("[SignAI] Ejes bisagra de falange:", state.boneFlexAxis.size);
}

// Flexiona una falange 'angle' rad sobre su eje bisagra local, partiendo del rest.
// Garantiza: 1 solo eje, sin torsión, rango clampeado. Suavizado por slerp.
function flexFinger(bone, angle, alpha = state.fingerAlpha) {
  const axis  = state.boneFlexAxis.get(bone.name);
  const restL = state.boneRestLocalQ.get(bone.name);
  if (!axis || !restL) return;

  const a = THREE.MathUtils.clamp(angle, FLEX_MIN_RAD, FLEX_MAX_RAD);
  _flexDelta.setFromAxisAngle(axis, a);
  _flexTargetL.multiplyQuaternions(restL, _flexDelta); // rest ∘ flexión (local)

  bone.quaternion.slerp(_flexTargetL, alpha);
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
// Factor para el z crudo de MediaPipe Hands en la orientación de muñeca.
// z tiene span ~0.014 en toda la mano y es ruidoso → a escala 1.0 hacía que la
// muñeca temblara/torciera. A 0.3 conserva la señal de "palma hacia/desde cámara"
// con ~3× menos ruido. (bundle dedos, punto E)
const Z_HAND = 0.3;

function applyHandOrientation(bone, rawLms, normalSign, contactMode = false) {
  const w = rawLms[0];

  // ── Paso 1: alinear eje Y del hueso (hacia dónde "apunta" la mano) ──────
  if (contactMode && bone.parent) {
    // Durante CONTACT, rawLms[9] (dedo medio) viene de la pose PRE-contacto
    // congelada — solo trasladada para seguir la muñeca (_rebase_to_wrist en
    // hand_corrector.py), nunca re-orientada. Usarla aquí deja la mano
    // "mirando" para siempre hacia donde miraba justo antes del contacto —
    // a menudo una pose de transición (ej. seña 0018: queda con la palma
    // hacia arriba en vez del índice apuntando a cámara). El antebrazo, en
    // cambio, se sigue orientando en vivo por IK durante todo el CONTACT (no
    // depende de landmarks de mano) → se usa su eje Y como proxy de "hacia
    // dónde apunta la mano" (sin flexión propia de muñeca, pero sigue al
    // brazo real en vez de quedar pegada a la pose vieja).
    bone.parent.getWorldQuaternion(_hQ);
    _hUp.set(0, 1, 0).applyQuaternion(_hQ);
  } else {
    _hUp.set(rawLms[9].x - w.x, -(rawLms[9].y - w.y), -(rawLms[9].z - w.z) * Z_HAND);
    if (_hUp.lengthSq() < 1e-8) return;
    _hUp.normalize();
  }
  rotateBone(bone, _hUp); // slerp incluido

  // ── Paso 2: roll — girar el hueso para que su Z apunte a la normal de palma ──
  _hIdxV.set(rawLms[5].x  - w.x, -(rawLms[5].y  - w.y), -(rawLms[5].z  - w.z) * Z_HAND);
  _hPnkV.set(rawLms[17].x - w.x, -(rawLms[17].y - w.y), -(rawLms[17].z - w.z) * Z_HAND);
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
  const frameState = frameData._corrector_state ?? 'NORMAL';

  // ── Brazos: IK de 2 huesos hacia la posición real de la muñeca ───────────
  if (frameData.body) {
    applyArmIK(frameData.body, frameData.hands, frameState);
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
  const inContact = frameState === 'CONTACT';
  if (bHL && handsMap["Left"])  applyHandOrientation(bHL, handsMap["Left"],   1, inContact);
  if (bHR && handsMap["Right"]) applyHandOrientation(bHR, handsMap["Right"], -1, inContact);

  // Escala de cada mano = largo de palma (wrist → MCP medio), base del deadzone.
  const handSpan = {};
  for (const s of ["Left", "Right"]) {
    const lm = handsMap[s];
    if (lm) handSpan[s] = mpToThree(lm[9], lm[0]).length();
  }

  // ── Dedos: bisagra anatómica por falange ────────────────────────────────
  // Cada falange de index/middle/ring/pinky gira sobre UN eje (flexión 0–~100°,
  // sin torsión ni abducción). El ángulo es el giro 2D en el plano de imagen
  // entre la falange previa y la actual — buen proxy de la flexión total cuando
  // la mano mira a cámara; se subestima con el dedo en escorzo (lo compensa FLEX_GAIN).
  for (const [fam, lm] of Object.entries(FINGER_LM)) {
    for (const side of ["Left", "Right"]) {
      const rawLms = handsMap[side];
      if (!rawLms) continue;
      const sfx  = side === "Left" ? "l" : "r";
      const span = handSpan[side] ?? 0;
      const hinge = FINGER_HINGE && fam !== "thumb";
      const deadzone = frameState === 'CONTACT' ? state.fingerDeadzoneContact : state.fingerDeadzone;

      // Paso 1: ángulo de flexión y fiabilidad de las 3 falanges.
      // bend[k] = giro 2D (falange previa → actual) × FLEX_GAIN ; rel[k] = señal fiable.
      const bend = [0, 0, 0], rel = [false, false, false], seg = [0, 0, 0];
      for (let k = 1; k <= 3; k++) {
        const cA = rawLms[lm[k - 1]], cB = rawLms[lm[k]];
        const pA = k === 1 ? rawLms[0]     : rawLms[lm[k - 2]];
        const pB = k === 1 ? rawLms[lm[0]] : rawLms[lm[k - 1]];
        _segC.set(cB.x - cA.x, -(cB.y - cA.y), 0);
        _segP.set(pB.x - pA.x, -(pB.y - pA.y), 0);
        seg[k - 1]  = _segC.clone();
        // Deadzone adaptativo (punto B): falange más corta que el piso de ruido
        // (dedo en escorzo, mano colgando) o segmento padre degenerado → no fiable.
        rel[k - 1]  = _segC.length() >= span * deadzone && _segP.lengthSq() >= 1e-10;
        bend[k - 1] = rel[k - 1] ? _segP.angleTo(_segC) * FLEX_GAIN : 0;
      }
      // La distal sigue a la media si su propia señal no llega (acoplamiento tendinoso).
      if (hinge && !rel[2] && rel[1]) { bend[2] = bend[1] * DIP_PIP_COUPLING; rel[2] = true; }

      // El nudillo (MCP, k=0) se descarta SIEMPRE que se mida directo — no es
      // ruido ocasional, es sistemáticamente no confiable (ver MCP_PIP_COUPLING) —
      // y se deriva de PIP en su lugar. Solo aplica a dedos con bisagra (thumb
      // sigue con su propio segmento wrist→MCP en el retargeting libre de abajo).
      if (hinge) {
        if (rel[1]) { bend[0] = bend[1] * MCP_PIP_COUPLING; rel[0] = true; }
        else        { rel[0] = false; }
      }

      // DEBUG temporal (Foco D) — activar en consola con: window._fingerDebug = true
      if (window._fingerDebug && hinge) {
        const deg = bend.map(b => Math.round(b * 180 / Math.PI));
        console.log(`[FD] f=${Math.floor(state.frameIdx)} ${side} ${fam} bend°=[${deg}] rel=[${rel}] span=${span.toFixed(4)} dz=${deadzone} state=${frameState}`);
      }

      // Paso 2: aplicar a cada hueso. Señal no fiable → relajar hacia el rest en
      // vez de congelar la última pose (si no, la mano queda "en garra" al bajar).
      for (let k = 1; k <= 3; k++) {
        const bone = state.bones.get(`${fam}${k}${sfx}`);
        if (!bone) continue;

        if (!rel[k - 1]) {
          const restL = state.boneRestLocalQ.get(bone.name);
          if (restL) { bone.quaternion.slerp(restL, state.fingerAlpha * 0.5); bone.updateMatrixWorld(true); }
        } else if (hinge) {
          flexFinger(bone, bend[k - 1], state.fingerAlpha);
        } else {
          rotateBone(bone, seg[k - 1], state.fingerAlpha);   // pulgar / A-B libre
        }
      }
    }
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
