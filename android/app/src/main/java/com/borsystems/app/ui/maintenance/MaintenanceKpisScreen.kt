package com.borsystems.app.ui.maintenance

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import com.borsystems.app.network.MaintKpis
import kotlin.math.roundToInt

/**
 * Maintenance KPI scorecard (admin + supervisor) — reliability, work and cost
 * at a glance plus the reliability "bad actors". Read-only; mirrors iOS
 * MaintenanceKpisView / the web KPIs page. All values computed server-side.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MaintenanceKpisScreen(onBack: () -> Unit) {
    var k by remember { mutableStateOf<MaintKpis?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try { k = ApiClient.maintenanceKpis(); error = null }
        catch (e: Exception) { error = "Could not load KPIs." }
        finally { loaded = true }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Maintenance KPIs") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            val kpi = k
            when {
                !loaded -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                error != null -> Text(
                    error!!, color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                kpi == null -> Text(
                    "No data yet.", color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item { SectionLabel("Reliability") }
                    item { KpiRow("PM compliance", kpi.pmCompliancePct?.let { "$it%" } ?: "—") }
                    item { KpiRow("MTTR", kpi.mttrDays?.let { "${trim(it)}d" } ?: "—", "avg to close a reactive job") }
                    item { KpiRow("MTBF", kpi.mtbfDays?.let { "${it}d" } ?: "—", "avg between failures / asset") }
                    item { SectionLabel("Work & cost") }
                    item { KpiRow("Open backlog", kpi.openBacklog.toString(), if (kpi.openBacklog > 0) "oldest ${kpi.backlogOldestDays}d" else "all clear") }
                    item { KpiRow("Completed this month", kpi.completedThisMonth.toString()) }
                    item { KpiRow("Planned share", kpi.plannedSharePct?.let { "$it%" } ?: "—", "planned vs reactive (90d)") }
                    item { KpiRow("Spend (90d)", euro(kpi.spend90Cents), "awarded contractor cost") }
                    item { KpiRow("Past expected life", kpi.assetsPastLife.toString(), "assets to review") }
                    if (kpi.badActors.isNotEmpty()) {
                        item { SectionLabel("Reliability — bad actors") }
                        items(kpi.badActors.size) { idx ->
                            val a = kpi.badActors[idx]
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(a.name, fontWeight = FontWeight.SemiBold)
                                        Text(
                                            "${a.reactiveJobs} reactive · ${euro(a.spendCents)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    Text(
                                        a.criticality.replaceFirstChar(Char::uppercase),
                                        color = critColor(a.criticality),
                                        style = MaterialTheme.typography.labelMedium,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(t: String) {
    Text(
        t,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 8.dp),
    )
}

@Composable
private fun KpiRow(label: String, value: String, sub: String? = null) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label)
                if (sub != null) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(value, fontWeight = FontWeight.SemiBold)
        }
    }
}

private fun trim(d: Double): String = if (d == d.roundToInt().toDouble()) d.roundToInt().toString() else String.format("%.1f", d)
private fun euro(cents: Int): String = "€" + (cents / 100)
private fun critColor(c: String): Color = when (c) {
    "critical" -> Color(0xFFE53935)
    "high" -> Color(0xFFF59E0B)
    "low" -> Color(0xFF94A3B8)
    else -> Color(0xFF2563EB)
}
