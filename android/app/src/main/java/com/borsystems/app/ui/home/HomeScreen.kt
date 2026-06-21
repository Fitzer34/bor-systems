package com.borsystems.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ActiveAlert
import com.borsystems.app.network.AlertKind
import com.borsystems.app.network.AlertStatus
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.CloseReason
import com.borsystems.app.network.UserRole
import com.borsystems.app.ui.floorplans.absoluteApiUrl
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Home — role/discipline-tailored dashboard.
 *
 * Top bar: account avatar (→ profile), name + role, a discipline switcher
 * (admin/supervisor only; cleaners are pinned to cleaning) and the on/off-duty
 * chip. Body is per-discipline content: a KPI header card + a prioritised
 * "Needs attention" list drawn from the existing endpoints. Cleaning keeps the
 * live spill-alert cards (acknowledge / done inline) as before.
 *
 * Android port of the web role-tailored dashboard + section split.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onAlertTap: (ActiveAlert) -> Unit = {},
    onOpenProfile: () -> Unit = {},
    onOpenRoute: (String) -> Unit = {},
) {
    val user by AuthStore.user.collectAsState()
    val ctx = LocalContext.current

    // Cleaners are always pinned to cleaning; staff persist their choice.
    val isStaff = user?.role == UserRole.admin || user?.role == UserRole.supervisor
    // Remember the Flow so it isn't recreated every recomposition (which would
    // re-subscribe and momentarily reset to null, flashing ChooseDisciplineScreen).
    val disciplineFlow = remember(ctx) { DisciplineStore.flow(ctx) }
    val persisted by disciplineFlow.collectAsState(initial = null)
    var loadedOnce by remember { mutableStateOf(false) }
    LaunchedEffect(persisted) { loadedOnce = true }

    val discipline: Discipline? = when {
        !isStaff -> Discipline.Cleaning
        else -> persisted
    }

    var showSwitcher by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                navigationIcon = {
                    AccountAvatar(name = user?.name, avatarUrl = user?.avatarUrl, onClick = onOpenProfile)
                },
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            user?.name ?: "HazardLink",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (isStaff && discipline != null) {
                            Row(
                                Modifier.clip(RoundedCornerShape(12.dp)).clickable { showSwitcher = true }
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    discipline.label,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Icon(
                                    Icons.Default.ExpandMore, contentDescription = "Switch area",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        } else {
                            user?.role?.let {
                                Text(
                                    it.name.replaceFirstChar(Char::uppercase),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                },
                actions = {
                    user?.let { u ->
                        DutyChip(onDuty = u.onDuty, onToggle = { AuthStore.setOnDuty(!u.onDuty) })
                        Spacer(Modifier.width(8.dp))
                    }
                },
            )
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                // Staff who haven't chosen yet (and we've read DataStore once).
                isStaff && discipline == null && loadedOnce ->
                    ChooseDisciplineScreen(onPick = { picked ->
                        // Persist; recomposition picks it up via the flow.
                        AuthStore.scopeLaunch { DisciplineStore.set(ctx, picked) }
                    })

                discipline == Discipline.Cleaning -> CleaningHome(onAlertTap, onOpenRoute)
                discipline == Discipline.Maintenance -> MaintenanceHome(onOpenRoute)
                discipline == Discipline.Security -> SecurityHome(onOpenRoute)
                else -> CircularProgressIndicator(Modifier.align(Alignment.Center))
            }
        }
    }

    if (showSwitcher) {
        DisciplineSwitcherSheet(
            current = discipline,
            onPick = { picked ->
                AuthStore.scopeLaunch { DisciplineStore.set(ctx, picked) }
                showSwitcher = false
            },
            onDismiss = { showSwitcher = false },
        )
    }
}

// ─── Cleaning discipline ──────────────────────────────────────────────────
// Keeps the live spill-alert cards (the original Home behaviour) under a KPI
// header + a needs-attention summary.

