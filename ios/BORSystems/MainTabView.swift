import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var notifications: NotificationsStore

    var body: some View {
        // Single source of truth for what this user may see. Each tab is gated
        // on the same capability layer the web nav uses, so the phone honours
        // the backend's permission model (admin all-true; supervisor most;
        // cleaner operations-only) and falls back to the role baseline when the
        // login payload didn't carry a permission map.
        let caps = auth.capabilities

        TabView {
            // Alerts / Home — the operations landing screen. Operations is the
            // baseline module every role has, so this is always present.
            if caps.canSeeOperations {
                HomeView()
                    .tabItem { Label("Alerts", systemImage: "bell.badge") }
            }

            if caps.canSeeOperations {
                MapView()
                    .tabItem { Label("Map", systemImage: "map") }
            }

            // Dispatch — admins/supervisors get the org-wide send form; cleaners
            // get a read-only inbox of dispatches sent to them. Both require the
            // operations module.
            if caps.canSeeOperations {
                Group {
                    if caps.canSendDispatch {
                        DispatchSendView()
                    } else {
                        NavigationStack { MyDispatchesView() }
                    }
                }
                .tabItem { Label("Dispatch", systemImage: "paperplane") }
            }

            // Schedule — everyone in operations. Cleaners see their own shifts
            // read-only; admins/supervisors see all + can edit (gated inside).
            if caps.canSeeOperations {
                NavigationStack { ScheduleView() }
                    .tabItem { Label("Schedule", systemImage: "calendar") }
            }

            // More — always present (even a cleaner needs profile + sign out).
            // Carries the unread-notifications badge.
            MenuView()
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
                .badge(notifications.unreadCount)
        }
        .task {
            // Keep the unread badge live while the user is signed in.
            notifications.startPolling()
        }
        .onDisappear { notifications.stopPolling() }
    }
}

#Preview {
    MainTabView()
        .environmentObject(AuthStore())
        .environmentObject(NotificationsStore())
}
