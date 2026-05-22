package com.borsystems.app.ui.setup

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.borsystems.app.ble.HangerSetupManager
import com.borsystems.app.ble.HangerSetupManager.Phase

/**
 * Hanger BLE Wi-Fi onboarding wizard — mirrors iOS HangerSetupView.
 *
 * Walks the customer through:
 *   1. Permission grant
 *   2. BLE scan for the hanger
 *   3. SSID + password entry
 *   4. Live status feedback ("joining → connected")
 *
 * Reuses the same GATT UUIDs as iOS + Heltec firmware + Pi setup_mode,
 * so a single hanger works with whichever phone happens to onboard it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HangerSetupScreen(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val manager = remember { HangerSetupManager(ctx) }
    val phase by manager.phase.collectAsState()

    val permsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        if (granted.values.all { it }) manager.start()
    }

    DisposableEffect(Unit) { onDispose { manager.stop() } }

    LaunchedEffect(Unit) {
        // Request perms up front so the user only sees the system dialog once.
        val needed = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        permsLauncher.launch(needed)
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Add hanger") },
            navigationIcon = {
                IconButton(onClick = onDone) {
                    Icon(Icons.Default.Close, contentDescription = "Close")
                }
            },
        )
    }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize(), contentAlignment = Alignment.Center) {
            when (val p = phase) {
                is Phase.Idle,
                is Phase.MissingPermissions  -> Hint("Waiting for Bluetooth permission…")
                is Phase.BluetoothOff        -> Hint("Turn on Bluetooth, then come back.")
                is Phase.Scanning            -> Searching()
                is Phase.Connecting          -> Hint("Connecting to ${p.name}…", spinner = true)
                is Phase.Discovering         -> Hint("Reading hanger info…", spinner = true)
                is Phase.Ready               -> CredentialsForm(p.devEui, manager::submitCredentials)
                is Phase.Sending             -> Hint("Sending Wi-Fi credentials…", spinner = true)
                is Phase.Joining             -> Hint("Hanger is joining your Wi-Fi…", spinner = true)
                is Phase.Connected           -> Done(onDone)
                is Phase.Failed              -> Failed(p.message, retry = { manager.start() })
            }
        }
    }
}

@Composable
private fun Hint(text: String, spinner: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (spinner) CircularProgressIndicator()
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun Searching() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Icon(Icons.Default.Bluetooth, contentDescription = null, modifier = Modifier.size(64.dp))
        Text("Looking for hanger…", style = MaterialTheme.typography.titleMedium)
        Text(
            "Power on the hanger you want to add. It will broadcast \"BOR-Setup-XXXX\" for 10 minutes after first boot.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        CircularProgressIndicator()
    }
}

@Composable
private fun CredentialsForm(devEui: String?, onSubmit: (String, String) -> Unit) {
    var ssid by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.padding(24.dp).fillMaxWidth(),
    ) {
        Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(48.dp))
        Text(
            devEui?.let { "Hanger $it" } ?: "Hanger paired",
            style = MaterialTheme.typography.titleMedium,
        )
        OutlinedTextField(
            value = ssid, onValueChange = { ssid = it },
            label = { Text("Wi-Fi network (SSID)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password, onValueChange = { password = it },
            label = { Text("Wi-Fi password") },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { onSubmit(ssid.trim(), password) },
            enabled = ssid.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Send to hanger") }
    }
}

@Composable
private fun Done(onDone: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(64.dp))
        Text("Hanger is online", style = MaterialTheme.typography.titleMedium)
        Text(
            "It's joined Wi-Fi and is reporting to the cloud.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onDone) { Text("Done") }
    }
}

@Composable
private fun Failed(message: String, retry: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(64.dp))
        Text("Setup failed", style = MaterialTheme.typography.titleMedium)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = retry) { Text("Try again") }
    }
}
