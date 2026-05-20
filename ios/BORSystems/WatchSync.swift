import Foundation
import WatchConnectivity

/// Pushes the iPhone's auth token + API base URL to the paired Apple Watch
/// so the watch app can call the backend directly.
///
/// Uses `updateApplicationContext` — guaranteed delivery, supersedes prior
/// values, and is delivered even when the watch app isn't running (queued
/// for next launch).
///
/// Timing-safe: if push() is called before WCSession.activate() has
/// completed, we queue the context and replay it once activation lands.
/// Without this, the very first push (right after iPhone app launch) was
/// silently no-op'd because activation is asynchronous.
@MainActor
final class WatchSync: NSObject, WCSessionDelegate {
    static let shared = WatchSync()

    private var session: WCSession? {
        guard WCSession.isSupported() else { return nil }
        return WCSession.default
    }

    /// Last context push that was attempted. If WCSession wasn't activated
    /// yet, we hold onto this and re-send from the activation callback.
    private var pendingContext: [String: Any]?

    override init() {
        super.init()
        session?.delegate = self
        session?.activate()
    }

    /// Push the current session to the watch. Safe to call on every login,
    /// logout, foreground, and duty-state change — the system de-dupes
    /// identical contexts.
    func push(token: String?, apiBase: URL) {
        var ctx: [String: Any] = ["apiBase": apiBase.absoluteString]
        if let t = token, !t.isEmpty {
            ctx["token"] = t
        } else {
            // Explicit logout signal — the watch wipes its stored token.
            ctx["signedOut"] = true
        }

        guard let s = session else {
            print("WatchSync: WCSession not supported (not on iPhone?)")
            return
        }

        if s.activationState == .activated {
            sendContext(ctx, on: s)
        } else {
            // Will be replayed from activationDidCompleteWith.
            pendingContext = ctx
        }
    }

    private func sendContext(_ ctx: [String: Any], on s: WCSession) {
        do {
            try s.updateApplicationContext(ctx)
            print("WatchSync: pushed context (\(ctx.keys.sorted().joined(separator: ", ")))")
        } catch {
            print("WatchSync: push failed — \(error)")
        }
    }

    // MARK: - WCSessionDelegate
    //
    // Methods are nonisolated because WCSession calls them on its internal
    // queue, not the main actor. We hop back to the main actor inside if
    // we need to touch @MainActor state.

    nonisolated func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        if let error {
            print("WatchSync: activation error — \(error)")
        }
        // Replay any context that tried to push before activation.
        Task { @MainActor in
            guard activationState == .activated, let ctx = self.pendingContext else { return }
            self.pendingContext = nil
            self.sendContext(ctx, on: session)
        }
    }

    #if os(iOS)
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        // Required to support switching paired watches.
        session.activate()
    }
    #endif
}
