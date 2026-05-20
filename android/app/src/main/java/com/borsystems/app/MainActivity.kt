package com.borsystems.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.ui.MainScaffold
import com.borsystems.app.ui.auth.LoginScreen
import com.borsystems.app.ui.theme.BORSystemsTheme

/**
 * Single-Activity Android app. The Activity is a thin host for the Compose
 * UI — same pattern as iOS where BORSystemsApp hosts ContentView.
 *
 * Auth state lives in AuthStore (singleton). When `user` is null we show
 * LoginScreen; otherwise we show MainScaffold (the bottom-nav root).
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Bootstrap any persisted session (token in EncryptedSharedPreferences).
        AuthStore.bootstrap()

        setContent {
            BORSystemsTheme {
                val user by AuthStore.user.collectAsState()
                if (user == null) LoginScreen() else MainScaffold()
            }
        }
    }
}
