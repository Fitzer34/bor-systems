package com.borsystems.app.ui.maintenance

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.MaintenanceJob

/**
 * Maintenance work orders — the CMMS jobs board (admin + supervisor).
 * Mirrors iOS MaintenanceJobsView / the web Maintenance page. Tendering and
 * quotes stay on the web for now; this view manages the work-order lifecycle
 * (schedule → start → complete / cancel). Reached from More → Maintenance jobs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceScreen(onBack: () -> Unit, onOpenJob: (String) -> Unit) {
    var list by remember { mutableStateOf<List<MaintenanceJob>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try { list = ApiClient.maintenanceJobs(); error = null }
        catch (e: Exception) { error = "Could not load jobs." }
        finally { loaded = true }
    }
    LaunchedEffect(Unit) { load() }

    val open = list.filter { !jobIsClosed(it.status) }
    val closed = list.filter { jobIsClosed(it.status) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Maintenance") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                !loaded -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                error != null -> Text(
                    error!!,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                list.isEmpty() -> Text(
                    "No jobs yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(open, key = { it.id }) { job ->
                        JobCard(job) { onOpenJob(job.id) }
                    }
                    if (closed.isNotEmpty()) {
                        item {
                            Text(
                                "Closed",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        }
                        items(closed, key = { it.id }) { job ->
                            JobCard(job) { onOpenJob(job.id) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun JobCard(job: MaintenanceJob, onClick: () -> Unit) {
    val st = jobStatusUi(job.status)
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(job.title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(st.label, color = st.color, style = MaterialTheme.typography.labelMedium)
            }
            val priority = job.priority.takeIf { it != "routine" }
            if (priority != null || !job.description.isNullOrBlank()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (priority != null) {
                        Text(
                            priority.replaceFirstChar(Char::uppercase),
                            style = MaterialTheme.typography.labelMedium,
                            color = priorityColor(priority),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    job.description?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

// ─── Shared status / priority helpers (also used by the detail screen) ────

data class JobStatusUi(val label: String, val color: Color)

fun jobIsClosed(status: String): Boolean = status == "completed" || status == "cancelled"

fun jobStatusUi(status: String): JobStatusUi = when (status) {
    "logged" -> JobStatusUi("Logged", Color(0xFF94A3B8))
    "scoped" -> JobStatusUi("Scoped", Color(0xFF94A3B8))
    "tendering" -> JobStatusUi("Tendering", Color(0xFF2563EB))
    "awarded" -> JobStatusUi("Awarded", Color(0xFF4F46E5))
    "scheduled" -> JobStatusUi("Scheduled", Color(0xFF4F46E5))
    "in_progress" -> JobStatusUi("In progress", Color(0xFFF59E0B))
    "completed" -> JobStatusUi("Completed", Color(0xFF2E7D32))
    "cancelled" -> JobStatusUi("Cancelled", Color(0xFF94A3B8))
    else -> JobStatusUi(status.replaceFirstChar(Char::uppercase), Color(0xFF94A3B8))
}

fun priorityColor(p: String): Color = when (p) {
    "emergency" -> Color(0xFFE53935)
    "urgent" -> Color(0xFFF59E0B)
    else -> Color(0xFF94A3B8)
}
