import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var alerts: [ActiveAlert] = []
    @State private var dispatches: [DispatchItem] = []
    @State private var hangers: [Hanger] = []
    @State private var error: String?
    @State private var refreshTask: Task<Void, Never>?
    @State private var showProfile = false
    /// Bumped every second to force re-evaluation of the offline computation
    /// even when the polled data is identical.
    @State private var tick = 0

    /// 15-second window matches the WiFi-Pi 5-second heartbeat (tolerates 2 misses).
    /// Combined with a 1-second tick, offline indicators flip within ~16s of a
    /// hanger going dark.
    private static let onlineWindow: TimeInterval = 15

    private var offlineHangerIds: Set<String> {
        let now = Date()
        var out = Set<String>()
        for h in hangers where h.status == .active {
            let seen = h.lastSeenAt
            let online = seen != nil && now.timeIntervalSince(seen!) <= Self.onlineWindow
            if !online { out.insert(h.id) }
        }
        return out
    }

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
                        let offlineSet = offlineHangerIds
                        ForEach(alerts) { alert in
                            NavigationLink(value: alert) {
                                AlertRow(alert: alert, hangerOffline: offlineSet.contains(alert.hangerId))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    // Only your own action items on Home. Admins and supervisors
                    // can still see the full org-wide list on the Dispatch tab.
                    let myId = auth.user?.id ?? ""
                    let active = dispatches.filter {
                        $0.status != .completed && $0.recipientUserId == myId
                    }
                    if !active.isEmpty {
                        sectionHeader("Your dispatches")
                        ForEach(active) { d in
                            DispatchRow(item: d) { kind in
                                Task { await act(on: d, kind: kind) }
                            }
                        }
                    }

                    // Scrollable feed of every floor plan in the org, mirroring
                    // the All-floor-plans block on the web dashboard. Pins use
                    // the same legend (red/blue/grey-?/green).
                    sectionHeader("Floor plans")
                    SiteFloorPlansFeed()
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
            // Hit the API every 5 seconds but bump `tick` every second so
            // the offline indicator flips purely from time elapsing.
            var i = 0
            while !Task.isCancelled {
                if i % 5 == 0 { await refresh() }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                tick &+= 1
                i += 1
            }
        }
    }

    private func refresh() async {
        do {
            async let alertsTask = APIClient.shared.activeAlerts()
            async let dispTask = APIClient.shared.dispatches()
            async let hangersTask = APIClient.shared.hangers()
            self.alerts = try await alertsTask
            self.dispatches = try await dispTask
            // Hangers are fetched only so we can flag "hanger offline" on
            // an alert. If the fetch fails we just don't show the indicator
            // — not worth blocking the whole refresh on.
            self.hangers = (try? await hangersTask) ?? self.hangers
            self.error = nil
            // Fire local notifications for any new alerts/dispatches we haven't seen
            LocalAlertNotifier.shared.observe(alerts: self.alerts, dispatches: self.dispatches)
        } catch APIError.unauthorized {
            // Don't yank the user back to login on a single 401 from a
            // polling refresh — a transient blip would otherwise destroy
            // their session. The bootstrap path on next app launch handles
            // a genuinely-expired token cleanly.
            self.error = "Couldn't refresh — tap to retry."
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
        } catch let APIError.http(_, body) {
            // Show the actual reason from the server so the user knows whether
            // the dispatch is theirs, already actioned, or something else.
            if body.contains("not_your_dispatch") {
                self.error = "This dispatch is assigned to a different user."
            } else if body.contains("already_acknowledged") {
                self.error = "Already accepted earlier."
            } else if body.contains("already_completed") {
                self.error = "Already marked done."
            } else if body.contains("dispatch_not_found") {
                self.error = "Dispatch was deleted."
            } else {
                self.error = "Could not action dispatch."
            }
        } catch {
            self.error = "Action failed."
        }
    }
}

enum DispatchAction { case acknowledge, complete }

private struct AlertRow: View {
    let alert: ActiveAlert
    var hangerOffline: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(alert.floorName ?? "Unknown floor") — \(alert.zoneName ?? "Unassigned")")
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                Text("Lifted \(alert.openedAt, style: .relative) ago · Status: \(alert.status.rawValue)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    statusBadge
                    if hangerOffline {
                        // The hanger that opened this alert hasn't phoned home
                        // recently — the spill might still be there but no
                        // automatic "returned" event will arrive to close it.
                        Text("HANGER OFFLINE")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Color.orange.opacity(0.18), in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.orange, style: StrokeStyle(lineWidth: 1, dash: [3])))
                            .foregroundStyle(Color.orange)
                    }
                }
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
