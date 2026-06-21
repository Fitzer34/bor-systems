package com.borsystems.app.ui.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.navigation.NavController
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.auth.Action
import com.borsystems.app.auth.Capabilities
import com.borsystems.app.auth.Module
import com.borsystems.app.notifications.NotificationCenter

/**
 * More tab — the navigation hub, organised into sections and gated by
 * capability. Mirrors the web sidebar groups (Operations / Maintenance /
 * Insights / Admin / Account) and its permission gating via lib/nav.tsx.
 *
 * Notifications is now a native screen (not a web link); the unread count shows
 * as a trailing badge.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreScreen(nav: NavController) {
    val user by AuthStore.user.collectAsState()
    val caps = remember(user) { Capabilities.of(user) }
    val ctx = LocalContext.current
    val unread by NotificationCenter.unread.collectAsState()

    Scaffold(topBar = { TopAppBar(title = { Text("More") }) }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(bottom = 24.dp)) {
            sections(nav, ctx, caps, unread).forEach { section ->
                if (section.rows.isEmpty()) return@forEach
                item(key = "h-${section.title}") { SectionHeader(section.title) }
                section.rows.forEach { row ->
                    item(key = row.label) {
                        MoreItem(row)
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

private data class MoreSection(val title: String, val rows: List<MoreItemSpec>)

private data class MoreItemSpec(
    val icon: ImageVector,
    val label: String,
    val badge: Int = 0,
    val destructive: Boolean = false,
    val onClick: () -> Unit,
)

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 6.dp),
    )
}

@Composable
private fun MoreItem(spec: MoreItemSpec) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = spec.onClick).padding(16.dp),
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
            modifier = Modifier.weight(1f),
            color = if (spec.destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
        if (spec.badge > 0) {
            Badge { Text(if (spec.badge > 99) "99+" else spec.badge.toString()) }
        }
    }
}

private fun sections(
    nav: NavController,
    ctx: android.content.Context,
    caps: Capabilities,
    unread: Int,
): List<MoreSection> {
    val operations = buildList {
        // Hangers shows for everyone — cleaners need to see the inventory they're
        // responsible for; staff with device rights manage them.
        add(MoreItemSpec(Icons.Default.Inventory2, "Hangers") { nav.navigate("hangers") })
        if (caps.can(Module.OPERATIONS)) {
            add(MoreItemSpec(Icons.Default.Map, "Floor plans") { nav.navigate("floor-plans") })
        }
        if (caps.isStaff && caps.can(Module.OPERATIONS)) {
            add(MoreItemSpec(Icons.Default.LocationCity, "Sites overview") { nav.navigate("sites") })
        }
    }

    val maintenance = buildList {
        if (caps.isStaff && caps.can(Module.MAINTENANCE)) {
            add(MoreItemSpec(Icons.Default.Construction, "Maintenance jobs") { nav.navigate("maintenance") })
            add(MoreItemSpec(Icons.Default.Speed, "Meters") { nav.navigate("meters") })
            add(MoreItemSpec(Icons.Default.Build, "PPMs") { nav.navigate("ppms") })
            add(MoreItemSpec(Icons.Default.VerifiedUser, "Competency") { nav.navigate("competency") })
        }
    }

    val insights = buildList {
        if (caps.isStaff && caps.can(Module.INSIGHTS)) {
            add(MoreItemSpec(Icons.Default.QueryStats, "Maintenance KPIs") { nav.navigate("maintenance-kpis") })
            add(MoreItemSpec(Icons.Default.Description, "Reports") { nav.navigate("reports") })
            // Analytics stays web-only — heavy charting not worth a native port.
            add(MoreItemSpec(Icons.Default.Analytics, "Analytics") { openWeb(ctx, "/analytics") })
        }
    }

    val admin = buildList {
        if (caps.can(Module.ADMIN) && caps.can(Action.MANAGE_USERS)) {
            add(MoreItemSpec(Icons.Default.Group, "Users") { nav.navigate("users") })
        }
        if (caps.isStaff && caps.can(Module.ADMIN)) {
            add(MoreItemSpec(Icons.Default.Settings, "Settings") { nav.navigate("settings") })
        }
        if (caps.isAdmin) {
            add(MoreItemSpec(Icons.Default.History, "Audit log") { nav.navigate("audit-log") })
        }
    }

    val account = buildList {
        add(MoreItemSpec(Icons.Default.Notifications, "Notifications", badge = unread) { nav.navigate("notifications") })
        add(MoreItemSpec(Icons.Default.Person, "My profile") { nav.navigate("profile") })
        add(MoreItemSpec(Icons.AutoMirrored.Filled.Logout, "Log out", destructive = true) { AuthStore.logout() })
    }

    return listOf(
        MoreSection("Operations", operations),
        MoreSection("Maintenance", maintenance),
        MoreSection("Insights", insights),
        MoreSection("Admin", admin),
        MoreSection("Account", account),
    )
}

/**
 * Open the web admin to a given path — for screens not worth a native port
 * (Analytics). The web app is mobile-responsive.
 */
private fun openWeb(ctx: android.content.Context, path: String) {
    val full = com.borsystems.app.BuildConfig.WEB_BASE_URL + path
    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, full.toUri())
    ctx.startActivity(intent)
}
