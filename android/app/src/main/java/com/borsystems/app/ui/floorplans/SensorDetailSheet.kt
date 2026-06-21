package com.borsystems.app.ui.floorplans

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.borsystems.app.network.AlertStatus
import com.borsystems.app.network.Hanger

/**
 * Sensor detail — opened by tapping a pin or a side-list row. Android's answer
 * to the web SensorDetailPopover, rendered as a ModalBottomSheet (the prompt's
 * popover→bottom-sheet mapping). Shows the same field set + a deep link into the
 * live spill alert.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SensorDetailSheet(
    hanger: Hanger,
    zoneName: String?,
    activeAlertId: String?,
    alertStatus: AlertStatus?,
    lowBatteryThreshold: Int,
    onOpenAlert: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        val state = sensorState(hanger, alertStatus)
        val low = isLowBattery(hanger.batteryPct, lowBatteryThreshold)
        // signal and rssi carry the same value (gateway RSSI proxy); prefer signal.
        val sig = hanger.signal ?: hanger.rssi

        Column(
            Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
        ) {
            // Header: name + HGR id, status pill on the trailing side.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        hanger.name ?: "Wet-floor sign",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        hanger.id,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatePill(state)
            }

            Spacer(Modifier.height(16.dp))

            DetailRow("DevEUI", hanger.devEui, mono = true)
            DetailRow("Zone", zoneName ?: "Unassigned")
            DetailRow(
                "Battery",
                hanger.batteryPct?.let { "$it%" } ?: "—",
                highlight = low,
            )
            DetailRow("Signal", sig?.let { "$it dBm (${signalLabel(it)})" } ?: "—")
            DetailRow("Last seen", hanger.lastSeenAt?.let { relativeTime(it) } ?: "Never")
            DetailRow("Last lifted", hanger.lastLiftedAt?.let { relativeTime(it) } ?: "—")
            DetailRow("Reports via", hanger.reportsViaGatewayName ?: "—")

            if (activeAlertId != null) {
                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = { onOpenAlert(activeAlertId) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (alertStatus == AlertStatus.acknowledged)
                            MaterialTheme.colorScheme.primary else sensorColor(SensorState.Alert),
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (alertStatus == AlertStatus.acknowledged) "View cleaning task" else "Open spill alert")
                }
            }
        }
    }
}

@Composable
private fun StatePill(state: SensorState) {
    val color = sensorColor(state)
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            sensorStateLabel(state),
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun DetailRow(label: String, value: String, mono: Boolean = false, highlight: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
            fontWeight = FontWeight.Medium,
            color = if (highlight) sensorColor(SensorState.Offline) else MaterialTheme.colorScheme.onSurface,
        )
    }
}
