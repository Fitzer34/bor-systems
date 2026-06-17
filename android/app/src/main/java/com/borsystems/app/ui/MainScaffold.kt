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
import com.borsystems.app.ui.alert.AlertDetailScreen
import com.borsystems.app.ui.dispatch.DispatchScreen
import com.borsystems.app.ui.dispatch.MyDispatchesScreen
import com.borsystems.app.ui.floorplans.FloorPlansScreen
import com.borsystems.app.ui.hangers.HangersScreen
import com.borsystems.app.ui.home.HomeScreen
import com.borsystems.app.ui.maintenance.MaintenanceDetailScreen
import com.borsystems.app.ui.maintenance.MaintenanceScreen
import com.borsystems.app.ui.more.MoreScreen
import com.borsystems.app.ui.ppms.PpmsScreen
import com.borsystems.app.ui.profile.EditProfileScreen
import com.borsystems.app.ui.profile.ProfileScreen
import com.borsystems.app.ui.reports.AuditLogScreen
import com.borsystems.app.ui.reports.ReportsScreen
import com.borsystems.app.ui.schedule.ScheduleScreen
import com.borsystems.app.ui.settings.SettingsScreen
import com.borsystems.app.ui.setup.HangerSetupScreen
import com.borsystems.app.ui.sites.SitesScreen
import com.borsystems.app.ui.users.UsersScreen

/**
 * Bottom-navigation root — mirrors iOS MainTabView.swift.
 *
 * Five tabs in the same order as iOS. Cleaners and admins see the same
 * tabs; each screen filters its content based on the user's role.
 */
// Matches iOS MainTabView.swift order: Alerts, Map, Dispatch, Schedule, More.
// Hangers moved into the "More" menu — same place iOS keeps it (under MenuView).
private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    Home    ("home",     "Alerts",    Icons.Default.Notifications),
    Map     ("map",      "Map",       Icons.Default.Map),
    Dispatch("dispatch", "Dispatch",  Icons.Default.Send),
    Schedule("schedule", "Schedule",  Icons.Default.CalendarMonth),
    More    ("more",     "More",      Icons.Default.Menu),
}

@Composable
fun MainScaffold() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    Scaffold(
        bottomBar = {
            val isRootTab = Tab.entries.any { it.route == currentRoute }
            if (isRootTab) {
                NavigationBar {
                    Tab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
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
            composable(Tab.Home.route)     {
                HomeScreen(onAlertTap = { alert -> nav.navigate("alert/${alert.id}") })
            }
            composable(Tab.Map.route)      { FloorPlansScreen(onBack = { /* root tab — no back */ }, asTab = true) }
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
            composable("sites")             { SitesScreen() }
            composable("profile")           { ProfileScreen(nav) }
            composable("profile/edit")      { EditProfileScreen(onBack = { nav.popBackStack() }) }
            composable("my-dispatches")     { MyDispatchesScreen(onBack = { nav.popBackStack() }) }
            composable("floor-plans")       { FloorPlansScreen(onBack = { nav.popBackStack() }) }
            composable("reports")           { ReportsScreen(onBack = { nav.popBackStack() }) }
            composable("audit-log")         { AuditLogScreen(onBack = { nav.popBackStack() }) }
            composable("users")             { UsersScreen(onBack = { nav.popBackStack() }) }
            composable("settings")          { SettingsScreen(onBack = { nav.popBackStack() }) }
            composable("ppms")              { PpmsScreen(onBack = { nav.popBackStack() }) }
            composable("maintenance")       {
                MaintenanceScreen(
                    onBack = { nav.popBackStack() },
                    onOpenJob = { id -> nav.navigate("job/$id") },
                )
            }
            composable("job/{id}")          { entry ->
                MaintenanceDetailScreen(
                    jobId = entry.arguments?.getString("id").orEmpty(),
                    onBack = { nav.popBackStack() },
                )
            }
            composable("hanger-setup")      { HangerSetupScreen(onDone = { nav.popBackStack() }) }
        }
    }
}
