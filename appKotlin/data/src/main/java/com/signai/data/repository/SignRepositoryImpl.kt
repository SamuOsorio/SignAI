package com.signai.data.repository

import com.signai.data.parser.CsvLandmarksParser
import com.signai.data.source.LandmarksAssetDataSource
import com.signai.domain.model.Sign
import com.signai.domain.model.SignLandmarks
import com.signai.domain.repository.SignRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SignRepositoryImpl(
    private val dataSource: LandmarksAssetDataSource,
    private val parser: CsvLandmarksParser = CsvLandmarksParser()
) : SignRepository {

    override suspend fun listSigns(): List<Sign> = withContext(Dispatchers.IO) {
        val ids = dataSource.listSignIds()
        ids.mapNotNull { dataSource.loadSignMeta(it) }
    }

    override suspend fun getSignLandmarks(signId: String): SignLandmarks? = withContext(Dispatchers.IO) {
        val body = dataSource.readBody(signId)
        val face = dataSource.readFace(signId)
        val left = dataSource.readLeftHand(signId)
        val right = dataSource.readRightHand(signId)

        if (body.isNullOrEmpty() && left.isNullOrEmpty() && right.isNullOrEmpty()) {
            return@withContext null
        }

        parser.parse(
            stem = signId,
            leftHandCsv = left,
            rightHandCsv = right,
            bodyCsv = body,
            faceCsv = face
        )
    }
}
