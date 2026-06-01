import SwiftUI

/// A scrollable list of every floor plan in the org. Each card shows the
/// floor plan image with pins overlayed:
///   - red pulsing  → open alert
///   - blue pulsing → acknowledged (cleaning in progress)
///   - grey "?"     → hanger offline
///   - green        → idle
///
/// Mirrors the SiteFloorPlansOverview component on the web Dashboard.
/// Floors are ordered by `orderIndex`, which admins can change from the
/// web Floor plans page — that ordering flows through here automatically.
struct SiteFloorPlansFeed: View {
    @State private var items: [FloorBundle] = []
    @State private var alerts: [ActiveAlert] = []
    @State private var hangers: [Hanger] = []
    @State private var loadError: String?
    @State private var didInitialLoad = false
    @State private var refreshTask: Task<Void, Never>?
    /// Bumped every second to force re-evaluation of offline pins between fetches.
    @State private var tick = 0

    /// Battery LoRa hangers deep-sleep + check in once a DAY: "online" = checked
    /// in within 26 h (one daily beat + 2 h margin). Lifting the sign wakes it
    /// instantly, so spill pins still appear immediately regardless of this.
    private static let onlineWindow: TimeInterval = 26 * 60 * 60

    struct FloorBundle: Identifiable {
        let id: String
        let building: Building
        let floor: Floor
        let zones: [Zone]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if items.isEmpty && didInitialLoad {
                Text("No floor plans uploaded yet. An admin can upload them on the web dashboard.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Color(.separator), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
                    )
            }

            ForEach(items) { item in
                FloorCard(item: item,
                          statusByZoneId: alertStatusByZoneId,
                          offlineZoneIds: offlineZoneIds)
            }
        }
        .task {
            await refresh()
            refreshTask?.cancel()
            refreshTask = Task {
                var i = 0
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    tick &+= 1
                    i += 1
                    // Refetch every 5 seconds; tick re-renders every second.
                    if i % 5 == 0 { await refresh() }
                }
            }
        }
        .onDisappear { refreshTask?.cancel() }
    }

    // MARK: derived state

    private var alertStatusByZoneId: [String: AlertStatus] {
        var map: [String: AlertStatus] = [:]
        for a in alerts where a.zoneId != nil && a.status != .closed {
            map[a.zoneId!] = a.status
        }
        return map
    }

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

    // MARK: data

    func refresh() async {
        do {
            async let alertsTask = APIClient.shared.activeAlerts()
            async let hangersTask = APIClient.shared.hangers()
            async let buildingsTask = APIClient.shared.buildings()
            self.alerts = (try? await alertsTask) ?? self.alerts
            self.hangers = (try? await hangersTask) ?? self.hangers
            let buildings = try await buildingsTask

            // Walk every building → floor → zone and collect those with a plan.
            // Sequential per-building keeps the load order predictable but we
            // could parallelise if it gets slow with many buildings.
            var out: [FloorBundle] = []
            for b in buildings {
                let floors = (try? await APIClient.shared.floors(buildingId: b.id)) ?? []
                let sorted = floors.sorted { $0.orderIndex < $1.orderIndex }
                for f in sorted where (f.floorPlanUrl != nil && !f.floorPlanUrl!.isEmpty) {
                    let zones = (try? await APIClient.shared.zones(floorId: f.id)) ?? []
                    out.append(FloorBundle(id: f.id, building: b, floor: f, zones: zones))
                }
            }
            self.items = out
            self.loadError = nil
            self.didInitialLoad = true
        } catch {
            self.loadError = "Could not load floor plans."
            self.didInitialLoad = true
        }
    }
}

private struct FloorCard: View {
    let item: SiteFloorPlansFeed.FloorBundle
    let statusByZoneId: [String: AlertStatus]
    let offlineZoneIds: Set<String>

    var body: some View {
        let pinned = item.zones.filter { $0.pinX != nil && $0.pinY != nil }
        let alertedHere = pinned.filter { statusByZoneId[$0.id] != nil }
        let offlineHere = pinned.filter { statusByZoneId[$0.id] == nil && offlineZoneIds.contains($0.id) }
        let hasOpen = alertedHere.contains { statusByZoneId[$0.id] == .open }
        let hasAck = alertedHere.contains { statusByZoneId[$0.id] == .acknowledged }

        let borderColor: Color = hasOpen ? Color.red.opacity(0.45)
            : hasAck ? Color.orange.opacity(0.45)
            : Color(.separator)

        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.floor.name).font(.subheadline.weight(.semibold))
                    Text(item.building.name).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                HStack(spacing: 6) {
                    if !alertedHere.isEmpty {
                        Text("\(alertedHere.count) active")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Color.red.opacity(0.15), in: Capsule())
                            .foregroundStyle(.red)
                    }
                    if !offlineHere.isEmpty {
                        Text("\(offlineHere.count) offline")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Color.orange.opacity(0.15), in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.orange, style: StrokeStyle(lineWidth: 1, dash: [3])))
                            .foregroundStyle(Color.orange)
                    }
                    Text("\(pinned.count) zone\(pinned.count == 1 ? "" : "s")")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            Divider()

            // Plan image
            if let urlString = item.floor.floorPlanUrl, let url = assetURL(urlString) {
                FloorPlanWithPins(planURL: url,
                                  zones: item.zones,
                                  alertedStatusByZoneId: statusByZoneId,
                                  offlineZoneIds: offlineZoneIds)
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground))
            }
        }
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(borderColor, lineWidth: 1)
        )
    }
}
