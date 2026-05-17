import SwiftUI

struct HangersView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var hangers: [Hanger] = []
    @State private var settings: AppSettings?
    @State private var zoneById: [String: (zone: Zone, floor: String, building: String)] = [:]
    @State private var error: String?
    @State private var showRegister = false
    @State private var showAddHanger = false
    @State private var refreshTask: Task<Void, Never>?
    // Re-render every second so the Online/Offline badge flips the instant
    // the 15-second silence threshold is crossed.
    @State private var tick = 0

    var body: some View {
        List {
            if hangers.isEmpty {
                Text("No hangers registered yet.").foregroundStyle(.secondary)
            }
            ForEach(hangers) { h in
                HangerRow(hanger: h, lowBatteryThreshold: settings?.lowBatteryThreshold ?? 20,
                          locationLabel: location(for: h))
                    .swipeActions {
                        if auth.user?.role == .admin {
                            if h.status == .decommissioned {
                                Button("Recommission") { Task { await recommission(h) } }.tint(.green)
                            } else {
                                Button("Decommission") { Task { await decommission(h) } }.tint(.red)
                            }
                        }
                    }
            }
            if let err = error {
                Section { Text(err).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Hangers")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if auth.user?.role == .admin {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            showAddHanger = true
                        } label: {
                            Label("Set up a new hanger via Bluetooth", systemImage: "antenna.radiowaves.left.and.right")
                        }
                        Button {
                            showRegister = true
                        } label: {
                            Label("Register an existing hanger (DevEUI)", systemImage: "number")
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showRegister) {
            RegisterHangerSheet { Task { await refresh() } }
                .environmentObject(auth)
        }
        .sheet(isPresented: $showAddHanger) {
            AddHangerView()
        }
        .refreshable { await refresh() }
        .task {
            await refresh()
            // Continuous background refresh every 5s while view is on screen,
            // plus a per-second tick so badges flip purely from time passing.
            refreshTask?.cancel()
            refreshTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    tick &+= 1
                    if tick % 5 == 0 { await refresh() }
                }
            }
        }
        .onDisappear { refreshTask?.cancel() }
    }

    private func location(for h: Hanger) -> String {
        guard let zid = h.zoneId, let entry = zoneById[zid] else { return "Unassigned" }
        return "\(entry.building) / \(entry.floor) / \(entry.zone.name)"
    }

    private func refresh() async {
        do {
            async let hangersTask = APIClient.shared.hangers()
            async let settingsTask = APIClient.shared.appSettings()
            async let buildingsTask = APIClient.shared.buildings()
            self.hangers = try await hangersTask
            self.settings = try await settingsTask
            let buildings = try await buildingsTask
            // Build the zone map for display
            var map: [String: (zone: Zone, floor: String, building: String)] = [:]
            for b in buildings {
                let floors = (try? await APIClient.shared.floors(buildingId: b.id)) ?? []
                for f in floors {
                    let zones = (try? await APIClient.shared.zones(floorId: f.id)) ?? []
                    for z in zones { map[z.id] = (z, f.name, b.name) }
                }
            }
            self.zoneById = map
        } catch {
            self.error = "Could not load hangers."
        }
    }

    private func decommission(_ h: Hanger) async {
        do { try await APIClient.shared.decommissionHanger(h.id); await refresh() }
        catch { self.error = "Failed." }
    }
    private func recommission(_ h: Hanger) async {
        do { try await APIClient.shared.recommissionHanger(h.id); await refresh() }
        catch { self.error = "Failed." }
    }
}

