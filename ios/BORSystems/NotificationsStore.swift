import Foundation
import Combine

/// Owns the signed-in user's notification feed + unread badge count.
///
/// The unread count drives the badge on the More tab and the bell button.
/// `refreshUnread()` is cheap (a single count query) and polled often; the full
/// `load()` pulls the feed for the NotificationsCenterView. Marking read updates
/// the local copy optimistically so the UI feels instant.
@MainActor
final class NotificationsStore: ObservableObject {
    @Published private(set) var items: [UserNotification] = []
    @Published private(set) var unreadCount: Int = 0
    @Published private(set) var isLoading = false
    @Published var lastError: String?

    private var pollTask: Task<Void, Never>?

    /// Begin polling the unread count. Safe to call repeatedly — it cancels any
    /// existing poller first. Call once the user is signed in.
    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshUnread()
                // 15s is plenty for a badge — the feed itself refreshes on open
                // and on pull-to-refresh, and APNs covers the urgent path.
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    /// Clear everything on sign-out so the next user on a shared device doesn't
    /// inherit a stale badge or feed.
    func reset() {
        stopPolling()
        items = []
        unreadCount = 0
        lastError = nil
    }

    func refreshUnread() async {
        guard APIClient.shared.token != nil else { return }
        if let count = try? await APIClient.shared.unreadNotificationCount() {
            unreadCount = count
        }
    }

    func load() async {
        guard APIClient.shared.token != nil else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            async let feed = APIClient.shared.notifications(limit: 50)
            async let count = APIClient.shared.unreadNotificationCount()
            items = try await feed
            unreadCount = (try? await count) ?? unreadCount
            lastError = nil
        } catch {
            lastError = "Could not load notifications."
        }
    }

    func markRead(_ id: String) async {
        // Optimistic local update first so the row state + badge flip instantly.
        if let idx = items.firstIndex(where: { $0.id == id }), items[idx].isUnread {
            items[idx] = items[idx].markedRead()
            unreadCount = max(0, unreadCount - 1)
        }
        try? await APIClient.shared.markNotificationRead(id)
    }

    func markAllRead() async {
        items = items.map { $0.isUnread ? $0.markedRead() : $0 }
        unreadCount = 0
        try? await APIClient.shared.markAllNotificationsRead()
        await refreshUnread()
    }
}

private extension UserNotification {
    /// Return a copy with `readAt` stamped now — used for optimistic updates.
    func markedRead() -> UserNotification {
        UserNotification(
            id: id, type: type, title: title, body: body,
            entityType: entityType, entityId: entityId,
            readAt: Date(), createdAt: createdAt)
    }
}
