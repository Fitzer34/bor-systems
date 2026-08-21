package com.borsystems.app.ui.security

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Building
import com.borsystems.app.network.Incident
import com.borsystems.app.network.NewIncidentBody
import kotlinx.coroutines.launch

/**
 * Security incidents: the live log, report-from-the-spot, resolve. Same
 * endpoints as the web. Guards report from where they stand — that's the
 * point of having this on the phone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IncidentsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var incidents by remember { mutableStateOf<List<Incident>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var showReport by remember { mutableStateOf(false) }
    val user by AuthStore.user.collectAsState()
    val isStaff = user?.role in listOf("admin", "supervisor")

    suspend fun load() {
        try { incidents = ApiClient.incidents(); failed = false }
        catch (_: Exception) { if (incidents == null) failed = true }
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Incidents") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { showReport = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Report")
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            val list = incidents
            when {
                failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load incidents.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { scope.launch { load() } }) { Text("Retry") }
                }
                list == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> {
                    val open = list.filter { it.status != "resolved" }
                    val closed = list.filter { it.status == "resolved" }
                    LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item(key = "h-open") {
                            Text(if (open.isEmpty()) "No open incidents" else "Open",
                                style = MaterialTheme.typography.titleSmall)
                        }
                        items(open, key = { it.id }) { i ->
                            IncidentCard(i, isStaff) { scope.launch { ApiClient.setIncidentStatus(i.id, "resolved"); load() } }
                        }
                        if (closed.isNotEmpty()) {
                            item(key = "h-closed") { Text("Resolved", style = MaterialTheme.typography.titleSmall) }
                            items(closed.take(20), key = { it.id }) { i -> IncidentCard(i, false) {} }
                        }
                    }
                }
            }
        }
    }

    if (showReport) {
        ReportIncidentSheet(
            onDismiss = { showReport = false },
            onReported = { showReport = false; scope.launch { load() } },
        )
    }
}

@Composable
private fun IncidentCard(i: Incident, canResolve: Boolean, onResolve: () -> Unit) {
    val sev = when (i.severity) {
        "critical", "high" -> Color(0xFFD32F2F)
        "medium" -> Color(0xFFF57C00)
        else -> Color(0xFF757575)
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = if (i.status == "resolved") Color(0xFF2E7D32) else sev,
                    shape = MaterialTheme.shapes.small, modifier = Modifier.size(9.dp)) {}
                Spacer(Modifier.width(8.dp))
                Text(i.title, style = MaterialTheme.typography.titleSmall)
            }
            Text(
                listOfNotNull(i.severity, i.kind, i.building?.name, i.createdAt?.take(10)).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            i.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 2,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (canResolve && i.status != "resolved") {
                TextButton(onClick = onResolve) { Text("Mark resolved") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportIncidentSheet(onDismiss: () -> Unit, onReported: () -> Unit) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var severity by remember { mutableStateOf("medium") }
    var kind by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var buildings by remember { mutableStateOf<List<Building>>(emptyList()) }
    var buildingId by remember { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { try { buildings = ApiClient.listBuildings() } catch (_: Exception) {} }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(16.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Report incident", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(value = title, onValueChange = { title = it },
                label = { Text("What happened") },
                placeholder = { Text("e.g. Forced door at loading bay") },
                modifier = Modifier.fillMaxWidth(), singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("low", "medium", "high", "critical").forEach { s ->
                    FilterChip(selected = severity == s, onClick = { severity = s },
                        label = { Text(s.replaceFirstChar { it.uppercase() }) })
                }
            }
            OutlinedTextField(value = kind, onValueChange = { kind = it },
                label = { Text("Kind (optional)") },
                placeholder = { Text("e.g. intrusion, theft") },
                modifier = Modifier.fillMaxWidth(), singleLine = true)
            if (buildings.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    FilterChip(selected = buildingId == null, onClick = { buildingId = null }, label = { Text("No site") })
                    buildings.take(3).forEach { b ->
                        FilterChip(selected = buildingId == b.id, onClick = { buildingId = b.id },
                            label = { Text(b.name, maxLines = 1) })
                    }
                }
            }
            OutlinedTextField(value = description, onValueChange = { description = it },
                label = { Text("Detail (optional)") },
                modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Button(
                onClick = {
                    sending = true
                    scope.launch {
                        try {
                            ApiClient.reportIncident(NewIncidentBody(
                                title = title.trim(), severity = severity,
                                kind = kind.trim().ifBlank { null },
                                description = description.trim().ifBlank { null },
                                buildingId = buildingId))
                            onReported()
                        } catch (_: Exception) {
                            error = "Couldn't send the report. Check your connection and try again."
                        } finally { sending = false }
                    }
                },
                enabled = title.isNotBlank() && !sending,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (sending) "Sending…" else "Report") }
            Spacer(Modifier.height(12.dp))
        }
    }
}
