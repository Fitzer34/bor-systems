package com.borsystems.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.borsystems.app.ui.dispatch.DispatchScreen
import com.borsystems.app.ui.hangers.HangersScreen
import com.borsystems.app.ui.home.HomeScreen
import com.borsystems.app.ui.more.MoreScreen
import com.borsystems.app.ui.profile.ProfileScreen
import com.borsystems.app.ui.schedule.ScheduleScreen
import com.borsystems.app.ui.sites.SitesScreen

/**
 * Bottom-navigation root — mirrors iOS MainTabView.swift.
 *
 * Five tabs in the same order as iOS. Cleaners and admins see the same
 * tabs; each screen filters its content based on the user's role.
 */
private enum class Tab(val route: String, val label: String, val icon: ImageVector) {
    Home    ("home",     "Alerts",    Icons.Default.Notifications),
    Dispatch("dispatch", "Dispatch",  Icons.Default.Send),
    Schedule("schedule", "Schedule",  Icons.Default.CalendarMonth),
    Hangers ("hangers",  "Hangers",   Icons.Default.Inventory2),
    More    ("more",     "More",      Icons.Default.Menu),
}

@Composable
fun MainScaffold() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    Scaffold(
        bottomBar = {
            // Hide the bottom bar on detail screens pushed beyond the tab roots.
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
            composable(Tab.Home.route)     { HomeScreen() }
            composable(Tab.Dispatch.route) { DispatchScreen() }
            composable(Tab.Schedule.route) { ScheduleScreen() }
            composable(Tab.Hangers.route)  { HangersScreen() }
            composable(Tab.More.route)     { MoreScreen(nav) }

            // Sub-screens reached from "More"
            composable("sites")   { SitesScreen() }
            composable("profile") { ProfileScreen() }
        }
    }
}
