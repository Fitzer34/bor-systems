package com.borsystems.app.ui.floorplans

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.MapsHomeWork
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.borsystems.app.BuildConfig
import com.borsystems.app.network.ActiveAlert
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.Building
import com.borsystems.app.network.Floor

/**
 * Floor plans — mirrors iOS MapView.swift.
 *
 * Pick a building → pick a floor → see the floor plan image with a
 * status badge per zone. The zone-polygon overlay is web-only for now
 * (would need a coordinate system parser); we render the plan as an
 * image and surface any active alerts in a panel beneath it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FloorPlansScreen(onBack: () -> Unit, asTab: Boolean = false) {
    var buildings by remember { mutableStateOf<List<Building>>(emptyList()) }
    var selectedBuilding by remember { mutableStateOf<Building?>(null) }
    var floors by remember { mutableStateOf<List<Floor>>(emptyList()) }
    var selectedFloor by remember { mutableStateOf<Floor?>(null) }
    var activeAlerts by remember { mutableStateOf<List<ActiveAlert>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        try {
            buildings = ApiClient.listBuildings()
            activeAlerts = ApiClient.activeAlerts()
            if (buildings.size == 1) selectedBuilding = buildings.first()
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (asTab) "Map" else "Floor plans") },
                navigationIcon = {
                    // No back arrow when this screen is itself a root tab —
                    // popping the tab back stack would land on an empty screen.
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
                        },
                        onFloorReset = { selectedFloor = null },
                    )
                    if (selectedFloor == null) {
                        FloorPicker(floors) { selectedFloor = it }
                    } else {
                        FloorPlanView(
                            floor = selectedFloor!!,
                            alerts = activeAlerts.filter { it.floorId == selectedFloor!!.id },
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
            Text(
                "Choose a building",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
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
            Text(
                "Choose a floor",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
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
private fun FloorPlanView(floor: Floor, alerts: List<ActiveAlert>) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
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
                AsyncImage(
                    model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
                        .data(absoluteUrl(planUrl))
                        .crossfade(true)
                        .build(),
                    contentDescription = "Floor plan for ${floor.name}",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 200.dp)
                        .clip(RoundedCornerShape(8.dp)),
                )
            }
        }

        Text(
            "Active alerts on this floor",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        if (alerts.isEmpty()) {
            Text(
                "All clear.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            alerts.forEach { a ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            a.zoneName ?: "Unassigned zone",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "Status: ${a.status.name.replaceFirstChar(Char::uppercase)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
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
        Modifier
            .fillMaxSize()
            .padding(32.dp),
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

/** Floor-plan URLs come from the backend as either absolute (https://…)
 *  or relative ("/uploads/abc.png"). Stitch the relative ones onto the
 *  API base so Coil can fetch them. */
private fun absoluteUrl(url: String): String =
    if (url.startsWith("http://") || url.startsWith("https://")) url
    else BuildConfig.API_BASE_URL.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")
