import SwiftUI

struct MapView: View {
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []
    @State private var alerts: [ActiveAlert] = []
    @State private var hangers: [Hanger] = []
    @State private var gateways: [Gateway] = []
    @State private var settings: AppSettings?

    @State private var selectedBuilding: Building?
    @State private var selectedFloor: Floor?
    /// Tapped hanger pin → drives the SensorDetailSheet.
    @State private var selectedHanger: Hanger?

    @State private var refreshTask: Task<Void, Never>?
    @State private var loadError: String?
    /// Bumped every second to force re-evaluation of the offline pins.
    @State private var tick = 0

    private var lowBatteryThreshold: Int { settings?.lowBatteryThreshold ?? 20 }

    /// Hangers that haven't phoned home within the online window. Per-hanger
    /// (not per-zone) so the map can flag an individual offline sign even when
    /// a sibling in the same zone is healthy.
    private var offlineHangerIds: Set<String> {
        let now = Date()
        var out = Set<String>()
        for h in hangers where h.status == .active {
            let fresh = h.lastSeenAt.map { now.timeIntervalSince($0) <= Self.onlineWindow } ?? false
            if !fresh { out.insert(h.id) }
        }
        return out
    }

    /// Hangers on the currently-selected floor (by zone membership).
    private var hangersOnFloor: [Hanger] {
        let floorZoneIds = Set(zones.map { $0.id })
        return hangers.filter { $0.zoneId.map(floorZoneIds.contains) ?? false }
    }

    /// Gateways located in the selected building (drawn distinctly on the plan
    /// card header so installers can see where the box lives).
    private var gatewaysInBuilding: [Gateway] {
        guard let b = selectedBuilding else { return [] }
        return gateways.filter { $0.buildingId == b.id }
    }

    /// The open alert (if any) on a given hanger's zone — used to deep-link the
    /// SensorDetailSheet to AlertDetailView.
    private func openAlert(for hanger: Hanger) -> ActiveAlert? {
        guard let zid = hanger.zoneId else { return nil }
        return alerts.first { $0.zoneId == zid && $0.status == .open && $0.kind == .spill }
    }

