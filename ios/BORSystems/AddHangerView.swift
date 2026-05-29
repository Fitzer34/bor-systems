import SwiftUI
import AVFoundation

/// First-time Wi-Fi onboarding wizard. Used for both hangers and the building
/// gateway — the BLE protocol is identical, only the BLE name prefix the scan
/// filters on and the install-step copy differ.
///
/// Walks the customer through: scan → pick the device → enter Wi-Fi → wait →
/// done. Backed by HangerSetupManager which does the actual Core Bluetooth
/// dance and the GATT writes that land in `firmware/src/setup_mode/`.
///
/// WiFi UX (deliberate, given iOS's limits):
///   - SSID is auto-filled from the network the phone is currently on
///     (NEHotspotNetwork.fetchCurrent + Location When In Use).
///   - Password can be:
///       a) typed once and remembered for the rest of the session so the
///          customer doesn't re-type it for every hanger they're adding,
///       b) scanned from a WiFi QR code (router sticker, or iOS's own
///          "Share password as QR"),
///       c) typed manually if neither of those works.
///   - We cannot read the password from iCloud Keychain — Apple does not
///     expose it to any third-party app.
struct AddDeviceView: View {
    let kind: SetupDeviceKind

    @StateObject private var manager = HangerSetupManager()
    @Environment(\.dismiss) private var dismiss

    @State private var ssid = ""
    @State private var password = ""
    @State private var showingQRScanner = false
    @State private var didAutofillOnce = false

