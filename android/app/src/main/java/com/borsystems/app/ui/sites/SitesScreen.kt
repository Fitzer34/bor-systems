package com.borsystems.app.ui.sites

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
import com.borsystems.app.network.SiteOverview
import com.borsystems.app.network.SitesOverviewResponse
import kotlinx.coroutines.delay

/**
 * The estate on Android, same shape as web / Mac / iPhone: every site with
 * its key numbers first, then one site broken down by discipline — Cleaning,
 * Maintenance, Security. Every number comes from GET /sites/overview.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SitesScreen() {
    var data by remember { mutableStateOf<SitesOverviewResponse?>(null) }
    var failed by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<SiteOverview?>(null) }

    LaunchedEffect(Unit) {
        while (true) {
            try {
                val r = ApiClient.sitesOverview()
                data = r
                failed = false
                selected = selected?.let { sel -> r.sites.find { it.buildingId == sel.buildingId } ?: sel }
            } catch (_: Exception) { if (data == null) failed = true }
            delay(20_000)
        }
    }

    val sel = selected
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(sel?.buildingName ?: "Sites") },
            navigationIcon = {
                if (sel != null) IconButton(onClick = { selected = null }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "All sites")
                }
            },
        )
    }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                failed -> Column(
                    Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("Could not load the sites overview.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { failed = false; data = null }) { Text("Retry") }
                }
                data == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                sel != null -> SiteDetail(sel)
                else -> Estate(data!!, onOpen = { selected = it })
            }
        }
    }
}

@Composable
private fun Estate(d: SitesOverviewResponse, onOpen: (SiteOverview) -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "totals") {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("The whole estate", style = MaterialTheme.typography.titleMedium)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Kpi("${d.totals.openSpills}", "Spills",
                            if (d.totals.openSpills > 0) Color(0xFFD32F2F) else Color(0xFF2E7D32), Modifier.weight(1f))
                        Kpi("${d.totals.openJobs}", "Jobs", MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
                        Kpi("${d.totals.openIncidents}", "Incidents",
                            if (d.totals.openIncidents > 0) Color(0xFFF57C00) else MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
                        Kpi("${d.totals.staffOnClock + d.totals.visitorsOnSite}", "On site", Color(0xFF1565C0), Modifier.weight(1f))
                    }
                    Text(
                        "${d.totals.sites} sites · ${d.totals.hangers} smart signs (${d.totals.hangersOnline} online) · " +
                            "${d.totals.urgentJobs} urgent · ${d.totals.overduePpms} PPM overdue",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (d.sites.isEmpty()) {
            item(key = "empty") {
                Text(
                    "No sites yet. An admin adds them on the web or Mac app.",
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(d.sites, key = { it.buildingId }) { s ->
            Card(Modifier.fillMaxWidth(), onClick = { onOpen(s) }) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusDot(s)
                        Spacer(Modifier.width(8.dp))
                        Text(s.buildingName, style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.weight(1f))
                        Text(
                            when {
                                s.openSpills > 0 -> "Live spill"
                                s.urgentJobs > 0 || s.openIncidents > 0 -> "Needs attention"
                                else -> "Operational"
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        "${s.openSpills} spills · ${s.openJobs} jobs · ${s.openIncidents} incidents · ${s.hangers} signs",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun SiteDetail(s: SiteOverview) {
    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(key = "hero") {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(s.buildingName, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.width(8.dp))
                        if (s.openSpills > 0) {
                            Text("${s.openSpills} live spill" + if (s.openSpills == 1) "" else "s",
                                color = Color(0xFFD32F2F), fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.labelMedium)
                        } else {
                            Text("Operational", color = Color(0xFF2E7D32), fontWeight = FontWeight.SemiBold,
                                style = MaterialTheme.typography.labelMedium)
                        }
                    }
                    Text(
                        "${s.floors} floors · ${s.hangers} smart signs (${s.hangersOnline} online) · " +
                            "${s.staffOnClock} staff on the clock · ${s.visitorsOnSite} visitors on site",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        item(key = "cleaning") {
            Discipline(
                tint = Color(0xFF0D9488), title = "Cleaning",
                stats = listOf(
                    Triple("${s.openSpills}", "Live spills", if (s.openSpills > 0) Color(0xFFD32F2F) else Color(0xFF2E7D32)),
                    Triple("${s.hangers}", "Smart signs", null),
                    Triple("${s.hangersOnline}", "Online", null),
                    Triple("${s.floorsWithPlan}/${s.floors}", "Plans", null),
                ),
                note = if (s.openSpills > 0) "A sign is off its rack — the pin is red on the floor plan."
                       else "No live spills. Every sign here is on its rack.",
            )
        }
        item(key = "maintenance") {
            Discipline(
                tint = Color(0xFFB45309), title = "Maintenance",
                stats = listOf(
                    Triple("${s.openJobs}", "Open jobs", null),
                    Triple("${s.urgentJobs}", "Urgent", if (s.urgentJobs > 0) Color(0xFFF57C00) else null),
                    Triple("${s.overduePpms}", "PPM overdue", if (s.overduePpms > 0) Color(0xFFF57C00) else null),
                    Triple("${s.assets}", "Assets", null),
                ),
                note = if (s.openJobs == 0) "No open work orders at this site."
                       else "${s.openJobs} open — the Maintenance board has the detail.",
            )
        }
        item(key = "security") {
            Discipline(
                tint = Color(0xFF4338CA), title = "Security",
                stats = listOf(
                    Triple("${s.openIncidents}", "Incidents", if (s.openIncidents > 0) Color(0xFFF57C00) else null),
                    Triple("${s.visitorsOnSite}", "Visitors", null),
                    Triple("${s.staffOnClock}", "On the clock", null),
                    Triple("${s.gateways}", "Gateways", null),
                ),
                note = if (s.openIncidents == 0) "No open incidents at this site."
                       else "${s.openIncidents} open — see Incidents.",
            )
        }
    }
}

@Composable
private fun Discipline(tint: Color, title: String, stats: List<Triple<String, String, Color?>>, note: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = tint, fontWeight = FontWeight.Bold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                stats.forEach { (n, l, c) ->
                    Kpi(n, l, c ?: MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
                }
            }
            Text(note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Kpi(n: String, label: String, tint: Color, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(n, style = MaterialTheme.typography.titleLarge, color = tint, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

@Composable
private fun StatusDot(s: SiteOverview) {
    val color = when {
        s.openSpills > 0 -> Color(0xFFD32F2F)
        s.urgentJobs > 0 || s.openIncidents > 0 -> Color(0xFFF57C00)
        else -> Color(0xFF2E7D32)
    }
    Surface(color = color, shape = MaterialTheme.shapes.small, modifier = Modifier.size(10.dp)) {}
}
