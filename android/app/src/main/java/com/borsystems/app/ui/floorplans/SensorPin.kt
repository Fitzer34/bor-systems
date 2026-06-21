package com.borsystems.app.ui.floorplans

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * A single wet-floor-sign sensor pin, the live marker on the floor plan.
 *
 * Round footprint (vs square gateway markers) keeps sensors and gateways
 * distinct. The glyph is the classic A-frame "caution / wet floor" sign drawn in
 * white so it reads on every fill. Alert/cleaning states gently pulse; offline
 * shows a "?"; low battery clips a small badge to the corner.
 *
 * Android port of web components/SensorPin.tsx (SensorPin).
 */
@Composable
fun SensorPin(
    state: SensorState,
    lowBattery: Boolean = false,
    selected: Boolean = false,
    sizeDp: Dp = 28.dp,
    onClick: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val color = sensorColor(state)

    // Pulse alpha for live spill / cleaning so a moving sign draws the eye.
    // The transition is created unconditionally (so the slot count is stable as
    // a pin changes state live) and only *applied* when the state pulses.
    val pulse = state == SensorState.Alert || state == SensorState.Cleaning
    val transition = rememberInfiniteTransition(label = "pinPulse")
    val pulsing by transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.45f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "pinAlpha",
    )
    val alpha = if (pulse) pulsing else 1f

    Box(
        modifier
            .size(sizeDp)
            .alpha(alpha)
            .clip(CircleShape)
            .background(color)
            .then(
                if (selected) Modifier.border(2.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                else Modifier.border(BorderStroke(2.dp, Color.White), CircleShape)
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        // A-frame wet-floor glyph, drawn with simple strokes in white.
        Box(
            Modifier
                .size(sizeDp)
                .drawBehind {
                    val w = size.width
                    val h = size.height
                    val s = Stroke(width = w * 0.09f)
                    val white = Color.White
                    // Left + right legs.
                    drawLine(white, Offset(w * 0.38f, h * 0.26f), Offset(w * 0.20f, h * 0.78f), strokeWidth = s.width)
                    drawLine(white, Offset(w * 0.62f, h * 0.26f), Offset(w * 0.80f, h * 0.78f), strokeWidth = s.width)
                    // Top hinge + brace.
                    drawLine(white, Offset(w * 0.38f, h * 0.26f), Offset(w * 0.62f, h * 0.26f), strokeWidth = s.width)
                    drawLine(white, Offset(w * 0.30f, h * 0.58f), Offset(w * 0.70f, h * 0.58f), strokeWidth = s.width)
                },
        )

        // Offline marker: a "?" so a glance reads "we can't hear it".
        if (state == SensorState.Offline) {
            Text(
                "?",
                color = Color(0xFF7C4A03),
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelMedium,
            )
        }

        // Low-battery badge clipped to the top-right corner.
        if (lowBattery) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .size(sizeDp * 0.42f)
                    .clip(CircleShape)
                    .background(Color.White)
                    .border(1.dp, sensorColor(SensorState.Offline), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier.size(sizeDp * 0.22f).drawBehind {
                        drawRect(sensorColor(SensorState.Offline))
                    }
                )
            }
        }
    }
}
