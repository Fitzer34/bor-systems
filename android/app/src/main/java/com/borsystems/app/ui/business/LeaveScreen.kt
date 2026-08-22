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
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.LeaveCreateBody
import com.borsystems.app.network.LeaveRow
import com.borsystems.app.network.UserRole
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * Leave on the phone: book your own holidays or sick days, see where the
 * request stands, and (staff) approve or decline the team's requests.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeaveScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val user by AuthStore.user.collectAsState()
    val isStaff = user?.role == UserRole.admin || user?.role == UserRole.supervisor

    var rows by remember { mutableStateOf<List<LeaveRow>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var showBook by remember { mutableStateOf(false) }

    suspend fun load() {
        try { rows = ApiClient.leave(); failed = false }
        catch (_: Exception) { if (rows == null) failed = true }
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Leave") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { showBook = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Book leave")
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            val list = rows
            when {
                failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load leave.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { scope.launch { load() } }) { Text("Retry") }
                }
                list == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                list.isEmpty() -> Text("No leave requests yet. Book your first with the + button.",
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val pending = list.filter { it.status == "pending" }
                    val decided = list.filter { it.status != "pending" }
                    if (pending.isNotEmpty()) {
                        item(key = "h-p") { Text("Awaiting decision", style = MaterialTheme.typography.titleSmall) }
                        items(pending, key = { it.id }) { r -> LeaveCard(r, isStaff) { st -> scope.launch { try { ApiClient.decideLeave(r.id, st); load() } catch (_: Exception) {} } } }
                    }
                    if (decided.isNotEmpty()) {
                        item(key = "h-d") { Text("Decided", style = MaterialTheme.typography.titleSmall) }
                        items(decided.take(30), key = { it.id }) { r -> LeaveCard(r, false) {} }
                    }
                }
            }
        }
    }

    if (showBook) {
        BookLeaveSheet(onDismiss = { showBook = false }, onSaved = { showBook = false; scope.launch { load() } })
    }
}

@Composable
private fun LeaveCard(r: LeaveRow, canDecide: Boolean, onDecide: (String) -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${r.type.replaceFirstChar { it.uppercase() }} · ${r.startsOn} → ${r.endsOn}",
                style = MaterialTheme.typography.titleSmall)
            Text(listOfNotNull(r.status, r.note).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (canDecide) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TextButton(onClick = { onDecide("approved") }) { Text("Approve") }
                    TextButton(onClick = { onDecide("declined") }) { Text("Decline") }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BookLeaveSheet(onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var type by remember { mutableStateOf("annual") }
    var startsOn by remember { mutableStateOf(LocalDate.now().plusDays(1).toString()) }
    var endsOn by remember { mutableStateOf(LocalDate.now().plusDays(1).toString()) }
    var note by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(16.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Book leave", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("annual", "sick", "unpaid", "other").forEach { t ->
                    FilterChip(selected = type == t, onClick = { type = t },
                        label = { Text(t.replaceFirstChar { it.uppercase() }) })
                }
            }
            OutlinedTextField(value = startsOn, onValueChange = { startsOn = it },
                label = { Text("From (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(value = endsOn, onValueChange = { endsOn = it },
                label = { Text("To (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(value = note, onValueChange = { note = it },
                label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            val dateRe = Regex("""\d{4}-\d{2}-\d{2}""")
            Button(
                onClick = {
                    sending = true
                    scope.launch {
                        try {
                            ApiClient.createLeave(LeaveCreateBody(
                                type = type, startsOn = startsOn.trim(), endsOn = endsOn.trim(),
                                note = note.trim().ifBlank { null }))
                            onSaved()
                        } catch (_: Exception) {
                            error = "Couldn't book that. Check the dates and try again."
                        } finally { sending = false }
                    }
                },
                enabled = !sending && startsOn.trim().matches(dateRe) && endsOn.trim().matches(dateRe),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (sending) "Booking…" else "Request leave") }
            Spacer(Modifier.height(12.dp))
        }
    }
}
