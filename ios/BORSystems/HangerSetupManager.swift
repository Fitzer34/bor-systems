import Foundation
import CoreBluetooth
import Combine
import NetworkExtension
import CoreLocation

/// The class of hardware we're onboarding. Same BLE protocol on the wire —
/// only the advertised name prefix and the UI copy differ.
enum SetupDeviceKind: String, CaseIterable, Identifiable {
    case hanger
    case gateway

    var id: String { rawValue }

    /// Prefix used by `firmware/src/setup_mode/setup_mode.cpp::deviceName()`.
    /// Branded as HazardLink-* on new builds. We also accept the older
    /// BOR-* and `BOR-Setup-` prefixes so devices flashed before the
    /// rebrand can still be onboarded by a freshly-built app.
    var bleNamePrefixes: [String] {
        switch self {
        case .hanger:  return [
            "HazardLink-Hanger-", "HazardLink-HangerW-",
            "BOR-Hanger-", "BOR-HangerW-", "BOR-Setup-",
        ]
        case .gateway: return [
            "HazardLink-GW-",
            "BOR-GW-",
        ]
        }
    }

    var humanName: String {
        switch self {
        case .hanger:  return "hanger"
        case .gateway: return "gateway"
        }
    }
}

/// Drives the BLE side of first-time Wi-Fi onboarding.
///
/// One manager, used for both hangers and the building gateway — the wire
/// protocol is identical, the only difference is which advertised name
/// prefix we accept during the scan. Sister to `pi/setup_mode.py` — keep
/// UUIDs in sync byte-for-byte.
///
/// State machine:
///   .idle → .scanning → .found → .connecting → .pairing → .ready →
///   (user fills SSID/password) → .joining → .connected | .failed(message)
///
/// Everything is published as @Published so SwiftUI can drive a clean flow.
@MainActor
final class HangerSetupManager: NSObject, ObservableObject {

    /// What we're filtering the scan to. Set by `startScan(kind:)`.
    private var deviceKind: SetupDeviceKind = .hanger

    // MARK: GATT UUIDs — same as pi/setup_mode.py

    // These are constants and need to be readable from CoreBluetooth delegate
    // callbacks (which run on the delegate's queue, not the main actor).
    // `nonisolated` opts them out of the @MainActor isolation the class
    // imposes — fine because CBUUID is immutable and these are just IDs.
    nonisolated static let serviceUUID  = CBUUID(string: "b08e0001-d4e2-4f5a-9c01-3f25d3a7c2a1")
    nonisolated private static let chrSSID     = CBUUID(string: "b08e0002-d4e2-4f5a-9c01-3f25d3a7c2a1")
    nonisolated private static let chrPassword = CBUUID(string: "b08e0003-d4e2-4f5a-9c01-3f25d3a7c2a1")
    nonisolated private static let chrCommit   = CBUUID(string: "b08e0004-d4e2-4f5a-9c01-3f25d3a7c2a1")
    nonisolated private static let chrStatus   = CBUUID(string: "b08e0005-d4e2-4f5a-9c01-3f25d3a7c2a1")
    nonisolated private static let chrDevEui   = CBUUID(string: "b08e0006-d4e2-4f5a-9c01-3f25d3a7c2a1")

    // MARK: Public state

    enum Phase: Equatable {
        case idle
        case bluetoothOff
        case scanning
        case connecting(name: String)
        case discovering           // service + characteristic discovery
        case ready                 // characteristics resolved, waiting for SSID+password
        case sending
        case joining
        case connected
        case failed(message: String)
    }

    @Published var phase: Phase = .idle
    /// Devices the manager has spotted in this scan. Sorted strongest-signal-first.
    @Published var discovered: [DiscoveredHanger] = []
    /// The DevEUI the Pi reported back, set once we're connected. Lets the
    /// caller register the hanger with the cloud without manual entry.
    @Published var devEui: String?

    struct DiscoveredHanger: Identifiable, Equatable {
        let id: UUID         // CBPeripheral.identifier
        let name: String
        let rssi: Int
    }

    // MARK: Internals

    private var central: CBCentralManager!
    private var connected: CBPeripheral?
    private var ssidChar: CBCharacteristic?
    private var passwordChar: CBCharacteristic?
    private var commitChar: CBCharacteristic?
    private var statusChar: CBCharacteristic?
    private var devEuiChar: CBCharacteristic?