    /// Battery LoRa hangers deep-sleep + check in once a DAY: "online" = checked
    /// in within 26 h (one daily beat + 2 h margin). Lifting the sign wakes it
    /// instantly, so the spill pin appears immediately regardless of this.
    private static let onlineWindow: TimeInterval = 26 * 60 * 60

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    pickerCard
                    if let error = loadError {
                        Text(error).foregroundStyle(.red).font(.footnote)
                    }
                    if let floor = selectedFloor {
                        planCard(for: floor)
                        legend
                        zonesList
                    } else if !buildings.isEmpty {
                        Text("Pick a building and floor above to see the plan.")
                            .foregroundStyle(.secondary)
                            .font(.footnote)
                            .padding(.top, 4)
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle("Map")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await refresh() }
            .task { await loadInitial() }
            .onAppear { startPolling() }
            .onDisappear { refreshTask?.cancel() }
            .sheet(item: $selectedHanger) { hanger in
                SensorDetailSheet(
                    hanger: hanger,
                    zoneName: zones.first(where: { $0.id == hanger.zoneId })?.name,
                    floorName: selectedFloor?.name,
                    openAlert: openAlert(for: hanger),
                    lowBatteryThreshold: lowBatteryThreshold)
            }
        }
    }

    // MARK: subviews

    private var pickerCard: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Building")
                    .frame(width: 80, alignment: .leading)
                    .foregroundStyle(.secondary)
                Picker("Building", selection: Binding(
                    get: { selectedBuilding?.id ?? "" },
                    set: { newId in
                        selectedBuilding = buildings.first(where: { $0.id == newId })
                        selectedFloor = nil
                        Task { await refreshFloors() }
                    }
                )) {
                    Text("—").tag("")
                    ForEach(buildings) { b in Text(b.name).tag(b.id) }
                }
                .labelsHidden()
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            Divider()
            HStack {
                Text("Floor")
                    .frame(width: 80, alignment: .leading)
                    .foregroundStyle(.secondary)
                Picker("Floor", selection: Binding(
                    get: { selectedFloor?.id ?? "" },
                    set: { newId in
                        selectedFloor = floors.first(where: { $0.id == newId })
                        Task { await refreshZonesForFloor() }
                    }
                )) {
                    Text("—").tag("")
                    ForEach(floors) { f in Text(f.name).tag(f.id) }
                }
                .labelsHidden()
                .disabled(selectedBuilding == nil)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
        }
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func planCard(for floor: Floor) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(floor.name).font(.headline)
                Spacer()
                // Gateways live per-building, not per-floor, so we surface them
                // as a distinct marker + count on the card header rather than
                // pinning them onto a specific floor's plan.
                if !gatewaysInBuilding.isEmpty {
                    Label("\(gatewaysInBuilding.count) gateway\(gatewaysInBuilding.count == 1 ? "" : "s")",
                          systemImage: "wifi.router")
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color.indigo.opacity(0.12), in: Capsule())
                        .foregroundStyle(.indigo)
                }
            }
            if let urlString = floor.floorPlanUrl, let url = assetURL(urlString) {
                HangerFloorPlan(
                    planURL: url,
                    zones: zones,
                    hangers: hangersOnFloor,
                    liftedSpillZoneIds: liftedSpillZoneIds,
                    offlineHangerIds: offlineHangerIds,
                    lowBatteryThreshold: lowBatteryThreshold,
                    onSelect: { selectedHanger = $0 })
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 240)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            } else {
                Text("No floor plan uploaded for this floor yet. Upload one from the web admin.")
                    .foregroundStyle(.secondary)
                    .font(.footnote)
                    .padding(20)
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(12)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private var legend: some View {
        HStack(spacing: 14) {
            legendItem(color: .green,  text: "On rack")
            legendItem(color: .red,    text: "Lifted")
            legendItem(color: .orange, text: "Offline")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.leading, 4)
    }

    private func legendItem(color: Color, text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text)
        }
    }

    private var zonesList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(zones) { z in
                HStack {
                    Circle()
                        .fill(zonePinColor(z))
                        .frame(width: 10, height: 10)
                    Text(z.name)
                    Spacer()
                    Text(zonePinLabel(z))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                if z.id != zones.last?.id { Divider().padding(.leading, 36) }
            }
        }
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func zonePinColor(_ z: Zone) -> Color {
        switch alertStatusByZoneId[z.id] {
        case .open:         return .red
        case .acknowledged: return .blue
        default:            return .green
        }
    }
    private func zonePinLabel(_ z: Zone) -> String {
        switch alertStatusByZoneId[z.id] {
        case .open:         return "ALERT"
        case .acknowledged: return "Cleaning"
        default:            return "Idle"
        }
    }

    private var alertStatusByZoneId: [String: AlertStatus] {
        var map: [String: AlertStatus] = [:]
        for a in alerts where a.zoneId != nil && a.status != .closed {
            map[a.zoneId!] = a.status
        }
        return map
    }

    /// Zones with an active *spill* (the sign was lifted). Kind-aware so a
    /// planned-cleaning alert doesn't drive the lifted pin, and open *or*
    /// acknowledged both count — an acknowledged spill is still being cleaned,
    /// so its sign is still lifted. Matches `openAlert(for:)`'s deep-link filter.
    private var liftedSpillZoneIds: Set<String> {
        var ids = Set<String>()
        for a in alerts where a.kind == .spill && (a.status == .open || a.status == .acknowledged) {
            if let zid = a.zoneId { ids.insert(zid) }
        }
        return ids
    }

    // MARK: data

    private func loadInitial() async {
        do {
            buildings = try await APIClient.shared.buildings()
            if selectedBuilding == nil, let first = buildings.first {
                selectedBuilding = first
                await refreshFloors()
            }
            await refreshAlerts()
            await refreshHangers()
            // Gateways + settings change rarely — load once, not on every tick.
            gateways = (try? await APIClient.shared.gateways()) ?? []
            settings = try? await APIClient.shared.appSettings()
        } catch {
            loadError = "Could not load buildings."
        }
    }

    private func refresh() async {
        await refreshAlerts()
        if selectedFloor != nil { await refreshZonesForFloor() }
    }

    private func refreshFloors() async {
        guard let b = selectedBuilding else { floors = []; zones = []; return }
        do {
            floors = try await APIClient.shared.floors(buildingId: b.id).sorted { $0.orderIndex < $1.orderIndex }
            if selectedFloor == nil, let first = floors.first(where: { $0.floorPlanUrl != nil }) ?? floors.first {
                selectedFloor = first
                await refreshZonesForFloor()
            }
        } catch {
            loadError = "Could not load floors."
        }
    }

    private func refreshZonesForFloor() async {
        guard let f = selectedFloor else { zones = []; return }
        do {
            zones = try await APIClient.shared.zones(floorId: f.id)
        } catch {
            loadError = "Could not load zones."
        }
    }

    private func refreshAlerts() async {
        do {
            alerts = try await APIClient.shared.activeAlerts()
        } catch {
            // non-fatal — keep last known
        }
    }

    private func startPolling() {
        refreshTask?.cancel()
        refreshTask = Task {
            // Tick every second so the offline pin flips the moment the
            // 15-second silence threshold is crossed. Hit the API every 5s
            // to keep alerts + hanger lastSeenAt fresh.
            var i = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                tick &+= 1
                i += 1
                if i % 5 == 0 {
                    await refreshAlerts()
                    await refreshHangers()
                }
            }
        }
    }

    private func refreshHangers() async {
        if let h = try? await APIClient.shared.hangers() {
            self.hangers = h
        }
    }
}

