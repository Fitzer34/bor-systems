import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Alerts", systemImage: "bell.badge") }

            MapView()
                .tabItem { Label("Map", systemImage: "map") }

            // Dispatch tab: admins and supervisors get the send form;
            // cleaners get a read-only inbox of dispatches sent to them.
            if let role = auth.user?.role {
                Group {
                    if role == .admin || role == .supervisor {
                        DispatchSendView()
                    } else {
                        NavigationStack { MyDispatchesView() }
                    }
                }
                .tabItem { Label("Dispatch", systemImage: "paperplane") }
            }

            // Schedule tab: visible to everyone. Cleaners see only their
            // own shifts read-only; admins/supervisors see all + can edit.
            NavigationStack { ScheduleView() }
                .tabItem { Label("Schedule", systemImage: "calendar") }

            MenuView()
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}

#Preview {
    MainTabView().environmentObject(AuthStore())
}
