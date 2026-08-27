package com.signai.domain.usecase

import com.signai.domain.model.SignLandmarks
import com.signai.domain.repository.SignRepository

class GetSignLandmarksUseCase(private val repository: SignRepository) {
    suspend operator fun invoke(signId: String): SignLandmarks? =
        repository.getSignLandmarks(signId)
}
