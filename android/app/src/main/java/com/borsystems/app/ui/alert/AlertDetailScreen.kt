package com.borsystems.app.ui.alert

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ActiveAlert
import com.borsystems.app.network.AlertStatus
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.CloseReason
import kotlinx.coroutines.launch

/**
 * Alert detail — mirrors iOS AlertDetailView.swift.
 *
 * Loaded from the active-alerts list by ID. Lets the responder
 * acknowledge, add a note, and close with a reason (manual, damaged sign,
 * missing sign).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlertDetailScreen(alertId: String, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var alert by remember { mutableStateOf<ActiveAlert?>(null) }
    var notFound by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf("") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        try {
            val all = ApiClient.activeAlerts()
            val found = all.firstOrNull { it.id == alertId }
            if (found == null) notFound = true else alert = found
        } catch (e: Exception) {
            error = e.message
        }
    }

    LaunchedEffect(alertId) { reload() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Alert") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        when {
            notFound -> EmptyState(
                title = "Alert closed",
                body = "This alert has been resolved.",
                modifier = Modifier.padding(padding).fillMaxSize(),
            )
            alert == null -> Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            else -> AlertBody(
                alert = alert!!,
                note = note,
                onNoteChange = { note = it },
                working = working,
                error = error,
                onAcknowledge = {
                    if (!working) {
                        working = true; error = null
                        scope.launch {
                            try {
                                ApiClient.acknowledgeAlert(alertId)
                                reload()
                            } catch (e: Exception) {
                                error = "Could not acknowledge — already acknowledged or closed."
                            } finally { working = false }
                        }
                    }
                },
                onClose = { reason ->
                    if (!working) {
                        working = true; error = null
                        scope.launch {
                            try {
                                ApiClient.closeAlert(alertId, reason, note.takeIf { it.isNotBlank() })
                                onBack()
                            } catch (e: Exception) {
                                error = "Could not close alert."
                            } finally { working = false }
                        }
                    }
                },
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun AlertBody(
    alert: ActiveAlert,
    note: String,
    onNoteChange: (String) -> Unit,
    working: Boolean,
    error: String?,
    onAcknowledge: () -> Unit,
    onClose: (CloseReason) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            "${alert.floorName ?: "Unknown floor"} — ${alert.zoneName ?: "Unassigned"}",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            "Status: ${alert.status.name.replaceFirstChar(Char::uppercase)}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Location", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    if (alert.floorId == null) "This hanger isn't assigned to a zone yet."
                    else "Floor plan view in the Floor Plans tab.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (alert.status == AlertStatus.open) {
            Button(
                onClick = onAcknowledge,
                enabled = !working,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                Text("I'm on it", style = MaterialTheme.typography.titleMedium)
            }
        }

        Text(
            "Optional note (logged with closure)",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = note,
            onValueChange = onNoteChange,
            modifier = Modifier.fillMaxWidth().heightIn(min = 88.dp),
            minLines = 3,
            shape = RoundedCornerShape(8.dp),
        )

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CloseButton(
                title = "Sign damaged",
                color = Color(0xFFFFA000),
                onClick = { onClose(CloseReason.signDamaged) },
                enabled = !working,
                modifier = Modifier.weight(1f),
            )
            CloseButton(
                title = "Sign missing",
                color = MaterialTheme.colorScheme.error,
                onClick = { onClose(CloseReason.signMissing) },
                enabled = !working,
                modifier = Modifier.weight(1f),
            )
        }

        TextButton(
            onClick = { onClose(CloseReason.manual) },
            enabled = !working,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Manually close", style = MaterialTheme.typography.labelMedium)
        }

        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        Text(
            "The alert auto-closes when the sign is physically replaced on the hanger.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CloseButton(
    title: String,
    color: Color,
    onClick: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = color),
        border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(color)),
    ) {
        Text(title, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
internal fun EmptyState(title: String, body: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
