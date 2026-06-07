import Foundation
import NearbyInteraction
import CoreBluetooth
import simd

/// Drives UWB precision-finding against a Qorvo DWM3001 sign tag using Apple's
/// **Nearby Interaction Accessory Protocol** (`NINearbyAccessoryConfiguration`).
///
/// IMPORTANT: this is the THIRD-PARTY ACCESSORY model, not the iPhone↔iPhone
/// peer model. A DWM3001 can't produce an Apple `NIDiscoveryToken`; instead the
/// phone and tag exchange Apple "accessory configuration data" over BLE, then
/// range over UWB. (The earlier version used `NINearbyPeerConfiguration`, which
/// only works between two Apple devices — see docs/UWB_PLAN.md.)
///
/// BLE transport = Nordic UART Service (NUS), which is what Qorvo's "Nearby
/// Interaction" sample firmware for the DWM3001 uses. Confirm these against the
/// flashed firmware.
///
/// Accessory-protocol messages (match Qorvo sample / Apple NINearbyAccessorySample):
///   phone → tag:  0x0A initialize · 0x0B configureAndStart(+config) · 0x0C stop
///   tag → phone:  0x01 accessoryConfigurationData(+data) · 0x02 uwbDidStart · 0x03 uwbDidStop
@MainActor
final class SignFinder: NSObject, ObservableObject {

    // MARK: BLE / protocol constants (must match the tag firmware)
    private enum NUS {
        static let service = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        static let rx      = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E") // write: phone → tag
        static let tx      = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E") // notify: tag → phone
    }
    private enum ToAccessory: UInt8 { case initialize = 0x0A, configureAndStart = 0x0B, stop = 0x0C }
    private enum FromAccessory: UInt8 { case configurationData = 0x01, uwbDidStart = 0x02, uwbDidStop = 0x03 }

    enum State {
        case idle
        case lookingUp
        case connecting
        case ranging(distance: Float, direction: simd_float3?)
        case signFound
        case unavailable(reason: String)
    }

    @Published private(set) var state: State = .idle

    private var niSession: NISession?
    private var central: CBCentralManager?
    private var tagPeripheral: CBPeripheral?
    private var rxChar: CBCharacteristic?
    private var bleUuid: String?

    // MARK: - Public API

    func start(alertId: String) async {
        // 1. Does this iPhone even do UWB? (U1/U2 chip — iPhone 11+.)
        guard NISession.deviceCapabilities.supportsPreciseDistanceMeasurement else {
            state = .unavailable(
                reason: "This iPhone doesn't have a U1 or U2 chip. iPhone 11 and newer are supported.")
            return
        }

        // 2. Which tag is paired to this alert's hanger?
        state = .lookingUp
        do {
            let info = try await APIClient.shared.fetchSignTagForAlert(alertId: alertId)
            self.bleUuid = info.bleUuid
        } catch {
            state = .unavailable(
                reason: "No precision-finding tag is paired with this sign. Using floor plan instead.")
            return
        }

        // 3. Scan/connect over BLE (the scan starts once Bluetooth reports poweredOn).
        state = .connecting
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func stop() {
        send(.stop)
        niSession?.invalidate()
        niSession = nil
        if let p = tagPeripheral { central?.cancelPeripheralConnection(p) }
        tagPeripheral = nil
        rxChar = nil
        central = nil
    }

    func markFound() {
        state = .signFound
        stop()
    }

    // MARK: - Helpers

    /// Send an accessory-protocol message: [messageId byte] + payload.
    private func send(_ messageId: ToAccessory, _ payload: Data = Data()) {
        guard let peripheral = tagPeripheral, let rx = rxChar else { return }
        var msg = Data([messageId.rawValue])
        msg.append(payload)
        peripheral.writeValue(msg, for: rx, type: .withResponse)
    }
}

// MARK: - Bluetooth scanning

extension SignFinder: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            guard central.state == .poweredOn else {
                self.state = .unavailable(reason: "Bluetooth is off. Turn it on in Settings.")
                return
            }
            central.scanForPeripherals(withServices: [NUS.service], options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String : Any],
                                    rssi RSSI: NSNumber) {
        Task { @MainActor in
            guard self.tagPeripheral == nil else { return }
            // Prefer the tag the backend pinned to this alert; fall back to the
            // first NUS peripheral if no UUID was provisioned yet.
            if let expected = self.bleUuid, !expected.isEmpty,
               peripheral.identifier.uuidString != expected { return }
            self.tagPeripheral = peripheral
            peripheral.delegate = self
            central.stopScan()
            central.connect(peripheral, options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([NUS.service])
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in self.state = .unavailable(reason: "Couldn't connect to the tag.") }
    }
}

