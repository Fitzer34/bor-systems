import Foundation
import UserNotifications

/// Historical: this used to fire LOCAL notifications when polling discovered
/// a new alert or dispatch. With APNs wired up, the backend already pushes
/// real notifications via the system, so firing a local one too produced a
/// duplicate ("ping" when the alert opened, then a second "ping" when the
/// app's polling caught up).
///
/// We keep the class so `observe(...)` calls in HomeView still compile, but
/// it intentionally does nothing now. If APNs is ever turned off, re-enable
/// the bodies of `postAlert` / `postDispatch` and the duplicate behaviour
/// becomes the fallback.
@MainActor
final class LocalAlertNotifier {
    static let shared = LocalAlertNotifier()
    private init() {}

    /// No-op. APNs push from the backend is the single source of notifications.
    func observe(alerts: [ActiveAlert], dispatches: [DispatchItem]) {
        _ = alerts
        _ = dispatches
    }
}
