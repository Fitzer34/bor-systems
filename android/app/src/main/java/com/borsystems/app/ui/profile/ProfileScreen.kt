package com.borsystems.app.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore

/**
 * Profile screen — shows current user info + on-duty toggle.
 * Mirrors iOS ProfileView. Editing name/email goes through the web admin
 * (low frequency, not worth duplicating the form here).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen() {
    val user by AuthStore.user.collectAsState()

    Scaffold(topBar = { TopAppBar(title = { Text("My profile") }) }) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            user?.let { u ->
                Field("Name",  u.name)
                Field("Email", u.email)
                Field("Role",  u.role.name)
                u.organisationName?.let { Field("Organisation", it) }

                HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("On duty", style = MaterialTheme.typography.bodyLarge)
                    Switch(checked = u.onDuty, onCheckedChange = { AuthStore.setOnDuty(it) })
                }
                Text(
                    "On-duty users receive spill alert push notifications.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Field(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}
