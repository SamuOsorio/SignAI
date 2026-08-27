package com.signai.app.presentation.ui.screens

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import android.view.SurfaceView
import com.signai.app.render.FilamentRenderer

@Composable
fun SignAIScreen() {
    val context = LocalContext.current
    val renderer = remember { FilamentRenderer(context) }

    DisposableEffect(Unit) {
        onDispose { renderer.destroy() }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            SurfaceView(ctx).also { sv ->
                sv.setOnTouchListener { _, ev ->
                    renderer.onTouchEvent(ev)
                    true
                }
                renderer.attach(sv)
            }
        }
    )
}
