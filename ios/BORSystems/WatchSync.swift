import Foundation
import WatchConnectivity

/// Pushes the iPhone's auth token + API base URL to the paired Apple Watch
/// so the watch app can call the backend directly.
///
/// Uses `updateApplicationContext` — guaranteed delivery, supersedes prior
/// values, and is delivered even when the watch app isn't running (queued
/// for next launch).
@MainActor
final class WatchSync: NSObject, WCSessionDelegate {
    static let shared = WatchSync()

    private var session: WCSession? {
        guard WCSession.isSupported() else { return nil }
        return WCSession.default
    }

    override init() {
        super.init()
        session?.delegate = self
        session?.activate()
    }

    /// Push the current session to the watch. Safe to call on every login,
    /// logout, foreground, and duty-state change — the system de-dupes
    /// identical contexts.
    func push(token: String?, apiBase: URL) {
        guard let s = session, s.activationState == .activated else { return }
        var ctx: [String: Any] = [
            "apiBase": apiBase.absoluteString,
        ]
        if let t = token, !t.isEmpty {
            ctx["token"] = t
        } else {
            // Explicit logout signal — the watch wipes its stored token.
            ctx["signedOut"] = true
        }
        do {
            try s.updateApplicationContext(ctx)
        } catch {
            // Reachable in rare cases (e.g. session not activated, watch not
            // paired). Not fatal — next push will overwrite.
            print("WatchSync push failed: \(error)")
        }
    }

    // MARK: - WCSessionDelegate (stubs — we only push, never receive)

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {}

    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        // Required to support switching paired watches.
        session.activate()
    }
    #endif
}
