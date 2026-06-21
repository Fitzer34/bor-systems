import SwiftUI

/// The notifications centre — the signed-in user's in-app feed, grouped by day,
/// with unread highlighting, mark-one / mark-all read, and tap-through to the
/// underlying entity (alerts open AlertDetailView, reusing the same screen the
/// APNs deep-link lands on).
struct NotificationsCenterView: View {
    @EnvironmentObject var store: NotificationsStore

    /// Set when the user taps an alert notification — drives a navigation push
    /// to AlertDetailView once we've resolved the live alert.
    @State private var openingAlert: ActiveAlert?
    @State private var resolving = false
    @State private var resolveError: String?

    var body: some View {
        List {
            if store.items.isEmpty && !store.isLoading {
                ContentUnavailableCompat(
                    title: "You're all caught up",
                    systemImage: "bell.slash",
                    description: "New alerts, jobs and reminders will show up here.")
            }

            ForEach(groupedDays, id: \.title) { group in
                Section(group.title) {
                    ForEach(group.items) { item in
                        Button {
                            Task { await handleTap(item) }
                        } label: {
                            NotificationRow(item: item)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            if item.isUnread {
                                Button {
                                    Task { await store.markRead(item.id) }
                                } label: {
                                    Label("Read", systemImage: "envelope.open")
                                }
                                .tint(.blue)
                            }
                        }
                    }
                }
            }

            if let resolveError = resolveError {
                Section { Text(resolveError).foregroundStyle(.red).font(.footnote) }
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Mark all read") {
                    Task { await store.markAllRead() }
                }
                .disabled(store.unreadCount == 0)
            }
        }
        .overlay {
            if resolving {
                ProgressView().controlSize(.large)
            }
        }
        .refreshable { await store.load() }
        .task { await store.load() }
        // iOS 16-compatible programmatic push: bind presentation to whether an
        // alert has been resolved, and read it back inside the destination.
        .navigationDestination(isPresented: Binding(
            get: { openingAlert != nil },
            set: { if !$0 { openingAlert = nil } }
        )) {
            if let alert = openingAlert {
                AlertDetailView(alert: alert) { await store.load() }
            }
        }
    }

    // MARK: Grouping

    private struct DayGroup { let title: String; let items: [UserNotification] }

    /// Group notifications into Today / Yesterday / older date headings, newest
    /// first within each group (the feed already arrives newest-first).
    private var groupedDays: [DayGroup] {
        let cal = Calendar.current
        let grouped = Dictionary(grouping: store.items) { item in
            cal.startOfDay(for: item.createdAt)
        }
        return grouped
            .sorted { $0.key > $1.key }
            .map { (day, items) in
                DayGroup(title: dayTitle(day), items: items)
            }
    }

    private func dayTitle(_ day: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(day) { return "Today" }
        if cal.isDateInYesterday(day) { return "Yesterday" }
        return day.formatted(date: .abbreviated, time: .omitted)
    }

    // MARK: Tap-through

    private func handleTap(_ item: UserNotification) async {
        if item.isUnread { await store.markRead(item.id) }

        // Alert notifications deep-link to the alert detail — the same screen
        // the APNs "Open" action lands on. We resolve the live alert from the
        // active list by its entity id.
        guard item.entityType == "alert", let alertId = item.entityId else { return }
        resolving = true
        resolveError = nil
        defer { resolving = false }
        if let alerts = try? await APIClient.shared.activeAlerts(),
           let match = alerts.first(where: { $0.id == alertId }) {
            openingAlert = match
        } else {
            resolveError = "That alert is no longer active."
        }
    }
}

// MARK: - Row

private struct NotificationRow: View {
    let item: UserNotification

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Unread dot.
            Circle()
                .fill(item.isUnread ? iconColor : Color.clear)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Image(systemName: iconName)
                        .foregroundStyle(iconColor)
                        .font(.caption)
                    Text(item.title)
                        .font(.subheadline.weight(item.isUnread ? .semibold : .regular))
                        .foregroundStyle(.primary)
                }
                Text(item.body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                Text(relativeTime(from: item.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
            if item.entityType == "alert" {
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    /// Icon + colour chosen from the event-type prefix so the feed scans fast.
    private var iconName: String {
        switch item.type.split(separator: ".").first.map(String.init) {
        case "spill":       return "exclamationmark.triangle.fill"
        case "wo":          return "hammer.fill"
        case "ppm":         return "wrench.and.screwdriver.fill"
        case "part":        return "shippingbox.fill"
        case "cert":        return "checkmark.seal.fill"
        case "invoice":     return "doc.text.fill"
        case "lone_worker": return "person.fill.viewfinder"
        case "quote":       return "tag.fill"
        case "patrol":      return "shield.fill"
        default:            return "bell.fill"
        }
    }
    private var iconColor: Color {
        switch item.type.split(separator: ".").first.map(String.init) {
        case "spill":       return .red
        case "wo", "ppm":   return .orange
        case "lone_worker": return .red
        case "patrol":      return .purple
        default:            return .blue
        }
    }
}

// MARK: - Back-compat empty state

/// `ContentUnavailableView` is iOS 17+, but the project targets iOS 16. This is
/// a minimal stand-in with the same call shape so the empty state renders on 16.
struct ContentUnavailableCompat: View {
    let title: String
    let systemImage: String
    let description: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text(title).font(.headline)
            Text(description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .listRowSeparator(.hidden)
    }
}

#Preview {
    NavigationStack { NotificationsCenterView() }
        .environmentObject(NotificationsStore())
}
