package com.borsystems.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
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
 * Top bar matches iOS: user name + role, with the duty-switch toggle on
 * the trailing side so a cleaner can come on/off duty from one tap.
 * Auto-refreshes every 5 seconds while on screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(onAlertTap: (ActiveAlert) -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val user by AuthStore.user.collectAsState()
    var alerts by remember { mutableStateOf<List<ActiveAlert>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        try {
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
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            user?.name ?: "HazardLink",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        user?.role?.let {
                            Text(
                                it.name.replaceFirstChar(Char::uppercase),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                actions = {
                    user?.let { u ->
                        DutyChip(
                            onDuty = u.onDuty,
                            onToggle = { AuthStore.setOnDuty(!u.onDuty) },
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                },
            )
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
                            onTap = { onAlertTap(alert) },
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
private fun DutyChip(onDuty: Boolean, onToggle: () -> Unit) {
    val color = if (onDuty) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(color.copy(alpha = 0.15f))
            .clickable(onClick = onToggle)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(8.dp)
                .background(color, CircleShape)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            if (onDuty) "On duty" else "Off duty",
            style = MaterialTheme.typography.labelMedium,
            color = color,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun AllClear(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(96.dp)
                .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Default.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(56.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
        Text(
            "All clear",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "No active alerts",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun AlertCard(
    alert: ActiveAlert,
    onTap: () -> Unit = {},
    onAck: () -> Unit = {},
    onDone: () -> Unit = {},
) {
    val isAcked = alert.status == AlertStatus.acknowledged
    val dotColor = if (isAcked) Color(0xFFFFA000) else Color(0xFFE53935)
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onTap),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(36.dp)
                        .background(dotColor.copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        tint = dotColor,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        alert.zoneName ?: "Unknown zone",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    alert.floorName?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    if (isAcked) "Acknowledged" else "Live",
                    style = MaterialTheme.typography.labelSmall,
                    color = dotColor,
                    fontWeight = FontWeight.Bold,
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
