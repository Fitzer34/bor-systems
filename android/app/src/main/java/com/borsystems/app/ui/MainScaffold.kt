package com.borsystems.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.borsystems.app.auth.Action
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.auth.Capabilities
import com.borsystems.app.auth.Module
import com.borsystems.app.notifications.NotificationCenter
import com.borsystems.app.ui.alert.AlertDetailScreen
import com.borsystems.app.ui.dispatch.DispatchScreen
import com.borsystems.app.ui.dispatch.MyDispatchesScreen
import com.borsystems.app.ui.floorplans.FloorPlansScreen
import com.borsystems.app.ui.hangers.HangersScreen
import com.borsystems.app.ui.home.HomeScreen
import com.borsystems.app.ui.maintenance.MaintenanceDetailScreen
import com.borsystems.app.ui.maintenance.MaintenanceScreen
import com.borsystems.app.ui.maintenance.MetersScreen
import com.borsystems.app.ui.maintenance.CompetencyScreen
import com.borsystems.app.ui.maintenance.MaintenanceKpisScreen
import com.borsystems.app.ui.more.MoreScreen
import com.borsystems.app.ui.notifications.NotificationPrefsScreen
import com.borsystems.app.ui.notifications.NotificationsScreen
import com.borsystems.app.ui.ppms.PpmsScreen
import com.borsystems.app.ui.profile.EditProfileScreen
import com.borsystems.app.ui.profile.ProfileScreen
import com.borsystems.app.ui.profile.SecurityScreen
import com.borsystems.app.ui.reports.AuditLogScreen
import com.borsystems.app.ui.reports.ReportsScreen
import com.borsystems.app.ui.schedule.ScheduleScreen
import com.borsystems.app.ui.settings.SettingsScreen
import com.borsystems.app.ui.setup.HangerSetupScreen
import com.borsystems.app.ui.sites.SitesScreen
import com.borsystems.app.ui.users.UsersScreen

/**
 * Bottom-navigation root.
 *
 * The tab set is a function of the user's capabilities (≤5 items). Home + More
 * are always present; Map / Dispatch / Schedule are gated on the operations
 * module (so a maintenance-only role wouldn't carry cleaning tabs). The More
 * tab carries the in-app notifications unread badge.
 *
 * Mirrors iOS MainTabView order, with the role-aware filtering the web sidebar
 * does via lib/nav.tsx + lib/permissions.tsx.
 */
private enum class Tab(
    val route: String,
    val label: String,
    val icon: ImageVector,
    /** Capability key that must be granted, or null for "always". */
    val requires: String? = null,
) {
    Home    ("home",     "Alerts",    Icons.Default.Notifications),
    Map     ("map",      "Map",       Icons.Default.Map,          Module.OPERATIONS),
    Dispatch("dispatch", "Dispatch",  Icons.Default.Send,         Module.OPERATIONS),
    Schedule("schedule", "Schedule",  Icons.Default.CalendarMonth, Module.OPERATIONS),
    More    ("more",     "More",      Icons.Default.Menu),
}

private fun visibleTabs(caps: Capabilities): List<Tab> =
    Tab.entries.filter { it.requires == null || caps.can(it.requires) }.take(5)

