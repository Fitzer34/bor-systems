import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var alerts: [ActiveAlert] = []
    @State private var dispatches: [DispatchItem] = []
    @State private var error: String?
    @State private var refreshTask: Task<Void, Never>?
    @State private var showProfile = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let error = error {
                        Text(error).foregroundStyle(.red).font(.footnote)
                    }

                    sectionHeader("Active alerts")
                    if alerts.isEmpty {
                        emptyCard("No active spill alerts.")
                    } else {
                        ForEach(alerts) { alert in
                            NavigationLink(value: alert) {
                                AlertRow(alert: alert)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    let active = dispatches.filter { $0.status != .completed }
                    if !active.isEmpty {
                        sectionHeader("Dispatches")
                        ForEach(active) { d in
                            DispatchRow(item: d) { kind in
                                Task { await act(on: d, kind: kind) }
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: ActiveAlert.self) { alert in
                AlertDetailView(alert: alert) {
                    await refresh()
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let user = auth.user {
                        DutySwitch(isOn: user.onDuty) { newValue in
                            Task { await auth.setOnDuty(newValue) }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showProfile = true
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                }
            }
            .refreshable { await refresh() }
            .sheet(isPresented: $showProfile) {
                ProfileSheet()
                    .environmentObject(auth)
            }
            .task { startPolling() }
            .onDisappear { refreshTask?.cancel() }
        }
    }

    private var navigationTitle: String {
        guard let u = auth.user else { return "BOR Systems" }
        return "\(u.name) · \(u.role.rawValue)"
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.title3.weight(.semibold))
            .padding(.top, 4)
    }

    private func emptyCard(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
            .padding(24)
            .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color(.separator), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
            )
    }

    private func startPolling() {
        refreshTask?.cancel()
        refreshTask = Task {
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    private func refresh() async {
        do {
            async let alertsTask = APIClient.shared.activeAlerts()
            async let dispTask = APIClient.shared.dispatches()
            self.alerts = try await alertsTask
            self.dispatches = try await dispTask
            self.error = nil
        } catch APIError.unauthorized {
            auth.logout()
        } catch {
            self.error = "Could not refresh."
        }
    }

    private func act(on d: DispatchItem, kind: DispatchAction) async {
        do {
            switch kind {
            case .acknowledge: try await APIClient.shared.acknowledgeDispatch(d.id)
            case .complete:    try await APIClient.shared.completeDispatch(d.id)
            }
            await refresh()
        } catch {
            self.error = "Action failed."
        }
    }
}

enum DispatchAction { case acknowledge, complete }

private struct AlertRow: View {
    let alert: ActiveAlert

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(alert.floorName ?? "Unknown floor") — \(alert.zoneName ?? "Unassigned")")
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                Text("Lifted \(alert.openedAt, style: .relative) ago · Status: \(alert.status.rawValue)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                statusBadge
            }
            Spacer(minLength: 8)
            AlertFloorPlanThumb(floorId: alert.floorId, alertedZoneId: alert.zoneId, status: alert.status)
        }
        .padding(14)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(borderColor, lineWidth: 1)
        )
    }

    private var borderColor: Color {
        alert.status == .open ? Color.red.opacity(0.45) : Color.orange.opacity(0.45)
    }

    @ViewBuilder
    private var statusBadge: some View {
        let label = alert.status == .open ? "UNACK" : "IN PROGRESS"
        let color: Color = alert.status == .open ? .red : .orange
        Text(label)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(color.opacity(0.12), in: Capsule())
            .foregroundStyle(color)
    }
}

private struct DispatchRow: View {
    let item: DispatchItem
    let onAction: (DispatchAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(item.zoneName.map { "Go to: \($0)" } ?? "Dispatch")
                .font(.body.weight(.medium))
            Text(item.message)
                .foregroundStyle(.primary)
            Text("Sent \(item.sentAt, style: .relative) ago · Status: \(item.status.rawValue)")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                if item.status == .sent {
                    Button("On my way") { onAction(.acknowledge) }
                        .buttonStyle(.borderedProminent)
                        .tint(.blue)
                }
                if item.status != .completed {
                    Button("Mark done") { onAction(.complete) }
                        .buttonStyle(.bordered)
                }
            }
        }
        .padding(14)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.blue.opacity(0.45), lineWidth: 1)
        )
    }
}
