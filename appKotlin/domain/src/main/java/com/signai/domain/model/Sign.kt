package com.signai.domain.model

/**
 * Metadato de una seña del catálogo LSC50.
 * `id` tiene formato SSSS_VVVV_RRRR (seña_voluntario_repetición).
 */
data class Sign(
    val id: String,
    val signIndex: Int,
    val volunteer: Int,
    val repetition: Int
)
