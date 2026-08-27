package com.signai.common.constants

/**
 * Constantes del dataset LSC50 y del avatar Rigify.
 * Puerto directo de `app/server.py` y `app/static/app.js`.
 *
 * Formato ID: SSSS_VVVV_RRRR (seña, voluntario, repetición).
 */
object LandmarkConstants {

    const val FPS = 30

    const val BODY_LANDMARK_COUNT = 33
    const val HAND_LANDMARK_COUNT = 21

    // Índices de body landmarks relevantes para IK de brazos.
    const val BODY_L_SHOULDER = 11
    const val BODY_R_SHOULDER = 12
    const val BODY_L_ELBOW = 13
    const val BODY_R_ELBOW = 14
    const val BODY_L_WRIST = 15
    const val BODY_R_WRIST = 16
    const val BODY_L_INDEX = 19
    const val BODY_R_INDEX = 20

    // Subset de FaceMesh (468) usado para animación. Ver server.py FACE_KEY_LMS.
    val FACE_KEY_LMS: List<Int> = listOf(
        13, 14,        // labio superior/inferior centro
        78, 308,       // comisura izq/der
        70, 107, 55,   // ceja izq (exterior, centro, interior)
        300, 336, 285, // ceja der (exterior, centro, interior)
        159, 145,      // párpado izq (sup, inf)
        386, 374,      // párpado der (sup, inf)
        1, 168         // nariz (punta, puente)
    )

    // Mapeo: cada dedo es [bone_name, lm_start, lm_end]. Ver app.js BONE_MAP.
    data class BoneDef(val boneName: String, val lmStart: Int, val lmEnd: Int)

    val LEFT_FINGER_BONES: List<BoneDef> = listOf(
        BoneDef("thumb01L", 1, 2), BoneDef("thumb02L", 2, 3), BoneDef("thumb03L", 3, 4),
        BoneDef("f_index01L", 5, 6), BoneDef("f_index02L", 6, 7), BoneDef("f_index03L", 7, 8),
        BoneDef("f_middle01L", 9, 10), BoneDef("f_middle02L", 10, 11), BoneDef("f_middle03L", 11, 12),
        BoneDef("f_ring01L", 13, 14), BoneDef("f_ring02L", 14, 15), BoneDef("f_ring03L", 15, 16),
        BoneDef("f_pinky01L", 17, 18), BoneDef("f_pinky02L", 18, 19), BoneDef("f_pinky03L", 19, 20)
    )

    val RIGHT_FINGER_BONES: List<BoneDef> = listOf(
        BoneDef("thumb01R", 1, 2), BoneDef("thumb02R", 2, 3), BoneDef("thumb03R", 3, 4),
        BoneDef("f_index01R", 5, 6), BoneDef("f_index02R", 6, 7), BoneDef("f_index03R", 7, 8),
        BoneDef("f_middle01R", 9, 10), BoneDef("f_middle02R", 10, 11), BoneDef("f_middle03R", 11, 12),
        BoneDef("f_ring01R", 13, 14), BoneDef("f_ring02R", 14, 15), BoneDef("f_ring03R", 15, 16),
        BoneDef("f_pinky01R", 17, 18), BoneDef("f_pinky02R", 18, 19), BoneDef("f_pinky03R", 19, 20)
    )

    // Huesos de brazo (Rigify) — nótese la convención distinta: "DEF-upper_armL".
    const val BONE_UPPER_ARM_L = "DEF-upper_armL"
    const val BONE_UPPER_ARM_L_1 = "DEF-upper_armL001"
    const val BONE_FOREARM_L = "DEF-forearmL"
    const val BONE_FOREARM_L_1 = "DEF-forearmL001"
    const val BONE_HAND_L = "DEF-handL"

    const val BONE_UPPER_ARM_R = "DEF-upper_armR"
    const val BONE_UPPER_ARM_R_1 = "DEF-upper_armR001"
    const val BONE_FOREARM_R = "DEF-forearmR"
    const val BONE_FOREARM_R_1 = "DEF-forearmR001"
    const val BONE_HAND_R = "DEF-handR"

    const val BONE_JAW_MASTER = "DEF-jaw_master"
    // Bug 1 fix (ver openspec/avatar/spec.md): el nombre real es "DEF-brow.T.L", no "DEF-browTL".
    const val BONE_BROW_T_L = "DEF-brow.T.L"
    const val BONE_BROW_T_R = "DEF-brow.T.R"
}
