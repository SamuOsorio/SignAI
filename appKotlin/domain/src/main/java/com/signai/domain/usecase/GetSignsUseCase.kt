package com.signai.domain.usecase

import com.signai.domain.model.Sign
import com.signai.domain.repository.SignRepository

class GetSignsUseCase(private val repository: SignRepository) {
    suspend operator fun invoke(): List<Sign> = repository.listSigns()
}
