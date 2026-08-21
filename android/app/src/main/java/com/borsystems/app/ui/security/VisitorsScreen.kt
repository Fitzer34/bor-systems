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
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Building
import com.borsystems.app.network.NewVisitorBody
import com.borsystems.app.network.Visitor
import kotlinx.coroutines.launch

/**
 * The visitor day sheet: who's on site right now, who's expected, who's
 * been and gone — plus walk-in sign-in and expected bookings. The on-site
 * list is the roll-call in an evacuation, so it must be the live truth.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VisitorsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var visitors by remember { mutableStateOf<List<Visitor>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var tab by remember { mutableStateOf(0) }
    var sheet by remember { mutableStateOf<Boolean?>(null) } // true walk-in · false expected

    suspend fun load() {
        try { visitors = ApiClient.visitors(); failed = false }
        catch (_: Exception) { if (visitors == null) failed = true }
    }
    LaunchedEffect(Unit) { load() }

    val list = visitors ?: emptyList()
    val onSite = list.filter { it.signedInAt != null && it.signedOutAt == null }
    val expected = list.filter { it.signedInAt == null }
    val history = list.filter { it.signedOutAt != null }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Visitors") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { sheet = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Sign in")
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("On site (${onSite.size})") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Expected (${expected.size})") })
                Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("History (${history.size})") })
            }
            Box(Modifier.fillMaxSize()) {
                when {
                    failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Could not load the visitor sheet.")
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { scope.launch { load() } }) { Text("Retry") }
                    }
                    visitors == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                    else -> {
                        val rows = when (tab) { 0 -> onSite; 1 -> expected; else -> history }
                        if (rows.isEmpty()) {
                            Text(
                                when (tab) {
                                    0 -> "Nobody signed in right now."
                                    1 -> "Nobody booked in. Book ahead with the + button."
                                    else -> "No completed visits today."
                                },
                                modifier = Modifier.align(Alignment.Center).padding(16.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(rows, key = { it.id }) { v ->
                                    VisitorCard(v,
                                        onArrive = { scope.launch { ApiClient.visitorSignIn(v.id); load() } },
                                        onOut = { scope.launch { ApiClient.visitorSignOut(v.id); load() } })
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    sheet?.let { walkIn ->
        VisitorFormSheet(
            walkIn = walkIn,
            onSwitchMode = { sheet = it },
            onDismiss = { sheet = null },
            onSaved = { sheet = null; scope.launch { load() } },
        )
    }
}

@Composable
private fun VisitorCard(v: Visitor, onArrive: () -> Unit, onOut: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(v.name, style = MaterialTheme.typography.titleSmall)
            Text(
                listOfNotNull(
                    v.company,
                    v.host?.let { "hosted by $it" },
                    v.purpose,
                    v.signedInAt?.let { "in " + it.substring(11, 16) },
                    v.signedOutAt?.let { "out " + it.substring(11, 16) },
                    if (v.signedInAt == null) v.expectedAt?.let { "expected " + it.substring(11, 16) } else null,
                ).joinToString(" · ").ifBlank { "—" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            when {
                v.signedInAt == null -> TextButton(onClick = onArrive) { Text("Arrived") }
                v.signedOutAt == null -> TextButton(onClick = onOut) { Text("Sign out") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VisitorFormSheet(
    walkIn: Boolean,
    onSwitchMode: (Boolean) -> Unit,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var host by remember { mutableStateOf("") }
    var buildings by remember { mutableStateOf<List<Building>>(emptyList()) }
    var buildingId by remember { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { try { buildings = ApiClient.listBuildings() } catch (_: Exception) {} }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(16.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = walkIn, onClick = { onSwitchMode(true) }, label = { Text("Walk-in now") })
                FilterChip(selected = !walkIn, onClick = { onSwitchMode(false) }, label = { Text("Expected later") })
            }
            OutlinedTextField(value = name, onValueChange = { name = it },
                label = { Text("Visitor name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(value = company, onValueChange = { company = it },
                label = { Text("Company (optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(value = host, onValueChange = { host = it },
                label = { Text("Host (optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            if (buildings.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    FilterChip(selected = buildingId == null, onClick = { buildingId = null }, label = { Text("No site") })
                    buildings.take(3).forEach { b ->
                        FilterChip(selected = buildingId == b.id, onClick = { buildingId = b.id },
                            label = { Text(b.name, maxLines = 1) })
                    }
                }
            }
            if (!walkIn) {
                Text("Booked as expected for today — reception taps Arrived when they show up.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Button(
                onClick = {
                    sending = true
                    scope.launch {
                        try {
                            ApiClient.addVisitor(NewVisitorBody(
                                name = name.trim(),
                                company = company.trim().ifBlank { null },
                                host = host.trim().ifBlank { null },
                                buildingId = buildingId,
                                signInNow = walkIn))
                            onSaved()
                        } catch (_: Exception) {
                            error = "Couldn't save. Check your connection and try again."
                        } finally { sending = false }
                    }
                },
                enabled = name.isNotBlank() && !sending,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (sending) "Saving…" else if (walkIn) "Sign in" else "Book") }
            Spacer(Modifier.height(12.dp))
        }
    }
}
