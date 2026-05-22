package com.borsystems.app.ui.schedule

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Shift
import com.borsystems.app.network.UserRole
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Schedule screen — read-only list of shifts.
 *
 * Cleaners see only THEIR shifts. Admin/supervisor see everyone's.
 * Mirrors iOS ScheduleView's read-only mode for cleaners. Creating
 * shifts happens via the web admin for now (~95% of admin time spent
 * editing schedules is on a laptop anyway).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen() {
    val user by AuthStore.user.collectAsState()
    var shifts by remember { mutableStateOf<List<Shift>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        try {
            val all = ApiClient.listShifts()
            shifts = if (user?.role == UserRole.cleaner) all.filter { it.userId == user?.id } else all
        } catch (_: Exception) { }
        loading = false
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Schedule") }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                shifts.isEmpty() -> Text("No shifts scheduled.", modifier = Modifier.align(Alignment.Center))
                else -> LazyColumn(
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(shifts, key = { it.id }) { ShiftRow(it) }
                }
            }
        }
    }
}

@Composable
private fun ShiftRow(s: Shift) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            s.userName?.let { Text(it, style = MaterialTheme.typography.titleSmall) }
            Text(
                "${formatTime(s.startsAt)} – ${formatTime(s.endsAt)}",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

private fun formatTime(iso: String): String {
    val dt = runCatching { ZonedDateTime.parse(iso) }.getOrNull() ?: return iso
    return dt.format(DateTimeFormatter.ofPattern("EEE d MMM HH:mm"))
}
