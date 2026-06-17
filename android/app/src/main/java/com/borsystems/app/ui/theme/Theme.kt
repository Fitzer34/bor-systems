package com.borsystems.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// ─── HazardLink palette ───────────────────────────────────────────────
// Source: BRAND.md. Same hex codes used on iOS, the web admin, and the
// marketing landing page so a customer who sees the orange in an alert
// notification immediately recognises it on every surface.
val HazardOrange      = Color(0xFFFF8800)
val HazardOrangeDark  = Color(0xFFE67700)
val HazardRed         = Color(0xFFE53935)
val HazardGreen       = Color(0xFF2E7D32)
val HazardInk         = Color(0xFF0F172A)
val HazardGrey        = Color(0xFF64748B)
val HazardSoft        = Color(0xFFF8FAFC)

private val LightColors = lightColorScheme(
    primary           = HazardOrange,
    onPrimary         = Color.White,
    primaryContainer  = Color(0xFFFFE0B2),
    onPrimaryContainer = HazardInk,
    secondary         = HazardGreen,
    onSecondary       = Color.White,
    tertiary          = HazardInk,
    error             = HazardRed,
    onError           = Color.White,
    errorContainer    = Color(0xFFFFDAD6),
    onErrorContainer  = Color(0xFF410002),
    background        = Color.White,
    onBackground      = HazardInk,
    surface           = Color.White,
    onSurface         = HazardInk,
    surfaceVariant    = HazardSoft,
    onSurfaceVariant  = HazardGrey,
    outline           = Color(0xFFE2E8F0),
)

private val DarkColors = darkColorScheme(
    primary           = HazardOrange,
    onPrimary         = Color.Black,
    primaryContainer  = HazardOrangeDark,
    onPrimaryContainer = Color.White,
    secondary         = HazardGreen,
    error             = HazardRed,
    background        = Color(0xFF0B1220),
    onBackground      = Color(0xFFE2E8F0),
    surface           = Color(0xFF111827),
    onSurface         = Color(0xFFE2E8F0),
    surfaceVariant    = Color(0xFF1F2937),
    onSurfaceVariant  = Color(0xFF9CA3AF),
    outline           = Color(0xFF374151),
)

private val HazardTypography = Typography(
    // Tighten the default Material 3 weights — iOS uses a slightly bolder
    // hierarchy that reads better at glance distance (alerts on a wall
    // screen, watch face, etc.).
    headlineLarge  = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold,    letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.SemiBold),
    titleLarge     = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
    titleMedium    = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge      = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Normal),
    bodyMedium     = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Normal),
    labelLarge     = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
)

/**
 * App-wide theme. Always uses the HazardLink palette — we explicitly do
 * NOT opt into Material You / dynamic colours, because that would let the
 * OS swap our orange for the user's wallpaper accent, breaking brand
 * recognition across the marketing site, web admin, iOS app, and the
 * push-notification colour swatch.
 */
@Composable
fun BORSystemsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = HazardTypography,
        content = content,
    )
}
