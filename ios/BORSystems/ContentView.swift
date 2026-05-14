import SwiftUI
import UserNotifications
import UIKit

struct ContentView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if auth.isLoading && auth.user == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemGroupedBackground).ignoresSafeArea())
            } else if auth.user == nil {
                LoginView()
            } else {
                MainTabView()
                    .task(id: auth.user?.id) {
                        // Re-request authorization and re-register on every
                        // distinct logged-in user so the push token always
                        // lives on the right user record.
                        await requestPushAuthorization()
                    }
                    .onChange(of: scenePhase) { newPhase in
                        // Also re-register when the app comes back to the
                        // foreground — APNs sometimes rotates the token, and
                        // we want the backend to have the latest.
                        if newPhase == .active && auth.user != nil {
                            Task { await requestPushAuthorization() }
                        }
                    }
            }
        }
    }

    private func requestPushAuthorization() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            if granted {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
        } catch {
            // Not fatal in dev
        }
    }
}

#Preview {
    ContentView().environmentObject(AuthStore())
}
