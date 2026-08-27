package com.signai.common.math

import kotlin.math.sqrt

/**
 * Vector 3D inmutable. Operaciones devuelven nuevas instancias.
 * Puerto mínimo de THREE.Vector3 para los cálculos de pose.
 */
data class Vec3(val x: Float, val y: Float, val z: Float) {

    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun unaryMinus() = Vec3(-x, -y, -z)

    operator fun times(s: Float) = Vec3(x * s, y * s, z * s)

    fun lengthSq(): Float = x * x + y * y + z * z
    fun length(): Float = sqrt(lengthSq())

    fun normalize(): Vec3 {
        val l = length()
        return if (l < 1e-8f) ZERO else Vec3(x / l, y / l, z / l)
    }

    fun dot(o: Vec3): Float = x * o.x + y * o.y + z * o.z

    fun cross(o: Vec3): Vec3 = Vec3(
        y * o.z - z * o.y,
        z * o.x - x * o.z,
        x * o.y - y * o.x
    )

    /**
     * Project this vector onto the plane perpendicular to `n`.
     * `result = v - (v·n̂) n̂` — exact port of app.js Three.js helper.
     */
    fun projectPerpendicular(n: Vec3): Vec3 {
        val nHat = n.normalize()
        return this - nHat * dot(nHat)
    }

    fun addScaledVector(v: Vec3, s: Float): Vec3 = this + v * s

    companion object {
        val ZERO = Vec3(0f, 0f, 0f)
        val UP = Vec3(0f, 1f, 0f)
        val RIGHT = Vec3(1f, 0f, 0f)
        val FORWARD = Vec3(0f, 0f, 1f)
    }
}
