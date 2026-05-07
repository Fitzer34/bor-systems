import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Alerts", systemImage: "bell.badge") }

            MapView()
                .tabItem { Label("Map", systemImage: "map") }

            if let role = auth.user?.role, role == .admin || role == .supervisor {
                DispatchSendView()
                    .tabItem { Label("Dispatch", systemImage: "paperplane") }
            }

            MenuView()
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}

#Preview {
    MainTabView().environmentObject(AuthStore())
}
