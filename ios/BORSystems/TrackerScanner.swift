import Foundation
import SwiftUI
import CoreBluetooth

/// Scans for nearby Qorvo "Nearby Interaction" trackers so an installer can pin
/// one to a hanger by holding the phone next to the sign and tapping — no typing.
/// Discovery only (we never connect here); the actual UWB ranging is SignFinder.
struct DiscoveredTracker: Identifiable, Equatable {
    let id: String   // CoreBluetooth identifier — stable per phone, unique per tag
    let name: String
    var rssi: Int
}

@MainActor
final class TrackerScanner: NSObject, ObservableObject {
    // The same NI GATT profiles SignFinder binds to (firmware advertises one).
    nonisolated static let services = [
        CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"), // Nordic UART
        CBUUID(string: "2E938FD0-6A61-11ED-A1EB-0242AC120002"), // Qorvo NI
    ]

    @Published var nearby: [DiscoveredTracker] = []
    @Published var bluetoothOff = false
    @Published var scanning = false

    private var central: CBCentralManager?
    private var lastSeen: [String: Date] = [:]
    private var pruneTimer: Timer?

    func start() {
        if central == nil { central = CBCentralManager(delegate: self, queue: .main) }
        nearby = []
        lastSeen = [:]
        if central?.state == .poweredOn { beginScan() }
        // Drop entries we haven't heard from in 8s (so trackers carried away or
        // powered off fall off the list).
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
        // allowDuplicates so RSSI keeps refreshing (closest-first ordering).
        central?.scanForPeripherals(
            withServices: Self.services,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }

    private func prune() {
        let cutoff = Date().addingTimeInterval(-8)
        let stale = lastSeen.filter { $0.value < cutoff }.map(\.key)
        guard !stale.isEmpty else { return }
        for k in stale { lastSeen[k] = nil }
        nearby.removeAll { stale.contains($0.id) }
    }
}

extension TrackerScanner: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:  bluetoothOff = false; beginScan()
            case .poweredOff: bluetoothOff = true; nearby = []
            default: break
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String: Any],
                                    rssi RSSI: NSNumber) {
        let id = peripheral.identifier.uuidString
        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? peripheral.name ?? "Tracker"
        let rssi = RSSI.intValue
        Task { @MainActor in
            lastSeen[id] = Date()
            if let idx = nearby.firstIndex(where: { $0.id == id }) {
                nearby[idx].rssi = rssi
            } else {
                nearby.append(DiscoveredTracker(id: id, name: name, rssi: rssi))
            }
            nearby.sort { $0.rssi > $1.rssi }   // closest (strongest) first
        }
    }
}

/// Sheet: scan and tap a nearby tracker to pin it to a hanger.
struct TrackerAssignSheet: View {
    let hangerId: String
    let onAssigned: (HangerTracker) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var scanner = TrackerScanner()
    @State private var assigningId: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if scanner.bluetoothOff {
                        Label("Bluetooth is off. Turn it on in Settings.",
                              systemImage: "wifi.slash")
                            .foregroundStyle(.secondary)
                    } else if scanner.nearby.isEmpty {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Looking for trackers…")
                        }
                    } else {
                        ForEach(scanner.nearby) { t in
                            Button {
                                Task { await assign(t) }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(t.name)
                                        Text(bleSignalLabel(t.rssi))
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if assigningId == t.id {
                                        ProgressView()
                                    } else {
                                        Image(systemName: "plus.circle.fill")
                                            .foregroundStyle(.blue)
                                    }
                                }
                            }
                            .disabled(assigningId != nil)
                        }
                    }
                } footer: {
                    Text("Hold the phone right next to this sign's tracker — the closest one shows at the top.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Assign tracker")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { scanner.start() }
            .onDisappear { scanner.stop() }
        }
    }

    private func assign(_ t: DiscoveredTracker) async {
        assigningId = t.id; error = nil
        do {
            let tracker = try await APIClient.shared.assignTracker(hangerId: hangerId, bleUuid: t.id)
            onAssigned(tracker)
            dismiss()
        } catch {
            self.error = "Couldn't assign that tracker — try again."
            assigningId = nil
        }
    }
}
