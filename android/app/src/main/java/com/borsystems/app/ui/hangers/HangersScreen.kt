package com.borsystems.app.ui.hangers

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.BatteryFull
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.UserRole
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Hanger
import com.borsystems.app.network.HangerStatus
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Hangers admin screen — mirrors iOS HangersView.swift.
 *
 * Shows each hanger with DevEUI, online/offline badge, battery%, last-seen.
 * Online = last_seen_at within 15 seconds (matches iOS + web).
 *
 * Polls every 5 seconds; re-renders every second so the online badge
 * flips the moment the 15-second silence threshold is crossed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HangersScreen(onAddHanger: () -> Unit = {}) {
    val user by AuthStore.user.collectAsState()
    val isAdmin = user?.role == UserRole.admin
    var hangers by remember { mutableStateOf<List<Hanger>>(emptyList()) }
    var threshold by remember { mutableStateOf(20) }
    var loading by remember { mutableStateOf(true) }
    var tick by remember { mutableStateOf(0) }

    suspend fun refresh() {
        try {
            hangers = ApiClient.listHangers()
            threshold = ApiClient.appSettings().lowBatteryThreshold
        } catch (_: Exception) {
            /* keep last value */
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        refresh()
        while (true) {
            delay(1000)
            tick++
            if (tick % 5 == 0) refresh()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Hangers") },
                actions = {
                    if (isAdmin) {
                        IconButton(onClick = onAddHanger) {
                            Icon(Icons.Default.Add, contentDescription = "Add hanger")
                        }
                    }
                },
            )
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            if (loading && hangers.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else if (hangers.isEmpty()) {
                Text(
                    "No hangers registered yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center),
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(hangers, key = { it.id }) { h ->
                        HangerRow(h, threshold)
                    }
                }
            }
        }
    }
}

@Composable
private fun HangerRow(h: Hanger, lowBatteryThreshold: Int) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    h.devEui,
                    style = MaterialTheme.typography.bodyMedium,
                    fontFamily = FontFamily.Monospace,
                    modifier = Modifier.weight(1f),
                )
                StatusBadge(h)
            }
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                val pct = h.batteryPct
                if (pct != null) {
                    val low = pct <= lowBatteryThreshold
                    Icon(
                        if (low) Icons.Default.BatteryAlert else Icons.Default.BatteryFull,
                        contentDescription = null,
                        tint = if (low) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        "$pct%",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (low) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                h.lastSeenAt?.let {
                    Text(
                        formatRelative(it),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

/**
 * Online/offline badge — mirrors iOS HangerRow exactly.
 * Online = active + last_seen within 15s. Offline = active + over 15s
 * (or no last_seen at all). Other statuses pass through as labels.
 */
@Composable
private fun StatusBadge(h: Hanger) {
    val (label, color) = when (h.status) {
        HangerStatus.out_of_service ->
            "out of service" to Color(0xFFFF8800)
        HangerStatus.decommissioned ->
            "decommissioned" to Color.Gray
        HangerStatus.active -> {
            val seenRecently = h.lastSeenAt?.let { ts ->
                runCatching { Instant.parse(ts) }.getOrNull()?.let { i ->
                    ChronoUnit.SECONDS.between(i, Instant.now()) <= 15
                } ?: false
            } ?: false
            if (seenRecently) "Online" to Color(0xFF2E7D32)
            else              "Offline" to Color(0xFFFF8800)
        }
    }
    Box(
        Modifier
            .background(color.copy(alpha = 0.18f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 3.dp),
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = color)
    }
}

private fun formatRelative(iso: String): String {
    val then = runCatching { Instant.parse(iso) }.getOrNull() ?: return "—"
    val s = ChronoUnit.SECONDS.between(then, Instant.now())
    if (s < 60)    return "${s}s ago"
    if (s < 3600)  return "${s / 60}m ago"
    if (s < 86400) return "${s / 3600}h ago"
    return "${s / 86400}d ago"
}
