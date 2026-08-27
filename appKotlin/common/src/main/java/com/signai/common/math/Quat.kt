package com.signai.common.math

import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Quaternion inmutable (x, y, z, w). Puerto mínimo de THREE.Quaternion.
 *
 * Convención: misma que Three.js / glTF — (x, y, z, w).
 */
data class Quat(val x: Float, val y: Float, val z: Float, val w: Float) {

    operator fun times(o: Quat): Quat {
        val ax = x; val ay = y; val az = z; val aw = w
        val bx = o.x; val by = o.y; val bz = o.z; val bw = o.w
        return Quat(
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz
        )
    }

    fun conjugate(): Quat = Quat(-x, -y, -z, w)

    fun inverse(): Quat {
        val n2 = x * x + y * y + z * z + w * w
        if (n2 < 1e-8f) return IDENTITY
        val inv = 1f / n2
        return Quat(-x * inv, -y * inv, -z * inv, w * inv)
    }

    fun normalize(): Quat {
        val l = sqrt(x * x + y * y + z * z + w * w)
        if (l < 1e-8f) return IDENTITY
        return Quat(x / l, y / l, z / l, w / l)
    }

    /** Devuelve un array de 9 floats (mat3 columnas) para construir TRS. */
    fun toMatrix3(): FloatArray {
        val xx = x * x; val yy = y * y; val zz = z * z
        val xy = x * y; val xz = x * z; val yz = y * z
        val wx = w * x; val wy = w * y; val wz = w * z
        return floatArrayOf(
            1f - 2f * (yy + zz), 2f * (xy + wz),       2f * (xz - wy),
            2f * (xy - wz),       1f - 2f * (xx + zz), 2f * (yz + wx),
            2f * (xz + wy),       2f * (yz - wx),       1f - 2f * (xx + yy)
        )
    }

    companion object {
        val IDENTITY = Quat(0f, 0f, 0f, 1f)

        /**
         * Rotación mínima que lleva `from` a `to` (ambos unitarios).
         * Puerto de THREE.Quaternion.setFromUnitVectors.
         */
        fun fromUnitVectors(from: Vec3, to: Vec3): Quat {
            val r = from.dot(to) + 1f
            return when {
                r < 1e-6f -> {
                    // Antiparalelos: elige eje ortogonal.
                    if (kotlin.math.abs(from.x) > kotlin.math.abs(from.z)) {
                        Quat(-from.y, from.x, 0f, 0f).normalize()
                    } else {
                        Quat(0f, -from.z, from.y, 0f).normalize()
                    }
                }
                else -> {
                    val axis = from.cross(to)
                    Quat(axis.x, axis.y, axis.z, r).normalize()
                }
            }
        }

        /** Rotación alrededor de un eje (en radianes). */
        fun fromAxisAngle(axis: Vec3, angleRad: Float): Quat {
            val half = angleRad * 0.5f
            val s = sin(half)
            val a = axis.normalize()
            return Quat(a.x * s, a.y * s, a.z * s, cos(half))
        }
    }
}

/**
 * Slerp entre dos quaternions. `t = 0` → a, `t = 1` → b.
 * Puerto de THREE.Quaternion.slerp.
 */
fun slerp(a: Quat, b: Quat, t: Float): Quat {
    var bx = b.x; var by = b.y; var bz = b.z; var bw = b.w
    var cosHalfTheta = a.w * bw + a.x * bx + a.y * by + a.z * bz
    if (cosHalfTheta < 0f) {
        bw = -bw; bx = -bx; by = -by; bz = -bz
        cosHalfTheta = -cosHalfTheta
    }
    if (cosHalfTheta >= 1f) return a
    val sq = if (cosHalfTheta > 0.9999f) 0f else (1f - cosHalfTheta * cosHalfTheta)
    val sinHalfTheta = sqrt(sq)
    if (sinHalfTheta < 1e-4f) {
        // Lineal en lugar de slerp para cuaterniones casi paralelos.
        val k = 1f - t
        return Quat(
            a.x * k + bx * t,
            a.y * k + by * t,
            a.z * k + bz * t,
            a.w * k + bw * t
        ).normalize()
    }
    val halfTheta = kotlin.math.atan2(sinHalfTheta, cosHalfTheta)
    val ratioA = sin(halfTheta * (1f - t)) / sinHalfTheta
    val ratioB = sin(halfTheta * t) / sinHalfTheta
    return Quat(
        a.x * ratioA + bx * ratioB,
        a.y * ratioA + by * ratioB,
        a.z * ratioA + bz * ratioB,
        a.w * ratioA + bw * ratioB
    )
}