@Composable
private fun CleaningHome(onAlertTap: (ActiveAlert) -> Unit, onOpenRoute: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var alerts by remember { mutableStateOf<List<ActiveAlert>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun refresh() {
        try {
            alerts = ApiClient.activeAlerts().filter { it.kind == AlertKind.spill }
            error = null
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        refresh()
        while (true) { delay(5000); refresh() }
    }

    val live = alerts.count { it.status == AlertStatus.open }
    val cleaning = alerts.count { it.status == AlertStatus.acknowledged }

    Box(Modifier.fillMaxSize()) {
        when {
            loading && alerts.isEmpty() -> CircularProgressIndicator(Modifier.align(Alignment.Center))
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    KpiHeader(
                        listOf(
                            Kpi("Live spills", live.toString(), if (live > 0) Color(0xFFE53935) else null),
                            Kpi("Cleaning", cleaning.toString(), if (cleaning > 0) Color(0xFF2563EB) else null),
                        ),
                    )
                }
                if (alerts.isEmpty()) {
                    item { AllClear() }
                } else {
                    item {
                        Text("Active spills", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                    items(alerts, key = { it.id }) { alert ->
                        AlertCard(
                            alert = alert,
                            onTap = { onAlertTap(alert) },
                            onAck = {
                                scope.launch {
                                    try { ApiClient.acknowledgeAlert(alert.id); refresh() } catch (e: Exception) { error = e.message }
                                }
                            },
                            onDone = {
                                scope.launch {
                                    try { ApiClient.closeAlert(alert.id, CloseReason.manual, null); refresh() } catch (e: Exception) { error = e.message }
                                }
                            },
                        )
                    }
                }
                item {
                    NeedsAttentionSection(discipline = Discipline.Cleaning, onOpenRoute = onOpenRoute)
                }
            }
        }
        error?.let { msg ->
            Snackbar(
                modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                containerColor = MaterialTheme.colorScheme.errorContainer,
            ) { Text(msg) }
        }
    }
}

// ─── Maintenance discipline ───────────────────────────────────────────────

@Composable
private fun MaintenanceHome(onOpenRoute: (String) -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { MaintenanceKpiHeader() }
        item { NeedsAttentionSection(discipline = Discipline.Maintenance, onOpenRoute = onOpenRoute) }
    }
}

@Composable
private fun MaintenanceKpiHeader() {
    var open by remember { mutableStateOf<Int?>(null) }
    var completed by remember { mutableStateOf<Int?>(null) }
    var pmPct by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(Unit) {
        runCatching { ApiClient.maintenanceKpis() }.getOrNull()?.let { k ->
            open = k.openBacklog; completed = k.completedThisMonth; pmPct = k.pmCompliancePct
        }
    }
    KpiHeader(
        listOf(
            Kpi("Open backlog", open?.toString() ?: "—", if ((open ?: 0) > 0) Color(0xFFF59E0B) else null),
            Kpi("PM compliance", pmPct?.let { "$it%" } ?: "—"),
            Kpi("Done this month", completed?.toString() ?: "—"),
        ),
    )
}

// ─── Security discipline ──────────────────────────────────────────────────

@Composable
private fun SecurityHome(onOpenRoute: (String) -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            KpiHeader(listOf(Kpi("Security", "Patrols & incidents")))
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Security tools", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Patrols, incidents and checkpoints are managed in the web admin for now. Spill-safety and maintenance work fully here.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        item { NeedsAttentionSection(discipline = Discipline.Security, onOpenRoute = onOpenRoute) }
    }
}

// ─── Needs attention ──────────────────────────────────────────────────────

private data class AttentionItem(
    val title: String,
    val subtitle: String,
    val severity: Severity,
    val route: String,
)

private enum class Severity { High, Medium, Low }

private fun sevColor(s: Severity): Color = when (s) {
    Severity.High -> Color(0xFFE53935)
    Severity.Medium -> Color(0xFFF59E0B)
    Severity.Low -> Color(0xFF2563EB)
}

@Composable
private fun NeedsAttentionSection(discipline: Discipline, onOpenRoute: (String) -> Unit) {
    var items by remember(discipline) { mutableStateOf<List<AttentionItem>>(emptyList()) }
    var loaded by remember(discipline) { mutableStateOf(false) }

    LaunchedEffect(discipline) {
        items = buildAttention(discipline)
        loaded = true
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Spacer(Modifier.height(4.dp))
        Text("Needs attention", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        when {
            !loaded -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(28.dp))
            }
            items.isEmpty() -> Text(
                "Nothing needs your attention right now.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> items.forEach { it -> AttentionCard(it) { onOpenRoute(it.route) } }
        }
    }
}

/**
 * Build a prioritised attention list per discipline from the existing endpoints.
 * Best-effort — any single failing call just contributes nothing. Ordered
 * high → low severity.
 */
