package com.borsystems.app.ui.business

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
import com.borsystems.app.network.NewPermitBody
import com.borsystems.app.network.PermitRow
import com.borsystems.app.network.UserRole
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Permit-to-work on the phone: request, and (staff) approve / activate / close. */
private val PERMIT_TYPES = listOf(
    "hot_works" to "Hot works",
    "working_at_height" to "Working at height",
    "confined_space" to "Confined space",
    "electrical" to "Electrical",
    "general" to "General",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermitsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val user by AuthStore.user.collectAsState()
    val isStaff = user?.role == UserRole.admin || user?.role == UserRole.supervisor

    var permits by remember { mutableStateOf<List<PermitRow>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var showNew by remember { mutableStateOf(false) }

    suspend fun load() {
        try { permits = ApiClient.permits(); failed = false }
        catch (_: Exception) { if (permits == null) failed = true }
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Permits") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { showNew = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Request")
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            val list = permits
            when {
                failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load permits.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { scope.launch { load() } }) { Text("Retry") }
                }
                list == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                list.isEmpty() -> Text("No permits yet. Request one with the + button.",
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(list, key = { it.id }) { p ->
                        PermitCard(p, isStaff) { action -> scope.launch { try { ApiClient.permitAction(p.id, action); load() } catch (_: Exception) {} } }
                    }
                }
            }
        }
    }

    if (showNew) {
        NewPermitSheet(onDismiss = { showNew = false }, onSaved = { showNew = false; scope.launch { load() } })
    }
}

@Composable
private fun PermitCard(p: PermitRow, isStaff: Boolean, onAction: (String) -> Unit) {
    val statusColor = when (p.status) {
        "active" -> Color(0xFF2E7D32)
        "approved" -> Color(0xFF1565C0)
        "requested" -> Color(0xFFF57C00)
        "rejected" -> Color(0xFFD32F2F)
        else -> Color(0xFF757575)
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = statusColor, shape = MaterialTheme.shapes.small, modifier = Modifier.size(9.dp)) {}
                Spacer(Modifier.width(8.dp))
                Text(p.typeLabel ?: p.type.replace('_', ' '), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.weight(1f))
                Text(p.status, style = MaterialTheme.typography.labelSmall, color = statusColor)
            }
            Text(p.description, style = MaterialTheme.typography.bodySmall, maxLines = 2)
            Text(
                listOfNotNull(p.buildingName, p.contractorName,
                    p.startsAt.take(10) + " → " + p.endsAt.take(10)).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (isStaff) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    when (p.status) {
                        "requested" -> {
                            TextButton(onClick = { onAction("approve") }) { Text("Approve") }
                            TextButton(onClick = { onAction("reject") }) { Text("Reject") }
                        }
                        "approved" -> TextButton(onClick = { onAction("activate") }) { Text("Activate") }
                        "active" -> TextButton(onClick = { onAction("close") }) { Text("Close") }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewPermitSheet(onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var type by remember { mutableStateOf("general") }
    var description by remember { mutableStateOf("") }
    var buildings by remember { mutableStateOf<List<Building>>(emptyList()) }
    var buildingId by remember { mutableStateOf<String?>(null) }
    var startsOn by remember { mutableStateOf(LocalDate.now().toString()) }
    var endsOn by remember { mutableStateOf(LocalDate.now().toString()) }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { try { buildings = ApiClient.listBuildings() } catch (_: Exception) {} }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(16.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Request a permit", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                PERMIT_TYPES.take(3).forEach { (k, l) ->
                    FilterChip(selected = type == k, onClick = { type = k }, label = { Text(l, maxLines = 1) })
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                PERMIT_TYPES.drop(3).forEach { (k, l) ->
                    FilterChip(selected = type == k, onClick = { type = k }, label = { Text(l, maxLines = 1) })
                }
            }
            OutlinedTextField(value = description, onValueChange = { description = it },
                label = { Text("What's the work?") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
            if (buildings.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    FilterChip(selected = buildingId == null, onClick = { buildingId = null }, label = { Text("No site") })
                    buildings.take(3).forEach { b ->
                        FilterChip(selected = buildingId == b.id, onClick = { buildingId = b.id },
                            label = { Text(b.name, maxLines = 1) })
                    }
                }
            }
            OutlinedTextField(value = startsOn, onValueChange = { startsOn = it },
                label = { Text("Starts (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(value = endsOn, onValueChange = { endsOn = it },
                label = { Text("Ends (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            val dateRe = Regex("""\d{4}-\d{2}-\d{2}""")
            Button(
                onClick = {
                    sending = true
                    scope.launch {
                        try {
                            ApiClient.requestPermit(NewPermitBody(
                                type = type, description = description.trim(), buildingId = buildingId,
                                startsAt = startsOn.trim() + "T08:00:00.000Z",
                                endsAt = endsOn.trim() + "T18:00:00.000Z"))
                            onSaved()
                        } catch (_: Exception) {
                            error = "Couldn't request that permit. Check the dates and try again."
                        } finally { sending = false }
                    }
                },
                enabled = !sending && description.isNotBlank() && startsOn.trim().matches(dateRe) && endsOn.trim().matches(dateRe),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (sending) "Requesting…" else "Request permit") }
            Spacer(Modifier.height(12.dp))
        }
    }
}
