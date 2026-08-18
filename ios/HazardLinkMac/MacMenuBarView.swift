import SwiftUI

/// The menu-bar drop-down: open spills at the top, then the latest unread
/// notifications, then a jump into the app. Always available, one click,
/// even when the main window is hidden.
struct MacMenuBarView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var notifications: NotificationsStore
    @EnvironmentObject var alerts: MacAlertWatcher
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: "shield.fill").foregroundStyle(Color.accentColor)
                Text("HazardLink").font(.headline)
                Spacer()
                if auth.user != nil {
                    Text(auth.user?.name ?? "").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(12)
            Divider()

            if auth.user == nil {
                Text("Not signed in. Open the app to sign in.")
                    .font(.footnote).foregroundStyle(.secondary).padding(12)
            } else {
                // Spills
                sectionHeader(alerts.openSpills > 0 ? "\(alerts.openSpills) open spill\(alerts.openSpills == 1 ? "" : "s")" : "No open spills",
                              tone: alerts.openSpills > 0 ? .red : .green)
                if alerts.openSpills > 0 {
                    ForEach(alerts.alerts.filter { $0.status != .closed }.prefix(5)) { a in
                        HStack(spacing: 8) {
                            Circle().fill(a.status == .acknowledged ? Color.orange : Color.red).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text([a.floorName, a.zoneName].compactMap { $0 }.joined(separator: " · ").ifEmpty("Sensor location"))
                                    .font(.footnote.weight(.medium))
                                Text(a.status == .acknowledged ? "Being handled" : "Sign lifted " + a.openedAt.formatted(date: .omitted, time: .shortened))
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 12).padding(.vertical, 5)
                    }
                }
                Divider().padding(.vertical, 4)

                // Notifications
                sectionHeader(notifications.unreadCount > 0 ? "\(notifications.unreadCount) unread" : "Nothing unread", tone: notifications.unreadCount > 0 ? .blue : .secondary)
                ForEach(notifications.items.filter { $0.isUnread }.prefix(6)) { n in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(n.title).font(.footnote.weight(.medium)).lineLimit(1)
                        Text(n.body).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 5)
                }
                if notifications.unreadCount > 0 {
                    Button("Mark all read") { Task { await notifications.markAllRead() } }
                        .buttonStyle(.plain).font(.caption).foregroundStyle(Color.accentColor)
                        .padding(.horizontal, 12).padding(.top, 2)
                }
                Divider().padding(.vertical, 6)
            }

            HStack {
                Button("Open HazardLink") {
                    NSApp.activate(ignoringOtherApps: true)
                    openWindow(id: "main")
                }
                .keyboardShortcut("o")
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
                    .keyboardShortcut("q")
            }
            .padding(12)
        }
        .frame(width: 320)
        .task {
            if auth.user != nil { await notifications.load() }
        }
    }

    private func sectionHeader(_ text: String, tone: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(tone).frame(width: 7, height: 7)
            Text(text).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
