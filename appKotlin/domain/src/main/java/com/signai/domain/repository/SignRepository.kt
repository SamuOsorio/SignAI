package com.signai.domain.repository

import com.signai.domain.model.Sign
import com.signai.domain.model.SignLandmarks

/**
 * Repositorio de señas. Tiene dos responsabilidades:
 * 1. Listar el catálogo disponible.
 * 2. Cargar los landmarks de una seña específica.
 *
 * La implementación concreta vive en `:data`.
 */
interface SignRepository {
    suspend fun listSigns(): List<Sign>
    suspend fun getSignLandmarks(signId: String): SignLandmarks?
}
