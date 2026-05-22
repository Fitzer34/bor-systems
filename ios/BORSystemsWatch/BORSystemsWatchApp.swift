import SwiftUI
import WatchConnectivity

/// Apple Watch companion app.
///
/// Scope is deliberately tight — a watch isn't a place to navigate menus.
/// Three things only:
///   1. Glanceable list of active alerts (red dot if any are open)
///   2. One-tap acknowledge for an alert or dispatch (forwarded to backend)
///   3. Pull-to-refresh + auto-refresh every 30 s when the app is on screen
///
/// Auth: the watch can't show a login form sensibly. The iPhone app pushes
/// its auth token + API base URL to the watch over WatchConnectivity on
/// every login + every foreground. If the watch hasn't received a token,
/// it shows a "Open the iPhone app to sign in" screen.
@main
struct BORSystemsWatchApp: App {
    @StateObject private var auth = WatchAuthStore.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .onAppear { auth.activateSession() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var auth: WatchAuthStore

    var body: some View {
        Group {
            if auth.token == nil {
                NotSignedInView()
            } else {
                NavigationStack {
                    ActiveAlertsView()
                        .navigationTitle("Active alerts")
                }
            }
        }
    }
}

struct NotSignedInView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "iphone.gen3")
                .font(.system(size: 36))
                .foregroundStyle(.secondary)
            Text("Open the ZeroSlip iPhone app and sign in to use the watch.")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
