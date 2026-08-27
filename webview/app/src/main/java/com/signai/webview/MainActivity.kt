package com.signai.webview

import android.content.Context
import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshots.SnapshotStateList as SnapshotList
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.foundation.layout.width
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
    val context = LocalContext.current
    val webViewRef = remember { mutableStateOf<WebView?>(null) }
    val history = remember {
        mutableStateListOf<String>().apply {
            val saved = context.getSharedPreferences("signai", Context.MODE_PRIVATE)
                .getString("history", "") ?: ""
            if (saved.isNotEmpty()) addAll(saved.split("\n"))
        }
    }
    // Opciones de configuración
    var showSettings by remember { mutableStateOf(false) }
    var debugOn by remember { mutableStateOf(true) }
    var freeCamOn by remember { mutableStateOf(false) }
    var gridOn by remember { mutableStateOf(true) }
    var bgOn by remember { mutableStateOf(false) }
    var sign by remember { mutableStateOf("0000_0000_0000") }

    // Blur del WebView detrás de la sidebar (Android 12+)
    LaunchedEffect(showSettings) {
        webViewRef.value?.let { wv ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                wv.setRenderEffect(
                    if (showSettings) RenderEffect.createBlurEffect(16f, 16f, Shader.TileMode.CLAMP)
                    else null
                )
            }
        }
    }

    val play: (String) -> Unit = { text ->
        if (text.isNotBlank()) {
            // Ya está en el top 5 → no se re-agrega ni reordena
            if (!(history.take(5).contains(text))) {
                history.remove(text)          // si estaba más abajo, sube al tope
                history.add(0, text)
                while (history.size > 20) history.removeAt(history.size - 1)
            }
        }
        context.getSharedPreferences("signai", Context.MODE_PRIVATE)
            .edit().putString("history", history.joinToString("\n")).apply()
        webViewRef.value?.evaluateJavascript("window.SignAI?.play()", null)
    }
    val sendJs: (String) -> Unit = { js ->
        webViewRef.value?.evaluateJavascript(js, null)
    }
    Box(Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                TopBar(
                    history = history,
                    onReplay = { play(it) },
                    onOpenSettings = { showSettings = true },
                )
            },
            bottomBar = { BottomBar(onSend = { play(it) }, onMic = { play("mic") }) },
        ) { innerPadding ->
            AvatarWebView(Modifier.padding(innerPadding), onReady = { webViewRef.value = it })
        }
        // Overlay: cubre todo, incluidas TopBar y BottomBar
        SettingsSidebar(
            visible = showSettings,
            onDismiss = { showSettings = false },
            sendJs = sendJs,
            debugOn = debugOn, onDebug = { debugOn = it },
            freeCamOn = freeCamOn, onFreeCam = { freeCamOn = it },
            gridOn = gridOn, onGrid = { gridOn = it },
            bgOn = bgOn, onBg = { bgOn = it },
            sign = sign, onSign = { sign = it },
        )
    }
}

private fun jsToggle(prop: String, on: Boolean) =
    "window.SignAI?.${prop}(!!${on})"

