package com.borsystems.app.ui.ppms

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.PPM
import com.borsystems.app.network.PpmInput
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * PPMs — Planned Preventive Maintenance. Mirrors the iOS PPMsView / web PPMs
 * page. Lists recurring contractor jobs with due/overdue status, and lets
 * staff add, edit, complete (rolls the due date forward), and delete them.
 * Reached from More → PPMs (staff only; the backend also gates it).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PpmsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<PPM>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<Editing?>(null) }

    suspend fun load() {
        try { list = ApiClient.listPpms(); error = null }
        catch (e: Exception) { error = "Could not load PPMs." }
        finally { loaded = true }
    }
    LaunchedEffect(Unit) { load() }

    val current = editing
    if (current != null) {
        PpmEditor(
            existing = current.ppm,
            onClose = { editing = null },
            onChanged = { editing = null; scope.launch { load() } },
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("PPMs") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { editing = Editing(null) }) {
                        Icon(Icons.Default.Add, contentDescription = "Add PPM")
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
                    "No maintenance tasks yet. Tap + to add one.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(list, key = { it.id }) { p ->
                        PpmCard(
                            ppm = p,
                            onEdit = { editing = Editing(p) },
                            onDone = {
                                scope.launch {
                                    try { ApiClient.completePpm(p.id); load() }
                                    catch (e: Exception) { error = "Could not mark done." }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

private data class Editing(val ppm: PPM?)

@Composable
private fun PpmCard(ppm: PPM, onEdit: () -> Unit, onDone: () -> Unit) {
    val st = ppmStatus(ppm)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(ppm.title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Text(st.label, color = st.color, style = MaterialTheme.typography.labelMedium)
            }
            Text(
                "${freqLabel(ppm.frequencyPerYear)} · Next due ${displayDate(ppm.nextDueDate)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ppm.contractorName?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = onDone) { Text("Mark done") }
                TextButton(onClick = onEdit) { Text("Edit") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PpmEditor(existing: PPM?, onClose: () -> Unit, onChanged: () -> Unit) {
    val scope = rememberCoroutineScope()
    val isEdit = existing != null

    var title by remember { mutableStateOf(existing?.title ?: "") }
    var notes by remember { mutableStateOf(existing?.notes ?: "") }
    var contractor by remember { mutableStateOf(existing?.contractorName ?: "") }
    var phone by remember { mutableStateOf(existing?.contactPhone ?: "") }
    var email by remember { mutableStateOf(existing?.contactEmail ?: "") }
    var frequency by remember { mutableStateOf(existing?.frequencyPerYear ?: 1) }
    var dueDate by remember { mutableStateOf(existing?.nextDueDate ?: millisToIso(System.currentTimeMillis() + 30L * 86_400_000L)) }
    var leadDays by remember { mutableStateOf((existing?.reminderLeadDays ?: 14).toString()) }
    var active by remember { mutableStateOf(existing?.active ?: true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showDatePicker by remember { mutableStateOf(false) }
    var freqOpen by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "Edit PPM" else "Add PPM") },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Task title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes (optional)") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = contractor, onValueChange = { contractor = it }, label = { Text("Contractor company") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())

            // Frequency dropdown
            ExposedDropdownMenuBox(expanded = freqOpen, onExpandedChange = { freqOpen = it }) {
                OutlinedTextField(
                    value = freqLabel(frequency), onValueChange = {}, readOnly = true,
                    label = { Text("How often") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = freqOpen) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = freqOpen, onDismissRequest = { freqOpen = false }) {
                    listOf(1, 2, 3, 4, 6, 12).forEach { v ->
                        DropdownMenuItem(text = { Text(freqLabel(v)) }, onClick = { frequency = v; freqOpen = false })
                    }
                }
            }

            // Next due date — read-only field with a picker.
            OutlinedTextField(
                value = displayDate(dueDate), onValueChange = {}, readOnly = true,
                label = { Text("Next due date") },
                trailingIcon = { TextButton(onClick = { showDatePicker = true }) { Text("Change") } },
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = leadDays, onValueChange = { leadDays = it.filter(Char::isDigit).take(3) },
                label = { Text("Remind days before due") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )

            if (isEdit) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = active, onCheckedChange = { active = it })
                    Spacer(Modifier.width(8.dp))
                    Text("Active (off = pause reminders)")
                }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Button(
                onClick = {
                    error = null
                    saving = true
                    scope.launch {
                        try {
                            val body = PpmInput(
                                title = title.trim(),
                                notes = notes.trim().ifBlank { null },
                                contractorName = contractor.trim().ifBlank { null },
                                contactPhone = phone.trim().ifBlank { null },
                                contactEmail = email.trim().ifBlank { null },
                                frequencyPerYear = frequency,
                                nextDueDate = dueDate,
                                reminderLeadDays = leadDays.toIntOrNull() ?: 14,
                                active = active,
                            )
                            if (existing != null) ApiClient.updatePpm(existing.id, body)
                            else ApiClient.createPpm(body)
                            onChanged()
                        } catch (e: Exception) {
                            error = if ((e.message ?: "").contains("email", ignoreCase = true))
                                "Check the contractor email address."
                            else "Could not save — try again."
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = title.isNotBlank() && !saving,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (saving) "Saving…" else if (isEdit) "Save" else "Add PPM") }

            if (isEdit) {
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            try { ApiClient.completePpm(existing!!.id); onChanged() }
                            catch (e: Exception) { error = "Could not mark done." }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Mark done now") }

                TextButton(
                    onClick = {
                        scope.launch {
                            try { ApiClient.deletePpm(existing!!.id); onChanged() }
                            catch (e: Exception) { error = "Could not delete." }
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Delete PPM") }
            }
        }
    }

    if (showDatePicker) {
        val state = rememberDatePickerState(initialSelectedDateMillis = isoToMillis(dueDate))
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { dueDate = millisToIso(it) }
                    showDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("Cancel") } },
        ) {
            DatePicker(state = state)
        }
    }
}

// ─── Helpers ────────────────────────────────────────────────────────

private data class PpmStatusUi(val label: String, val color: Color)

private val isoFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

private fun isoToMillis(s: String): Long =
    try { isoFmt.parse(s)?.time ?: System.currentTimeMillis() } catch (e: Exception) { System.currentTimeMillis() }

private fun millisToIso(ms: Long): String = isoFmt.format(Date(ms))

private fun displayDate(s: String): String = try {
    val d = isoFmt.parse(s) ?: return s
    SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(d)
} catch (e: Exception) { s }

private fun daysUntil(iso: String): Int {
    val due = isoToMillis(iso)
    val today = isoToMillis(millisToIso(System.currentTimeMillis()))
    return ((due - today) / 86_400_000L).toInt()
}

private fun ppmStatus(p: PPM): PpmStatusUi {
    if (!p.active) return PpmStatusUi("Paused", Color(0xFF94A3B8))
    val d = daysUntil(p.nextDueDate)
    return when {
        d < 0 -> PpmStatusUi("Overdue ${-d}d", Color(0xFFE53935))
        d == 0 -> PpmStatusUi("Due today", Color(0xFFF59E0B))
        d <= p.reminderLeadDays -> PpmStatusUi("Due in ${d}d", Color(0xFFF59E0B))
        else -> PpmStatusUi("Due ${displayDate(p.nextDueDate)}", Color(0xFF2E7D32))
    }
}

private fun freqLabel(n: Int): String = when (n) {
    1 -> "Annually"
    2 -> "Twice a year"
    3 -> "3× a year"
    4 -> "Quarterly"
    6 -> "Every 2 months"
    12 -> "Monthly"
    else -> "$n× a year"
}