    /// True once the user has finished assigning the hanger to a zone (or
    /// explicitly chosen to skip). Drives whether we show the location
    /// picker or the success screen. Gateways short-circuit this — they
    /// don't belong to a zone, so they go straight to success.
    @State private var locationStepComplete = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                switch manager.phase {
                case .idle, .bluetoothOff:
                    welcomeStep
                case .scanning:
                    scanningStep
                case .connecting(let name):
                    progressStep(title: "Connecting to \(name)…",
                                 detail: "iOS will ask you to pair — enter the 6-digit PIN shown on the device's OLED.")
                case .discovering:
                    progressStep(title: "Pairing…",
                                 detail: "Hold tight, almost there.")
                case .ready:
                    credentialsStep
                case .sending:
                    progressStep(title: "Sending credentials…", detail: nil)
                case .joining:
                    progressStep(title: "Joining \(ssid.isEmpty ? "your Wi-Fi" : "“\(ssid)”")…",
                                 detail: "This takes 10–20 seconds.")
                case .connected:
                    // Hangers go through one more step (pick a building/
                    // floor/zone so the alert + dispatch flow knows where
                    // the device lives). Gateways skip — they're not
                    // tied to a single zone.
                    if kind == .hanger && !locationStepComplete {
                        if let devEui = manager.devEui {
                            HangerLocationStep(
                                devEui: devEui,
                                onDone: { locationStepComplete = true }
                            )
                        } else {
                            // No DevEUI = the firmware didn't expose it
                            // over BLE. Shouldn't happen, but if it does
                            // we just show success and let the user
                            // register manually.
                            successStep
                        }
                    } else {
                        successStep
                    }
                case .failed(let message):
                    failureStep(message: message)
                }
            }
            .padding(20)
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        manager.cancel()
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showingQRScanner) {
                WiFiQRScannerSheet { result in
                    if let r = result {
                        ssid = r.ssid
                        password = r.password
                    }
                    showingQRScanner = false
                }
            }
            .onAppear(perform: autofillFromCurrentNetwork)
        }
        .interactiveDismissDisabled(true) // force the user to use Cancel so we clean up the BLE state
    }

    // MARK: Kind-specific copy

    private var navTitle: String {
        switch kind {
        case .hanger:  return "Add a hanger"
        case .gateway: return "Add a gateway"
        }
    }

    private var welcomeIcon: String {
        switch kind {
        case .hanger:  return "antenna.radiowaves.left.and.right"
        case .gateway: return "wifi.router"
        }
    }

    private var welcomeTitle: String {
        switch kind {
        case .hanger:  return "Ready to set up your new hanger?"
        case .gateway: return "Ready to set up your gateway?"
        }
    }

    private var welcomeSubtitle: String {
        switch kind {
        case .hanger:
            return "Plug the hanger into power. Wait until the green LED is breathing. Then tap the button below — we'll find it over Bluetooth and connect it to your Wi-Fi."
        case .gateway:
            return "Plug the gateway into mains power via USB-C. Place it somewhere central — high up is best. Wait until the OLED shows a 6-digit pairing PIN. Then tap below — we'll find it over Bluetooth and connect it to your Wi-Fi."
        }
    }

    private var findButtonLabel: String {
        switch kind {
        case .hanger:  return "Find my hanger"
        case .gateway: return "Find my gateway"
        }
    }

    private var scanningLabel: String {
        switch kind {
        case .hanger:  return "Looking for nearby hangers…"
        case .gateway: return "Looking for the gateway…"
        }
    }

    // MARK: Steps

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            stepHeader(icon: welcomeIcon, title: welcomeTitle, subtitle: welcomeSubtitle)
            Spacer()
            Button { manager.startScan(kind: kind) } label: {
                Text(findButtonLabel)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .background(Color.blue, in: RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(.white)

            if manager.phase == .bluetoothOff {
                Text("Bluetooth is off — turn it on in Control Centre or Settings, then tap again.")
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var scanningStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                ProgressView()
                VStack(alignment: .leading, spacing: 2) {
                    Text(scanningLabel).font(.body.weight(.medium))
                    Text("Make sure it's powered on.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.bottom, 6)

            if manager.discovered.isEmpty {
                Text("Nothing yet — usually takes 5–10 seconds.")
                    .font(.footnote).foregroundStyle(.secondary)
            } else {
                ForEach(manager.discovered) { h in
                    Button {
                        manager.connect(to: h)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(h.name).font(.body.weight(.medium))
                                Text(signalLabel(h.rssi))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer()
        }
    }

    private var credentialsStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader(icon: "wifi",
                       title: "Connect to Wi-Fi",
                       subtitle: "We'll use your phone's current Wi-Fi. Confirm the password below or scan it from a QR code — the \(kind.humanName) uses this to reach the HazardLink cloud.")

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Wi-Fi name (SSID)").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if !ssid.isEmpty && didAutofillOnce {
                        Label("auto-filled", systemImage: "checkmark.circle.fill")
                            .font(.caption2).foregroundStyle(.green)
                    }
                }
                TextField("e.g. MyHome-5G", text: $ssid)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))

                HStack {
                    Text("Wi-Fi password").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if !password.isEmpty && WiFiSession.lastPassword == password {
                        Label("from this session", systemImage: "clock.arrow.circlepath")
                            .font(.caption2).foregroundStyle(.blue)
                    }
                }
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))

                Button {
                    showingQRScanner = true
                } label: {
                    Label("Scan Wi-Fi QR code", systemImage: "qrcode.viewfinder")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(.primary)
                .padding(.top, 4)
            }

            Text(kind == .gateway
                 ? "Tip — the gateway needs the same 2.4 GHz Wi-Fi the hangers will use."
                 : "Tip — the hanger only supports 2.4 GHz Wi-Fi networks.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer()

            Button {
                WiFiSession.remember(ssid: ssid, password: password)
                manager.submitCredentials(ssid: ssid, password: password)
            } label: {
                Text("Connect")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .background(canSubmit ? Color.blue : Color.gray, in: RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(.white)
            .disabled(!canSubmit)
        }
    }

    private var successStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            stepHeader(icon: "checkmark.circle.fill",
                       title: kind == .gateway ? "Gateway is online!" : "Hanger is online!",
                       subtitle: successSubtitle,
                       iconColor: .green)
            Spacer()
            Button {
                manager.cancel()
                dismiss()
            } label: {
                Text("Done")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .background(Color.blue, in: RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(.white)
        }
    }

    private var successSubtitle: String {
        let devEuiLine = manager.devEui.map { "DevEUI: \($0)\n\n" } ?? ""
        switch kind {
        case .hanger:
            return devEuiLine + "Next step: register this hanger to a zone in HazardLink → Hangers → Register."
        case .gateway:
            return devEuiLine + "Next step: the gateway is now relaying any nearby hangers automatically. Walk over to a hanger to add it next."
        }
    }

    private func failureStep(message: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            stepHeader(icon: "exclamationmark.triangle.fill",
                       title: "Setup didn't work",
                       subtitle: message,
                       iconColor: .orange)
            Spacer()
            VStack(spacing: 10) {
                Button { manager.startScan(kind: kind) } label: {
                    Text("Try again")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .background(Color.blue, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(.white)

                Button {
                    manager.cancel()
                    dismiss()
                } label: {
                    Text("Give up for now")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Auto-fill

    /// Pre-populates the SSID + password fields when the wizard reaches the
    /// credentials step. Called once per view appearance — won't clobber
    /// anything the user has already typed.
    private func autofillFromCurrentNetwork() {
        // Password first — instant, no permission prompt, no async hop.
        if password.isEmpty, let cached = WiFiSession.lastPassword {
            password = cached
        }
        if ssid.isEmpty, let cachedSsid = WiFiSession.lastSsid {
            ssid = cachedSsid
            didAutofillOnce = true
        }
        // Then the SSID lookup, which is async and depends on Location.
        WiFiCurrentNetwork.fetchSSID { detectedSsid in
            // Only fill if the user hasn't typed anything yet — never
            // clobber in-progress input.
            if let s = detectedSsid, !s.isEmpty, ssid.isEmpty {
                ssid = s
                didAutofillOnce = true
            }
        }
    }

    // MARK: Components

    private func stepHeader(icon: String, title: String, subtitle: String, iconColor: Color = .blue) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 44, weight: .light))
                .foregroundStyle(iconColor)
            Text(title).font(.title3.weight(.semibold))
            Text(subtitle).font(.body).foregroundStyle(.secondary)
        }
    }

    private func progressStep(title: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                ProgressView()
                Text(title).font(.body.weight(.medium))
            }
            if let detail = detail {
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var canSubmit: Bool {
        !ssid.trimmingCharacters(in: .whitespaces).isEmpty &&
        !password.isEmpty
    }

    private func signalLabel(_ rssi: Int) -> String {
        // Heuristic — closer is more negative-but-bigger. -50 is right next to you,
        // -90 is at the edge.
        let bars: String
        switch rssi {
        case (-100)...(-80): bars = "weak signal"
        case (-79)...(-65):  bars = "ok signal"
        default:             bars = "strong signal"
        }
        return "\(bars) (\(rssi) dBm)"
    }
}

// MARK: - HangerLocationStep ────────────────────────────────────────────────
//
// Shown after the WiFi handshake completes and we know the hanger's DevEUI.
// Lets the installer pick a building / floor / zone — or create new ones
// on the spot. On Save, POST /hangers/register so the alert + dispatch
// pipeline knows where the device lives.
//
// Design notes:
//   - All three levels are nested pickers backed by `/buildings`,
//     `/buildings/:id/floors`, `/floors/:id/zones`.
//   - "+ Create new" expands an inline name field rather than pushing a
//     sheet — fewer screens, faster path through the wizard.
//   - Picking a new building resets the floor and zone selection (they
//     belong to the previous building). Same cascade for floor → zone.
//   - The Skip button registers the hanger with no zone. The customer
//     can finish the assignment later from More → Manage → Hangers.

struct HangerLocationStep: View {
    let devEui: String
    let onDone: () -> Void

    // Loaded lists for each level.
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []

    // Current selection.
    @State private var selectedBuilding: Building?
    @State private var selectedFloor: Floor?
    @State private var selectedZone: Zone?

    // "Create new" expansion + draft text per level.
    @State private var creatingBuilding = false
    @State private var newBuildingName = ""
    @State private var creatingFloor = false
    @State private var newFloorName = ""
    @State private var creatingZone = false
    @State private var newZoneName = ""

    // UI state.
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "map")
                        .font(.system(size: 44, weight: .light))
                        .foregroundStyle(.blue)
                    Text("Where is this hanger?").font(.title3.weight(.semibold))
                    Text("So alerts and dispatches know which area of the building to point at. You can change this later in Manage → Hangers.")
                        .font(.body).foregroundStyle(.secondary)
                }

                buildingRow

                if selectedBuilding != nil {
                    floorRow
                }

                if selectedFloor != nil {
                    zoneRow
                }

                if let err = error {
                    Text(err).font(.footnote).foregroundStyle(.red)
                }

                Spacer(minLength: 12)

                Button {
                    Task { await saveAndRegister() }
                } label: {
                    HStack {
                        if saving { ProgressView().tint(.white) }
                        Text(selectedZone == nil ? "Skip — assign later" : "Register hanger here")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                }
                .background(selectedZone == nil ? Color.gray : Color.blue,
                            in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(.white)
                .disabled(saving)
            }
            .padding(.horizontal, 4)
        }
        .task { await loadBuildings() }
    }

    // MARK: Rows

    private var buildingRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Building").font(.caption).foregroundStyle(.secondary)
            VStack(spacing: 0) {
                ForEach(buildings) { b in
                    RowChip(
                        label: b.name,
                        isSelected: selectedBuilding?.id == b.id,
                        onTap: {
                            selectedBuilding = b
                            selectedFloor = nil
                            selectedZone = nil
                            floors = []; zones = []
                            Task { await loadFloors(buildingId: b.id) }
                        }
                    )
                }
                createNewRow(
                    expanded: $creatingBuilding,
                    text: $newBuildingName,
                    placeholder: "e.g. Mercy Hospital",
                    label: "Add new building",
                    action: { Task { await createBuilding() } }
                )
            }
        }
    }

    @ViewBuilder
    private var floorRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Floor").font(.caption).foregroundStyle(.secondary)
            VStack(spacing: 0) {
                ForEach(floors) { f in
                    RowChip(
                        label: f.name,
                        isSelected: selectedFloor?.id == f.id,
                        onTap: {
                            selectedFloor = f
                            selectedZone = nil
                            zones = []
                            Task { await loadZones(floorId: f.id) }
                        }
                    )
                }
                createNewRow(
                    expanded: $creatingFloor,
                    text: $newFloorName,
                    placeholder: "e.g. Ground floor, 1st floor",
                    label: "Add new floor",
                    action: { Task { await createFloor() } }
                )
            }
        }
    }

    @ViewBuilder
    private var zoneRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Zone").font(.caption).foregroundStyle(.secondary)
            VStack(spacing: 0) {
                ForEach(zones) { z in
                    RowChip(
                        label: z.name,
                        isSelected: selectedZone?.id == z.id,
                        onTap: { selectedZone = z }
                    )
                }
                createNewRow(
                    expanded: $creatingZone,
                    text: $newZoneName,
                    placeholder: "e.g. Reception, Toilets, Canteen",
                    label: "Add new zone",
                    action: { Task { await createZone() } }
                )
            }
        }
    }

    // MARK: Components

    @ViewBuilder
    private func createNewRow(
        expanded: Binding<Bool>,
        text: Binding<String>,
        placeholder: String,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        if expanded.wrappedValue {
            HStack {
                TextField(placeholder, text: text)
                    .padding(10)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
                    .submitLabel(.done)
                Button("Save") { action() }
                    .disabled(text.wrappedValue.trimmingCharacters(in: .whitespaces).isEmpty)
                Button {
                    expanded.wrappedValue = false
                    text.wrappedValue = ""
                } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
            }
            .padding(.vertical, 6)
        } else {
            Button {
                expanded.wrappedValue = true
            } label: {
                HStack {
                    Image(systemName: "plus.circle.fill").foregroundStyle(.blue)
                    Text(label).foregroundStyle(.blue)
                    Spacer()
                }
                .padding(.vertical, 10)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: Actions

    private func loadBuildings() async {
        do {
            buildings = try await APIClient.shared.buildings()
        } catch {
            self.error = "Could not load buildings."
        }
    }

    private func loadFloors(buildingId: String) async {
        do {
            floors = try await APIClient.shared.floors(buildingId: buildingId)
                .sorted { $0.orderIndex < $1.orderIndex }
        } catch {
            self.error = "Could not load floors."
        }
    }

    private func loadZones(floorId: String) async {
        do {
            zones = try await APIClient.shared.zones(floorId: floorId)
        } catch {
            self.error = "Could not load zones."
        }
    }

    private func createBuilding() async {
        let name = newBuildingName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        error = nil
        do {
            let b = try await APIClient.shared.createBuilding(name: name)
            buildings.append(b)
            selectedBuilding = b
            selectedFloor = nil
            selectedZone = nil
            floors = []; zones = []
            creatingBuilding = false
            newBuildingName = ""
        } catch {
            self.error = "Could not create building."
        }
    }

    private func createFloor() async {
        guard let b = selectedBuilding else { return }
        let name = newFloorName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        error = nil
        do {
            // Tack new floors onto the end of the list — the customer can
            // reorder them later in the Floor plans admin if they care.
            let nextOrder = (floors.map { $0.orderIndex }.max() ?? -1) + 1
            let f = try await APIClient.shared.createFloor(
                buildingId: b.id, name: name, orderIndex: nextOrder
            )
            floors.append(f)
            selectedFloor = f
            selectedZone = nil
            zones = []
            creatingFloor = false
            newFloorName = ""
        } catch {
            self.error = "Could not create floor."
        }
    }

    private func createZone() async {
        guard let f = selectedFloor else { return }
        let name = newZoneName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        error = nil
        do {
            let z = try await APIClient.shared.createZone(floorId: f.id, name: name)
            zones.append(z)
            selectedZone = z
            creatingZone = false
            newZoneName = ""
        } catch {
            self.error = "Could not create zone."
        }
    }

    private func saveAndRegister() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await APIClient.shared.registerHanger(
                devEui: devEui,
                zoneId: selectedZone?.id,
                audibleAlarmEnabled: false
            )
            onDone()
        } catch {
            self.error = "Could not register the hanger. Try again."
        }
    }
}

