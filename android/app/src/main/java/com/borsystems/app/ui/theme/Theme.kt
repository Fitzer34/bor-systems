package com.borsystems.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val BorOrange = Color(0xFFFF8800)   // accent — wet-floor sign yellow-orange
private val BorRed    = Color(0xFFE53935)
private val BorGreen  = Color(0xFF2E7D32)

private val LightColors = lightColorScheme(
    primary = BorOrange,
    secondary = BorGreen,
    error = BorRed,
)

private val DarkColors = darkColorScheme(
    primary = BorOrange,
    secondary = BorGreen,
    error = BorRed,
)

/**
 * App-wide theme. Uses Material 3 dynamic colours on Android 12+ when
 * available (the OS picks tones from the user's wallpaper), falling
 * back to our brand palette on older devices.
 */
@Composable
fun BORSystemsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        darkTheme -> DarkColors
        else      -> LightColors
    }
    MaterialTheme(colorScheme = colors, content = content)
}
