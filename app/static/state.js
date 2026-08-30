import * as THREE from "three";

export const state = {
  bones:           new Map(),
  boneRestLocalQ:  new Map(),
  boneRestWorldQ:  new Map(),
  boneRestDir:     new Map(),
  frames:          [],
  fps:             30,
  frameIdx:        0,
  playing:         false,
  lastTime:        null,
  animHandle:      null,
  smoothAlpha:     0.35,
  fingerAlpha:     0.50,
  palmNormalL:     new THREE.Vector3(0, 0, 1),
  palmNormalR:     new THREE.Vector3(0, 0, 1),
  handFilters:     null,
  lastGoodHandLms: { Left: null, Right: null },
  armRest: {
    shoulderL: new THREE.Vector3(), shoulderR: new THREE.Vector3(),
    L_upperL: 0, L_foreL: 0,
    L_upperR: 0, L_foreR: 0,
  },
};
