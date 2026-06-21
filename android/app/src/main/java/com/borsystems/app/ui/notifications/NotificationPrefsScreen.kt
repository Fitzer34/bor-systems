package com.borsystems.app.ui.notifications

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
import com.borsystems.app.network.ChannelPrefs
import kotlinx.coroutines.launch

/**
 * Notification preferences — per-event-type channel matrix (in-app / email /
 * SMS). In-app is always on server-side, but we keep the toggle visible for
 * parity with the web and so the user understands the row delivers to the feed.
 *
 * Toggles flip optimistically and PUT the single changed flag; on failure we
 * revert by re-fetching. Mirrors web lib/notifications.tsx prefs matrix.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationPrefsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var prefs by remember { mutableStateOf<Map<String, ChannelPrefs>>(emptyMap()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            prefs = ApiClient.notificationPreferences()
            error = null
        } catch (e: Exception) {
            error = "Could not load preferences."
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    fun update(eventType: String, channel: Channel, value: Boolean) {
        // Optimistic local flip.
        val current = prefs[eventType] ?: ChannelPrefs()
        val next = when (channel) {
            Channel.InApp -> current.copy(inApp = value)
            Channel.Email -> current.copy(email = value)
            Channel.Sms -> current.copy(sms = value)
        }
        prefs = prefs.toMutableMap().apply { put(eventType, next) }
        scope.launch {
            try {
                ApiClient.setNotificationPreference(
                    eventType = eventType,
                    inApp = if (channel == Channel.InApp) value else null,
                    email = if (channel == Channel.Email) value else null,
                    sms = if (channel == Channel.Sms) value else null,
                )
            } catch (e: Exception) {
                error = "Could not save — reverted."
                load() // reconcile against server truth
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notification preferences") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                prefs.isEmpty() -> Text(
                    "No notification types yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                else -> {
                    // Stable order: known catalogue first, then any extras.
                    val ordered = KNOWN_ORDER.filter { prefs.containsKey(it) } +
                        prefs.keys.filter { it !in KNOWN_ORDER }.sorted()
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        item {
                            Text(
                                "Choose how you're told about each kind of event. In-app delivers to your notifications feed; email and SMS are opt-in.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        items(ordered, key = { it }) { type ->
                            PrefCard(
                                label = notificationTypeLabel(type),
                                prefs = prefs[type] ?: ChannelPrefs(),
                                onChange = { ch, v -> update(type, ch, v) },
                            )
                        }
                    }
                }
            }
            error?.let {
                Snackbar(
                    Modifier.align(Alignment.BottomCenter).padding(12.dp),
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                ) { Text(it) }
            }
        }
    }
}

private enum class Channel { InApp, Email, Sms }

@Composable
private fun PrefCard(
    label: String,
    prefs: ChannelPrefs,
    onChange: (Channel, Boolean) -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            ChannelToggle("In-app", prefs.inApp) { onChange(Channel.InApp, it) }
            ChannelToggle("Email", prefs.email) { onChange(Channel.Email, it) }
            ChannelToggle("SMS", prefs.sms) { onChange(Channel.Sms, it) }
        }
    }
}

@Composable
private fun ChannelToggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

/** Catalogue order so the matrix reads consistently (mirrors DEFAULT_PREFS). */
private val KNOWN_ORDER = listOf(
    "spill.open",
    "spill.escalated",
    "ppm.overdue",
    "wo.overdue",
    "part.low_stock",
    "cert.expiring",
    "invoice.overdue",
    "lone_worker.overdue",
    "quote.awaiting_approval",
    "patrol.missed",
)
