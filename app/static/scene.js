import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const canvas   = document.getElementById("avatar-canvas");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f1a);
scene.fog = new THREE.Fog(0x0d0f1a, 8, 20);

export const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 1.2, 2.8);

export const controls = new OrbitControls(camera, canvas);
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

(function renderLoop() {
  requestAnimationFrame(renderLoop);
  resizeRenderer();
  controls.update();
  renderer.render(scene, camera);
})();
