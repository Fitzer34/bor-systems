import Foundation
import UserNotifications

/// Tracks which alert IDs we've already shown a banner for, and fires a local
/// notification when a previously-unseen alert appears in the polling result.
///
/// Local notifications are visible while the app is open or briefly backgrounded.
/// True background push (app fully killed) requires APNs / FCM credentials,
/// which need Apple Developer Program enrolment — out of scope here.
@MainActor
final class LocalAlertNotifier {
    static let shared = LocalAlertNotifier()
    private init() {}

    private var seenAlertIds: Set<String> = []
    private var seenDispatchIds: Set<String> = []
    private var primed = false

    /// Call on every refresh of the active alerts list. The first call is used
    /// to "prime" the set (no notifications for alerts already present at app
    /// open) — subsequent calls notify on any new ID.
    func observe(alerts: [ActiveAlert], dispatches: [DispatchItem]) {
        if !primed {
            seenAlertIds = Set(alerts.map { $0.id })
            seenDispatchIds = Set(dispatches.map { $0.id })
            primed = true
            return
        }

        for alert in alerts where !seenAlertIds.contains(alert.id) {
            seenAlertIds.insert(alert.id)
            postAlert(alert)
        }
        for d in dispatches where !seenDispatchIds.contains(d.id) {
            seenDispatchIds.insert(d.id)
            postDispatch(d)
        }
    }

    private func postAlert(_ alert: ActiveAlert) {
        let content = UNMutableNotificationContent()
        let where_ = [alert.floorName, alert.zoneName].compactMap { $0 }.joined(separator: " — ")
        content.title = "🚨 Spill alert"
        content.body = where_.isEmpty
            ? "A wet floor sign has been lifted."
            : "\(where_) — wet floor sign lifted."
        content.sound = .default
        content.threadIdentifier = "bor-spill-alert"

        let req = UNNotificationRequest(identifier: "alert-\(alert.id)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req) { _ in }
    }

    private func postDispatch(_ d: DispatchItem) {
        let content = UNMutableNotificationContent()
        content.title = d.zoneName.map { "📨 Go to \($0)" } ?? "📨 New dispatch"
        content.body = d.message
        content.sound = .default
        content.threadIdentifier = "bor-dispatch"

        let req = UNNotificationRequest(identifier: "dispatch-\(d.id)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req) { _ in }
    }
}
