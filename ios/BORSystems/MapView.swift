import SwiftUI

struct MapView: View {
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []
    @State private var alerts: [ActiveAlert] = []

    @State private var selectedBuilding: Building?
    @State private var selectedFloor: Floor?

    @State private var refreshTask: Task<Void, Never>?
    @State private var loadError: String?

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
            Text(floor.name).font(.headline)
            if let urlString = floor.floorPlanUrl, let url = assetURL(urlString) {
                FloorPlanWithPins(planURL: url, zones: zones, alertedStatusByZoneId: alertStatusByZoneId)
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
            legendItem(color: .red,   text: "Alert")
            legendItem(color: .blue,  text: "Cleaning")
            legendItem(color: .green, text: "Idle")
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

    // MARK: data

    private func loadInitial() async {
        do {
            buildings = try await APIClient.shared.buildings()
            if selectedBuilding == nil, let first = buildings.first {
                selectedBuilding = first
                await refreshFloors()
            }
            await refreshAlerts()
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
            while !Task.isCancelled {
                await refreshAlerts()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }
}

