package com.borsystems.app.ui.maintenance

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.JobEvent
import com.borsystems.app.network.MaintenanceJob
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * A single work order: status, description, lifecycle actions
 * (schedule → start → complete / cancel) and the event timeline.
 * Mirrors iOS MaintenanceJobDetailView / the web job modal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceDetailScreen(jobId: String, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var job by remember { mutableStateOf<MaintenanceJob?>(null) }
    var events by remember { mutableStateOf<List<JobEvent>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }

    var showSchedule by remember { mutableStateOf(false) }
    var showComplete by remember { mutableStateOf(false) }
    var confirmCancel by remember { mutableStateOf(false) }
    var completeNote by remember { mutableStateOf("") }

    suspend fun reload() {
        try {
            val d = ApiClient.maintenanceJobDetail(jobId)
            job = d.job; events = d.events; error = null
        } catch (e: Exception) {
            error = "Could not load the job."
        } finally { loaded = true }
    }
    LaunchedEffect(jobId) { reload() }

    fun act(op: suspend () -> Unit) {
        if (working) return
        working = true; error = null
        scope.launch {
            try { op(); reload() }
            catch (e: Exception) { error = "Action failed — try again." }
            finally { working = false }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(job?.title ?: "Job", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        val j = job
        when {
            !loaded -> Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            j == null -> Text(
                "Job not found.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(padding).padding(24.dp),
            )
            else -> Column(
                Modifier
                    .padding(padding)
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val st = jobStatusUi(j.status)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        st.label,
                        color = st.color,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (j.priority != "routine") {
                        Spacer(Modifier.weight(1f))
                        Text(
                            j.priority.replaceFirstChar(Char::uppercase),
                            color = priorityColor(j.priority),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                j.description?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium)
                }

                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }

                if (!jobIsClosed(j.status)) {
                    HorizontalDivider()
                    Text("Work order", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)

                    if (j.status != "scheduled" && j.status != "in_progress") {
                        OutlinedButton(
                            onClick = { showSchedule = true },
                            enabled = !working,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.DateRange, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Schedule")
                        }
                    }
                    if (j.status == "scheduled") {
                        Button(
                            onClick = { act { ApiClient.startJob(jobId) } },
                            enabled = !working,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Mark started")
                        }
                    }
                    if (j.status == "in_progress") {
                        Button(
                            onClick = { completeNote = ""; showComplete = true },
                            enabled = !working,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Mark complete")
                        }
                    }
                    TextButton(
                        onClick = { confirmCancel = true },
                        enabled = !working,
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Cancel job") }
                } else if (j.status == "completed") {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Completed", color = Color(0xFF2E7D32), fontWeight = FontWeight.SemiBold)
                            j.completionNote?.takeIf { it.isNotBlank() }?.let {
                                Spacer(Modifier.height(4.dp))
                                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }

                HorizontalDivider()
                Text("Timeline", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                if (events.isEmpty()) {
                    Text("No activity yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    events.forEach { e ->
                        Column(Modifier.fillMaxWidth()) {
                            Text(e.type.replaceFirstChar(Char::uppercase), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                            e.detail?.takeIf { it.isNotBlank() }?.let {
                                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            e.createdAt?.let {
                                Text(shortTimestamp(it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showSchedule) {
        val state = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis())
        DatePickerDialog(
            onDismissRequest = { showSchedule = false },
            confirmButton = {
                TextButton(onClick = {
                    val ms = state.selectedDateMillis
                    showSchedule = false
                    if (ms != null) act { ApiClient.scheduleJob(jobId, isoInstantOnDay(ms)) }
                }) { Text("Schedule") }
            },
            dismissButton = { TextButton(onClick = { showSchedule = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }

    if (showComplete) {
        AlertDialog(
            onDismissRequest = { showComplete = false },
            title = { Text("Mark complete") },
            text = {
                OutlinedTextField(
                    value = completeNote,
                    onValueChange = { completeNote = it },
                    label = { Text("Completion note (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showComplete = false
                    act { ApiClient.completeJob(jobId, completeNote.ifBlank { null }) }
                }) { Text("Complete") }
            },
            dismissButton = { TextButton(onClick = { showComplete = false }) { Text("Cancel") } },
        )
    }

    if (confirmCancel) {
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            title = { Text("Cancel this job?") },
            text = { Text("This marks the work order as cancelled.") },
            confirmButton = {
                TextButton(
                    onClick = { confirmCancel = false; act { ApiClient.cancelJob(jobId) } },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("Cancel job") }
            },
            dismissButton = { TextButton(onClick = { confirmCancel = false }) { Text("Keep") } },
        )
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

private val isoInstantFmt =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

/**
 * The Material date picker returns midnight-UTC for the chosen day. Schedule
 * the start at 12:00 UTC so the date doesn't slip a day in other timezones.
 * Produces an RFC-3339 instant the backend's z.string().datetime() accepts.
 */
private fun isoInstantOnDay(dayMillisUtcMidnight: Long): String =
    isoInstantFmt.format(Date(dayMillisUtcMidnight + 12L * 60L * 60L * 1000L))

private fun shortTimestamp(iso: String): String {
    val patterns = listOf(
        "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
        "yyyy-MM-dd'T'HH:mm:ssXXX",
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "yyyy-MM-dd'T'HH:mm:ss'Z'",
    )
    for (p in patterns) {
        try {
            val f = SimpleDateFormat(p, Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
            val d = f.parse(iso) ?: continue
            return SimpleDateFormat("d MMM, HH:mm", Locale.getDefault()).format(d)
        } catch (_: Exception) { /* try next pattern */ }
    }
    return iso
}
