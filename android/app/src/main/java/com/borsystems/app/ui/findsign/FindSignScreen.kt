package com.borsystems.app.ui.findsign

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.borsystems.app.network.ApiClient

/**
 * AirTag-style "Find Sign" screen — mirrors iOS FindSignView.swift.
 *
 * Opens NearbyInteraction-equivalent UWB ranging via androidx.core.uwb
 * against the sign tag's DWM3001 module. Falls back to a "no UWB on this
 * device" panel when the phone doesn't have UWB hardware (Pixel 6 Pro+,
 * Galaxy S21 Ultra+, Galaxy S22+ Ultra are the main devices that do).
 *
 * Connected via the SignFinder state machine which handles BLE pairing
 * + UWB token exchange + ranging callbacks.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FindSignScreen(alertId: String, zoneName: String?, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val finder = remember { SignFinder(ctx) }
    val state by finder.state.collectAsState()

    LaunchedEffect(alertId) { finder.start(alertId) }
    DisposableEffect(Unit) { onDispose { finder.stop() } }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(zoneName ?: "Find sign") },
            navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
        )
    }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
            when (val s = state) {
                is SignFinder.State.Idle,
                is SignFinder.State.LookingUp     -> CircularProgressIndicator()
                is SignFinder.State.Connecting    -> Connecting()
                is SignFinder.State.Ranging       -> Ranging(s.distance, s.bearingDegrees)
                is SignFinder.State.SignFound     -> Found()
                is SignFinder.State.Unavailable   -> Unavailable(s.reason)
            }
        }
    }
}

@Composable
private fun Connecting() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator()
        Text("Connecting to sign…", style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun Ranging(distance: Float, bearingDegrees: Float?) {
    val rotation by animateFloatAsState(
        targetValue = bearingDegrees ?: 0f,
        animationSpec = tween(durationMillis = 100),
        label = "arrow",
    )

    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Icon(
            Icons.Default.Navigation,
            contentDescription = null,
            tint = distanceColor(distance),
            modifier = Modifier
                .size(180.dp)
                .rotate(rotation),
        )

        Text(
            formatDistance(distance),
            color = distanceColor(distance),
            fontSize = 56.sp,
            fontWeight = FontWeight.SemiBold,
        )

        Text(
            hintText(distance, bearingDegrees),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Found() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("✅", fontSize = 72.sp)
        Text("Sign found", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Place it back on the hanger when done.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Unavailable(reason: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Default.LocationOff, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Precision finding unavailable", style = MaterialTheme.typography.titleMedium)
        Text(reason, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            "Showing the zone on the floor plan instead.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun formatDistance(m: Float): String =
    if (m < 1f) "${(m * 100).toInt()} cm" else "%.1f m".format(m)

private fun distanceColor(m: Float): Color = when {
    m < 0.5f -> Color(0xFF2E7D32)
    m < 2f   -> Color(0xFFFFC107)
    m < 5f   -> Color(0xFFFF9800)
    else     -> Color(0xFFE53935)
}

private fun hintText(distance: Float, bearing: Float?): String {
    if (bearing == null) return "Walk a few steps so we can find direction"
    val b = ((bearing + 360f) % 360f).toInt()
    return when {
        distance < 0.5f       -> "You're right next to it"
        b in 315..359 || b in 0..44 -> "Keep walking forward"
        b in 45..134          -> "Sign is to your right"
        b in 135..224         -> "Sign is behind you — turn around"
        else                  -> "Sign is to your left"
    }
}
