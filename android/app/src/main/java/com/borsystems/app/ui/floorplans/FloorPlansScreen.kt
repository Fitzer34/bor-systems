package com.borsystems.app.ui.floorplans

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.MapsHomeWork
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.borsystems.app.network.ActiveAlert
import com.borsystems.app.network.AlertStatus
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Building
import com.borsystems.app.network.Floor
import com.borsystems.app.network.Gateway
import com.borsystems.app.network.Hanger
import com.borsystems.app.network.Zone
import kotlinx.coroutines.delay
import java.time.Instant
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Floor plans — live monitoring view.
 *
 * Pick a building + floor, see the plan image with one pin per hanger dropped at
 * its zone's pin coords (0–1000 → fraction of the image). Four states (green on
 * rack, red pulsing spill, amber offline, low-battery badge) + a legend. Tapping
 * a pin opens [SensorDetailSheet]. Gateways have no floor coordinates, so they
 * live in a side list + legend count only. Auto-refreshes every 5 s.
 *
 * Android port of web pages/FloorPlans.tsx (monitoring half — building/floor/
 * zone editing stays on the web admin).
 */
private const val GATEWAY_ONLINE_WINDOW_MS = 90L * 1000

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FloorPlansScreen(
    onBack: () -> Unit,
    asTab: Boolean = false,
    onOpenAlert: (String) -> Unit = {},
) {
    var buildings by remember { mutableStateOf<List<Building>>(emptyList()) }
    var selectedBuilding by remember { mutableStateOf<Building?>(null) }
    var floors by remember { mutableStateOf<List<Floor>>(emptyList()) }
    var selectedFloor by remember { mutableStateOf<Floor?>(null) }
    var zones by remember { mutableStateOf<List<Zone>>(emptyList()) }
    var hangers by remember { mutableStateOf<List<Hanger>>(emptyList()) }
    var gateways by remember { mutableStateOf<List<Gateway>>(emptyList()) }
    var activeAlerts by remember { mutableStateOf<List<ActiveAlert>>(emptyList()) }
    var lowBatteryThreshold by remember { mutableIntStateOf(DEFAULT_LOW_BATTERY_PCT) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var selectedHangerId by remember { mutableStateOf<String?>(null) }

    // One-time, slow-changing data.
    LaunchedEffect(Unit) {
        try {
            buildings = ApiClient.listBuildings()
            gateways = ApiClient.listGateways()
            lowBatteryThreshold = runCatching { ApiClient.appSettings().lowBatteryThreshold }.getOrDefault(DEFAULT_LOW_BATTERY_PCT)
            if (buildings.size == 1) selectedBuilding = buildings.first()
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    // Live data — poll while on screen (matches the web's 5 s refetch).
    LaunchedEffect(Unit) {
        while (true) {
            try {
                hangers = ApiClient.listHangers()
                activeAlerts = ApiClient.activeAlerts()
            } catch (_: Exception) { /* keep last */ }
            delay(5000)
        }
    }

    LaunchedEffect(selectedBuilding) {
        selectedBuilding?.let { b ->
            try {
                floors = ApiClient.listFloors(b.id)
                if (floors.size == 1) selectedFloor = floors.first()
            } catch (e: Exception) {
                error = e.message
            }
        }
    }

    LaunchedEffect(selectedFloor) {
        selectedHangerId = null
        selectedFloor?.let { f ->
            try {
                zones = ApiClient.listZones(f.id)
            } catch (e: Exception) {
                error = e.message
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (asTab) "Map" else "Floor plans") },
                navigationIcon = {
                    if (!asTab) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
            )
        }
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surfaceVariant)
        ) {
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                buildings.isEmpty() -> Empty(
                    "No buildings yet",
                    "Add a building in the web admin to see its floor plan here.",
                )
                selectedBuilding == null -> BuildingPicker(buildings) { selectedBuilding = it }
                else -> {
                    Breadcrumb(
                        building = selectedBuilding!!,
                        floor = selectedFloor,
                        onBuildingReset = {
                            selectedBuilding = null
                            selectedFloor = null
                            floors = emptyList()
                            zones = emptyList()
                        },
                        onFloorReset = { selectedFloor = null; zones = emptyList() },
                    )
                    if (selectedFloor == null) {
                        FloorPicker(floors) { selectedFloor = it }
                    } else {
                        FloorPlanLiveView(
                            floor = selectedFloor!!,
                            zones = zones,
                            allHangers = hangers,
                            buildingGateways = gateways.filter { it.buildingId == selectedBuilding!!.id },
                            activeAlerts = activeAlerts,
                            lowBatteryThreshold = lowBatteryThreshold,
                            selectedHangerId = selectedHangerId,
                            onSelectHanger = { selectedHangerId = it },
                        )
                    }
                }
            }
            error?.let {
                Snackbar(
                    Modifier.padding(12.dp),
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                ) { Text(it) }
            }
        }
    }

    // ── Detail bottom sheet for the selected sensor ──
    val selectedHanger = hangers.firstOrNull { it.id == selectedHangerId }
    if (selectedHanger != null) {
        val alert = activeAlertForHanger(activeAlerts, selectedHanger.id)
        val zoneName = zones.firstOrNull { it.id == selectedHanger.zoneId }?.name
        SensorDetailSheet(
            hanger = selectedHanger,
            zoneName = zoneName,
            activeAlertId = alert?.id,
            alertStatus = alert?.status,
            lowBatteryThreshold = lowBatteryThreshold,
            onOpenAlert = { id -> selectedHangerId = null; onOpenAlert(id) },
            onDismiss = { selectedHangerId = null },
        )
    }
}

