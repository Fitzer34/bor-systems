import Foundation
import WatchConnectivity

/// Bridges the iPhone's logged-in session to the watch.
///
/// The iPhone app calls `WCSession.updateApplicationContext(["token": jwt,
/// "apiBase": "https://..."])` whenever auth state changes. WatchConnectivity
/// delivers it to the watch — even when the watch app isn't running, it'll
/// be present on next launch.
///
/// Token is persisted in the watch's UserDefaults so the watch app keeps
/// working when the iPhone is out of Bluetooth range. The watch hits the
/// backend directly over LTE/Wi-Fi using its own URLSession.
final class WatchAuthStore: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchAuthStore()

    @Published private(set) var token: String?
    @Published private(set) var apiBase: String =
        "https://bor-systems-backend.onrender.com"

    private let session: WCSession? =
        WCSession.isSupported() ? WCSession.default : nil

    override init() {
        super.init()
        // Re-hydrate from disk so the watch isn't "logged out" on cold launch.
        self.token   = UserDefaults.standard.string(forKey: "bor.token")
        if let stored = UserDefaults.standard.string(forKey: "bor.apiBase"),
           !stored.isEmpty {
            self.apiBase = stored
        }
    }

    func activateSession() {
        session?.delegate = self
        session?.activate()
    }

    // MARK: – WCSessionDelegate

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {
        // Application context may already have been delivered before
        // activation completed — pick it up now.
        if let ctx = session.receivedApplicationContext as [String: Any]? {
            apply(ctx)
        }
    }

    func session(_ session: WCSession,
                 didReceiveApplicationContext applicationContext: [String : Any]) {
        DispatchQueue.main.async { self.apply(applicationContext) }
    }

    func session(_ session: WCSession,
                 didReceiveMessage message: [String : Any]) {
        DispatchQueue.main.async { self.apply(message) }
    }

    private func apply(_ ctx: [String: Any]) {
        if let t = ctx["token"] as? String {
            UserDefaults.standard.set(t, forKey: "bor.token")
            self.token = t
        }
        if let b = ctx["apiBase"] as? String, !b.isEmpty {
            UserDefaults.standard.set(b, forKey: "bor.apiBase")
            self.apiBase = b
        }
        // iPhone sends {"signedOut": true} on logout — wipe local state.
        if (ctx["signedOut"] as? Bool) == true {
            UserDefaults.standard.removeObject(forKey: "bor.token")
            self.token = nil
        }
    }
}
