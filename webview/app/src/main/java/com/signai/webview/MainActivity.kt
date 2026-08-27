package com.signai.webview

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

// Paleta de app/static/style.css
private val Bg = Color(0xFF0F1117)
private val Bar = Color(0xFF1A1D27)
private val Border = Color(0xFF2A2D3A)
private val Input = Color(0xFF1E2130)
private val InputBorder = Color(0xFF333333)
private val TextMain = Color(0xFFE0E0E0)
private val Primary = Color(0xFF1D4ED8)

private val SignAIColors = darkColorScheme(
    background = Bg,
    surface = Bar,
    onBackground = TextMain,
    onSurface = Color.White,
    primary = Primary,
    onPrimary = Color.White,
    outline = Border,
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = SignAIColors) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    MainScreen()
                }
            }
        }
    }
}

@Composable
fun MainScreen() {
    Scaffold(
        topBar = { TopBar() },
        bottomBar = { BottomBar() },
    ) { innerPadding ->
        AvatarWebView(Modifier.padding(innerPadding))
    }
}

@Composable
private fun TopBar() {
    Surface(color = Bar) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "SignAI",
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                modifier = Modifier.padding(vertical = 12.dp),
            )
            IconButton(onClick = { /* Configuración: pendiente */ }) {
                Icon(Icons.Default.Settings, contentDescription = "Configuración", tint = TextMain)
            }
        }
    }
}

@Composable
private fun AvatarWebView(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = {
            WebView(it).apply {
                settings.javaScriptEnabled = true
                webChromeClient = object : android.webkit.WebChromeClient() {
                    override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                        android.util.Log.d("SignAIWeb", "${message.messageLevel()}: ${message.message()} @${message.lineNumber()}")
                        return true
                    }
                }
                val assetLoader = WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                    .build()
                webViewClient = object : WebViewClientCompat() {
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest,
                    ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
                }
                loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
            }
        },
    )
}

@Composable
private fun BottomBar() {
    Column(
        modifier = Modifier
            .navigationBarsPadding()
            .imePadding()
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
    var query by rememberSaveable { mutableStateOf("") }
    val keyboard = LocalSoftwareKeyboardController.current
    OutlinedTextField(
        value = query,
        onValueChange = { query = it },
            placeholder = { Text("Versión: ${BuildConfig.VERSION_NAME}") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Primary,
                unfocusedBorderColor = InputBorder,
                focusedTextColor = TextMain,
                unfocusedTextColor = TextMain,
            ),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val shape = RoundedCornerShape(6.dp)
            FilledIconButton(
                onClick = { /* Micrófono real: pendiente */ },
                modifier = Modifier.weight(0.25f).height(56.dp).border(1.dp, InputBorder, shape),
                shape = shape,
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = Input,
                    contentColor = TextMain,
                ),
            ) {
                Icon(Icons.Default.Mic, contentDescription = "Micrófono")
            }
            Button(
                onClick = {
                    query = ""
                    keyboard?.hide()
                },
                modifier = Modifier.weight(0.75f).height(56.dp),
                shape = shape,
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
            ) {
                Icon(Icons.Default.Send, contentDescription = "Enviar")
            }
        }
    }
}
