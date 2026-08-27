package com.signai.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.signai.app.presentation.ui.screens.SignAIScreen
import com.signai.app.ui.theme.SignAITheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SignAITheme {
                SignAIScreen()
            }
        }
    }
}
