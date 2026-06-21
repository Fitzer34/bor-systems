package com.borsystems.app.ui.floorplans

import androidx.compose.ui.graphics.Color
import com.borsystems.app.BuildConfig
import com.borsystems.app.network.AlertStatus
import com.borsystems.app.network.Hanger
import com.borsystems.app.network.HangerStatus
import java.time.Instant

/**
 * Sensor pin state logic — Android mirror of web components/SensorPin.tsx.
 * Keeping the thresholds + resolution identical means "offline"/"low battery"
 * mean the same thing on every surface (phone, web, watch).
 */

// Battery hangers deep-sleep and check in once a DAY (spill alerts are instant
// and separate): 26 h = one daily check-in + 2 h margin.
private const val ONLINE_WINDOW_MS = 26L * 60 * 60 * 1000

/** Default low-battery line when the org's configured threshold isn't to hand. */
const val DEFAULT_LOW_BATTERY_PCT = 20

/** The four visual states a sensor pin can be in, in priority order. */
enum class SensorState { Alert, Cleaning, Offline, Ok }

/**
 * Resolve a hanger's pin state from its live data + whether it currently has an
 * active spill alert. Alert state always wins: a lifted sign that also reads
 * "offline" must surface the spill, not the silence.
 */
fun sensorState(
    hanger: Hanger,
    alertStatus: AlertStatus?,
    now: Instant = Instant.now(),
): SensorState {
    if (alertStatus == AlertStatus.open) return SensorState.Alert
    if (alertStatus == AlertStatus.acknowledged) return SensorState.Cleaning
    // Lifecycle states (decommissioned / out_of_service) are never "offline" —
    // they're simply not in service, so they read OK (neutral) on the plan.
    if (hanger.status == HangerStatus.active) {
        val seen = hanger.lastSeenAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
        val fresh = seen != null && (now.toEpochMilli() - seen.toEpochMilli()) <= ONLINE_WINDOW_MS
        if (!fresh) return SensorState.Offline
    }
    return SensorState.Ok
}

fun isLowBattery(batteryPct: Int?, threshold: Int = DEFAULT_LOW_BATTERY_PCT): Boolean =
    batteryPct != null && batteryPct <= threshold

fun sensorStateLabel(state: SensorState): String = when (state) {
    SensorState.Alert -> "Lifted — live spill"
    SensorState.Cleaning -> "Cleaning in progress"
    SensorState.Offline -> "Offline"
    SensorState.Ok -> "On rack — ready"
}

/** Pin fill colours — match the web tokens: green ok, red alert, blue cleaning,
 *  amber offline. */
fun sensorColor(state: SensorState): Color = when (state) {
    SensorState.Alert -> Color(0xFFE53935)    // red
    SensorState.Cleaning -> Color(0xFF2563EB)  // blue
    SensorState.Offline -> Color(0xFFF59E0B)   // amber
    SensorState.Ok -> Color(0xFF22C55E)        // green
}

/** Human label for a dBm RSSI value (matches the Gateways page wording). */
fun signalLabel(rssi: Int): String = when {
    rssi >= -45 -> "excellent"
    rssi >= -55 -> "strong"
    rssi >= -65 -> "good"
    rssi >= -75 -> "weak"
    else -> "very weak"
}

/**
 * Stitch a backend asset URL onto the API base. URLs come absolute (https://…)
 * or relative ("/uploads/abc.png"); relative ones need the API host prefixed so
 * Coil can fetch them. Shared by the floor-plan image + the account avatar.
 */
fun absoluteApiUrl(url: String): String =
    if (url.startsWith("http://") || url.startsWith("https://")) url
    else BuildConfig.API_BASE_URL.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")

/** Relative-time label, e.g. "5m ago". Returns "Never"/"—" callers handle. */
fun relativeTime(iso: String, now: Instant = Instant.now()): String {
    val t = runCatching { Instant.parse(iso) }.getOrNull() ?: return iso
    val secs = ((now.toEpochMilli() - t.toEpochMilli()) / 1000).coerceAtLeast(0)
    return when {
        secs < 60 -> "${secs}s ago"
        secs < 3600 -> "${secs / 60}m ago"
        secs < 86400 -> "${secs / 3600}h ago"
        else -> "${secs / 86400}d ago"
    }
}
