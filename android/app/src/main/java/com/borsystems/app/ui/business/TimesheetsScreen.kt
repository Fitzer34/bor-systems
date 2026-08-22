package com.borsystems.app.ui.business

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.TimeEntry
import com.borsystems.app.network.UserRole
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate

/**
 * Timesheets on Android: clock in/out from the phone, this week's entries,
 * staff approval. Same /time endpoints as web, Mac and iPhone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimesheetsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val user by AuthStore.user.collectAsState()
    val isStaff = user?.role == UserRole.admin || user?.role == UserRole.supervisor

    var entries by remember { mutableStateOf<List<TimeEntry>?>(null) }
    var openClockIn by remember { mutableStateOf<String?>(null) }  // clockInAt of my open entry
    var failed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    val monday = remember { LocalDate.now().with(DayOfWeek.MONDAY) }
    val sunday = remember { monday.plusDays(6) }

    suspend fun load() {
        try {
            openClockIn = ApiClient.timeStatus().open?.clockInAt
            entries = ApiClient.timeEntries(monday.toString(), sunday.toString()).entries
            failed = false
        } catch (_: Exception) { if (entries == null) failed = true }
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Timesheets") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
        )
    }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load timesheets.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { scope.launch { load() } }) { Text("Retry") }
                }
                entries == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                else -> LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item(key = "clock") {
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (openClockIn != null) {
                                    Text("On the clock since " + openClockIn!!.substring(11, 16),
                                        style = MaterialTheme.typography.titleSmall)
                                    Button(
                                        enabled = !busy,
                                        onClick = {
                                            busy = true
                                            scope.launch { try { ApiClient.clockOut(0); load() } catch (_: Exception) {} finally { busy = false } }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) { Text("Clock out") }
                                } else {
                                    Text("Clock in when you start. Your hours land in this timesheet.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Button(
                                        enabled = !busy,
                                        onClick = {
                                            busy = true
                                            scope.launch { try { ApiClient.clockIn(null); load() } catch (_: Exception) {} finally { busy = false } }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    ) { Text("Clock in") }
                                }
                            }
                        }
                    }
                    item(key = "week") {
                        Text("Mon ${monday.dayOfMonth} → Sun ${sunday.dayOfMonth} · " +
                            String.format("%.1f", entries!!.sumOf { it.hours ?: 0.0 }) + "h this week",
                            style = MaterialTheme.typography.titleSmall)
                    }
                    if (entries!!.isEmpty()) {
                        item(key = "empty") {
                            Text("No hours this week yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    items(entries!!, key = { it.id }) { e ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(e.userName ?: "Me", style = MaterialTheme.typography.titleSmall)
                                Text(
                                    listOfNotNull(
                                        e.clockInAt.substring(5, 10) + " " + e.clockInAt.substring(11, 16),
                                        e.clockOutAt?.let { "→ " + it.substring(11, 16) } ?: "on the clock",
                                        e.hours?.let { String.format("%.1fh", it) },
                                        e.buildingName,
                                        e.status,
                                    ).joinToString(" · "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                if (isStaff && e.status == "pending") {
                                    TextButton(onClick = { scope.launch { try { ApiClient.approveTimeEntry(e.id); load() } catch (_: Exception) {} } }) {
                                        Text("Approve")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
