package com.borsystems.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ActiveAlert
import com.borsystems.app.network.AlertKind
import com.borsystems.app.network.AlertStatus
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.CloseReason
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Active alerts list — mirrors iOS HomeView.swift.
 *
 * Auto-refreshes every 5 seconds while on screen. Each row shows zone +
 * floor + status, with "I'm on it" / "It's done" actions (same UX as
 * the Apple Watch view).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen() {
    val scope = rememberCoroutineScope()
    var alerts by remember { mutableStateOf<List<ActiveAlert>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        try {
            // Filter planned_cleaning out of the alerts list — they only
            // appear as blue map pins, never as actionable alerts. Same as
            // iOS + web + watch.
            alerts = ApiClient.activeAlerts().filter { it.kind == AlertKind.spill }
            error = null
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        refresh()
        while (true) {
            delay(5000)
            refresh()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Active alerts") })
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when {
                loading && alerts.isEmpty() -> {
                    CircularProgressIndicator(Modifier.align(Alignment.Center))
                }
                alerts.isEmpty() -> AllClear(Modifier.align(Alignment.Center))
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(alerts, key = { it.id }) { alert ->
                        AlertCard(
                            alert = alert,
                            onAck = {
                                scope.launch {
                                    try { ApiClient.acknowledgeAlert(alert.id); refresh() }
                                    catch (e: Exception) { error = e.message }
                                }
                            },
                            onDone = {
                                scope.launch {
                                    try {
                                        ApiClient.closeAlert(alert.id, CloseReason.manual, null)
                                        refresh()
                                    } catch (e: Exception) { error = e.message }
                                }
                            },
                        )
                    }
                }
            }

            error?.let { msg ->
                Snackbar(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                ) { Text(msg) }
            }
        }
    }
}

@Composable
private fun AllClear(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Default.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.size(64.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text("All clear", style = MaterialTheme.typography.titleMedium)
        Text(
            "No active alerts",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun AlertCard(alert: ActiveAlert, onAck: () -> Void = {}, onDone: () -> Void = {}) {
    val isAcked = alert.status == AlertStatus.acknowledged
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(10.dp)
                        .background(if (isAcked) Color(0xFFFFA000) else Color(0xFFE53935), CircleShape)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    alert.zoneName ?: "Unknown zone",
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            alert.floorName?.let {
                Spacer(Modifier.height(2.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            if (isAcked) {
                Button(
                    onClick = onDone,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.secondary
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("It's done") }
            } else {
                Button(
                    onClick = onAck,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("I'm on it") }
            }
        }
    }
}

// Kotlin doesn't have a Void return type for lambdas — Unit serves that
// purpose. Type alias so the call-site signatures read like iOS callbacks.
private typealias Void = Unit
