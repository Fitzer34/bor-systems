import SwiftUI
import WatchKit

/// The main view on the watch — list of active alerts with "I'm on it"
/// (acknowledge) and "It's done" (close) buttons.
///
/// Visible error reporting: when something goes wrong (no token, decode
/// failure, server error) the error message shows up in the UI so we can
/// actually see what's broken instead of staring at "All clear".
struct ActiveAlertsView: View {
    @State private var alerts: [WatchAPIClient.Alert] = []
    @State private var loading = true
    @State private var error: String?
    @State private var refreshTask: Task<Void, Never>?

    var body: some View {
        Group {
            if let err = error, alerts.isEmpty {
                ErrorState(message: err, onRetry: { Task { await refresh() } })
            } else if loading && alerts.isEmpty {
                ProgressView()
            } else if alerts.isEmpty {
                EmptyState()
            } else {
                List {
                    ForEach(alerts) { alert in
                        AlertRow(
                            alert: alert,
                            onAck:   { Task { await acknowledge(alert.id) } },
                            onClose: { Task { await close(alert.id) } })
                    }
                }
                .listStyle(.plain)
            }
        }
        .refreshable { await refresh() }
        .task {
            await refresh()
            // Auto-refresh every 15 s while view is on screen. Keeps the
            // wrist current without spamming the backend. Suspended when
            // the watch screen turns off.
            refreshTask?.cancel()
            refreshTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 15_000_000_000)
                    await refresh()
                }
            }
        }
        .onDisappear { refreshTask?.cancel() }
    }

    // MARK: - Networking

    private func refresh() async {
        loading = true
        defer { loading = false }
        do {
            alerts = try await WatchAPIClient.shared.fetchActiveAlerts()
            self.error = nil
        } catch let e as WatchAPIError {
            // Swift's bare `catch` shadows the outer name `error` with the
            // implicit any-Error binding — disambiguate with self.
            self.error = e.errorDescription
        } catch let other {
            self.error = String(describing: other)
        }
    }

    private func acknowledge(_ id: String) async {
        // Optimistic: flip local row to acknowledged immediately, fall back
        // to server-truth on the next refresh.
        if let i = alerts.firstIndex(where: { $0.id == id }) {
            let cur = alerts[i]
            alerts[i] = WatchAPIClient.Alert(
                id: cur.id, kind: cur.kind, status: "acknowledged",
                zoneName: cur.zoneName, floorName: cur.floorName)
        }
        do {
            try await WatchAPIClient.shared.acknowledgeAlert(id)
            WKInterfaceDevice.current().play(.success)
            await refresh()
        } catch let e as WatchAPIError {
            self.error = e.errorDescription
            WKInterfaceDevice.current().play(.failure)
            await refresh()
        } catch {
            WKInterfaceDevice.current().play(.failure)
        }
    }

    private func close(_ id: String) async {
        // Optimistic: drop from the list immediately.
        let snapshot = alerts
        alerts.removeAll { $0.id == id }
        do {
            try await WatchAPIClient.shared.closeAlert(id)
            WKInterfaceDevice.current().play(.success)
            await refresh()
        } catch let e as WatchAPIError {
            alerts = snapshot
            self.error = e.errorDescription
            WKInterfaceDevice.current().play(.failure)
        } catch {
            alerts = snapshot
            WKInterfaceDevice.current().play(.failure)
        }
    }
}

// MARK: - Row

struct AlertRow: View {
    let alert: WatchAPIClient.Alert
    let onAck: () -> Void
    let onClose: () -> Void

    private var isAcknowledged: Bool {
        (alert.status ?? "open") == "acknowledged"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle()
                    .fill(isAcknowledged ? Color.orange : Color.red)
                    .frame(width: 9, height: 9)
                Text(alert.zoneName ?? "Unknown zone")
                    .font(.headline)
                    .lineLimit(1)
            }
            if let floor = alert.floorName {
                Text(floor)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            if isAcknowledged {
                Button {
                    onClose()
                } label: {
                    Label("It's done", systemImage: "checkmark.circle.fill")
                        .font(.caption)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            } else {
                Button {
                    onAck()
                } label: {
                    Label("I'm on it", systemImage: "hand.raised.fill")
                        .font(.caption)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - States

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

struct ErrorState: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.orange)
                Text("Couldn't load alerts")
                    .font(.headline)
                Text(message)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Retry", action: onRetry)
                    .buttonStyle(.borderedProminent)
            }
            .padding()
        }
    }
}
