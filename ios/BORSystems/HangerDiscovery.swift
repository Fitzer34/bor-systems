import Foundation
import CoreBluetooth
import Combine

/// Scans for the BLE discovery beacon that hangers broadcast during their
/// onboarding window (see firmware `hanger_beacon.cpp`). This is discovery
/// ONLY — we never connect or pair. The hanger advertises its DevEUI in the
/// manufacturer-data field; we read it straight out of the scan result so the
/// installer can tap a hanger to register it instead of typing the 16-char code.
///
/// The actual sensor data path is unrelated to this — it's LoRa → gateway →
/// cloud. Bluetooth here is purely a "find the thing in front of me" helper.
struct DiscoveredHangerBeacon: Identifiable, Equatable {
    let id: String      // DevEUI — stable identity across repeated adv packets
    let devEui: String
    var rssi: Int
}

@MainActor
final class HangerBeaconScanner: NSObject, ObservableObject {

    /// Must match firmware `hanger_beacon.cpp::BEACON_SERVICE_UUID`.
    nonisolated static let serviceUUID =
        CBUUID(string: "b08e0010-d4e2-4f5a-9c01-3f25d3a7c2a1")
    /// Must match firmware `COMPANY_ID` (0xFFFF, little-endian on the wire).
    nonisolated static let companyID: UInt16 = 0xFFFF

    @Published var nearby: [DiscoveredHangerBeacon] = []
    @Published var bluetoothOff = false
    @Published var scanning = false

    private var central: CBCentralManager?
    /// DevEUIs we last heard from, with a timestamp, so stale beacons drop off
    /// the list when a hanger's window closes or it's carried out of range.
    private var lastSeen: [String: Date] = [:]
    private var pruneTimer: Timer?

    func start() {
        if central == nil {
            central = CBCentralManager(delegate: self, queue: .main)
        }
        nearby = []
        lastSeen = [:]
        if central?.state == .poweredOn { beginScan() }
        // Drop entries we haven't heard from in 8s (beacon adv interval is sub-
        // second, so 8s of silence means it's gone).
        pruneTimer?.invalidate()
        pruneTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.prune() }
        }
    }

    func stop() {
        scanning = false
        central?.stopScan()
        pruneTimer?.invalidate()
        pruneTimer = nil
    }

    private func beginScan() {
        scanning = true
        // allowDuplicates so we keep getting RSSI updates + refreshed timestamps
        // for the prune logic.
        central?.scanForPeripherals(
            withServices: [Self.serviceUUID],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )
    }

    private func prune() {
        let cutoff = Date().addingTimeInterval(-8)
        let stale = lastSeen.filter { $0.value < cutoff }.map(\.key)
        guard !stale.isEmpty else { return }
        for k in stale { lastSeen[k] = nil }
        nearby.removeAll { stale.contains($0.id) }
    }
}

extension HangerBeaconScanner: CBCentralManagerDelegate {

    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                bluetoothOff = false
                beginScan()
            case .poweredOff:
                bluetoothOff = true
                nearby = []
            default:
                break
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String: Any],
                                    rssi RSSI: NSNumber) {
        // Pull the DevEUI out of manufacturer data: [company_lo, company_hi,
        // ...ASCII DevEUI]. Bail on anything that isn't our company ID.
        guard let mfr = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data,
              mfr.count >= 3 else { return }
        let company = UInt16(mfr[mfr.startIndex]) |
                      (UInt16(mfr[mfr.startIndex + 1]) << 8)
        guard company == Self.companyID else { return }

        let euiBytes = mfr.suffix(from: mfr.startIndex + 2)
        guard let devEui = String(data: Data(euiBytes), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased(),
              !devEui.isEmpty else { return }

        let rssi = RSSI.intValue
        Task { @MainActor in
            lastSeen[devEui] = Date()
            if let idx = nearby.firstIndex(where: { $0.id == devEui }) {
                nearby[idx].rssi = rssi
            } else {
                nearby.append(DiscoveredHangerBeacon(id: devEui, devEui: devEui, rssi: rssi))
            }
            nearby.sort { $0.rssi > $1.rssi }   // strongest signal first
        }
    }
}

/// Plain-English signal label for a BLE RSSI, shared by the discovery UI.
func bleSignalLabel(_ rssi: Int) -> String {
    switch rssi {
    case (-60)...:        return "right here"
    case (-75)...(-61):   return "strong signal"
    case (-88)...(-76):   return "ok signal"
    default:              return "weak signal"
    }
}