@Composable
private fun SettingsSidebar(
    visible: Boolean,
    onDismiss: () -> Unit,
    sendJs: (String) -> Unit,
    debugOn: Boolean, onDebug: (Boolean) -> Unit,
    freeCamOn: Boolean, onFreeCam: (Boolean) -> Unit,
    gridOn: Boolean, onGrid: (Boolean) -> Unit,
    bgOn: Boolean, onBg: (Boolean) -> Unit,
    sign: String, onSign: (String) -> Unit,
) {
    // Scrim: tocar fuera cierra
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(Modifier.fillMaxSize().clickable(
                indication = null, interactionSource = remember { MutableInteractionSource() }
            ) { onDismiss() })
        }
        AnimatedVisibility(
            visible = visible,
            enter = slideInHorizontally(initialOffsetX = { it }) + fadeIn(),
            exit = slideOutHorizontally(targetOffsetX = { it }) + fadeOut(),
            modifier = Modifier.fillMaxHeight().align(Alignment.CenterEnd),
        ) {
        Surface(
            color = Bar,
            modifier = Modifier.fillMaxHeight().width(300.dp),
        ) {
            Column(
                modifier = Modifier
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("Configuración", style = MaterialTheme.typography.titleMedium, color = Color.White)
                Spacer(Modifier.height(8.dp))

                SettingCheck("Modo debug", debugOn) {
                    onDebug(it)
                    sendJs(jsToggle("setDebug", it))
                }
                SettingCheck("Cámara libre (orbitar + zoom sin límite)", freeCamOn) {
                    onFreeCam(it)
                    sendJs(jsToggle("setFreeCamera", it))
                }
                SettingCheck("Suelo (grilla)", gridOn) {
                    onGrid(it)
                    sendJs(jsToggle("setGrid", it))
                }
                SettingCheck("Fondo bosque", bgOn) {
                    onBg(it)
                    sendJs(jsToggle("setBackground", it))
                }

                Spacer(Modifier.height(8.dp))
                // Selector de señas
                var expanded by remember { mutableStateOf(false) }
                val signs = listOf("0000_0000_0000")
                OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Seña: $sign", color = TextMain, maxLines = 1)
                }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, containerColor = Input) {
                    signs.forEach { s ->
                        DropdownMenuItem(
                            text = { Text(if (s == sign) "✓ $s" else s, color = TextMain) },
                            onClick = { expanded = false; onSign(s) },
                        )
                    }
                }
            }
        }
    }
    }
}

@Composable
private fun SettingCheck(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Text(label, color = TextMain, modifier = Modifier.padding(start = 4.dp))
    }
}

@Composable
private fun TopBar(history: SnapshotList<String>, onReplay: (String) -> Unit, onOpenSettings: () -> Unit) {
    var showHistory by remember { mutableStateOf(false) }
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
            Row {
                Box {
                    IconButton(onClick = { showHistory = true }) {
                        Icon(Icons.Default.History, contentDescription = "Historial", tint = TextMain)
                    }
                    DropdownMenu(
                        expanded = showHistory,
                        onDismissRequest = { showHistory = false },
                        containerColor = Input,
                        modifier = Modifier.heightIn(max = 280.dp), // ~5 ítems de 56dp, scrollea el resto
                    ) {
                        if (history.isEmpty()) {
                            DropdownMenuItem(text = { Text("Sin historial", color = TextMain) }, onClick = {})
                        } else {
                            val maxChars = 10
                            history.forEach { item ->
                                val label = if (item.length > maxChars) item.take(maxChars) + "..." else item
                                DropdownMenuItem(
                                    text = { Text(label, color = TextMain, maxLines = 1) },
                                    onClick = {
                                        showHistory = false
                                        onReplay(item)
                                    },
                                )
                            }
                        }
                    }
                }
                IconButton(onClick = onOpenSettings) {
                    Icon(Icons.Default.Settings, contentDescription = "Configuración", tint = TextMain)
                }
            }
        }
    }
}

@Composable
private fun AvatarWebView(modifier: Modifier = Modifier, onReady: (WebView) -> Unit) {
    val context = LocalContext.current
    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = {
            WebView(it).apply {
                settings.javaScriptEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
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
                    ): WebResourceResponse? {
                        val resp = assetLoader.shouldInterceptRequest(request.url) ?: return null
                        val headers = resp.responseHeaders ?: mutableMapOf()
                        headers["Cache-Control"] = "no-store"
                        resp.responseHeaders = headers
                        return resp
                    }
                }
                loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
                onReady(this)
            }
        },
    )
}

@Composable
private fun BottomBar(onSend: (String) -> Unit = {}, onMic: () -> Unit = {}) {
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
                onClick = onMic,
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
                    val text = query.trim()
                    query = ""
                    keyboard?.hide()
                    if (text.isNotEmpty()) onSend(text)
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
