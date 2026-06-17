package com.borsystems.app.ui.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.navigation.NavController
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.UserRole

/**
 * More tab — navigation hub for everything that doesn't deserve its own
 * tab. Sites overview, Analytics, Floor plans, Settings, Profile, and
 * out-of-app links for the rarely-used admin screens (Reports, Audit
 * log, Notifications log) which open the web admin in a browser tab.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreScreen(nav: NavController) {
    val user by AuthStore.user.collectAsState()
    val isStaff = user?.role == UserRole.admin || user?.role == UserRole.supervisor
    val isAdmin = user?.role == UserRole.admin
    val ctx = LocalContext.current

    Scaffold(topBar = { TopAppBar(title = { Text("More") }) }) { pad ->
        LazyColumn(Modifier.padding(pad)) {
            items(buildItems(nav, ctx, isStaff = isStaff, isAdmin = isAdmin) { AuthStore.logout() }) { row ->
                MoreItem(row)
                HorizontalDivider()
            }
        }
    }
}

private data class MoreItemSpec(
    val icon: ImageVector,
    val label: String,
    val destructive: Boolean = false,
    val onClick: () -> Unit,
)

@Composable
private fun MoreItem(spec: MoreItemSpec) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = spec.onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            spec.icon,
            contentDescription = null,
            tint = if (spec.destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.width(16.dp))
        Text(
            spec.label,
            color = if (spec.destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun buildItems(
    nav: NavController,
    ctx: android.content.Context,
    isStaff: Boolean,
    isAdmin: Boolean,
    onLogout: () -> Unit,
): List<MoreItemSpec> {
    val list = mutableListOf<MoreItemSpec>()
    // Hangers shows for everyone — cleaners need to see the inventory
    // they're responsible for; admins manage devices.
    list += MoreItemSpec(Icons.Default.Inventory2,    "Hangers")            { nav.navigate("hangers") }
    if (isStaff) {
        list += MoreItemSpec(Icons.Default.LocationCity,  "Sites overview")     { nav.navigate("sites") }
        list += MoreItemSpec(Icons.Default.Description,   "Reports")            { nav.navigate("reports") }
        list += MoreItemSpec(Icons.Default.Group,         "Users")              { nav.navigate("users") }
        list += MoreItemSpec(Icons.Default.Settings,      "Settings")           { nav.navigate("settings") }
        list += MoreItemSpec(Icons.Default.Construction,  "Maintenance jobs")   { nav.navigate("maintenance") }
        list += MoreItemSpec(Icons.Default.Speed,         "Meters")             { nav.navigate("meters") }
        list += MoreItemSpec(Icons.Default.Build,         "PPMs")               { nav.navigate("ppms") }
        // Analytics + Notifications log remain web-only — heavy charting /
        // long-tail screens that aren't worth a native port yet.
        list += MoreItemSpec(Icons.Default.Analytics,     "Analytics")          { openWeb(ctx, "/analytics") }
        list += MoreItemSpec(Icons.Default.Notifications, "Notifications log")  { openWeb(ctx, "/notifications-log") }
    }
    if (isAdmin) {
        list += MoreItemSpec(Icons.Default.History,       "Audit log")          { nav.navigate("audit-log") }
    }
    list += MoreItemSpec(Icons.Default.Person,            "My profile")         { nav.navigate("profile") }
    list += MoreItemSpec(Icons.Default.Logout,            "Log out", destructive = true, onClick = onLogout)
    return list
}

/**
 * Open the web admin to a given path. For the admin screens that don't
 * really benefit from a mobile-native UI (Reports, Audit log, etc.),
 * this is a much higher-leverage choice than re-implementing them in
 * Compose. The web app is already mobile-responsive.
 */
private fun openWeb(ctx: android.content.Context, path: String) {
    val full = com.borsystems.app.BuildConfig.WEB_BASE_URL + path
    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, full.toUri())
    ctx.startActivity(intent)
}
