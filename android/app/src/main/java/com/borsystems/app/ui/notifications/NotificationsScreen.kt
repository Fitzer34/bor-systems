package com.borsystems.app.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.NotificationItem
import com.borsystems.app.notifications.NotificationCenter
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

/**
 * Notifications centre — the native in-app feed.
 *
 * Grouped by recency (Today / Earlier), newest first. Unread rows carry a dot +
 * tinted background. Tapping a row marks it read and routes to the entity it
 * points at (alerts have a per-id detail screen; other entity types deep-link to
 * their list screen, where the row is shown). Mirrors web pages/Notifications +
 * lib/notifications.tsx.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    onOpenAlert: (String) -> Unit,
    onOpenRoute: (String) -> Unit,
    onOpenPreferences: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        try {
            items = ApiClient.notifications(limit = 50)
            error = null
        } catch (e: Exception) {
            error = "Could not load notifications."
        } finally {
            loading = false
        }
        NotificationCenter.refresh()
    }

    LaunchedEffect(Unit) { refresh() }

    val hasUnread = items.any { it.readAt == null }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notifications") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (hasUnread) {
                        TextButton(onClick = {
                            scope.launch {
                                try {
                                    ApiClient.markAllNotificationsRead()
                                    NotificationCenter.clear()
                                    refresh()
                                } catch (_: Exception) { error = "Could not mark all read." }
                            }
                        }) {
                            Icon(Icons.Default.DoneAll, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Mark all")
                        }
                    }
                    IconButton(onClick = onOpenPreferences) {
                        Icon(Icons.Default.NotificationsNone, contentDescription = "Notification preferences")
                    }
                },
            )
        }
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                loading && items.isEmpty() -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                items.isEmpty() -> EmptyFeed(Modifier.align(Alignment.Center))
                else -> {
                    val now = Instant.now()
                    val today = items.filter { isToday(it.createdAt, now) }
                    val earlier = items.filter { !isToday(it.createdAt, now) }
                    LazyColumn(
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        if (today.isNotEmpty()) {
                            item { GroupHeader("Today") }
                            items(today, key = { it.id }) { n ->
                                NotificationRow(n, now) { handleTap(scope, n, ::refresh, onOpenAlert, onOpenRoute) }
                                HorizontalDivider()
                            }
                        }
                        if (earlier.isNotEmpty()) {
                            item { GroupHeader("Earlier") }
                            items(earlier, key = { it.id }) { n ->
                                NotificationRow(n, now) { handleTap(scope, n, ::refresh, onOpenAlert, onOpenRoute) }
                                HorizontalDivider()
                            }
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

/** Mark read (if needed) then route to the entity the notification points at. */
private fun handleTap(
    scope: kotlinx.coroutines.CoroutineScope,
    n: NotificationItem,
    refresh: suspend () -> Unit,
    onOpenAlert: (String) -> Unit,
    onOpenRoute: (String) -> Unit,
) {
    scope.launch {
        if (n.readAt == null) {
            try { ApiClient.markNotificationRead(n.id); NotificationCenter.refresh() } catch (_: Exception) {}
        }
        val entityId = n.entityId
        when (n.entityType) {
            "alert" -> if (entityId != null) onOpenAlert(entityId)
            else -> notificationRoute(n.entityType)?.let(onOpenRoute)
        }
        refresh()
    }
}

@Composable
private fun GroupHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun NotificationRow(n: NotificationItem, now: Instant, onTap: () -> Unit) {
    val unread = n.readAt == null
    val bg = if (unread) MaterialTheme.colorScheme.primary.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surface
    Row(
        Modifier
            .fillMaxWidth()
            .background(bg)
            .clickable(onClick = onTap)
            .padding(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            Modifier
                .padding(top = 6.dp)
                .size(8.dp)
                .background(
                    if (unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    CircleShape,
                )
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    n.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    relativeTime(n.createdAt, now),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (n.body.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    n.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(6.dp))
            AssistChipLabel(notificationTypeLabel(n.type))
        }
    }
}

@Composable
private fun AssistChipLabel(text: String) {
    Box(
        Modifier
            .clip(MaterialTheme.shapes.small)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EmptyFeed(modifier: Modifier = Modifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            Icons.Default.NotificationsNone,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(56.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text("You're all caught up", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Notifications about spills, jobs and certificates land here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ─── Shared helpers (mirror web lib/notifications.tsx) ────────────────────

/** Friendly label for an event type (row chip + prefs list). */
fun notificationTypeLabel(type: String): String {
    val map = mapOf(
        "spill.open" to "Spill alert",
        "spill.escalated" to "Spill escalated",
        "ppm.overdue" to "PPM overdue",
        "wo.overdue" to "Work order overdue",
        "part.low_stock" to "Low stock",
        "cert.expiring" to "Certificate expiring",
        "invoice.overdue" to "Invoice overdue",
        "lone_worker.overdue" to "Lone-worker check-in",
        "quote.awaiting_approval" to "Quote awaiting approval",
        "patrol.missed" to "Missed patrol",
    )
    map[type]?.let { return it }
    // Fallback: "some.event_type" → "Some event type".
    return type.replace(Regex("[._]"), " ")
        .replaceFirstChar { it.uppercase() }
}

/** Map an entity type to the in-app route that shows it (null = nowhere). */
fun notificationRoute(entityType: String?): String? = when (entityType) {
    "job" -> "maintenance"
    "ppm" -> "ppms"
    "part" -> "meters"          // no Parts screen on mobile; meters is the closest
    "certification" -> "competency"
    "checkpoint" -> "sites"
    "lone_worker_session" -> "sites"
    else -> null
}

private fun parse(iso: String): Instant? = runCatching { Instant.parse(iso) }.getOrNull()

private fun isToday(iso: String, now: Instant): Boolean {
    val t = parse(iso) ?: return false
    return Duration.between(t, now).toHours() < 24
}

private fun relativeTime(iso: String, now: Instant): String {
    val t = parse(iso) ?: return ""
    val secs = Duration.between(t, now).seconds.coerceAtLeast(0)
    return when {
        secs < 60 -> "${secs}s"
        secs < 3600 -> "${secs / 60}m"
        secs < 86400 -> "${secs / 3600}h"
        else -> "${secs / 86400}d"
    }
}
