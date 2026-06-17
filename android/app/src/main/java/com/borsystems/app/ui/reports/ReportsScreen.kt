package com.borsystems.app.ui.reports

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Spill
import com.borsystems.app.network.SpillsResponse
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Spill report — mirrors iOS ReportsView.swift.
 *
 * Defaults to the last 30 days. Admins/supervisors use this for their own
 * health-and-safety reviews ("every spill last quarter, with response
 * time and outcome"). Edit dates via the buttons; tap Refresh to re-run.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var from by remember { mutableStateOf(LocalDate.now().minusDays(30)) }
    var to by remember { mutableStateOf(LocalDate.now()) }
    var report by remember { mutableStateOf<SpillsResponse?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun run() {
        loading = true; error = null
        scope.launch {
            try {
                report = ApiClient.spillsReport(
                    fromIso = from.atStartOfDay(ZoneId.of("UTC")).toInstant().toString(),
                    toIso = to.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant().toString(),
                )
            } catch (e: Exception) {
                error = "Could not load report."
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { run() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reports") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Range", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = from.toString(),
                                onValueChange = { try { from = LocalDate.parse(it) } catch (_: Exception) {} },
                                label = { Text("From") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = to.toString(),
                                onValueChange = { try { to = LocalDate.parse(it) } catch (_: Exception) {} },
                                label = { Text("To") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        Button(
                            onClick = ::run,
                            enabled = !loading,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (loading) "Running…" else "Run report") }
                    }
                }
            }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            report?.let { r ->
                item {
                    Text(
                        "${r.count} spill${if (r.count == 1) "" else "s"}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                if (r.spills.isEmpty()) {
                    item {
                        Text(
                            "No spills in this range.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(r.spills, key = { it.alertId }) { SpillRow(it) }
            }
        }
    }
}

@Composable
private fun SpillRow(spill: Spill) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(
                formatIso(spill.openedAt),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val location = listOfNotNull(spill.buildingName, spill.floorName, spill.zoneName).joinToString(" / ")
            Text(
                location.ifEmpty { "—" },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(top = 4.dp)) {
                Metric("Response", spill.responseSeconds)
                Metric("Resolution", spill.resolutionSeconds)
                spill.closureReason?.let {
                    Text(
                        it.replace('_', ' '),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun Metric(label: String, seconds: Double?) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(formatSeconds(seconds), style = MaterialTheme.typography.bodyMedium)
    }
}

private fun formatSeconds(s: Double?): String {
    if (s == null || s <= 0) return "—"
    if (s < 60) return "${s.toInt()}s"
    val m = (s / 60).toInt()
    val sec = (s % 60).toInt()
    if (m < 60) return "${m}m ${sec}s"
    val h = m / 60
    return "${h}h ${m % 60}m"
}

private fun formatIso(iso: String): String = try {
    val fmt = DateTimeFormatter.ofPattern("d MMM HH:mm").withZone(ZoneId.systemDefault())
    fmt.format(Instant.parse(iso))
} catch (_: Exception) { iso }
