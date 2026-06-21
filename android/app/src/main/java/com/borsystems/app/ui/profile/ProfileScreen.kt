package com.borsystems.app.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.CurrentUser
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Profile / My account.
 *
 * Top: identity + on-duty toggle. Then an "Access & security" card (role, sites
 * = organisation, member since = createdAt, last active = lastActiveAt, MFA),
 * with rows into the Security screen (2FA + change password) and Notification
 * preferences. Sign out at the bottom. Mirrors web pages/Profile.tsx.
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
            Modifier
                .padding(pad)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            user?.let { u ->
                // ── Identity + duty ──
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Name", u.name)
                    Field("Email", u.email)
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
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

                // ── Access & security ──
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Access & security", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(2.dp))
                        Text(
                            "Your role, organisation and account activity.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(12.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            MetaCell("Role", roleLabel(u), Modifier.weight(1f))
                            MetaCell("Sites", u.organisationName ?: "—", Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            MetaCell("Member since", fmtDate(u.createdAt), Modifier.weight(1f))
                            MetaCell("Last active", fmtDateTime(u.lastActiveAt), Modifier.weight(1f))
                        }
                    }
                }

                // ── Settings rows ──
                Card(Modifier.fillMaxWidth()) {
                    Column {
                        SettingRow(Icons.Default.Lock, "Sign-in security", "Two-factor auth & password") {
                            nav.navigate("security")
                        }
                        HorizontalDivider()
                        SettingRow(Icons.Default.Notifications, "Notification preferences", "In-app, email & SMS per event") {
                            nav.navigate("notification-prefs")
                        }
                    }
                }

                // ── Sign out ──
                OutlinedButton(
                    onClick = { AuthStore.logout() },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Sign out")
                }
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

@Composable
private fun MetaCell(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SettingRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** "cleaner" reads as "Field staff" in the UI (matches the web). */
private fun roleLabel(u: CurrentUser): String = when (u.role.name) {
    "admin" -> "Admin"
    "supervisor" -> "Supervisor"
    "cleaner" -> "Field staff"
    else -> u.role.name.replaceFirstChar(Char::uppercase)
}

private val DATE_FMT = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault())
private val DATETIME_FMT = DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.getDefault())

private fun fmtDate(iso: String?): String {
    val t = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return "—"
    return DATE_FMT.format(t.atZone(ZoneId.systemDefault()))
}

private fun fmtDateTime(iso: String?): String {
    val t = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return "—"
    return DATETIME_FMT.format(t.atZone(ZoneId.systemDefault()))
}
