import SwiftUI

struct ActiveAlertsView: View {
    @State private var alerts: [WatchAPIClient.Alert] = []
    @State private var loading = true
    @State private var error: String?
    @State private var refreshTask: Task<Void, Never>?

    var body: some View {
        Group {
            if loading && alerts.isEmpty {
                ProgressView()
            } else if alerts.isEmpty {
                EmptyState()
            } else {
                List {
                    ForEach(alerts) { alert in
                        AlertRow(alert: alert,
                                 onAck: { Task { await acknowledge(alert.id) } })
                    }
                }
                .listStyle(.plain)
            }
        }
        .refreshable { await refresh() }
        .task {
            await refresh()
            // Auto-refresh every 30 s while the view is on screen — keeps the
            // wrist current without spamming the backend. Throttled to nothing
            // when the watch screen turns off (iOS suspends the task).
            refreshTask?.cancel()
            refreshTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 30_000_000_000)
                    await refresh()
                }
            }
        }
        .onDisappear { refreshTask?.cancel() }
    }

    private func refresh() async {
        loading = true
        defer { loading = false }
        do {
            alerts = try await WatchAPIClient.shared.fetchActiveAlerts()
            error = nil
        } catch {
            self.error = String(describing: error)
        }
    }

    private func acknowledge(_ id: String) async {
        // Optimistic: remove from list immediately, recover on failure.
        let snapshot = alerts
        alerts.removeAll { $0.id == id }
        do {
            try await WatchAPIClient.shared.acknowledgeAlert(id)
            // Soft refresh to pick up server-truth.
            await refresh()
            WKInterfaceHaptic.success()
        } catch {
            alerts = snapshot
            WKInterfaceHaptic.failure()
        }
    }
}

struct AlertRow: View {
    let alert: WatchAPIClient.Alert
    let onAck: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle()
                    .fill(alert.acknowledgedAt == nil ? Color.red : Color.orange)
                    .frame(width: 8, height: 8)
                Text(alert.zoneName ?? "Unknown zone")
                    .font(.headline)
                    .lineLimit(1)
            }
            if let building = alert.buildingName, let floor = alert.floorName {
                Text("\(building) · \(floor)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if alert.acknowledgedAt == nil {
                Button {
                    onAck()
                } label: {
                    Text("Acknowledge")
                        .font(.caption)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            } else {
                Text("Acknowledged")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 4)
    }
}

struct EmptyState: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(.green)
            Text("All clear")
                .font(.headline)
            Text("No active alerts")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

// MARK: - Haptic helper

import WatchKit

enum WKInterfaceHaptic {
    static func success() {
        WKInterfaceDevice.current().play(.success)
    }
    static func failure() {
        WKInterfaceDevice.current().play(.failure)
    }
}
