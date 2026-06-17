package com.borsystems.app.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.borsystems.app.auth.AuthStore

/**
 * Profile screen — shows current user info + on-duty toggle.
 * Mirrors iOS ProfileView. Tapping "Edit" routes to EditProfileScreen
 * (name + phone + password).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(nav: NavController) {
    val user by AuthStore.user.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My profile") },
                navigationIcon = {
                    IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { nav.navigate("profile/edit") }) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit profile")
                    }
                },
            )
        }
    ) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            user?.let { u ->
                Field("Name",  u.name)
                Field("Email", u.email)
                Field("Role",  u.role.name.replaceFirstChar(Char::uppercase))
                u.organisationName?.let { Field("Organisation", it) }

                HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("On duty", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
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
        Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}