private struct RowChip: View {
    let label: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                Text(label).foregroundStyle(.primary)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.blue)
                }
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isSelected ? Color.blue.opacity(0.12) : Color(.secondarySystemBackground))
            )
        }
        .buttonStyle(.plain)
        .padding(.vertical, 2)
    }
}

// MARK: - Back-compat wrappers ──────────────────────────────────────────────
//
// HangersView already presents `AddHangerView()` from its `+` toolbar. Keep
// the name so existing call sites don't break.

struct AddHangerView: View {
    var body: some View { AddDeviceView(kind: .hanger) }
}

struct AddGatewayView: View {
    var body: some View { AddDeviceView(kind: .gateway) }
}

// MARK: - WiFi QR scanner sheet ─────────────────────────────────────────────
//
// AVFoundation QR scanner wrapped as a SwiftUI sheet. Returns parsed
// (ssid, password) via `onResult`, or nil if the user dismisses without
// scanning. Camera permission is requested lazily on first appearance.

struct WiFiQRScannerSheet: View {
    let onResult: ((ssid: String, password: String)?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var statusMessage = "Point camera at the Wi-Fi QR code"

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                QRScannerRepresentable(
                    onScan: { rawValue in
                        if let parsed = WiFiQRCode.parse(rawValue) {
                            onResult((ssid: parsed.ssid, password: parsed.password))
                        } else {
                            statusMessage = "That's not a Wi-Fi QR code — try again."
                        }
                    }
                )
                .ignoresSafeArea()

                VStack {
                    Spacer()
                    Text(statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.black.opacity(0.6), in: Capsule())
                        .padding(.bottom, 40)
                }
            }
            .navigationTitle("Scan Wi-Fi code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onResult(nil) }
                        .foregroundStyle(.white)
                }
            }
            .toolbarBackground(.black, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
    }
}

