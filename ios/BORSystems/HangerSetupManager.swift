import Foundation
import CoreBluetooth
import Combine

/// Drives the BLE side of "Add a hanger" first-time Wi-Fi onboarding.
///
/// Sister to `pi/setup_mode.py` — keep the UUIDs in sync byte-for-byte.
/// State machine:
///   .idle → .scanning → .found → .connecting → .pairing → .ready →
///   (user fills SSID/password) → .joining → .connected | .failed(message)
///
/// Everything is published as @Published so SwiftUI can drive a clean flow.
@MainActor
final class HangerSetupManager: NSObject, ObservableObject {

    // MARK: GATT UUIDs — same as pi/setup_mode.py

    static let serviceUUID  = CBUUID(string: "b08e0001-d4e2-4f5a-9c01-3f25d3a7c2a1")
    private static let chrSSID     = CBUUID(string: "b08e0002-d4e2-4f5a-9c01-3f25d3a7c2a1")
    private static let chrPassword = CBUUID(string: "b08e0003-d4e2-4f5a-9c01-3f25d3a7c2a1")
    private static let chrCommit   = CBUUID(string: "b08e0004-d4e2-4f5a-9c01-3f25d3a7c2a1")
    private static let chrStatus   = CBUUID(string: "b08e0005-d4e2-4f5a-9c01-3f25d3a7c2a1")
    private static let chrDevEui   = CBUUID(string: "b08e0006-d4e2-4f5a-9c01-3f25d3a7c2a1")

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

    func startScan() {
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
                self.phase = .failed(message: "No hangers found nearby. Make sure the hanger is plugged in and the green LED is breathing.")
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
                phase = .failed(message: "Bluetooth permission denied. Allow it in Settings → BOR Systems → Bluetooth.")
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
            ?? "Unknown hanger"
        let rssi = RSSI.intValue
        let id = peripheral.identifier
        Task { @MainActor in
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
