package com.borsystems.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.*
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Wear OS companion app — mirrors the Apple Watch ActiveAlertsView.
 *
 * Glanceable list of open spill alerts with one-tap "I'm on it" /
 * "It's done" actions. Auth token + API base URL are pushed from the
 * phone app via the Wearable Data Layer (Android's WatchConnectivity
 * equivalent).
 */
class WearMainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WearAuth.init(applicationContext)
        setContent {
            MaterialTheme {
                Scaffold(timeText = { TimeText() }) {
                    val token by WearAuth.token.collectAsState()
                    if (token.isNullOrBlank()) NotSignedIn() else ActiveAlertsList()
                }
            }
        }
    }
}

@Composable
private fun NotSignedIn() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Zero Slip Systems", style = MaterialTheme.typography.title3)
            Text(
                "Open the phone app and sign in.",
                style = MaterialTheme.typography.body2,
                color = MaterialTheme.colors.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ActiveAlertsList() {
    val scope = rememberCoroutineScope()
    var alerts by remember { mutableStateOf<List<WatchAlert>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        try {
            alerts = WearApi.fetchActiveAlerts()
            error = null
        } catch (e: Exception) {
            error = e.message ?: "Couldn't load"
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        refresh()
        while (true) {
            delay(15_000)
            refresh()
        }
    }

    when {
        loading && alerts.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        error != null && alerts.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(error!!, style = MaterialTheme.typography.caption1)
        }
        alerts.isEmpty() -> AllClear()
        else -> ScalingLazyColumn(modifier = Modifier.fillMaxSize()) {
            items(alerts.size) { i ->
                AlertRow(
                    alerts[i],
                    onAck = { scope.launch { try { WearApi.ack(alerts[i].id); refresh() } catch (_: Exception) {} } },
                    onClose = { scope.launch { try { WearApi.close(alerts[i].id); refresh() } catch (_: Exception) {} } },
                )
            }
        }
    }
}

@Composable
private fun AllClear() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("✅", style = MaterialTheme.typography.display1)
            Text("All clear", style = MaterialTheme.typography.title3)
        }
    }
}

@Composable
private fun AlertRow(alert: WatchAlert, onAck: () -> Unit, onClose: () -> Unit) {
    val acknowledged = alert.status == "acknowledged"
    Card(
        onClick = {},
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (acknowledged) Color(0xFFFFA000) else Color(0xFFE53935))
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    alert.zoneName ?: "Unknown zone",
                    style = MaterialTheme.typography.title3,
                )
            }
            alert.floorName?.let {
                Text(it, style = MaterialTheme.typography.caption1, color = MaterialTheme.colors.onSurfaceVariant)
            }
            Spacer(Modifier.height(4.dp))
            Chip(
                onClick = if (acknowledged) onClose else onAck,
                label = { Text(if (acknowledged) "It's done" else "I'm on it") },
                colors = ChipDefaults.primaryChipColors(),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

// background() needs to be from foundation, not wear
@Composable
private fun Modifier.background(color: Color) = this.then(
    androidx.compose.foundation.background(color)
)
