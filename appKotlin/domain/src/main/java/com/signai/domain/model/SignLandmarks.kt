package com.signai.domain.model

/**
 * Resultado de cargar todos los landmarks de una seña.
 * `frames` debe alinearse con FPS = 30 (LSC50 body/hands).
 */
data class SignLandmarks(
    val stem: String,
    val fps: Int,
    val totalFrames: Int,
    val framesWithHand: Int,
    val detectionRate: Float,
    val source: String,
    val frames: List<Frame>
)
