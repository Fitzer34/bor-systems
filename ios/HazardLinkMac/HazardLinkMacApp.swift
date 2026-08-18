import SwiftUI
import UserNotifications

/// HazardLink for Mac — the supervisor's desk app. Same API, auth, models and
/// most screens as the iPhone app; a Mac-native shell around them: a three-
/// column window (disciplines → list → detail), a menu-bar extra that keeps
/// the unread count and latest alerts one click away even when the window is
/// behind others, keyboard shortcuts, and native notifications for new alerts.
@main
struct HazardLinkMacApp: App {
    @StateObject private var auth = AuthStore()
    @StateObject private var discipline = DisciplineStore()
    @StateObject private var notifications = NotificationsStore()
    @StateObject private var alerts = MacAlertWatcher()

    var body: some Scene {
        WindowGroup("HazardLink") {
            MacRootView()
                .environmentObject(auth)
                .environmentObject(discipline)
                .environmentObject(notifications)
                .environmentObject(alerts)
                .frame(minWidth: 1000, minHeight: 640)
                .task {
                    await auth.bootstrap()
                    _ = try? await UNUserNotificationCenter.current()
                        .requestAuthorization(options: [.alert, .sound, .badge])
                }
        }
        .defaultSize(width: 1280, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("Go") {
                ForEach(MacSection.allCases) { s in
                    Button(s.title) {
                        NotificationCenter.default.post(name: .macGoToSection, object: s)
                    }
                    .keyboardShortcut(s.shortcut, modifiers: [.command])
                }
            }
        }

        // Menu-bar extra: unread badge + latest alerts, always one click away.
        MenuBarExtra {
            MacMenuBarView()
                .environmentObject(auth)
                .environmentObject(notifications)
                .environmentObject(alerts)
        } label: {
            Label {
                Text(notifications.unreadCount > 0 ? "\(notifications.unreadCount)" : "")
            } icon: {
                Image(systemName: alerts.openSpills > 0 ? "exclamationmark.triangle.fill" : "shield.fill")
            }
        }
        .menuBarExtraStyle(.window)
    }
}

extension Notification.Name {
    static let macGoToSection = Notification.Name("hl.mac.goToSection")
    /// Same name the iPhone app posts when a notification is tapped, so the
    /// shared HomeView's deep-link listener compiles here too.
    static let borOpenAlert = Notification.Name("BOROpenAlertNotification")
}
