package com.borsystems.app.ui.sites

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.SiteSummary
import kotlinx.coroutines.delay

/**
 * Sites overview — multi-building rollup for cleaning companies
 * managing many client buildings. Mirrors web/pages/Sites.tsx.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SitesScreen() {
    var sites by remember { mutableStateOf<List<SiteSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        while (true) {
            try { sites = ApiClient.sitesSummary() } catch (_: Exception) { }
            loading = false
            delay(5000)
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Sites overview") }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                loading && sites.isEmpty() -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                sites.isEmpty() -> Text("No buildings yet.", modifier = Modifier.align(Alignment.Center))
                else -> LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(sites, key = { it.buildingId }) { SiteCard(it) }
                }
            }
        }
    }
}

@Composable
private fun SiteCard(s: SiteSummary) {
    val onlinePct = if (s.hangerCount > 0) (s.onlineCount * 100 / s.hangerCount) else 0
    val needsAttention = s.openAlerts > 0 || s.lowBatteryCount > 0 || onlinePct < 80
    val border = if (needsAttention) Color(0xFFFFA000) else Color.Transparent

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(s.buildingName, style = MaterialTheme.typography.titleSmall)
                if (s.openAlerts > 0) {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Text(
                            "${s.openAlerts} open",
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Stat("Online", "${s.onlineCount}/${s.hangerCount}", good = onlinePct >= 80)
                Stat("Low batt", "${s.lowBatteryCount}", good = s.lowBatteryCount == 0)
                Stat("30-day spills", "${s.thirtyDaySpills}", good = true)
            }
            s.avgResponseSeconds?.let {
                Text(
                    "Avg response: ${formatDuration(it)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Stat(label: String, value: String, good: Boolean) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = if (good) Color(0xFF2E7D32) else Color(0xFFFF8800),
        )
    }
}

private fun formatDuration(s: Int): String {
    if (s < 60) return "${s}s"
    if (s < 3600) return "${s / 60}m"
    return "${s / 3600}h ${(s % 3600) / 60}m"
}