// MARK: - GATT discovery + accessory-protocol kickoff

extension SignFinder: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let svc = peripheral.services?.first(where: { $0.uuid == NUS.service }) else { return }
        peripheral.discoverCharacteristics([NUS.rx, NUS.tx], for: svc)
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverCharacteristicsFor service: CBService,
                                error: Error?) {
        guard let chars = service.characteristics else { return }
        Task { @MainActor in
            self.rxChar = chars.first(where: { $0.uuid == NUS.rx })
            if let tx = chars.first(where: { $0.uuid == NUS.tx }) {
                peripheral.setNotifyValue(true, for: tx)
            }
            // Kick off the handshake: ask the tag for its accessory config.
            self.send(.initialize)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didUpdateValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        guard let data = characteristic.value, let first = data.first,
              let kind = FromAccessory(rawValue: first) else { return }
        let payload = data.count > 1 ? data.subdata(in: 1..<data.count) : Data()
        Task { @MainActor in
            switch kind {
            case .configurationData:
                self.startSession(with: payload)
            case .uwbDidStart:
                break // ranging state arrives on the first NISession update
            case .uwbDidStop:
                self.state = .connecting
            }
        }
    }

    /// Build the accessory configuration from the tag's blob and run the session.
    /// The session then asks us (didGenerateShareableConfigurationData) for the
    /// data to send back in configureAndStart.
    @MainActor
    private func startSession(with accessoryData: Data) {
        do {
            let config = try NINearbyAccessoryConfiguration(data: accessoryData)
            let session = niSession ?? NISession()
            session.delegate = self
            niSession = session
            session.run(config)
        } catch {
            state = .unavailable(reason: "Couldn't start UWB session: \(error.localizedDescription)")
        }
    }
}

// MARK: - NI session callbacks

extension SignFinder: NISessionDelegate {
    /// Accessory flow: the session hands us the blob to send to the tag to make
    /// it start its side of the UWB session.
    nonisolated func session(_ session: NISession,
                             didGenerateShareableConfigurationData data: Data,
                             for object: NINearbyObject) {
        Task { @MainActor in self.send(.configureAndStart, data) }
    }

    nonisolated func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        guard let obj = nearbyObjects.first else { return }
        Task { @MainActor in
            let distance = obj.distance ?? Float.greatestFiniteMagnitude
            self.state = .ranging(distance: distance, direction: obj.direction)
        }
    }

    nonisolated func session(_ session: NISession,
                             didRemove nearbyObjects: [NINearbyObject],
                             reason: NINearbyObject.RemovalReason) {
        // Peer dropped — show a recoverable "connecting" state; NI re-acquires
        // automatically when the tag responds again.
        Task { @MainActor in self.state = .connecting }
    }

    nonisolated func sessionWasSuspended(_ session: NISession) {}
    nonisolated func sessionSuspensionEnded(_ session: NISession) {
        // Re-run by asking the tag to reconfigure.
        Task { @MainActor in self.send(.initialize) }
    }
    nonisolated func session(_ session: NISession, didInvalidateWith error: Error) {
        Task { @MainActor in
            self.state = .unavailable(reason: "Session ended: \(error.localizedDescription)")
        }
    }
}
