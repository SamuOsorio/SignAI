package com.signai.app.di

import android.content.Context
import com.signai.data.repository.SignRepositoryImpl
import com.signai.data.source.LandmarksAssetDataSource
import com.signai.domain.repository.SignRepository
import com.signai.domain.usecase.GetSignLandmarksUseCase
import com.signai.domain.usecase.GetSignsUseCase

/**
 * Service Locator minimal. Para esta fase evitamos Hilt — lo añadiremos
 * en una fase posterior si la app crece.
 */
object ServiceLocator {

    @Volatile
    private var repository: SignRepository? = null

    fun provideSignRepository(context: Context): SignRepository {
        return repository ?: synchronized(this) {
            repository ?: SignRepositoryImpl(LandmarksAssetDataSource(context))
                .also { repository = it }
        }
    }

    fun provideGetSignsUseCase(context: Context): GetSignsUseCase =
        GetSignsUseCase(provideSignRepository(context))

    fun provideGetSignLandmarksUseCase(context: Context): GetSignLandmarksUseCase =
        GetSignLandmarksUseCase(provideSignRepository(context))
}