    /// Captured locally so we can write password + commit once SSID write is acknowledged.
    private var pendingSsid: String?
    private var pendingPassword: String?

    /// Cap the scan so the UI doesn't spin forever when no hanger is in range.
    private var scanDeadline: Task<Void, Never>?

    // MARK: Lifecycle

    override init() {
        super.init()
        // Defer the CBCentralManager construction until the user starts a
        // scan — that's the point at which iOS shows the permission prompt.
    }

    func startScan(kind: SetupDeviceKind = .hanger) {
        deviceKind = kind
        if central == nil {
            central = CBCentralManager(delegate: self, queue: .main, options: nil)
        }
        discovered = []
        devEui = nil
        phase = central.state == .poweredOn ? .scanning : .idle
        if central.state == .poweredOn {
            beginScan()
        }
        // Else we'll start scanning when centralManagerDidUpdateState
        // tells us Bluetooth is on.
    }

    private func beginScan() {
        central.scanForPeripherals(withServices: [Self.serviceUUID], options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false,
        ])
        scanDeadline?.cancel()
        scanDeadline = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 30 * 1_000_000_000)
            guard let self = self else { return }
            if case .scanning = self.phase, self.discovered.isEmpty {
                self.central.stopScan()
                let kindName = self.deviceKind.humanName
                let powerHint = self.deviceKind == .gateway
                    ? "Make sure the gateway is plugged into mains power and the OLED is showing the pairing PIN."
                    : "Make sure the hanger is powered and the green LED is breathing."
                self.phase = .failed(message: "No \(kindName)s found nearby. \(powerHint)")
            }
        }
    }

    func cancel() {
        scanDeadline?.cancel()
        central?.stopScan()
        if let p = connected {
            central?.cancelPeripheralConnection(p)
        }
        connected = nil
        ssidChar = nil; passwordChar = nil; commitChar = nil; statusChar = nil; devEuiChar = nil
        phase = .idle
        discovered = []
    }

    func connect(to hanger: DiscoveredHanger) {
        guard let central = central else { return }
        scanDeadline?.cancel()
        central.stopScan()
        guard let peripheral = central.retrievePeripherals(withIdentifiers: [hanger.id]).first else {
            phase = .failed(message: "Hanger went out of range.")
            return
        }
        peripheral.delegate = self
        connected = peripheral
        phase = .connecting(name: hanger.name)
        central.connect(peripheral, options: nil)
    }

    /// Final step — sends SSID, then password, then commits. iOS will prompt
    /// for the pairing passkey on the first encrypted write.
    func submitCredentials(ssid: String, password: String) {
        guard
            let peripheral = connected,
            let ssidChar = ssidChar
        else {
            phase = .failed(message: "Lost the hanger before we could send credentials.")
            return
        }
        pendingSsid = ssid
        pendingPassword = password
        phase = .sending
        peripheral.writeValue(Data(ssid.utf8), for: ssidChar, type: .withResponse)
    }
}

// MARK: - CBCentralManagerDelegate

