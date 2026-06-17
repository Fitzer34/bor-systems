package com.borsystems.app.ui.dispatch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.DispatchItem
import com.borsystems.app.network.DispatchStatus
import kotlinx.coroutines.launch

/**
 * My dispatches — mirrors iOS MyDispatchesView.swift.
 *
 * What a cleaner sees: jobs sent TO them by a supervisor. Two sections:
 * Active (sent / acknowledged) and Completed. Each Active card has "On
 * my way" → "Done" buttons. Cleaners can't create dispatches, only
 * respond to them.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyDispatchesScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var dispatches by remember { mutableStateOf<List<DispatchItem>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        try {
            dispatches = ApiClient.listDispatches()
            error = null
        } catch (e: Exception) {
            error = "Could not load dispatches."
        }
    }

    LaunchedEffect(Unit) { refresh() }

    val active = dispatches.filter { it.status != DispatchStatus.completed }
    val done   = dispatches.filter { it.status == DispatchStatus.completed }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Dispatch") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        Box(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            if (dispatches.isEmpty() && error == null) {
                EmptyHint(Modifier.align(Alignment.Center))
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp)) } }
                    if (active.isNotEmpty()) {
                        item { SectionHeader("Active") }
                        items(active, key = { it.id }) { d ->
                            DispatchCard(
                                dispatch = d,
                                busy = busyId == d.id,
                                onAcknowledge = {
                                    busyId = d.id
                                    scope.launch {
                                        try { ApiClient.acknowledgeDispatch(d.id); refresh() }
                                        catch (e: Exception) { error = "Could not acknowledge." }
                                        finally { busyId = null }
                                    }
                                },
                                onComplete = {
                                    busyId = d.id
                                    scope.launch {
                                        try { ApiClient.completeDispatch(d.id); refresh() }
                                        catch (e: Exception) { error = "Could not complete." }
                                        finally { busyId = null }
                                    }
                                },
                            )
                        }
                    }
                    if (done.isNotEmpty()) {
                        item { SectionHeader("Completed") }
                        items(done, key = { it.id }) { d ->
                            DispatchCard(dispatch = d, busy = false, onAcknowledge = {}, onComplete = {})
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
    )
}

@Composable
private fun DispatchCard(
    dispatch: DispatchItem,
    busy: Boolean,
    onAcknowledge: () -> Unit,
    onComplete: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                dispatch.zoneName ?: "(no zone)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                dispatch.message,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Status: ${dispatch.status.name.replaceFirstChar(Char::uppercase)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            when (dispatch.status) {
                DispatchStatus.sent -> {
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = onAcknowledge,
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("On my way") }
                }
                DispatchStatus.acknowledged -> {
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = onComplete,
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    ) { Text("Done") }
                }
                DispatchStatus.completed -> {}
            }
        }
    }
}

@Composable
private fun EmptyHint(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Default.Send,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text("No dispatches yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(
            "When a supervisor sends you a job, it shows up here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