@Composable
fun MainScaffold() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    val user by AuthStore.user.collectAsState()
    val caps = remember(user) { Capabilities.of(user) }
    val tabs = remember(caps) { visibleTabs(caps) }
    val unread by NotificationCenter.unread.collectAsState()

    // Keep the unread badge fresh on entry.
    LaunchedEffect(Unit) { NotificationCenter.refresh() }

    Scaffold(
        bottomBar = {
            val isRootTab = tabs.any { it.route == currentRoute }
            if (isRootTab) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                if (tab == Tab.More && unread > 0) {
                                    BadgedBox(badge = { Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                                        Icon(tab.icon, contentDescription = tab.label)
                                    }
                                } else {
                                    Icon(tab.icon, contentDescription = tab.label)
                                }
                            },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Tab.Home.route,
            modifier = Modifier.padding(padding),
        ) {
            composable(Tab.Home.route) {
                HomeScreen(
                    onAlertTap = { alert -> nav.navigate("alert/${alert.id}") },
                    onOpenProfile = { nav.navigate("profile") },
                    onOpenRoute = { route -> nav.navigate(route) },
                )
            }
            composable(Tab.Map.route) {
                FloorPlansScreen(
                    onBack = { /* root tab — no back */ },
                    asTab = true,
                    onOpenAlert = { id -> nav.navigate("alert/$id") },
                )
            }
            composable(Tab.Dispatch.route) { DispatchScreen(nav) }
            composable(Tab.Schedule.route) { ScheduleScreen() }
            composable(Tab.More.route)     { MoreScreen(nav) }
            composable("hangers")          { HangersScreen(onAddHanger = { nav.navigate("hanger-setup") }) }

            // Sub-screens reached from tabs / "More"
            composable("alert/{id}")        { entry ->
                AlertDetailScreen(
                    alertId = entry.arguments?.getString("id").orEmpty(),
                    onBack = { nav.popBackStack() },
                )
            }
            composable("sites")             { Guard(caps, Module.OPERATIONS, requireStaff = true, nav = nav) { SitesScreen() } }
            composable("profile")           { ProfileScreen(nav) }
            composable("profile/edit")      { EditProfileScreen(onBack = { nav.popBackStack() }) }
            composable("security")          { SecurityScreen(onBack = { nav.popBackStack() }) }
            composable("notifications")     {
                NotificationsScreen(
                    onBack = { nav.popBackStack() },
                    onOpenAlert = { id -> nav.navigate("alert/$id") },
                    onOpenRoute = { route -> nav.navigate(route) },
                    onOpenPreferences = { nav.navigate("notification-prefs") },
                )
            }
            composable("notification-prefs") { NotificationPrefsScreen(onBack = { nav.popBackStack() }) }
            composable("my-dispatches")     { MyDispatchesScreen(onBack = { nav.popBackStack() }) }
            composable("floor-plans")       {
                FloorPlansScreen(
                    onBack = { nav.popBackStack() },
                    onOpenAlert = { id -> nav.navigate("alert/$id") },
                )
            }
            composable("reports")           { Guard(caps, Module.INSIGHTS, requireStaff = true, nav = nav) { ReportsScreen(onBack = { nav.popBackStack() }) } }
            composable("audit-log")         { Guard(caps, Module.ADMIN, requireAdmin = true, nav = nav) { AuditLogScreen(onBack = { nav.popBackStack() }) } }
            composable("users")             { Guard(caps, Action.MANAGE_USERS, requireStaff = true, nav = nav) { UsersScreen(onBack = { nav.popBackStack() }) } }
            composable("settings")          { Guard(caps, Module.ADMIN, requireStaff = true, nav = nav) { SettingsScreen(onBack = { nav.popBackStack() }) } }
            composable("ppms")              { Guard(caps, Module.MAINTENANCE, requireStaff = true, nav = nav) { PpmsScreen(onBack = { nav.popBackStack() }) } }
            composable("meters")            { Guard(caps, Module.MAINTENANCE, requireStaff = true, nav = nav) { MetersScreen(onBack = { nav.popBackStack() }) } }
            composable("competency")        { Guard(caps, Module.MAINTENANCE, requireStaff = true, nav = nav) { CompetencyScreen(onBack = { nav.popBackStack() }) } }
            composable("maintenance-kpis")  { Guard(caps, Module.INSIGHTS, requireStaff = true, nav = nav) { MaintenanceKpisScreen(onBack = { nav.popBackStack() }) } }
            composable("maintenance")       {
                Guard(caps, Module.MAINTENANCE, requireStaff = true, nav = nav) {
                    MaintenanceScreen(
                        onBack = { nav.popBackStack() },
                        onOpenJob = { id -> nav.navigate("job/$id") },
                    )
                }
            }
            composable("job/{id}")          { entry ->
                Guard(caps, Module.MAINTENANCE, requireStaff = true, nav = nav) {
                    MaintenanceDetailScreen(
                        jobId = entry.arguments?.getString("id").orEmpty(),
                        onBack = { nav.popBackStack() },
                    )
                }
            }
            composable("hanger-setup")      { HangerSetupScreen(onDone = { nav.popBackStack() }) }
        }
    }
}

/**
 * Route guard — defence in depth behind the nav filtering. If the user lacks the
 * capability (or staff/admin tier) for a destination, we pop straight back
 * instead of rendering it. Belt-and-braces against deep links / programmatic
 * navigation reaching a screen the menus wouldn't have shown.
 */
@Composable
private fun Guard(
    caps: Capabilities,
    permission: String,
    requireStaff: Boolean = false,
    requireAdmin: Boolean = false,
    nav: androidx.navigation.NavController,
    content: @Composable () -> Unit,
) {
    val allowed = caps.can(permission) &&
        (!requireStaff || caps.isStaff) &&
        (!requireAdmin || caps.isAdmin)
    if (allowed) {
        content()
    } else {
        LaunchedEffect(Unit) { nav.popBackStack() }
    }
}
