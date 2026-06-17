package com.borsystems.app.ui.maintenance

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.StaffCertification
import kotlin.math.abs

/**
 * Workforce competency — staff certifications with expiry (admin + supervisor).
 * Read-only on mobile: check who's qualified and what's lapsing in the field.
 * Adding certs stays on web. Mirrors iOS CompetencyView / the web page.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompetencyScreen(onBack: () -> Unit) {
    var list by remember { mutableStateOf<List<StaffCertification>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try { list = ApiClient.certifications(); error = null }
        catch (e: Exception) { error = "Could not load certifications." }
        finally { loaded = true }
    }

    fun rank(s: String) = when (s) { "expired" -> 0; "expiring" -> 1; else -> 2 }
    val sorted = list.sortedWith(compareBy({ rank(it.status) }, { it.expiresOn ?: "9999" }))

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Competency") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                !loaded -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                error != null -> Text(
                    error!!, color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                list.isEmpty() -> Text(
                    "No certifications logged yet. Add them on the web dashboard.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(sorted, key = { it.id }) { c -> CertCard(c) }
                }
            }
        }
    }
}

@Composable
private fun CertCard(c: StaffCertification) {
    val (label, color) = certStatusUi(c)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(c.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(8.dp))
                Text(label, color = color, style = MaterialTheme.typography.labelMedium)
            }
            val sub = buildList {
                add(c.userName ?: "—")
                c.userRole?.let { add(it.replaceFirstChar(Char::uppercase)) }
                c.issuer?.takeIf { it.isNotBlank() }?.let { add(it) }
                c.expiresOn?.let { add("expires $it") }
            }.joinToString(" · ")
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun certStatusUi(c: StaffCertification): Pair<String, Color> = when (c.status) {
    "expired" -> (c.daysToExpiry?.let { "Expired ${abs(it)}d ago" } ?: "Expired") to Color(0xFFE53935)
    "expiring" -> "Expires in ${c.daysToExpiry ?: 0}d" to Color(0xFFF59E0B)
    else -> (if (c.expiresOn == null) "No expiry" else "Valid") to Color(0xFF2E7D32)
}
