package com.borsystems.app.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.Construction
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Discipline picker shown to admin/supervisor who haven't chosen a side yet.
 * Field cleaners never see this — they're pinned to cleaning. Android mirror of
 * the web ChooseSection screen.
 */
@Composable
fun ChooseDisciplineScreen(onPick: (Discipline) -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Choose your area", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(
            "Pick the side you're working in today. You can switch any time from the home screen.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
        DisciplineCard(Icons.Default.CleaningServices, Discipline.Cleaning, "Spill alerts, dispatch, schedules, sensors") { onPick(Discipline.Cleaning) }
        Spacer(Modifier.height(12.dp))
        DisciplineCard(Icons.Default.Construction, Discipline.Maintenance, "Jobs, meters, PPMs, reliability KPIs") { onPick(Discipline.Maintenance) }
        Spacer(Modifier.height(12.dp))
        DisciplineCard(Icons.Default.Security, Discipline.Security, "Patrols, incidents, checkpoints") { onPick(Discipline.Security) }
    }
}

@Composable
private fun DisciplineCard(icon: ImageVector, discipline: Discipline, subtitle: String, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
            Spacer(Modifier.width(16.dp))
            Column {
                Text(discipline.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
