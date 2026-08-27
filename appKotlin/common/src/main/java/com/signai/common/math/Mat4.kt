package com.signai.common.math

import kotlin.math.sqrt

/**
 * Helpers para manipular matrices 4x4 column-major (formato Filament / OpenGL).
 *
 * Layout column-major:
 * ```
 * | m[0]  m[4]  m[8]  m[12] |
 * | m[1]  m[5]  m[9]  m[13] |
 * | m[2]  m[6]  m[10] m[14] |
 * | m[3]  m[7]  m[11] m[15] |
 * ```
 *
 * m[12..14] = translation, m[15] = 1.
 * m[0..10] = 3x3 rotation/scale (column-major).
 */
object Mat4 {

    /** Construye TRS como matriz column-major (16 floats). */
    fun ofTRS(translation: Vec3, rotation: Quat, scale: Float = 1f): FloatArray {
        val m = FloatArray(16)
        val q = rotation.normalize()
        val x = q.x; val y = q.y; val z = q.z; val w = q.w
        val xx = x * x; val yy = y * y; val zz = z * z
        val xy = x * y; val xz = x * z; val yz = y * z
        val wx = w * x; val wy = w * y; val wz = w * z

        // Column 0
        m[0] = (1f - 2f * (yy + zz)) * scale
        m[1] = (2f * (xy + wz)) * scale
        m[2] = (2f * (xz - wy)) * scale
        m[3] = 0f
        // Column 1
        m[4] = (2f * (xy - wz)) * scale
        m[5] = (1f - 2f * (xx + zz)) * scale
        m[6] = (2f * (yz + wx)) * scale
        m[7] = 0f
        // Column 2
        m[8] = (2f * (xz + wy)) * scale
        m[9] = (2f * (yz - wx)) * scale
        m[10] = (1f - 2f * (xx + yy)) * scale
        m[11] = 0f
        // Column 3
        m[12] = translation.x
        m[13] = translation.y
        m[14] = translation.z
        m[15] = 1f
        return m
    }

    /** Extrae la traslación de la matriz column-major (m[12..14]). */
    fun getTranslation(m: FloatArray, out: Vec3): Vec3 = Vec3(m[12], m[13], m[14])

    /** Construye quaternion de rotación desde la matriz column-major (sin scale). */
    fun getRotation(m: FloatArray): Quat {
        // Algoritmo de Shepperd (column-major).
        val trace = m[0] + m[5] + m[10]
        return when {
            trace > 0f -> {
                val s = sqrt(trace + 1f) * 2f
                Quat(
                    x = (m[6] - m[9]) / s,
                    y = (m[8] - m[2]) / s,
                    z = (m[1] - m[4]) / s,
                    w = 0.25f * s
                )
            }
            m[0] > m[5] && m[0] > m[10] -> {
                val s = sqrt(1f + m[0] - m[5] - m[10]) * 2f
                Quat(
                    x = 0.25f * s,
                    y = (m[4] + m[1]) / s,
                    z = (m[8] + m[2]) / s,
                    w = (m[6] - m[9]) / s
                )
            }
            m[5] > m[10] -> {
                val s = sqrt(1f + m[5] - m[0] - m[10]) * 2f
                Quat(
                    x = (m[4] + m[1]) / s,
                    y = 0.25f * s,
                    z = (m[9] + m[6]) / s,
                    w = (m[8] - m[2]) / s
                )
            }
            else -> {
                val s = sqrt(1f + m[10] - m[0] - m[5]) * 2f
                Quat(
                    x = (m[8] + m[2]) / s,
                    y = (m[9] + m[6]) / s,
                    z = 0.25f * s,
                    w = (m[1] - m[4]) / s
                )
            }
        }
    }
}
