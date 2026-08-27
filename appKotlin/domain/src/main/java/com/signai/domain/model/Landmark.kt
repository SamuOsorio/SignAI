package com.signai.domain.model

/**
 * Landmark 3D crudo. Coordenadas según MediaPipe (imagen normalizada):
 * - x, y ∈ [0, 1]
 * - z es profundidad relativa (misma unidad que x).
 */
data class Landmark(val x: Float, val y: Float, val z: Float) {
    companion object {
        val ZERO = Landmark(0f, 0f, 0f)
    }
}