/// Thin UIViewControllerRepresentable around AVCaptureSession configured for
/// QR codes. We don't keep any state — first valid decode wins, the parent
/// dismisses the sheet.
struct QRScannerRepresentable: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    func makeUIViewController(context: Context) -> QRScannerVC {
        let vc = QRScannerVC()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: QRScannerVC, context: Context) {}

    final class Coordinator: NSObject, QRScannerVCDelegate {
        let onScan: (String) -> Void
        private var didFire = false
        init(onScan: @escaping (String) -> Void) { self.onScan = onScan }
        func qrScannerDidDecode(_ value: String) {
            // Debounce — AVCapture can fire multiple frames per second once
            // it's locked on, but we only want one delivery.
            guard !didFire else { return }
            didFire = true
            onScan(value)
        }
    }
}

protocol QRScannerVCDelegate: AnyObject {
    func qrScannerDidDecode(_ value: String)
}

final class QRScannerVC: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    weak var delegate: QRScannerVCDelegate?
    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if !session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            session.stopRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    private func configureSession() {
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        previewLayer = layer
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        for obj in metadataObjects {
            if let r = obj as? AVMetadataMachineReadableCodeObject,
               r.type == .qr,
               let value = r.stringValue {
                delegate?.qrScannerDidDecode(value)
                return
            }
        }
    }
}
