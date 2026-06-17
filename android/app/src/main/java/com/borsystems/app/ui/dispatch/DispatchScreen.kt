package com.borsystems.app.ui.dispatch

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.DispatchItem
import com.borsystems.app.network.DispatchStatus
import com.borsystems.app.network.UserRole
import com.borsystems.app.network.UserSummary
import com.borsystems.app.network.Zone
import kotlinx.coroutines.launch

/**
 * Dispatch screen — role-based UI.
 *
 *   Admin / supervisor: send dispatches + see all sent
 *   Cleaner:            sees ONLY dispatches addressed to them, can
 *                       acknowledge ("on my way") and complete
 *
 * Mirrors iOS DispatchSendView + MyDispatchesView.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DispatchScreen(nav: androidx.navigation.NavController? = null) {
    val user by AuthStore.user.collectAsState()
    val canSend = user?.role == UserRole.admin || user?.role == UserRole.supervisor

    Scaffold(topBar = { TopAppBar(title = { Text(if (canSend) "Dispatch" else "My dispatches") }) }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            if (canSend) SendForm()
            DispatchList(currentUserId = user?.id ?: "")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SendForm() {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<UserSummary>>(emptyList()) }
    var zones by remember { mutableStateOf<List<Zone>>(emptyList()) }
    var recipientId by remember { mutableStateOf<String?>(null) }
    var zoneId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            users = ApiClient.listUsers().filter { it.deactivatedAt == null }
            // Best-effort zone list — flatten across all buildings.
            val buildings = ApiClient.listBuildings()
            val collected = mutableListOf<Zone>()
            for (b in buildings) {
                val floors = ApiClient.listFloors(b.id)
                for (f in floors) collected += ApiClient.listZones(f.id)
            }
            zones = collected
        } catch (_: Exception) { /* leave empty, form still works */ }
    }

    Card(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Send a dispatch", style = MaterialTheme.typography.titleMedium)

            UserPicker(users, recipientId) { recipientId = it }
            ZonePicker(zones, zoneId) { zoneId = it }

            OutlinedTextField(
                value = message,
                onValueChange = { message = it },
                label = { Text("Message") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )

            status?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            Button(
                onClick = {
                    scope.launch {
                        sending = true; status = null
                        try {
                            ApiClient.sendDispatch(recipientId!!, zoneId, message.trim())
                            message = ""; recipientId = null; zoneId = null
                            status = "Sent"
                        } catch (e: Exception) {
                            status = e.message ?: "Could not send"
                        } finally { sending = false }
                    }
                },
                enabled = !sending && recipientId != null && message.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(if (sending) "Sending…" else "Send dispatch")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UserPicker(users: List<UserSummary>, selected: String?, onChange: (String?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val name = users.firstOrNull { it.id == selected }?.name ?: "Pick a cleaner…"
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = name, onValueChange = {}, readOnly = true,
            label = { Text("Recipient") },
            modifier = Modifier.fillMaxWidth().menuAnchor(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            users.forEach { u ->
                DropdownMenuItem(text = { Text("${u.name}  (${u.role})") }, onClick = {
                    onChange(u.id); open = false
                })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ZonePicker(zones: List<Zone>, selected: String?, onChange: (String?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val name = zones.firstOrNull { it.id == selected }?.name ?: "(optional)"
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = name, onValueChange = {}, readOnly = true,
            label = { Text("Zone") },
            modifier = Modifier.fillMaxWidth().menuAnchor(),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("(no zone)") }, onClick = { onChange(null); open = false })
            zones.forEach { z ->
                DropdownMenuItem(text = { Text(z.name) }, onClick = { onChange(z.id); open = false })
            }
        }
    }
}

@Composable
private fun DispatchList(currentUserId: String) {
    val scope = rememberCoroutineScope()
    var dispatches by remember { mutableStateOf<List<DispatchItem>>(emptyList()) }

    suspend fun refresh() {
        try {
            val all = ApiClient.listDispatches()
            // Cleaners see only ones addressed to them; admin/supervisor see all.
            val user = AuthStore.user.value
            dispatches = if (user?.role == UserRole.cleaner) {
                all.filter { it.recipientUserId == currentUserId }
            } else all
        } catch (_: Exception) { /* keep last */ }
    }

    LaunchedEffect(Unit) { refresh() }

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(dispatches, key = { it.id }) { d ->
            DispatchRow(d, currentUserId = currentUserId,
                onAck = { scope.launch { try { ApiClient.acknowledgeDispatch(d.id); refresh() } catch (_: Exception) {} } },
                onComplete = { scope.launch { try { ApiClient.completeDispatch(d.id); refresh() } catch (_: Exception) {} } },
            )
        }
    }
}

@Composable
private fun DispatchRow(
    d: DispatchItem,
    currentUserId: String,
    onAck: () -> Unit,
    onComplete: () -> Unit,
) {
    val isMine = d.recipientUserId == currentUserId
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(d.message, style = MaterialTheme.typography.bodyMedium)
            d.zoneName?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("Status: ${d.status.name}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (isMine) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (d.status == DispatchStatus.sent) {
                        Button(onClick = onAck) { Text("On my way") }
                    }
                    if (d.status == DispatchStatus.acknowledged) {
                        Button(onClick = onComplete) { Text("Mark complete") }
                    }
                }
            }
        }
    }
}
