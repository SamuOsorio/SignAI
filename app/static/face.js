import * as THREE from "three";
import { state } from "./state.js";
import { rotateBone } from "./hands.js";

const FACE_REF_BROW   = 0.47; // browHt / IOD en neutro (mediana empírica LSC50)
const FACE_BROW_SCALE = 6.0;
const FACE_JAW_MAX    = 1.2;  // radianes máx apertura mandíbula (~70°)
const FACE_LIP_SCALE  = 4.0;
const FACE_LIP_MAX    = 0.5;
const FACE_ALPHA      = 1.0;  // snap instantáneo — el suavizado es para extremidades

const _xAxis   = new THREE.Vector3(1, 0, 0);
const _faceDir = new THREE.Vector3();

export function applyFace(face) {
  const lipT = face["13"], lipB = face["14"];
  const cL   = face["78"], cR   = face["308"];

  // ── Mandíbula ──────────────────────────────────────────────────────────────
  if (lipT && lipB && cL && cR) {
    const mouthW    = Math.abs(cR.x - cL.x);
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

  // ── Cejas ──────────────────────────────────────────────────────────────────
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

  // ── Comisuras de boca ──────────────────────────────────────────────────────
  if (lipT && lipB && cL && cR) {
    const mouthW = Math.abs(cR.x - cL.x);
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
