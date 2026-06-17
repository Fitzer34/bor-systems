package com.borsystems.app.ui.maintenance

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Meter
import kotlinx.coroutines.launch

/**
 * Predictive maintenance — usage meters (admin + supervisor). Field staff log
 * readings at the asset; the server flags each meter due by actual usage.
 * Mirrors iOS MetersView / the web Meters page. Creating meters stays on web.
 * Reached from More → Meters.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MetersScreen(onBack: () -> Unit) {
    var list by remember { mutableStateOf<List<Meter>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Meter?>(null) }
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    suspend fun load() {
        try { list = ApiClient.meters(); error = null }
        catch (e: Exception) { error = "Could not load meters." }
        finally { loaded = true }
    }
    LaunchedEffect(Unit) { load() }

    fun rank(s: String) = when (s) { "due" -> 0; "due_soon" -> 1; "ok" -> 2; else -> 3 }
    val sorted = list.sortedBy { rank(it.status) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("Meters") },
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
                    "No meters yet. Add them on the web dashboard, then log readings here.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(sorted, key = { it.id }) { m -> MeterCard(m) { selected = m } }
                }
            }
        }
    }

    selected?.let { m ->
        MeterReadingDialog(
            meter = m,
            onDismiss = { selected = null },
            onLog = { value, note ->
                scope.launch {
                    try { ApiClient.logMeterReading(m.id, value, note); selected = null; load() }
                    catch (e: Exception) { snackbar.showSnackbar("Could not save reading.") }
                }
            },
            onService = {
                scope.launch {
                    try { ApiClient.serviceMeter(m.id); selected = null; load() }
                    catch (e: Exception) { snackbar.showSnackbar("Could not mark serviced.") }
                }
            },
        )
    }
}

@Composable
private fun MeterCard(m: Meter, onClick: () -> Unit) {
    val st = meterStatusUi(m.status)
    val unit = m.unit?.let { " $it" } ?: ""
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(m.assetName ?: m.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(st.label, color = st.color, style = MaterialTheme.typography.labelMedium)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    m.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text("${m.currentValue}$unit", fontWeight = FontWeight.SemiBold)
            }
            val interval = m.intervalValue
            if (interval != null && interval > 0) {
                LinearProgressIndicator(
                    progress = ((m.pct ?: 0).coerceIn(0, 100)) / 100f,
                    modifier = Modifier.fillMaxWidth(),
                    color = st.color,
                )
                m.remaining?.let { rem ->
                    Text(
                        if (rem > 0) "$rem$unit to next service" else "Overdue by ${-rem}$unit",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun MeterReadingDialog(
    meter: Meter,
    onDismiss: () -> Unit,
    onLog: (Int, String?) -> Unit,
    onService: () -> Unit,
) {
    var value by remember { mutableStateOf(meter.currentValue.toString()) }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(meter.name) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                meter.assetName?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedTextField(
                    value = value,
                    onValueChange = { v -> value = v.filter(Char::isDigit) },
                    label = { Text("New reading" + (meter.unit?.let { " ($it)" } ?: "")) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    singleLine = true,
                )
                TextButton(onClick = onService) { Text("Mark serviced") }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { value.toIntOrNull()?.let { onLog(it, note.ifBlank { null }) } },
                enabled = value.toIntOrNull() != null,
            ) { Text("Save reading") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

data class MeterStatusUi(val label: String, val color: Color)

fun meterStatusUi(status: String): MeterStatusUi = when (status) {
    "due" -> MeterStatusUi("Service due", Color(0xFFE53935))
    "due_soon" -> MeterStatusUi("Due soon", Color(0xFFF59E0B))
    "ok" -> MeterStatusUi("OK", Color(0xFF2E7D32))
    else -> MeterStatusUi("Tracking", Color(0xFF94A3B8))
}
