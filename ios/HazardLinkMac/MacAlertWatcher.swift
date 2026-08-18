import Foundation
import Combine
import UserNotifications

/// Polls the live spill alerts for the menu-bar extra and posts a native
/// macOS notification the first time a new open spill appears — so a
/// supervisor at their desk hears about a wet floor even with the window
/// hidden. Polls every 20 s while signed in; nothing is invented, only what
/// the backend reports.
@MainActor
final class MacAlertWatcher: ObservableObject {
    @Published private(set) var alerts: [ActiveAlert] = []
    @Published private(set) var openSpills: Int = 0
    @Published private(set) var lastError: String?

    private var timer: Timer?
    private var seen = Set<String>()
    private var primed = false

    func start() {
        stop()
        Task { await tick() }
        timer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.tick() }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func tick() async {
        do {
            let all = try await APIClient.shared.activeAlerts()
            let spills = all.filter { $0.kind == .spill }
            alerts = spills.sorted { $0.openedAt > $1.openedAt }
            openSpills = spills.filter { $0.status != .closed }.count
            lastError = nil

            // Notify only for spills that appeared since the last poll; the
            // very first poll just primes the set (no notification storm on
            // launch for alerts that were already open).
            let ids = Set(spills.map(\.id))
            if primed {
                for a in spills where !seen.contains(a.id) && a.status == .open {
                    notify(a)
                }
            }
            seen = ids
            primed = true
        } catch {
            lastError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func notify(_ a: ActiveAlert) {
        let content = UNMutableNotificationContent()
        content.title = "Spill alert"
        content.body = [a.floorName, a.zoneName].compactMap { $0 }.joined(separator: " · ")
        if content.body.isEmpty { content.body = "A smart sign was lifted." }
        content.sound = .default
        let req = UNNotificationRequest(identifier: "spill-" + a.id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }
}
