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
        // The id is what the menu-bar extra's "Open HazardLink" asks for; without it that
        // button could not bring the window back once it had been closed.
        WindowGroup("HazardLink", id: "main") {
            MacRootView()
                .environmentObject(auth)
                .environmentObject(discipline)
                .environmentObject(notifications)
                .environmentObject(alerts)
                .frame(minWidth: 1000, minHeight: 640)
                .tint(Color.hlPrimary)
                .preferredColorScheme(.light)
                .onAppear { HLAppearance.pinLight() }
                .task {
                    await auth.bootstrap()
                    _ = try? await UNUserNotificationCenter.current()
                        .requestAuthorization(options: [.alert, .sound, .badge])
                }
        }
        .defaultSize(width: 1280, height: 800)
        // Each page carries its own title, and a window title would sit on the navy column.
        .windowToolbarStyle(.unified(showsTitle: false))
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(after: .toolbar) {
                Button("Refresh") {
                    NotificationCenter.default.post(name: .macRefresh, object: nil)
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
            CommandMenu("Go") {
                ForEach(Array(MacSection.menuGroups.enumerated()), id: \.offset) { i, group in
                    if i > 0 { Divider() }
                    ForEach(group) { s in
                        if let k = s.shortcut {
                            Button(s.title) { NotificationCenter.default.post(name: .macGoToSection, object: s) }
                                .keyboardShortcut(k.key, modifiers: k.modifiers)
                        } else {
                            Button(s.title) { NotificationCenter.default.post(name: .macGoToSection, object: s) }
                        }
                    }
                }
            }
        }

        // Menu-bar extra: unread badge + latest alerts, always one click away.
        MenuBarExtra {
            MacMenuBarView()
                .environmentObject(auth)
                .environmentObject(notifications)
                .environmentObject(alerts)
                .tint(Color.hlPrimary)
                .preferredColorScheme(.light)
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
    /// View > Refresh (⌘R): rebuild the screen in front so it loads again.
    static let macRefresh = Notification.Name("hl.mac.refresh")
    /// Same name the iPhone app posts when a notification is tapped, so the
    /// shared HomeView's deep-link listener compiles here too.
    static let borOpenAlert = Notification.Name("BOROpenAlertNotification")
}