private struct HangerRow: View {
    let hanger: Hanger
    let lowBatteryThreshold: Int
    let locationLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(hanger.devEui).font(.system(.body, design: .monospaced))
                Spacer()
                statusBadge
            }
            Text(locationLabel).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 14) {
                if let pct = hanger.batteryPct {
                    let low = pct <= lowBatteryThreshold
                    Label("\(pct)%", systemImage: "battery.\(batteryIcon(pct))")
                        .foregroundStyle(low ? .red : .secondary)
                        .font(.caption)
                } else {
                    Label("—", systemImage: "battery.0").foregroundStyle(.secondary).font(.caption)
                }
                if let last = hanger.lastSeenAt {
                    Label(relativeTime(from: last), systemImage: "clock")
                        .foregroundStyle(.secondary)
                        .font(.caption)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func batteryIcon(_ pct: Int) -> String {
        switch pct {
        case 76...: return "100"
        case 51...: return "75"
        case 26...: return "50"
        case 1...:  return "25"
        default:    return "0"
        }
    }

    /// "Online" if the hanger has phoned home within the last 15 seconds.
    /// WiFi-Pi hangers heartbeat every 5 seconds, so 15 seconds tolerates
    /// two missed beats. Combined with the 1-second tick driven by the
    /// parent HangersView, the badge flips within ~16 seconds of going dark.
    /// Battery LoRa hangers will need a longer threshold once we ship them.
    private static let onlineWindow: TimeInterval = 15

    @ViewBuilder
    private var statusBadge: some View {
        let (label, color): (String, Color) = {
            // Lifecycle states take priority — a decommissioned hanger
            // shouldn't show "online" even if it just phoned home.
            switch hanger.status {
            case .outOfService:   return ("out of service", .orange)
            case .decommissioned: return ("decommissioned", .gray)
            case .active:
                if let seen = hanger.lastSeenAt,
                   Date().timeIntervalSince(seen) <= Self.onlineWindow {
                    return ("Online", .green)
                }
                // Amber so it stands out from healthy green without competing
                // with red alert pulses for attention.
                return ("Offline", .orange)
            }
        }()
        Text(label).font(.caption2.weight(.medium))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}

private struct RegisterHangerSheet: View {
    let onCreated: () -> Void
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var devEui = ""
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []
    @State private var buildingId = ""
    @State private var floorId = ""
    @State private var zoneId = ""
    @State private var audibleAlarm = false
    @State private var creating = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Device") {
                    TextField("DevEUI (16 hex)", text: $devEui)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.system(.body, design: .monospaced))
                }
                Section("Zone (optional)") {
                    Picker("Building", selection: $buildingId) {
                        Text("—").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }.onChange(of: buildingId) { newValue in
                        floorId = ""; zoneId = ""; floors = []; zones = []
                        if !newValue.isEmpty { Task { floors = (try? await APIClient.shared.floors(buildingId: newValue).sorted { $0.orderIndex < $1.orderIndex }) ?? [] } }
                    }
                    Picker("Floor", selection: $floorId) {
                        Text("—").tag("")
                        ForEach(floors) { f in Text(f.name).tag(f.id) }
                    }
                    .disabled(buildingId.isEmpty)
                    .onChange(of: floorId) { newValue in
                        zoneId = ""; zones = []
                        if !newValue.isEmpty { Task { zones = (try? await APIClient.shared.zones(floorId: newValue)) ?? [] } }
                    }
                    Picker("Zone", selection: $zoneId) {
                        Text("—").tag("")
                        ForEach(zones) { z in Text(z.name).tag(z.id) }
                    }
                    .disabled(floorId.isEmpty)
                }
                Section {
                    Toggle("Audible alarm", isOn: $audibleAlarm)
                }
                if let err = error {
                    Section { Text(err).foregroundStyle(.red) }
                }
                Section {
                    Button {
                        Task { await register() }
                    } label: {
                        HStack {
                            if creating { ProgressView() }
                            Text("Register hanger").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!devEuiValid || creating)
                }
            }
            .navigationTitle("Register hanger")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
            }
            .task { buildings = (try? await APIClient.shared.buildings()) ?? [] }
        }
    }

    private var devEuiValid: Bool {
        devEui.range(of: #"^[0-9A-Fa-f]{16}$"#, options: .regularExpression) != nil
    }

    private func register() async {
        creating = true; error = nil
        do {
            try await APIClient.shared.registerHanger(devEui: devEui, zoneId: zoneId.isEmpty ? nil : zoneId, audibleAlarmEnabled: audibleAlarm)
            onCreated()
            dismiss()
        } catch {
            self.error = "Could not register — DevEUI may already exist."
        }
        creating = false
    }
}
