package com.borsystems.app.ui.business

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.ComplianceItem
import com.borsystems.app.network.UserRole
import kotlinx.coroutines.launch
import java.time.LocalDate

/**
 * The statutory compliance register on the phone: fire alarm service, gas
 * cert, lift LOLER and the rest, grouped by category with honest overdue /
 * due-soon states. Staff mark a task done today; the due date rolls forward
 * server-side.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComplianceScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val user by AuthStore.user.collectAsState()
    val isStaff = user?.role == UserRole.admin || user?.role == UserRole.supervisor

    var items by remember { mutableStateOf<List<ComplianceItem>?>(null) }
    var failed by remember { mutableStateOf(false) }

    suspend fun load() {
        try { items = ApiClient.complianceItems(); failed = false }
        catch (_: Exception) { if (items == null) failed = true }
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Compliance") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
        )
    }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            val list = items
            when {
                failed -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load the compliance register.")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { scope.launch { load() } }) { Text("Retry") }
                }
                list == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                list.isEmpty() -> Text(
                    "Nothing tracked yet. Add items on the web under Compliance.",
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                else -> {
                    val overdue = list.count { it.status == "overdue" }
                    val dueSoon = list.count { it.status == "due_soon" }
                    LazyColumn(contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        item(key = "kpi") {
                            Card(Modifier.fillMaxWidth()) {
                                Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    Kpi("$overdue", "Overdue", if (overdue > 0) Color(0xFFD32F2F) else Color(0xFF2E7D32))
                                    Kpi("$dueSoon", "Due soon", if (dueSoon > 0) Color(0xFFF57C00) else MaterialTheme.colorScheme.onSurface)
                                    Kpi("${list.size}", "Tracked", MaterialTheme.colorScheme.onSurface)
                                }
                            }
                        }
                        list.groupBy { it.category }.toSortedMap().forEach { (cat, rows) ->
                            item(key = "h-$cat") { Text(cat, style = MaterialTheme.typography.titleSmall) }
                            rows.forEach { i ->
                                item(key = i.id) {
                                    ComplianceCard(i, isStaff) {
                                        scope.launch {
                                            try { ApiClient.completeCompliance(i.id, LocalDate.now().toString()); load() }
                                            catch (_: Exception) {}
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
}

@Composable
private fun Kpi(n: String, l: String, tint: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(n, style = MaterialTheme.typography.titleLarge, color = tint)
        Text(l, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ComplianceCard(i: ComplianceItem, canComplete: Boolean, onDone: () -> Unit) {
    val tint = when (i.status) {
        "overdue" -> Color(0xFFD32F2F)
        "due_soon" -> Color(0xFFF57C00)
        "ok" -> Color(0xFF2E7D32)
        else -> Color(0xFF757575)
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = tint, shape = MaterialTheme.shapes.small, modifier = Modifier.size(9.dp)) {}
                Spacer(Modifier.width(8.dp))
                Text(i.name, style = MaterialTheme.typography.titleSmall)
            }
            Text(
                listOfNotNull(
                    i.buildingName,
                    "every ${i.frequencyMonths} mo",
                    i.nextDueOn?.let { "due $it" } ?: "not scheduled",
                    i.contractorName,
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (canComplete) {
                TextButton(onClick = onDone) { Text("Mark done today") }
            }
        }
    }
}
