import SwiftUI

struct AlertDetailView: View {
    let alert: ActiveAlert
    let onChange: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var isWorking = false
    @State private var error: String?
    @State private var floor: Floor?
    @State private var zones: [Zone] = []
    @State private var hangers: [Hanger] = []
    @State private var refreshTask: Task<Void, Never>?
    /// Bumped every second so the offline pin updates live.
    @State private var tick = 0

    /// Battery LoRa hangers deep-sleep + heartbeat hourly, so "online" =
    /// checked in within 75 min (one beat + margin). A lifted sign wakes the
    /// hanger instantly, so the spill alert itself never waits on this.
    private static let onlineWindow: TimeInterval = 75 * 60

    private var offlineZoneIds: Set<String> {
        let now = Date()
        var byZone: [String: [Hanger]] = [:]
        for h in hangers where h.zoneId != nil && h.status == .active {
            byZone[h.zoneId!, default: []].append(h)
        }
        var out = Set<String>()
        for (zid, list) in byZone {
            let fresh = list.contains { h in
                guard let last = h.lastSeenAt else { return false }
                return now.timeIntervalSince(last) <= Self.onlineWindow
            }
            if !fresh { out.insert(zid) }
        }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("\(alert.floorName ?? "Unknown floor") — \(alert.zoneName ?? "Unassigned")")
                    .font(.title3.weight(.semibold))
                Text("Opened \(alert.openedAt, style: .relative) ago · Status: \(alert.status.rawValue)")
                    .foregroundStyle(.secondary)

                locationCard

                if alert.status == .open {
                    Button {
                        Task { await acknowledge() }
                    } label: {
                        Text("I'm on it")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .background(Color.blue, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.white)
                    .disabled(isWorking)
                }

                Text("Optional note (logged with closure)")
                    .font(.caption).foregroundStyle(.secondary)
                TextEditor(text: $note)
                    .frame(minHeight: 80)
                    .padding(8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))

                HStack(spacing: 12) {
                    closeButton(title: "Sign damaged", color: .orange, reason: .signDamaged)
                    closeButton(title: "Sign missing", color: .red,    reason: .signMissing)
                }

                Button {
                    Task { await close(reason: .manual) }
                } label: {
                    Text("Manually close")
                        .font(.footnote)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .foregroundStyle(.secondary)

                if let error = error {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }

                Text("The alert auto-closes when the sign is physically replaced on the hanger.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Alert")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadLocation()
            await refreshHangers()
            refreshTask?.cancel()
            refreshTask = Task {
                var i = 0
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    tick &+= 1
                    i += 1
                    if i % 5 == 0 { await refreshHangers() }
                }
            }
        }
        .onDisappear { refreshTask?.cancel() }
    }

    private func refreshHangers() async {
        if let h = try? await APIClient.shared.hangers() {
            self.hangers = h
        }
    }

    @ViewBuilder
    private var locationCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Location").font(.headline)
            if let floor = floor, let urlString = floor.floorPlanUrl, let url = assetURL(urlString) {
                let statusByZoneId: [String: AlertStatus] = alert.zoneId.map { [$0: alert.status] } ?? [:]
                FloorPlanWithPins(planURL: url, zones: zones, alertedStatusByZoneId: statusByZoneId, offlineZoneIds: offlineZoneIds)
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
            } else if alert.floorId == nil {
                Text("This hanger isn't assigned to a zone yet.")
                    .font(.footnote).foregroundStyle(.secondary)
            } else {
                Text("No floor plan uploaded for this floor yet.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private func loadLocation() async {
        guard let id = alert.floorId else { return }
        async let f = APIClient.shared.floor(id)
        async let z = APIClient.shared.zones(floorId: id)
        self.floor = try? await f
        self.zones = (try? await z) ?? []
    }

    private func closeButton(title: String, color: Color, reason: CloseReason) -> some View {
        Button {
            Task { await close(reason: reason) }
        } label: {
            Text(title)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
        .foregroundStyle(color)
        .disabled(isWorking)
    }

    private func acknowledge() async {
        guard !isWorking else { return }
        isWorking = true; error = nil
        do {
            try await APIClient.shared.acknowledgeAlert(alert.id)
            await onChange()
        } catch {
            self.error = "Could not acknowledge — already acknowledged or closed."
        }
        isWorking = false
    }

    private func close(reason: CloseReason) async {
        guard !isWorking else { return }
        isWorking = true; error = nil
        do {
            try await APIClient.shared.closeAlert(alert.id, reason: reason, note: note.isEmpty ? nil : note)
            await onChange()
            dismiss()
        } catch {
            self.error = "Could not close alert."
        }
        isWorking = false
    }
}
