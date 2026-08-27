package com.signai.app.presentation.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.signai.app.di.ServiceLocator
import com.signai.domain.model.Sign
import com.signai.domain.model.SignLandmarks
import com.signai.domain.usecase.GetSignLandmarksUseCase
import com.signai.domain.usecase.GetSignsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MainUiState(
    val signs: List<Sign> = emptyList(),
    val selectedSignId: String? = null,
    val status: String = "Cargando...",
    val landmarks: SignLandmarks? = null
)

class MainViewModel(
    private val getSigns: GetSignsUseCase,
    private val getLandmarks: GetSignLandmarksUseCase
) : ViewModel() {

    private val _state = MutableStateFlow(MainUiState())
    val state: StateFlow<MainUiState> = _state.asStateFlow()

    init {
        loadSigns()
    }

    private fun loadSigns() {
        viewModelScope.launch {
            val signs = runCatching { getSigns() }.getOrElse {
                _state.value = _state.value.copy(status = "Error: ${it.message}")
                return@launch
            }
            _state.value = _state.value.copy(
                signs = signs,
                status = if (signs.isEmpty()) "Sin CSVs en assets/landmarks/" else "${signs.size} señas disponibles"
            )
            signs.firstOrNull()?.let { selectSign(it.id) }
        }
    }

    fun selectSign(signId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                selectedSignId = signId,
                status = "Cargando landmarks..."
            )
            val data = runCatching { getLandmarks(signId) }.getOrNull()
            _state.value = _state.value.copy(
                landmarks = data,
                status = if (data != null) {
                    "${data.totalFrames} frames · ${(data.detectionRate * 100).toInt()}% detección"
                } else "Sin datos para $signId"
            )
        }
    }

    class Factory(private val app: Application) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return MainViewModel(
                getSigns = ServiceLocator.provideGetSignsUseCase(app),
                getLandmarks = ServiceLocator.provideGetSignLandmarksUseCase(app)
            ) as T
        }
    }
}
