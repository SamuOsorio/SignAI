import { state } from "./state.js";
import { applyArmIK, CROSS_HAND_THRESHOLD } from "./ik.js";
import { applyFace } from "./face.js";
import { filterHandLandmarks, isHandDegenerate } from "./filters.js";
import { clampHandLandmarks, applyFingers, initSprings } from "./hands.js";

const video = document.getElementById("video");

// Orquesta un frame completo: filtra landmarks, detecta cruces/degeneración,
// aplica constraints y delega en los módulos de IK, cara y dedos.
export function applyFrame(frameData, dt = 1 / state.fps) {
  const handsMap = {};
  if (frameData.hands) {
    for (const h of frameData.hands) {
      handsMap[h.hand] = state.handFilters
        ? filterHandLandmarks(h.landmarks, h.hand, dt)
        : h.landmarks;
    }
  }

  if (frameData.body) applyArmIK(frameData.body, handsMap);
  if (frameData.face) applyFace(frameData.face);
  if (!frameData.hands?.length) return;

  // Freeze: cruce de manos y landmarks degenerados
  const _lW = handsMap["Left"]?.[0], _lR = handsMap["Right"]?.[0];
  const crossDetected = !!(_lW && _lR &&
    (_lW.x - _lR.x)**2 + (_lW.y - _lR.y)**2 < CROSS_HAND_THRESHOLD**2);

  for (const side of ["Left", "Right"]) {
    const lms = handsMap[side];
    const freeze = crossDetected || (lms && isHandDegenerate(lms));
    if (freeze) {
      if (state.lastGoodHandLms[side]) handsMap[side] = state.lastGoodHandLms[side];
      else delete handsMap[side];
    } else if (lms) {
      state.lastGoodHandLms[side] = lms;
    }
  }

  for (const side of ["Left", "Right"]) {
    if (handsMap[side]) handsMap[side] = clampHandLandmarks(handsMap[side]);
  }

  applyFingers(handsMap, dt);
}

export function resetPose() {
  state.bones.forEach((bone, name) => {
    const restQ = state.boneRestLocalQ.get(name);
    if (restQ) bone.quaternion.copy(restQ);
    bone.updateMatrixWorld(true);
  });
}

function animTick(now) {
  if (!state.playing) return;
  state.animHandle = requestAnimationFrame(animTick);
  if (state.lastTime === null) { state.lastTime = now; return; }

  const dt = (now - state.lastTime) / 1000;
  state.frameIdx += dt * state.fps;
  state.lastTime  = now;

  const idx = Math.floor(state.frameIdx);
  if (idx >= state.frames.length) {
    state.frameIdx = 0;
    state.lastTime = null;
    video.currentTime = 0;
    return;
  }
  applyFrame(state.frames[idx], dt);
}

export function startAnim() {
  if (state.playing) return;
  state.playing = true;
  state.lastTime = null;
  video.play();
  state.animHandle = requestAnimationFrame(animTick);
  document.getElementById("btn-play").textContent = "⏸ Pausar";
}

export function pauseAnim() {
  state.playing = false;
  video.pause();
  if (state.animHandle) cancelAnimationFrame(state.animHandle);
  document.getElementById("btn-play").textContent = "▶ Reproducir";
}

export function resetAnim() {
  pauseAnim();
  state.frameIdx = 0;
  video.currentTime = 0;
  initSprings();
  resetPose();
}