private suspend fun buildAttention(discipline: Discipline): List<AttentionItem> {
    val out = mutableListOf<AttentionItem>()
    when (discipline) {
        Discipline.Cleaning -> {
            runCatching { ApiClient.listDispatches() }.getOrNull()?.let { ds ->
                val mine = ds.count { it.status.name == "sent" }
                if (mine > 0) out += AttentionItem("$mine open dispatch${if (mine == 1) "" else "es"}", "Awaiting acknowledgement", Severity.Medium, "dispatch")
            }
            runCatching { ApiClient.certifications() }.getOrNull()?.let { certs ->
                val expired = certs.count { it.status == "expired" }
                val expiring = certs.count { it.status == "expiring" }
                if (expired > 0) out += AttentionItem("$expired expired certificate${if (expired == 1) "" else "s"}", "Staff not permitted on site", Severity.High, "competency")
                else if (expiring > 0) out += AttentionItem("$expiring certificate${if (expiring == 1) "" else "s"} expiring", "Renew soon", Severity.Medium, "competency")
            }
        }
        Discipline.Maintenance -> {
            runCatching { ApiClient.maintenanceKpis() }.getOrNull()?.let { k ->
                if (k.openBacklog > 0) out += AttentionItem("${k.openBacklog} open work order${if (k.openBacklog == 1) "" else "s"}", if (k.backlogOldestDays > 0) "Oldest ${k.backlogOldestDays}d" else "In backlog", if (k.backlogOldestDays >= 14) Severity.High else Severity.Medium, "maintenance")
                if (k.assetsPastLife > 0) out += AttentionItem("${k.assetsPastLife} asset${if (k.assetsPastLife == 1) "" else "s"} past expected life", "Review for replacement", Severity.Low, "maintenance-kpis")
            }
            runCatching { ApiClient.meters() }.getOrNull()?.let { meters ->
                val due = meters.count { it.status == "due" }
                if (due > 0) out += AttentionItem("$due meter${if (due == 1) "" else "s"} due for service", "Predictive maintenance", Severity.Medium, "meters")
            }
            runCatching { ApiClient.listPpms() }.getOrNull()?.let { ppms ->
                val today = java.time.LocalDate.now().toString()
                val overdue = ppms.count { it.active && it.nextDueDate < today }
                if (overdue > 0) out += AttentionItem("$overdue PPM${if (overdue == 1) "" else "s"} overdue", "Planned maintenance slipped", Severity.High, "ppms")
            }
        }
        Discipline.Security -> {
            // No native security endpoints yet — surface nothing rather than guess.
        }
    }
    return out.sortedBy { it.severity.ordinal }
}

@Composable
private fun AttentionCard(item: AttentionItem, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).background(sevColor(item.severity).copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Warning, contentDescription = null, tint = sevColor(item.severity), modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ─── KPI header ───────────────────────────────────────────────────────────

private data class Kpi(val label: String, val value: String, val accent: Color? = null)

@Composable
private fun KpiHeader(kpis: List<Kpi>) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            kpis.forEach { k ->
                Column(Modifier.weight(1f)) {
                    Text(
                        k.value,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = k.accent ?: MaterialTheme.colorScheme.onSurface,
                    )
                    Text(k.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

// ─── Top-bar bits ─────────────────────────────────────────────────────────

@Composable
private fun AccountAvatar(name: String?, avatarUrl: String?, onClick: () -> Unit) {
    val initials = (name ?: "?").trim().split(" ").mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString("")
    Box(
        Modifier
            .padding(start = 8.dp)
            .size(36.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (!avatarUrl.isNullOrBlank()) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(absoluteApiUrl(avatarUrl)).crossfade(true).build(),
                contentDescription = "Account",
                modifier = Modifier.fillMaxSize().clip(CircleShape),
            )
        } else {
            Text(initials.ifEmpty { "?" }, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DisciplineSwitcherSheet(current: Discipline?, onPick: (Discipline) -> Unit, onDismiss: () -> Unit) {
    val sheet = rememberModalBottomSheetState()
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
            Text(
                "Switch area",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(20.dp),
            )
            Discipline.entries.forEach { d ->
                Row(
                    Modifier.fillMaxWidth().clickable { onPick(d) }.padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = d == current, onClick = { onPick(d) })
                    Spacer(Modifier.width(8.dp))
                    Text(d.label, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}

@Composable
private fun DutyChip(onDuty: Boolean, onToggle: () -> Unit) {
    val color = if (onDuty) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(color.copy(alpha = 0.15f))
            .clickable(onClick = onToggle)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Spacer(Modifier.width(6.dp))
        Text(
            if (onDuty) "On duty" else "Off duty",
            style = MaterialTheme.typography.labelMedium,
            color = color,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun AllClear() {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(96.dp).background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(56.dp))
        }
        Spacer(Modifier.height(20.dp))
        Text("All clear", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text("No active alerts", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AlertCard(
    alert: ActiveAlert,
    onTap: () -> Unit = {},
    onAck: () -> Unit = {},
    onDone: () -> Unit = {},
) {
    val isAcked = alert.status == AlertStatus.acknowledged
    val dotColor = if (isAcked) Color(0xFFFFA000) else Color(0xFFE53935)
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onTap),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(36.dp).background(dotColor.copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = dotColor, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(alert.zoneName ?: "Unknown zone", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    alert.floorName?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Text(
                    if (isAcked) "Acknowledged" else "Live",
                    style = MaterialTheme.typography.labelSmall,
                    color = dotColor,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(12.dp))
            if (isAcked) {
                Button(
                    onClick = onDone,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("It's done") }
            } else {
                Button(onClick = onAck, modifier = Modifier.fillMaxWidth()) { Text("I'm on it") }
            }
        }
    }
}
