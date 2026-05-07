import SwiftUI
import UserNotifications
import UIKit

struct ContentView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        Group {
            if auth.isLoading && auth.user == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemGroupedBackground).ignoresSafeArea())
            } else if auth.user == nil {
                LoginView()
            } else {
                HomeView()
                    .task { await requestPushAuthorization() }
            }
        }
    }

    private func requestPushAuthorization() async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
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
