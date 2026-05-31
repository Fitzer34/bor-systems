import SwiftUI

struct HangersView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var hangers: [Hanger] = []
    @State private var settings: AppSettings?
    @State private var zoneById: [String: (zone: Zone, floor: String, building: String)] = [:]
    @State private var error: String?
    @State private var showRegister = false
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
                NavigationLink {
                    HangerDetailView(
                        hanger: h,
                        zoneById: zoneById,
                        lowBatteryThreshold: settings?.lowBatteryThreshold ?? 20,
                        onChange: { Task { await refresh() } },
                    )
                } label: {
                    HangerRow(
                        hanger: h,
                        lowBatteryThreshold: settings?.lowBatteryThreshold ?? 20,
                        locationLabel: location(for: h),
                    )
                }
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
                    // Hangers are LoRa-only — they don't do BLE/WiFi onboarding.
                    // Registration is purely "type the DevEUI shown on the OLED
                    // + pick a zone", so the + button goes straight there
                    // (no Bluetooth menu — that path is gone).
                    Button {
                        showRegister = true
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
                // Friendly name takes top billing; DevEUI becomes the
                // secondary identifier underneath.
                Text(hanger.name?.isEmpty == false ? hanger.name! : hanger.devEui)
                    .font(hanger.name?.isEmpty == false ? .body.weight(.medium) : .system(.body, design: .monospaced))
                Spacer()
                statusBadge
            }
            if hanger.name?.isEmpty == false {
                Text(hanger.devEui)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.tertiary)
            }
            Text(locationLabel).font(.caption).foregroundStyle(.secondary)
            if let note = hanger.locationNote, !note.isEmpty {
                Text("📍 \(note)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .italic()
                    .lineLimit(2)
            }
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
    private static let onlineWindow: TimeInterval = 90

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

// MARK: - HangerDetailView ──────────────────────────────────────────────────
//
// Sister to GatewayDetailView. Tap a hanger in the list → land here. Lets
// admins/supervisors edit the customer-facing name, re-assign to a
// different zone (cascading building → floor → zone picker), add a
// free-form note explaining where the hanger actually hangs, and toggle
// the audible alarm. Read-only battery / firmware / last seen below.
// Decommission / Recommission live in the footer (admin only) — same
// destructive-action shape we use for gateways.

struct HangerDetailView: View {
    let hanger: Hanger
    let zoneById: [String: (zone: Zone, floor: String, building: String)]
    let lowBatteryThreshold: Int
    let onChange: () -> Void

    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var locationNote: String
    @State private var audibleAlarm: Bool
    @State private var zoneId: String  // empty == unassigned

    // Cascade picker support — load lazily so the detail view opens fast
    // even if there are many buildings/floors/zones.
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []
    @State private var buildingId: String = ""   // empty == not chosen
    @State private var floorId: String = ""

    @State private var saving = false
    @State private var error: String?
    @State private var showDecommissionConfirm = false

    init(
        hanger: Hanger,
        zoneById: [String: (zone: Zone, floor: String, building: String)],
        lowBatteryThreshold: Int,
        onChange: @escaping () -> Void,
    ) {
        self.hanger = hanger
        self.zoneById = zoneById
        self.lowBatteryThreshold = lowBatteryThreshold
        self.onChange = onChange
        _name = State(initialValue: hanger.name ?? "")
        _locationNote = State(initialValue: hanger.locationNote ?? "")
        _audibleAlarm = State(initialValue: hanger.audibleAlarmEnabled)
        _zoneId = State(initialValue: hanger.zoneId ?? "")
    }

    private var canEdit: Bool {
        auth.user?.role == .admin || auth.user?.role == .supervisor
    }
    private var isAdmin: Bool { auth.user?.role == .admin }

    var body: some View {
        Form {
            Section("Identification") {
                if canEdit {
                    TextField("Name (e.g. Ward 4B main bathroom)", text: $name)
                        .autocorrectionDisabled(false)
                } else {
                    LabeledContent("Name", value: name.isEmpty ? "—" : name)
                }
                LabeledContent("DevEUI", value: hanger.devEui)
                    .font(.system(.body, design: .monospaced))
            }

            Section("Location") {
                if canEdit {
                    Picker("Building", selection: $buildingId) {
                        Text("— Unassigned —").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }
                    .onChange(of: buildingId) { newValue in
                        floorId = ""; zoneId = ""
                        floors = []; zones = []
                        if !newValue.isEmpty {
                            Task { await loadFloors(buildingId: newValue) }
                        }
                    }

                    Picker("Floor", selection: $floorId) {
                        Text("— Unassigned —").tag("")
                        ForEach(floors) { f in Text(f.name).tag(f.id) }
                    }
                    .disabled(buildingId.isEmpty)
                    .onChange(of: floorId) { newValue in
                        zoneId = ""; zones = []
                        if !newValue.isEmpty {
                            Task { await loadZones(floorId: newValue) }
                        }
                    }

                    Picker("Zone", selection: $zoneId) {
                        Text("— Unassigned —").tag("")
                        ForEach(zones) { z in Text(z.name).tag(z.id) }
                    }
                    .disabled(floorId.isEmpty)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Where in the zone?").font(.caption).foregroundStyle(.secondary)
                        TextField("e.g. behind the first stall, on the wall by the sinks", text: $locationNote, axis: .vertical)
                            .lineLimit(2...4)
                    }
                } else {
                    LabeledContent("Location", value: locationLabel)
                    if !locationNote.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Where in the zone?").font(.caption).foregroundStyle(.secondary)
                            Text(locationNote)
                        }
                    }
                }
            }

            Section("Alarm") {
                if canEdit {
                    Toggle("Audible alarm on lift", isOn: $audibleAlarm)
                } else {
                    LabeledContent("Audible alarm", value: audibleAlarm ? "On" : "Off")
                }
            }

            Section("Live state") {
                statusRow
                batteryRow
                if let fw = hanger.firmwareVersion {
                    LabeledContent("Firmware", value: fw)
                }
                if let last = hanger.lastSeenAt {
                    LabeledContent("Last seen", value: relativeTime(from: last))
                } else {
                    LabeledContent("Last seen", value: "Never")
                }
            }

            if let err = error {
                Section { Text(err).foregroundStyle(.red) }
            }

            if isAdmin {
                Section {
                    if hanger.status == .decommissioned {
                        Button {
                            Task { await recommission() }
                        } label: {
                            Label("Recommission hanger", systemImage: "arrow.up.bin")
                        }
                        .foregroundStyle(.green)
                    } else {
                        Button(role: .destructive) {
                            showDecommissionConfirm = true
                        } label: {
                            Label("Decommission hanger", systemImage: "archivebox")
                        }
                    }
                }
            }
        }
        .navigationTitle("Hanger")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() }
                        else      { Text("Save").bold() }
                    }
                    .disabled(saving || !hasChanges)
                }
            }
        }
        .task { await bootstrap() }
        .alert("Decommission this hanger?", isPresented: $showDecommissionConfirm) {
            Button("Decommission", role: .destructive) {
                Task { await decommission() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("It will stop appearing in active alerts. You can recommission it any time — the device on the wall keeps working.")
        }
    }

    // MARK: Derived

    private var locationLabel: String {
        guard !zoneId.isEmpty, let entry = zoneById[zoneId] else { return "Unassigned" }
        return "\(entry.building) / \(entry.floor) / \(entry.zone.name)"
    }

    private var hasChanges: Bool {
        name != (hanger.name ?? "") ||
        locationNote != (hanger.locationNote ?? "") ||
        audibleAlarm != hanger.audibleAlarmEnabled ||
        zoneId != (hanger.zoneId ?? "")
    }

    @ViewBuilder
    private var statusRow: some View {
        HStack {
            Text("Status")
            Spacer()
            statusBadgeInline
        }
    }

    @ViewBuilder
    private var statusBadgeInline: some View {
        let (label, color): (String, Color) = {
            switch hanger.status {
            case .outOfService:   return ("Out of service", .orange)
            case .decommissioned: return ("Decommissioned", .gray)
            case .active:
                if let seen = hanger.lastSeenAt,
                   Date().timeIntervalSince(seen) <= 90 {
                    return ("Online", .green)
                }
                return ("Offline", .orange)
            }
        }()
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label).foregroundStyle(color)
        }
    }

    @ViewBuilder
    private var batteryRow: some View {
        HStack {
            Text("Battery")
            Spacer()
            if let pct = hanger.batteryPct {
                let low = pct <= lowBatteryThreshold
                Text("\(pct)%").foregroundStyle(low ? .red : .primary)
            } else {
                Text("—").foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Loading

    private func bootstrap() async {
        // Load buildings always — fast.
        buildings = (try? await APIClient.shared.buildings()) ?? []

        // If we know the hanger's current zone, hydrate the cascade with
        // the building/floor that zone belongs to so the user can see the
        // current pick reflected in the picker without an extra tap.
        if !zoneId.isEmpty, let entry = zoneById[zoneId] {
            // Find the matching building by name (the map keys we have
            // here are zones; we walk back via building name).
            if let b = buildings.first(where: { $0.name == entry.building }) {
                buildingId = b.id
                await loadFloors(buildingId: b.id)
                if let f = floors.first(where: { $0.name == entry.floor }) {
                    floorId = f.id
                    await loadZones(floorId: f.id)
                }
            }
        }
    }

    private func loadFloors(buildingId: String) async {
        do {
            floors = try await APIClient.shared.floors(buildingId: buildingId)
                .sorted { $0.orderIndex < $1.orderIndex }
        } catch { /* ignore — error surfaces via empty list */ }
    }

    private func loadZones(floorId: String) async {
        do {
            zones = try await APIClient.shared.zones(floorId: floorId)
        } catch { /* ignore */ }
    }

    // MARK: Actions

    private func save() async {
        saving = true
        defer { saving = false }
        error = nil
        do {
            try await APIClient.shared.updateHanger(
                hanger.id,
                name: name.isEmpty ? nil : name,
                locationNote: locationNote.trimmingCharacters(in: .whitespaces).isEmpty ? nil : locationNote,
                zoneId: zoneId.isEmpty ? nil : zoneId,
                audibleAlarmEnabled: audibleAlarm,
            )
            onChange()
            dismiss()
        } catch {
            self.error = "Could not save changes."
        }
    }

    private func decommission() async {
        saving = true
        defer { saving = false }
        do {
            try await APIClient.shared.decommissionHanger(hanger.id)
            onChange()
            dismiss()
        } catch {
            self.error = "Could not decommission."
        }
    }

    private func recommission() async {
        saving = true
        defer { saving = false }
        do {
            try await APIClient.shared.recommissionHanger(hanger.id)
            onChange()
            dismiss()
        } catch {
            self.error = "Could not recommission."
        }
    }
}

// MARK: - GatewaysView ─────────────────────────────────────────────────────
//
// Sister to HangersView. Lists every gateway that's self-registered against
// the current organisation. Unlike hangers, there's no "+ Register" entry
// here — the firmware adds itself the first time it joins WiFi.

struct GatewaysView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var gateways: [Gateway] = []
    @State private var error: String?
    @State private var refreshTask: Task<Void, Never>?
    /// Re-render every second so the Online/Offline badge flips the instant
    /// the heartbeat window expires.
    @State private var tick = 0

    var body: some View {
        List {
            if gateways.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("No gateways yet.").foregroundStyle(.secondary)
                    Text("Plug in your HazardLink gateway, run More → Add a gateway, and it'll appear here within ~60 seconds.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }
            ForEach(gateways) { g in
                NavigationLink {
                    GatewayDetailView(gateway: g) { Task { await refresh() } }
                } label: {
                    GatewayRow(gateway: g)
                }
                .swipeActions {
                    if auth.user?.role == .admin {
                        Button(role: .destructive) { Task { await delete(g) } } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                }
            }
            if let err = error {
                Section { Text(err).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Gateways")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task {
            await refresh()
            refreshTask?.cancel()
            refreshTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    tick &+= 1
                    // Heartbeats are every 60s, so refresh every 10s — we'll
                    // see updated lastSeenAt within one tick of it arriving.
                    if tick % 10 == 0 { await refresh() }
                }
            }
        }
        .onDisappear { refreshTask?.cancel() }
    }

    private func refresh() async {
        do {
            self.gateways = try await APIClient.shared.gateways()
                .sorted { ($0.name ?? "") < ($1.name ?? "") }
            self.error = nil
        } catch {
            self.error = "Could not load gateways."
        }
    }

    private func delete(_ g: Gateway) async {
        do { try await APIClient.shared.deleteGateway(g.id); await refresh() }
        catch { self.error = "Failed to remove gateway." }
    }
}

// MARK: - GatewayDetailView ─────────────────────────────────────────────────
//
// Tap a row in GatewaysView → land here. Lets admins edit the customer-
// facing name, change which building it's in, and add a free-form note
// telling cleaners exactly where in the building the gateway sits ("behind
// reception desk", "Floor 2 server cupboard").
//
// The bottom half shows the read-only network state straight from the
// last heartbeat — useful for installer diagnostics but not editable.

struct GatewayDetailView: View {
    let gateway: Gateway
    let onChange: () -> Void

    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var buildingId: String   // empty string == no building
    @State private var locationNote: String
    @State private var buildings: [Building] = []
    @State private var saving = false
    @State private var error: String?
    @State private var showDeleteConfirm = false

    init(gateway: Gateway, onChange: @escaping () -> Void) {
        self.gateway = gateway
        self.onChange = onChange
        _name = State(initialValue: gateway.name ?? "")
        _buildingId = State(initialValue: gateway.buildingId ?? "")
        _locationNote = State(initialValue: gateway.locationNote ?? "")
    }

    private var isAdmin: Bool { auth.user?.role == .admin }

    var body: some View {
        Form {
            Section("Identification") {
                if isAdmin {
                    TextField("Name", text: $name)
                        .autocorrectionDisabled()
                } else {
                    LabeledContent("Name", value: name.isEmpty ? "—" : name)
                }
                LabeledContent("DevEUI", value: gateway.devEui)
                    .font(.system(.body, design: .monospaced))
            }

            Section("Location") {
                if isAdmin {
                    Picker("Building", selection: $buildingId) {
                        Text("— Unassigned —").tag("")
                        ForEach(buildings) { b in
                            Text(b.name).tag(b.id)
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Where in the building?").font(.caption).foregroundStyle(.secondary)
                        TextField("e.g. behind reception desk, Floor 2 cupboard", text: $locationNote, axis: .vertical)
                            .lineLimit(2...4)
                            .autocorrectionDisabled(false)
                    }
                } else {
                    LabeledContent("Building", value: buildingName)
                    if !locationNote.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Where in the building?").font(.caption).foregroundStyle(.secondary)
                            Text(locationNote)
                        }
                    }
                }
            }

            Section("Live state") {
                statusRow
                if let ip = gateway.ipAddress    { LabeledContent("IP", value: ip) }
                if let ssid = gateway.ssid       { LabeledContent("WiFi", value: ssid) }
                if let rssi = gateway.rssi       { LabeledContent("Signal", value: "\(rssi) dBm \(signalLabel(rssi))") }
                LabeledContent("Forwarded", value: "\(gateway.packetsForwarded) pkts")
                if let up = gateway.uptimeSec    { LabeledContent("Uptime", value: formatUptime(up)) }
                if let fw = gateway.firmwareVersion { LabeledContent("Firmware", value: fw) }
                if let last = gateway.lastSeenAt {
                    LabeledContent("Last heartbeat", value: relativeTime(from: last))
                }
            }

            if let err = error {
                Section { Text(err).foregroundStyle(.red) }
            }

            if isAdmin {
                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("Remove gateway", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Gateway")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if isAdmin {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving {
                            ProgressView()
                        } else {
                            Text("Save").bold()
                        }
                    }
                    .disabled(saving || !hasChanges)
                }
            }
        }
        .task {
            buildings = (try? await APIClient.shared.buildings()) ?? []
        }
        .alert("Remove this gateway?", isPresented: $showDeleteConfirm) {
            Button("Remove", role: .destructive) {
                Task { await delete() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The device on the wall is still yours — it'll re-register itself on next boot. Removing here just deletes the dashboard record.")
        }
    }

    @ViewBuilder
    private var statusRow: some View {
        let isOnline: Bool = {
            guard let seen = gateway.lastSeenAt else { return false }
            return Date().timeIntervalSince(seen) <= 90
        }()
        HStack {
            Text("Status")
            Spacer()
            HStack(spacing: 6) {
                Circle()
                    .fill(isOnline ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)
                Text(isOnline ? "Online" : "Offline")
                    .foregroundStyle(isOnline ? .green : .orange)
            }
        }
    }

    private var buildingName: String {
        if buildingId.isEmpty { return "Unassigned" }
        return buildings.first(where: { $0.id == buildingId })?.name ?? "—"
    }

    private var hasChanges: Bool {
        name != (gateway.name ?? "") ||
        buildingId != (gateway.buildingId ?? "") ||
        locationNote != (gateway.locationNote ?? "")
    }

    private func signalLabel(_ rssi: Int) -> String {
        switch rssi {
        case (-45)...: return "(excellent)"
        case (-55)...: return "(strong)"
        case (-65)...: return "(good)"
        case (-75)...: return "(weak)"
        default:       return "(very weak)"
        }
    }

    private func formatUptime(_ sec: Int) -> String {
        if sec < 60 { return "\(sec)s" }
        if sec < 3600 { return "\(sec / 60)m" }
        if sec < 86400 { return "\(sec / 3600)h \((sec % 3600) / 60)m" }
        return "\(sec / 86400)d \((sec % 86400) / 3600)h"
    }

    private func save() async {
        saving = true
        defer { saving = false }
        error = nil
        do {
            try await APIClient.shared.updateGateway(
                gateway.id,
                name: name.isEmpty ? nil : name,
                buildingId: buildingId.isEmpty ? nil : buildingId,
                locationNote: locationNote.trimmingCharacters(in: .whitespaces).isEmpty ? nil : locationNote,
            )
            onChange()
            dismiss()
        } catch {
            self.error = "Could not save changes."
        }
    }

    private func delete() async {
        saving = true
        defer { saving = false }
        do {
            try await APIClient.shared.deleteGateway(gateway.id)
            onChange()
            dismiss()
        } catch {
            self.error = "Could not remove gateway."
        }
    }
}

private struct GatewayRow: View {
    let gateway: Gateway

    /// Gateways heartbeat every 60 s, so 90 s tolerates one missed beat.
    /// More forgiving than hangers because a single dropped TLS POST is
    /// much more likely than a hanger missing two beats over LoRa.
    private static let onlineWindow: TimeInterval = 90

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(gateway.name ?? gateway.devEui)
                    .font(.body.weight(.medium))
                Spacer()
                statusBadge
            }
            Text(gateway.devEui)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
            HStack(spacing: 14) {
                if let ip = gateway.ipAddress {
                    Label(ip, systemImage: "network").font(.caption).foregroundStyle(.secondary)
                }
                if let ssid = gateway.ssid {
                    Label(ssid, systemImage: "wifi").font(.caption).foregroundStyle(.secondary)
                }
                if let rssi = gateway.rssi {
                    Label("\(rssi) dBm", systemImage: "antenna.radiowaves.left.and.right")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 14) {
                Label("\(gateway.packetsForwarded) pkts", systemImage: "arrow.up.arrow.down")
                    .font(.caption).foregroundStyle(.secondary)
                if let last = gateway.lastSeenAt {
                    Label(relativeTime(from: last), systemImage: "clock")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let fw = gateway.firmwareVersion {
                    Label(fw, systemImage: "info.circle")
                        .font(.caption).foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var statusBadge: some View {
        let (label, color): (String, Color) = {
            if let seen = gateway.lastSeenAt,
               Date().timeIntervalSince(seen) <= Self.onlineWindow {
                return ("Online", .green)
            }
            return ("Offline", .orange)
        }()
        Text(label).font(.caption2.weight(.medium))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}

struct RegisterHangerSheet: View {
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