/** A hanger dropped on the plan: zone pin coords + a small fan-out offset so
 *  several hangers sharing a zone don't stack on the same point. */
private data class PlacedSensor(val hanger: Hanger, val zone: Zone, val x: Float, val y: Float)

/** Active (open/acknowledged) alert for a hanger, if any. */
private fun activeAlertForHanger(alerts: List<ActiveAlert>, hangerId: String): ActiveAlert? =
    alerts.firstOrNull {
        it.hangerId == hangerId && (it.status == AlertStatus.open || it.status == AlertStatus.acknowledged)
    }

@Composable
private fun FloorPlanLiveView(
    floor: Floor,
    zones: List<Zone>,
    allHangers: List<Hanger>,
    buildingGateways: List<Gateway>,
    activeAlerts: List<ActiveAlert>,
    lowBatteryThreshold: Int,
    selectedHangerId: String?,
    onSelectHanger: (String?) -> Unit,
) {
    val now = Instant.now()

    // Join hangers → pinned zones on this floor, then fan out per zone.
    val zoneById = remember(zones) { zones.associateBy { it.id } }
    val placed = remember(zones, allHangers) {
        val byZone = HashMap<String, MutableList<Hanger>>()
        for (h in allHangers) {
            val z = h.zoneId?.let { zoneById[it] } ?: continue
            if (z.pinX == null || z.pinY == null) continue
            byZone.getOrPut(h.zoneId) { mutableListOf() }.add(h)
        }
        val out = mutableListOf<PlacedSensor>()
        for ((zoneId, hs) in byZone) {
            val z = zoneById[zoneId]!!
            val ordered = hs.sortedBy { it.id }
            val n = ordered.size
            ordered.forEachIndexed { i, h ->
                var x = z.pinX!!.toFloat()
                var y = z.pinY!!.toFloat()
                if (n > 1) {
                    // Spread around the point on a small circle (~2.2% of plan).
                    val angle = (2 * Math.PI * i / n - Math.PI / 2)
                    val r = 22f
                    x = (z.pinX!! + cos(angle) * r).toFloat().coerceIn(0f, 1000f)
                    y = (z.pinY!! + sin(angle) * r).toFloat().coerceIn(0f, 1000f)
                }
                out.add(PlacedSensor(h, z, x, y))
            }
        }
        out.sortedBy { it.zone.name + it.hanger.id }
    }

    val alertStatusByHanger = remember(activeAlerts) {
        activeAlerts.filter { it.status == AlertStatus.open || it.status == AlertStatus.acknowledged }
            .associate { it.hangerId to it.status }
    }
    fun stateOf(h: Hanger): SensorState = sensorState(h, alertStatusByHanger[h.id], now)

    // Legend counts.
    val counts = remember(placed, alertStatusByHanger) {
        val c = mutableMapOf(
            SensorState.Ok to 0, SensorState.Alert to 0,
            SensorState.Cleaning to 0, SensorState.Offline to 0,
        )
        for (p in placed) { val s = stateOf(p.hanger); c[s] = (c[s] ?: 0) + 1 }
        c
    }

    val gatewayOnline: (Gateway) -> Boolean = { g ->
        val seen = g.lastSeenAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
        seen != null && (now.toEpochMilli() - seen.toEpochMilli()) <= GATEWAY_ONLINE_WINDOW_MS
    }
    val hangerCountByGateway = remember(allHangers) {
        allHangers.groupingBy { it.reportsViaGatewayId }.eachCount()
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            val planUrl = floor.floorPlanUrl
            if (planUrl == null) {
                Empty(
                    "No plan uploaded",
                    "Upload a floor plan in the web admin for this floor to appear here.",
                )
            } else {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(floor.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(8.dp))
                        PlanWithPins(
                            planUrl = planUrl,
                            placed = placed,
                            stateOf = ::stateOf,
                            lowBatteryThreshold = lowBatteryThreshold,
                            selectedHangerId = selectedHangerId,
                            onSelectHanger = onSelectHanger,
                        )
                        Spacer(Modifier.height(12.dp))
                        Legend(counts, buildingGateways.size)
                    }
                }
            }
        }

        // ── Linked side list: sensors on this floor ──
        item {
            Text("Sensors on this floor", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
        if (placed.isEmpty()) {
            item {
                Text(
                    "No placed sensors. Assign hangers to pinned zones (in the web admin) to see them here.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(placed, key = { it.hanger.id }) { p ->
                SensorRow(
                    placed = p,
                    state = stateOf(p.hanger),
                    low = isLowBattery(p.hanger.batteryPct, lowBatteryThreshold),
                    hasAlert = alertStatusByHanger.containsKey(p.hanger.id),
                    selected = selectedHangerId == p.hanger.id,
                    onClick = { onSelectHanger(if (selectedHangerId == p.hanger.id) null else p.hanger.id) },
                )
            }
        }

        // ── Gateways group (side list + legend only — no floor coordinates) ──
        item {
            Spacer(Modifier.height(4.dp))
            Text("Gateways", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
        if (buildingGateways.isEmpty()) {
            item {
                Text(
                    "No gateways in this building.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(buildingGateways, key = { it.id }) { g ->
                GatewayRow(
                    gateway = g,
                    online = gatewayOnline(g),
                    hears = hangerCountByGateway[g.id] ?: 0,
                )
            }
        }
    }
}

/** The plan image with absolutely-positioned pins via Modifier.offset. */
@Composable
private fun PlanWithPins(
    planUrl: String,
    placed: List<PlacedSensor>,
    stateOf: (Hanger) -> SensorState,
    lowBatteryThreshold: Int,
    selectedHangerId: String?,
    onSelectHanger: (String?) -> Unit,
) {
    var boxW by remember { mutableIntStateOf(0) }
    var boxH by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current

    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .onSizeChanged { boxW = it.width; boxH = it.height },
    ) {
        AsyncImage(
            model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
                .data(absoluteApiUrl(planUrl))
                .crossfade(true)
                .build(),
            contentDescription = "Floor plan",
            // Fit so the whole plan shows; pins are positioned over the box. We
            // use the box (not intrinsic image) bounds, which is correct because
            // the image fills the width and the box height tracks it.
            contentScale = ContentScale.FillWidth,
            modifier = Modifier.fillMaxWidth(),
        )
        // Only place pins once we know the rendered size.
        if (boxW > 0 && boxH > 0) {
            val pinSizeDp = 28.dp
            val pinSizePx = with(density) { pinSizeDp.toPx() }
            placed.forEach { p ->
                val cx = (p.x / 1000f) * boxW
                val cy = (p.y / 1000f) * boxH
                SensorPin(
                    state = stateOf(p.hanger),
                    lowBattery = isLowBattery(p.hanger.batteryPct, lowBatteryThreshold),
                    selected = selectedHangerId == p.hanger.id,
                    sizeDp = pinSizeDp,
                    onClick = { onSelectHanger(if (selectedHangerId == p.hanger.id) null else p.hanger.id) },
                    modifier = Modifier.offset {
                        IntOffset(
                            (cx - pinSizePx / 2f).roundToInt(),
                            (cy - pinSizePx / 2f).roundToInt(),
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun Breadcrumb(
    building: Building,
    floor: Floor?,
    onBuildingReset: () -> Unit,
    onFloorReset: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            building.name,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.clickable(onClick = onBuildingReset),
        )
        floor?.let {
            Text(" › ", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                it.name,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable(onClick = onFloorReset),
            )
        }
    }
}

@Composable
private fun BuildingPicker(buildings: List<Building>, onPick: (Building) -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Text("Choose a building", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
        }
        items(buildings, key = { it.id }) { b ->
            ListCard(icon = Icons.Default.LocationCity, title = b.name, onClick = { onPick(b) })
        }
    }
}

@Composable
private fun FloorPicker(floors: List<Floor>, onPick: (Floor) -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Text("Choose a floor", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
        }
        if (floors.isEmpty()) {
            item {
                Text(
                    "No floors set up for this building yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(floors, key = { it.id }) { f ->
            ListCard(icon = Icons.Default.MapsHomeWork, title = f.name, onClick = { onPick(f) })
        }
    }
}

@Composable
private fun SensorRow(
    placed: PlacedSensor,
    state: SensorState,
    low: Boolean,
    hasAlert: Boolean,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val border = if (selected) MaterialTheme.colorScheme.primary else Color.Transparent
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, border, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).background(sensorColor(state), CircleShape))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(placed.hanger.name ?: "Wet-floor sign", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(
                    "${placed.zone.name} · ${sensorStateLabel(state)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (low) {
                Text("Low batt", style = MaterialTheme.typography.labelSmall, color = sensorColor(SensorState.Offline))
                Spacer(Modifier.width(8.dp))
            }
            if (hasAlert) {
                Icon(Icons.Default.Warning, contentDescription = "Active alert", tint = sensorColor(state), modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
private fun GatewayRow(gateway: Gateway, online: Boolean, hears: Int) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            // Square marker so gateways read distinctly from round sensor pins.
            Box(
                Modifier
                    .size(18.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(if (online) Color(0xFF334155) else sensorColor(SensorState.Offline)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Wifi, contentDescription = null, tint = Color.White, modifier = Modifier.size(11.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(gateway.name ?: "Gateway", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                Text(
                    buildString {
                        append(if (online) "Online" else "Offline")
                        if (hears > 0) append(" · hears $hears hanger${if (hears == 1) "" else "s"}")
                        gateway.rssi?.let { append(" · $it dBm (${signalLabel(it)})") }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Legend(counts: Map<SensorState, Int>, gatewayCount: Int) {
    FlowRowLegend {
        LegendDot(sensorColor(SensorState.Ok), "On rack ${counts[SensorState.Ok] ?: 0}")
        LegendDot(sensorColor(SensorState.Alert), "Lifted ${counts[SensorState.Alert] ?: 0}")
        LegendDot(sensorColor(SensorState.Cleaning), "Cleaning ${counts[SensorState.Cleaning] ?: 0}")
        LegendDot(sensorColor(SensorState.Offline), "Offline ${counts[SensorState.Offline] ?: 0}")
        LegendSquare(Color(0xFF334155), "Gateways $gatewayCount")
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowLegend(content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.FlowRow(
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) { content() }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).background(color, CircleShape))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LegendSquare(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ListCard(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun Empty(title: String, body: String) {
    Column(
        Modifier.fillMaxWidth().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

/** Floor-plan URLs come absolute (https://…) or relative ("/uploads/abc.png").
 *  Stitch relative ones onto the API base so Coil can fetch them. */
// `absoluteApiUrl(...)` lives in SensorState.kt (shared with the account avatar).
