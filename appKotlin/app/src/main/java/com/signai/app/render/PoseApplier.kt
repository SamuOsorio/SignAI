package com.signai.app.render

import com.google.android.filament.Engine
import com.signai.common.constants.LandmarkConstants
import com.signai.common.constants.PoseTuning
import com.signai.common.math.Mat4
import com.signai.common.math.Quat
import com.signai.common.math.Vec3
import com.signai.common.math.slerp
import com.signai.domain.model.BodyFrame
import com.signai.domain.model.Frame
import com.signai.domain.model.HandSide
import com.signai.domain.model.Landmark

/** Conversión Landmark (dominio) → Vec3 (math). Vive en :app para evitar ciclos. */
private fun Landmark.toVec3(): Vec3 = Vec3(x, y, z)

/**
 * Puerto Kotlin del pose-applier de `app/static/app.js`.
 *
 * Aplica IK de brazos, orientación de muñeca y huesos de dedos a partir
 * de un `Frame` de landmarks.
 *
 * El consumidor debe llamar a `measureArmRest()` una vez tras cargar el avatar
 * y antes del primer `applyFrame()`.
 */
class PoseApplier(
    private val engine: Engine,
    private val avatar: AvatarScene
) {

    private val tm = engine.transformManager

    private val armRest = ArmRest()

    init {
        measureArmRest()
    }

    /** Captura longitudes y posiciones de hombros en rest pose. */
    fun measureArmRest() {
        val shoulderL = avatar.bones[LandmarkConstants.BONE_UPPER_ARM_L] ?: return
        val elbowL = avatar.bones[LandmarkConstants.BONE_FOREARM_L] ?: return
        val handL = avatar.bones[LandmarkConstants.BONE_HAND_L] ?: return
        val shoulderR = avatar.bones[LandmarkConstants.BONE_UPPER_ARM_R] ?: return
        val elbowR = avatar.bones[LandmarkConstants.BONE_FOREARM_R] ?: return
        val handR = avatar.bones[LandmarkConstants.BONE_HAND_R] ?: return

        val sL = Mat4.getTranslation(shoulderL.worldMatrix, Vec3.ZERO)
        val sR = Mat4.getTranslation(shoulderR.worldMatrix, Vec3.ZERO)
        val eL = Mat4.getTranslation(elbowL.worldMatrix, Vec3.ZERO)
        val eR = Mat4.getTranslation(elbowR.worldMatrix, Vec3.ZERO)
        val hL = Mat4.getTranslation(handL.worldMatrix, Vec3.ZERO)
        val hR = Mat4.getTranslation(handR.worldMatrix, Vec3.ZERO)

        armRest.shoulderL = sL
        armRest.shoulderR = sR
        armRest.upperArmL = sL.minus(eL).length()
        armRest.upperArmR = sR.minus(eR).length()
        armRest.forearmL = eL.minus(hL).length()
        armRest.forearmR = eR.minus(hR).length()
    }

    /**
     * Aplica un frame: IK brazos + orientación mano + huesos de dedos.
     */
    fun applyFrame(frame: Frame, alpha: Float = 1.0f) {
        _currentBody = frame.body
        _currentHands = frame.hands.associate { it.side to it.landmarks }

        // 1. Brazos via IK.
        frame.body?.let { applyArmIK(it) }

        // 2. Cara — fase 2.

        // 3. Manos.
        val lLms = _currentHands[HandSide.Left]
        val rLms = _currentHands[HandSide.Right]
        val boneHandL = avatar.bones[LandmarkConstants.BONE_HAND_L]
        val boneHandR = avatar.bones[LandmarkConstants.BONE_HAND_R]
        if (boneHandL != null && lLms != null) applyHandOrientation(boneHandL, lLms, 1)
        if (boneHandR != null && rLms != null) applyHandOrientation(boneHandR, rLms, -1)

        applyFingerBones(LandmarkConstants.LEFT_FINGER_BONES, lLms, alpha)
        applyFingerBones(LandmarkConstants.RIGHT_FINGER_BONES, rLms, alpha)
    }

    // ── IK de brazos (analítico, ley de cosenos) ─────────────────────────────

    private fun applyArmIK(body: BodyFrame) {
        if (armRest.upperArmL < 1e-6f) return
        val scale = bodyScale(body)

        applyOneArm(
            shoulderIdx = LandmarkConstants.BODY_L_SHOULDER,
            elbowIdx = LandmarkConstants.BODY_L_ELBOW,
            wristIdx = LandmarkConstants.BODY_L_WRIST,
            shoulderWorld = armRest.shoulderL,
            L1 = armRest.upperArmL,
            L2 = armRest.forearmL,
            scale = scale,
            names = ArmBoneNames(
                upper = LandmarkConstants.BONE_UPPER_ARM_L,
                upper1 = LandmarkConstants.BONE_UPPER_ARM_L_1,
                fore = LandmarkConstants.BONE_FOREARM_L,
                fore1 = LandmarkConstants.BONE_FOREARM_L_1
            )
        )
        applyOneArm(
            shoulderIdx = LandmarkConstants.BODY_R_SHOULDER,
            elbowIdx = LandmarkConstants.BODY_R_ELBOW,
            wristIdx = LandmarkConstants.BODY_R_WRIST,
            shoulderWorld = armRest.shoulderR,
            L1 = armRest.upperArmR,
            L2 = armRest.forearmR,
            scale = scale,
            names = ArmBoneNames(
                upper = LandmarkConstants.BONE_UPPER_ARM_R,
                upper1 = LandmarkConstants.BONE_UPPER_ARM_R_1,
                fore = LandmarkConstants.BONE_FOREARM_R,
                fore1 = LandmarkConstants.BONE_FOREARM_R_1
            )
        )
    }

    private fun applyOneArm(
        shoulderIdx: Int,
        elbowIdx: Int,
        wristIdx: Int,
        shoulderWorld: Vec3,
        L1: Float,
        L2: Float,
        scale: Float,
        names: ArmBoneNames
    ) {
        val body = _currentBody ?: return
        if (L1 < 1e-6f || L2 < 1e-6f) return
        val shoulderLm = body.landmarks[shoulderIdx].toVec3()
        val elbowLm = body.landmarks[elbowIdx].toVec3()
        val wristLm = body.landmarks[wristIdx].toVec3()

        val wristWorld = lmWorldOffset(wristLm, shoulderLm, scale, shoulderWorld)
        val elbowHint = lmWorldOffset(elbowLm, shoulderLm, scale, shoulderWorld)

        // Pole con bias anatómico (immutable).
        var pole = elbowHint.minus(shoulderWorld)
        pole = pole.copy(
            y = pole.y - (L1 + L2) * PoseTuning.IK_POLE_DOWN,
            z = pole.z + (L1 + L2) * PoseTuning.IK_POLE_FRONT
        )

        val elbowWorld = solveIKElbow(shoulderWorld, wristWorld, pole, L1, L2)

        val dirUpper = elbowWorld.minus(shoulderWorld)
        val dirFore = wristWorld.minus(elbowWorld)

        val upper = avatar.bones[names.upper]
        val upper1 = avatar.bones[names.upper1]
        val fore = avatar.bones[names.fore]
        val fore1 = avatar.bones[names.fore1]

        rotateBone(upper, dirUpper)
        rotateBone(upper1, dirUpper)
        rotateBone(fore, dirFore)
        rotateBone(fore1, dirFore)
    }

    private fun solveIKElbow(
        shoulder: Vec3,
        target: Vec3,
        pole: Vec3,
        L1: Float,
        L2: Float
    ): Vec3 {
        val toTarget = target.minus(shoulder)
        val D = kotlin.math.min(toTarget.length(), L1 + L2 - 1e-4f)
        val tt = toTarget.normalize()

        val poleResidual = pole.addScaledVector(tt, -pole.dot(tt))
        val poleHat = if (poleResidual.lengthSq() < 1e-8f) {
            val arbitrary = Vec3.UP.addScaledVector(tt, -tt.y).normalize()
            if (arbitrary.lengthSq() < 1e-8f) Vec3.RIGHT else arbitrary
        } else {
            poleResidual.normalize()
        }

        val cosA = clamp((L1 * L1 + D * D - L2 * L2) / (2f * L1 * D), -1f, 1f)
        val sinA = kotlin.math.sqrt(1f - cosA * cosA)

        return shoulder
            .addScaledVector(tt, cosA * L1)
            .addScaledVector(poleHat, sinA * L1)
    }

    private fun bodyScale(body: BodyFrame): Float {
        val a = body.landmarks[LandmarkConstants.BODY_L_SHOULDER].toVec3()
        val b = body.landmarks[LandmarkConstants.BODY_R_SHOULDER].toVec3()
        val lmSep = a.minus(b).length()
        if (lmSep < 1e-6f) return 1f
        return armRest.shoulderL.minus(armRest.shoulderR).length() / lmSep
    }

    private fun lmWorldOffset(lm: Vec3, lmRef: Vec3, scale: Float, worldRef: Vec3): Vec3 {
        return Vec3(
            (lm.x - lmRef.x) * scale,
            -(lm.y - lmRef.y) * scale,
            -(lm.z - lmRef.z) * scale * PoseTuning.Z_SCALE
        ).plus(worldRef)
    }

    private fun clamp(v: Float, lo: Float, hi: Float): Float =
        if (v < lo) lo else if (v > hi) hi else v

    // ── Retargeting / rotateBone ──────────────────────────────────────────────

    private fun rotateBone(bone: AvatarBone?, targetDir: Vec3, alpha: Float = 1.0f) {
        if (bone == null) return
        if (targetDir.lengthSq() < 1e-6f) return
        val restQuat = Mat4.getRotation(bone.worldMatrix)
        val restDir = Vec3.UP.applyQuaternion(restQuat).normalize()

        val deltaQ = Quat.fromUnitVectors(restDir, targetDir.normalize())
        val targetWorldQ = deltaQ * restQuat

        val currentLocal = Mat4.getRotation(bone.localMatrix)
        val blended = if (alpha >= 1.0f) targetWorldQ else slerp(currentLocal, targetWorldQ, alpha)

        writeBoneRotation(bone, blended)
    }

    private fun writeBoneRotation(bone: AvatarBone, q: Quat) {
        // Mantener la traslación en rest de la pose (de la primera lectura de localMatrix).
        // Solo modificamos la rotación.
        val restTranslation = Vec3(bone.localMatrix[12], bone.localMatrix[13], bone.localMatrix[14])
        val newLocalMatrix = Mat4.ofTRS(restTranslation, q, scale = 1f)
        tm.setTransform(bone.transformInstance, newLocalMatrix)
        bone.localMatrix = newLocalMatrix
        val newWorld = FloatArray(16)
        tm.getWorldTransform(bone.transformInstance, newWorld)
        bone.worldMatrix = newWorld
    }

    // ── Muñeca con roll ──────────────────────────────────────────────────────

    private fun applyHandOrientation(
        bone: AvatarBone,
        rawLms: List<Landmark>,
        normalSign: Int
    ) {
        val wrist = rawLms[0].toVec3()

        val upVec = Vec3(
            rawLms[9].x - wrist.x,
            -(rawLms[9].y - wrist.y),
            -(rawLms[9].z - wrist.z)
        )
        if (upVec.lengthSq() < 1e-8f) return
        rotateBone(bone, upVec)

        val idxVec = Vec3(
            rawLms[5].x - wrist.x,
            -(rawLms[5].y - wrist.y),
            -(rawLms[5].z - wrist.z)
        )
        val pnkVec = Vec3(
            rawLms[17].x - wrist.x,
            -(rawLms[17].y - wrist.y),
            -(rawLms[17].z - wrist.z)
        )
        val normal = idxVec.cross(pnkVec) * normalSign.toFloat()
        if (normal.lengthSq() < 1e-8f) return
        val normalHat = normal.normalize()
        val upHat = upVec.normalize()
        val normalPerp = normalHat.addScaledVector(upHat, -normalHat.dot(upHat)).normalize()
        if (normalPerp.lengthSq() < 1e-8f) return

        val currentWorldQ = Mat4.getRotation(bone.worldMatrix)
        val currentZ = Vec3.FORWARD.applyQuaternion(currentWorldQ)
        val currentZPerp = currentZ.addScaledVector(upHat, -currentZ.dot(upHat)).normalize()
        if (currentZPerp.lengthSq() < 1e-8f) return

        val deltaQ = Quat.fromUnitVectors(currentZPerp, normalPerp)
        val targetWorldQ = deltaQ * currentWorldQ
        writeBoneRotation(bone, targetWorldQ)
    }

    // ── Huesos de dedos ──────────────────────────────────────────────────────

    private fun applyFingerBones(
        bones: List<LandmarkConstants.BoneDef>,
        lms: List<Landmark>?,
        alpha: Float
    ) {
        if (lms == null) return
        val wrist = lms[0].toVec3()
        for (def in bones) {
            val bone = avatar.bones[def.boneName] ?: continue
            val a = lms[def.lmStart].toVec3()
            val b = lms[def.lmEnd].toVec3()
            // Dirección a → b (en espacio world, relativo a muñeca).
            val ax = (a.x - wrist.x); val ay = -(a.y - wrist.y); val az = -(a.z - wrist.z)
            val bx = (b.x - wrist.x); val by = -(b.y - wrist.y); val bz = -(b.z - wrist.z)
            val dir = Vec3(bx - ax, by - ay, bz - az)
            rotateBone(bone, dir, alpha)
        }
    }

    // Cache de contexto actual (necesario para applyOneArm).
    private var _currentBody: BodyFrame? = null
    private var _currentHands: Map<HandSide, List<Landmark>> = emptyMap()
}

