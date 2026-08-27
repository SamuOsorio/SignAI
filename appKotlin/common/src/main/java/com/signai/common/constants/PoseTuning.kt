package com.signai.common.constants

/**
 * Constantes de tuning del pose-applier. Puerto de app.js (Z_SCALE, FACE_*).
 */
object PoseTuning {

    /** Factor empírico para profundidad del brazo. Ver app.js Z_SCALE. */
    const val Z_SCALE = 0.40f

    /** Alpha de slerp para huesos faciales (siempre snap). */
    const val FACE_ALPHA = 1.0f

    /** Apertura máxima de mandíbula en radianes. */
    const val FACE_JAW_MAX = 1.2f

    /** Altura de ceja neutra normalizada (referencia). */
    const val FACE_REF_BROW = 0.47f

    /** Amplificación del delta de ceja → radianes. */
    const val FACE_BROW_SCALE = 6.0f

    /** Bias vertical (hacia abajo) del polo IK del codo. */
    const val IK_POLE_DOWN = 0.35f

    /** Bias frontal del polo IK del codo. */
    const val IK_POLE_FRONT = 0.10f
}
