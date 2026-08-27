package com.signai.data.source

import android.content.Context
import com.signai.domain.model.Sign
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader

/**
 * Lee CSVs de landmarks desde `assets/landmarks/<signId>/`.
 *
 * Estructura esperada (un directorio por seña):
 *   assets/landmarks/0000_0000_0000/
 *     ├── body.csv
 *     ├── face.csv
 *     ├── left_hand.csv
 *     └── right_hand.csv
 */
class LandmarksAssetDataSource(private val context: Context) {

    private val basePath = "landmarks"

    /**
     * Lista los IDs de seña que tienen un directorio en `assets/landmarks/`.
     * No intenta cargar ningún CSV — solo el listing.
     */
    suspend fun listSignIds(): List<String> = withContext(Dispatchers.IO) {
        val assetManager = context.assets
        val names = assetManager.list(basePath) ?: return@withContext emptyList()
        // Cada entry es una carpeta con un ID de seña.
        names.filter { assetManager.list("$basePath/$it")?.contains("body.csv") == true }
            .sorted()
    }

    suspend fun loadSignMeta(signId: String): Sign? {
        val parts = signId.split("_")
        if (parts.size != 3) return null
        val signIndex = parts[0].toIntOrNull() ?: return null
        val volunteer = parts[1].toIntOrNull() ?: return null
        val repetition = parts[2].toIntOrNull() ?: return null
        return Sign(
            id = signId,
            signIndex = signIndex,
            volunteer = volunteer,
            repetition = repetition
        )
    }

    suspend fun readCsvFile(relativePath: String): List<String>? {
        return withContext(Dispatchers.IO) {
            runCatching {
                context.assets.open(relativePath).use { input ->
                    BufferedReader(input.reader()).readLines()
                }
            }.getOrNull()
        }
    }

    suspend fun readBody(signId: String): List<String>? = readCsvFile("$basePath/$signId/body.csv")
    suspend fun readFace(signId: String): List<String>? = readCsvFile("$basePath/$signId/face.csv")
    suspend fun readLeftHand(signId: String): List<String>? = readCsvFile("$basePath/$signId/left_hand.csv")
    suspend fun readRightHand(signId: String): List<String>? = readCsvFile("$basePath/$signId/right_hand.csv")
}
