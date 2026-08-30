import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { scene } from "./scene.js";
import { state } from "./state.js";
import { setStatus } from "./ui.js";

function measureArmRest() {
  const g   = state.armRest;
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

export function loadAvatar() {
  setStatus("Cargando avatar.glb...", "");
  new GLTFLoader().load("/avatar.glb", (gltf) => {
    // Ocultar helpers de Blender (no eliminar — pueden ser referenciados por bones)
    gltf.scene.traverse(obj => {
      if (obj.name.startsWith("WGT-") || obj.name === "metarig") obj.visible = false;
    });

    scene.add(gltf.scene);

    // Centrar y escalar usando solo la geometría visible
    const meshBox = new THREE.Box3();
    gltf.scene.traverse(obj => { if (obj.isMesh && obj.visible) meshBox.expandByObject(obj); });
    if (!meshBox.isEmpty()) {
      const h = meshBox.getSize(new THREE.Vector3()).y;
      const s = 1.7 / h;
      gltf.scene.scale.setScalar(s);
      const c = meshBox.getCenter(new THREE.Vector3());
      gltf.scene.position.set(-c.x * s, -meshBox.min.y * s, -c.z * s);
    }

    gltf.scene.updateWorldMatrix(true, true);

    // Recopilar todos los huesos y guardar su estado de rest
    gltf.scene.traverse(obj => {
      if (!obj.isBone) return;
      state.bones.set(obj.name, obj);
      state.boneRestLocalQ.set(obj.name, obj.quaternion.clone());

      const wq = new THREE.Quaternion();
      obj.getWorldQuaternion(wq);
      state.boneRestWorldQ.set(obj.name, wq.clone());
      const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(wq).normalize();
      state.boneRestDir.set(obj.name, dir);
    });

    const fingerBones = [...state.bones.keys()].filter(n =>
      /^(thumb|f_index|f_middle|f_ring|f_pinky)\d+[LR]$/.test(n));

    measureArmRest();
    window._signAI = state;

    setStatus(`Avatar listo — ${state.bones.size} huesos (${fingerBones.length} dedos)`, "ok");
    document.getElementById("avatar-meta").textContent =
      `${state.bones.size} huesos · ${fingerBones.length} dedos`;

  }, (xhr) => {
    setStatus(`Cargando avatar... ${Math.round(xhr.loaded / xhr.total * 100)}%`, "");
  }, (err) => {
    setStatus("Error cargando avatar.glb", "err");
    console.error(err);
  });
}
