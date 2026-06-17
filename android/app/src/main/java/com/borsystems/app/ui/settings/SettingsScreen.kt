package com.borsystems.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.AppSettings
import kotlinx.coroutines.launch

/**
 * App settings — mirrors iOS SettingsView.swift.
 *
 * Each setting has its own save endpoint so a flaky save doesn't drop
 * other in-flight edits. The footers explain the operational impact of
 * each threshold — same copy as iOS so admins reading them on either
 * platform get identical guidance.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<AppSettings?>(null) }
    var ack by remember { mutableStateOf("") }
    var resolution by remember { mutableStateOf("") }
    var lowBattery by remember { mutableStateOf("") }
    var cleaning by remember { mutableStateOf("") }
    var audibleAlarm by remember { mutableStateOf(false) }
    var savedKey by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            val s = ApiClient.appSettings()
            settings = s
            if (ack.isEmpty())        ack = s.acknowledgementTimerMinutes.toString()
            if (resolution.isEmpty()) resolution = s.resolutionTimerMinutes.toString()
            if (lowBattery.isEmpty()) lowBattery = s.lowBatteryThreshold.toString()
            if (cleaning.isEmpty())   cleaning = s.expectedCleaningTimeMinutes.toString()
            audibleAlarm = s.defaultAudibleAlarmEnabled
        } catch (e: Exception) {
            error = "Could not load settings."
        }
    }

    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            NumberSetting(
                label = "Acknowledgement timer",
                suffix = "min",
                value = ack,
                onChange = { ack = it },
                dirty = settings?.let { ack.toIntOrNull() != it.acknowledgementTimerMinutes } ?: false,
                saved = savedKey == "ack",
                onSave = {
                    scope.launch {
                        try {
                            ApiClient.setAckTimer(ack.toInt())
                            savedKey = "ack"; load()
                        } catch (e: Exception) { error = "Could not save." }
                    }
                },
                footer = "If no cleaner taps 'I'm on it' within this many minutes, the alert escalates to all on-duty supervisors via push, SMS, and email.",
            )
            NumberSetting(
                label = "Resolution timer",
                suffix = "min",
                value = resolution,
                onChange = { resolution = it },
                dirty = settings?.let { resolution.toIntOrNull() != it.resolutionTimerMinutes } ?: false,
                saved = savedKey == "res",
                onSave = {
                    scope.launch {
                        try {
                            ApiClient.setResolutionTimer(resolution.toInt())
                            savedKey = "res"; load()
                        } catch (e: Exception) { error = "Could not save." }
                    }
                },
                footer = "If the sign isn't physically replaced within this many minutes, the alert is rebroadcast and (if not already) escalated.",
            )
            NumberSetting(
                label = "Expected cleaning time",
                suffix = "min",
                value = cleaning,
                onChange = { cleaning = it },
                dirty = settings?.let { cleaning.toIntOrNull() != it.expectedCleaningTimeMinutes } ?: false,
                saved = savedKey == "clean",
                onSave = {
                    scope.launch {
                        try {
                            ApiClient.setExpectedCleaningTime(cleaning.toInt())
                            savedKey = "clean"; load()
                        } catch (e: Exception) { error = "Could not save." }
                    }
                },
                footer = "After 'I'm on it', a reminder push is sent to the cleaner after this many minutes asking them to put the sign back on the hanger.",
            )
            NumberSetting(
                label = "Low-battery threshold",
                suffix = "%",
                value = lowBattery,
                onChange = { lowBattery = it },
                dirty = settings?.let { lowBattery.toIntOrNull() != it.lowBatteryThreshold } ?: false,
                saved = savedKey == "battery",
                onSave = {
                    scope.launch {
                        try {
                            ApiClient.setLowBatteryThreshold(lowBattery.toInt())
                            savedKey = "battery"; load()
                        } catch (e: Exception) { error = "Could not save." }
                    }
                },
                footer = "When a hanger's battery drops to this percentage, admins and supervisors get a 'Hanger battery low' notification.",
            )
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text(
                            "Default audible alarm on new hangers",
                            modifier = Modifier.weight(1f),
                            fontWeight = FontWeight.SemiBold,
                        )
                        Switch(checked = audibleAlarm, onCheckedChange = { audibleAlarm = it })
                    }
                    if (settings?.defaultAudibleAlarmEnabled != audibleAlarm) {
                        TextButton(onClick = {
                            scope.launch {
                                try {
                                    ApiClient.setDefaultAudibleAlarm(audibleAlarm)
                                    savedKey = "audible"; load()
                                } catch (e: Exception) { error = "Could not save." }
                            }
                        }) { Text("Save") }
                    }
                    if (savedKey == "audible") {
                        Text("Saved", color = MaterialTheme.colorScheme.secondary, style = MaterialTheme.typography.labelMedium)
                    }
                    Text(
                        "Whether the optional buzzer is enabled by default when a new hanger is registered. Existing hangers are unaffected.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}

@Composable
private fun NumberSetting(
    label: String,
    suffix: String,
    value: String,
    onChange: (String) -> Unit,
    dirty: Boolean,
    saved: Boolean,
    onSave: () -> Unit,
    footer: String,
) {
    Card {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                OutlinedTextField(
                    value = value,
                    onValueChange = { onChange(it.filter(Char::isDigit)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Text(suffix, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (dirty) {
                TextButton(onClick = onSave) { Text("Save") }
            }
            if (saved) {
                Text("Saved", color = MaterialTheme.colorScheme.secondary, style = MaterialTheme.typography.labelMedium)
            }
            Text(
                footer,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