private class ArmRest {
    var shoulderL: Vec3 = Vec3.ZERO
    var shoulderR: Vec3 = Vec3.ZERO
    var upperArmL: Float = 0f
    var upperArmR: Float = 0f
    var forearmL: Float = 0f
    var forearmR: Float = 0f
}

private data class ArmBoneNames(
    val upper: String,
    val upper1: String,
    val fore: String,
    val fore1: String
)

/** Aplica un quaternion a un vector (rotación pura). Fórmula estándar. */
private fun Vec3.applyQuaternion(q: Quat): Vec3 {
    val n2 = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w
    val inv = if (n2 > 0f) 2f / n2 else 0f
    val xx = q.x * q.x * inv
    val yy = q.y * q.y * inv
    val zz = q.z * q.z * inv
    val xy = q.x * q.y * inv
    val xz = q.x * q.z * inv
    val yz = q.y * q.z * inv
    val wx = q.w * q.x * inv
    val wy = q.w * q.y * inv
    val wz = q.w * q.z * inv

    return Vec3(
        (1f - (yy + zz)) * x + (xy - wz) * y + (xz + wy) * z,
        (xy + wz) * x + (1f - (xx + zz)) * y + (yz - wx) * z,
        (xz - wy) * x + (yz + wx) * y + (1f - (xx + yy)) * z
    )
}