extension HangerSetupManager: CBCentralManagerDelegate {

    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                if case .idle = phase {
                    // first-launch power-on; do nothing until user starts scan
                } else if case .scanning = phase {
                    beginScan()
                } else if case .bluetoothOff = phase {
                    phase = .scanning
                    beginScan()
                }
            case .poweredOff:
                phase = .bluetoothOff
            case .unauthorized:
                phase = .failed(message: "Bluetooth permission denied. Allow it in Settings → HazardLink → Bluetooth.")
            case .unsupported:
                phase = .failed(message: "This device doesn't support Bluetooth.")
            default:
                break
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String: Any],
                                    rssi RSSI: NSNumber) {
        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? peripheral.name
            ?? "Unknown device"
        let rssi = RSSI.intValue
        let id = peripheral.identifier
        Task { @MainActor in
            // Only surface devices whose advertised name matches the kind the
            // user actually asked to add. The BLE service UUID is identical
            // across all SKUs, so we have to do the split at the name level.
            let prefixes = deviceKind.bleNamePrefixes
            guard prefixes.contains(where: { name.hasPrefix($0) }) else { return }

            if let idx = discovered.firstIndex(where: { $0.id == id }) {
                discovered[idx] = DiscoveredHanger(id: id, name: name, rssi: rssi)
            } else {
                discovered.append(DiscoveredHanger(id: id, name: name, rssi: rssi))
            }
            // Strongest signal first.
            discovered.sort { $0.rssi > $1.rssi }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            phase = .discovering
            peripheral.discoverServices([Self.serviceUUID])
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didFailToConnect peripheral: CBPeripheral,
                                    error: Error?) {
        let msg = error?.localizedDescription ?? "Couldn't connect to the hanger."
        Task { @MainActor in
            phase = .failed(message: msg)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDisconnectPeripheral peripheral: CBPeripheral,
                                    error: Error?) {
        Task { @MainActor in
            if case .connected = phase { return }   // expected

            // BLE notify() is fire-and-forget. The firmware fires "connected"
            // before tearing the link down, but the notify can be dropped if
            // the link is briefly busy. If we made it to .joining (commit
            // succeeded), the device almost certainly joined Wi-Fi — the
            // disconnect just beat the notify. Treat as success so the user
            // sees the right UI; the cloud check on next dashboard load
            // confirms it.
            if case .joining = phase {
                phase = .connected
                return
            }
            // .sending or .ready disconnects are unambiguous failures —
            // commit hadn't even been written yet.
            if let err = error {
                phase = .failed(message: err.localizedDescription)
            }
        }
    }
}

// MARK: - CBPeripheralDelegate

extension HangerSetupManager: CBPeripheralDelegate {

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let svc = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) {
            peripheral.discoverCharacteristics([
                Self.chrSSID, Self.chrPassword, Self.chrCommit, Self.chrStatus, Self.chrDevEui,
            ], for: svc)
        } else {
            let msg = error?.localizedDescription ?? "This device doesn't expose the BOR setup service."
            Task { @MainActor in
                phase = .failed(message: msg)
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverCharacteristicsFor service: CBService,
                                error: Error?) {
        for c in service.characteristics ?? [] {
            switch c.uuid {
            case Self.chrSSID:     Task { @MainActor in ssidChar = c }
            case Self.chrPassword: Task { @MainActor in passwordChar = c }
            case Self.chrCommit:   Task { @MainActor in commitChar = c }
            case Self.chrStatus:
                Task { @MainActor in statusChar = c }
                peripheral.setNotifyValue(true, for: c)
                peripheral.readValue(for: c)
            case Self.chrDevEui:
                Task { @MainActor in devEuiChar = c }
                peripheral.readValue(for: c)
            default: break
            }
        }
        Task { @MainActor in
            if ssidChar != nil, passwordChar != nil, commitChar != nil, statusChar != nil {
                phase = .ready
            }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didUpdateValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        guard let data = characteristic.value else { return }
        let text = String(data: data, encoding: .utf8) ?? ""
        if characteristic.uuid == Self.chrDevEui {
            Task { @MainActor in
                if !text.isEmpty { devEui = text }
            }
            return
        }
        if characteristic.uuid == Self.chrStatus {
            Task { @MainActor in handleStatus(text) }
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didWriteValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        if let error = error {
            Task { @MainActor in
                phase = .failed(message: "Write failed: \(error.localizedDescription)")
            }
            return
        }
        Task { @MainActor in
            if characteristic.uuid == Self.chrSSID, let pwd = pendingPassword, let pwdChar = passwordChar {
                peripheral.writeValue(Data(pwd.utf8), for: pwdChar, type: .withResponse)
            } else if characteristic.uuid == Self.chrPassword, let commitChar = commitChar {
                phase = .joining
                peripheral.writeValue(Data([0x01]), for: commitChar, type: .withResponse)
            }
        }
    }

    @MainActor
    private func handleStatus(_ raw: String) {
        // setup_mode.py emits: "ready" | "joining" | "connected" | "failed:<reason>"
        let normalised = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalised == "ready" {
            // Nothing to do — we wait for the user to submit credentials.
        } else if normalised == "joining" {
            phase = .joining
        } else if normalised == "connected" {
            phase = .connected
        } else if normalised.hasPrefix("failed:") {
            let reason = String(normalised.dropFirst("failed:".count))
            phase = .failed(message: friendlyJoinError(reason))
        }
    }

    private func friendlyJoinError(_ reason: String) -> String {
        if reason.contains("missing_credentials") { return "We didn't send credentials — try again." }
        if reason.lowercased().contains("password") { return "Wrong Wi-Fi password. Try again." }
        if reason.lowercased().contains("timeout") { return "Took too long to connect. Move the hanger closer to the router and retry." }
        if reason.contains("Secrets were required") { return "Wrong Wi-Fi password. Try again." }
        return reason.isEmpty ? "Couldn't join that Wi-Fi network." : reason
    }
}

// MARK: - WiFi helpers ──────────────────────────────────────────────────────
//
// Cuts the WiFi typing in the onboarding flow as much as iOS allows. Things
// we CAN do here:
//   - Auto-detect the SSID the phone is currently joined to (with Location
//     permission + Access WiFi Information entitlement).
//   - Cache the WiFi password in-memory for the lifetime of the app session
//     so onboarding multiple hangers only takes one password entry total.
//   - Parse the standard `WIFI:S:...;T:WPA;P:...;;` QR code format used by
//     iOS's "Share Wi-Fi password as QR code" and most routers' stickers.
//
// Things iOS doesn't let us do, no matter what we try:
//   - Read the password of the currently-joined network. iCloud Keychain
//     stores it, but Apple does not expose it to any third-party app. We
//     have to ask the user (or get it from a QR code) at least once per
//     session.

/// In-memory password cache. Lives for the lifetime of the app process
/// only — never written to disk, Keychain, or anywhere else. Cleared when
/// the user signs out (call `WiFiSession.clear()` from AuthStore.logout).
enum WiFiSession {
    nonisolated(unsafe) static var lastSsid: String?
    nonisolated(unsafe) static var lastPassword: String?

    static func remember(ssid: String, password: String) {
        lastSsid = ssid
        lastPassword = password
    }

    static func clear() {
        lastSsid = nil
        lastPassword = nil
    }
}

/// Asks iOS for the SSID of the network the phone is currently joined to.
/// Requires the **Access WiFi Information** capability + a populated
/// `NSLocationWhenInUseUsageDescription` in Info.plist + the user granting
/// location permission. Returns nil if any of those preconditions fail —
/// the calling view just leaves the SSID field empty in that case.
enum WiFiCurrentNetwork {
    /// Synchronous-feeling wrapper around `NEHotspotNetwork.fetchCurrent`.
    /// Calls `completion` on the main thread.
    static func fetchSSID(completion: @escaping (String?) -> Void) {
        // Location permission is a hard prereq for current-SSID lookup
        // on iOS 13+. Request it lazily here so the prompt appears at the
        // moment the user opens the Add Hanger / Add Gateway sheet.
        let locManager = CLLocationManager()
        let status = locManager.authorizationStatus
        if status == .notDetermined {
            locManager.requestWhenInUseAuthorization()
            // The callback isn't critical — we'll just return nil for now
            // and the user can re-open the screen once they've granted.
        }
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            completion(nil)
            return
        }

        NEHotspotNetwork.fetchCurrent { network in
            DispatchQueue.main.async {
                completion(network?.ssid)
            }
        }
    }
}

/// Parses the WiFi QR code format used by iOS's "Share Wi-Fi password" and
/// most consumer routers' stickers. The grammar is:
///
///     WIFI:S:<ssid>;T:<WPA|WEP|nopass>;P:<password>;H:<true|false>;;
///
/// Field order isn't fixed in the spec — we tokenise on `;` rather than
/// assuming positions. Returns nil if the string isn't a WIFI: QR.
enum WiFiQRCode {
    static func parse(_ raw: String) -> (ssid: String, password: String)? {
        guard raw.uppercased().hasPrefix("WIFI:") else { return nil }
        let body = String(raw.dropFirst(5))   // strip "WIFI:"
        var ssid = ""
        var password = ""
        // Split on unescaped semicolons. WIFI: spec lets `;` inside fields
        // be backslash-escaped, but we keep it simple — almost no router
        // ever does that.
        for token in body.split(separator: ";", omittingEmptySubsequences: true) {
            let parts = token.split(separator: ":", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { continue }
            let key = parts[0].uppercased()
            let value = parts[1]
            switch key {
            case "S": ssid = value
            case "P": password = value
            default:  break  // T (security type), H (hidden), R (reserved) — ignored
            }
        }
        return ssid.isEmpty ? nil : (ssid, password)
    }
}
