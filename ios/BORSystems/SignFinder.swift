import Foundation
import NearbyInteraction
import CoreBluetooth
import simd

/// Drives the UWB precision-finding session against the sign-side
/// Qorvo DWM3001 tag.
///
/// State machine:
///
///   idle
///     │  start(alertId:)
///     ▼
///   lookingUp ─── backend /sign-tags/for-alert/:id
///     │
///     ├── 404 / no UWB on this phone → unavailable(reason)
///     │
///     ▼
///   connecting ─── CBCentralManager scan + connect to tag's BLE UUID
///     │           ─── exchange NI discovery tokens over a writable BLE
///     │              characteristic (matches the tag's GATT spec)
///     ▼
///   ranging(distance, direction) ─── NISession callbacks stream every ~100 ms
///     │
///     │  markFound() OR session drops
///     ▼
///   signFound
///
/// Hardware contract (matches the firmware we'll write for the DWM3001):
///   - Tag advertises BLE service 0xFE59 (BOR sign) with the bleUuid from
///     the backend as the instance UUID
///   - One characteristic 0xFE5A: writable — accepts a 16-byte NIDiscoveryToken
///     from the iPhone, then the tag computes its own token and writes it back
///   - One characteristic 0xFE5B: notify — tag's UWB MAC address (8 bytes)
@MainActor
final class SignFinder: NSObject, ObservableObject {

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
    private var bleUuid: String?
    private var uwbAddress: String?

    // MARK: - Public API

    func start(alertId: String) async {
        // 1. Check hardware support first. NIDeviceCapability is the
        //    canonical "does this phone do UWB" check.
        guard NISession.deviceCapabilities.supportsPreciseDistanceMeasurement else {
            state = .unavailable(
                reason: "This iPhone doesn't have a U1 or U2 chip. iPhone 11 and newer are supported.")
            return
        }

        state = .lookingUp
        do {
            let info = try await APIClient.shared.fetchSignTagForAlert(alertId: alertId)
            self.bleUuid    = info.bleUuid
            self.uwbAddress = info.uwbAddress
        } catch {
            state = .unavailable(
                reason: "No precision-finding tag is paired with this sign. Using floor plan instead.")
            return
        }

        state = .connecting
        central = CBCentralManager(delegate: self, queue: nil)
        // CBCentralManager's centralManagerDidUpdateState callback will
        // kick off the scan once Bluetooth is actually powered on.
    }

    func stop() {
        niSession?.invalidate()
        niSession = nil
        if let p = tagPeripheral { central?.cancelPeripheralConnection(p) }
        tagPeripheral = nil
        central = nil
    }

    func markFound() {
        state = .signFound
        stop()
    }

    // MARK: - NI session setup

    private func startNiSession(with discoveryToken: NIDiscoveryToken) {
        let session = NISession()
        session.delegate = self
        let config = NINearbyPeerConfiguration(peerToken: discoveryToken)
        session.run(config)
        niSession = session
        // Move into ranging state once we have ANY callback — until then
        // show "connecting" so the user knows something's happening.
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
            // The tag advertises the BOR sign service. We'll filter
            // matches by the bleUuid we got from the backend lookup.
            let svc = CBUUID(string: "FE59")
            central.scanForPeripherals(withServices: [svc], options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String : Any],
                                    rssi RSSI: NSNumber) {
        Task { @MainActor in
            guard self.tagPeripheral == nil,
                  let expected = self.bleUuid,
                  peripheral.identifier.uuidString == expected else { return }
            self.tagPeripheral = peripheral
            peripheral.delegate = self
            central.stopScan()
            central.connect(peripheral, options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([CBUUID(string: "FE59")])
    }
}

// MARK: - GATT discovery + NI token exchange

extension SignFinder: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverServices error: Error?) {
        guard let svc = peripheral.services?.first(where: { $0.uuid == CBUUID(string: "FE59") })
        else { return }
        peripheral.discoverCharacteristics(
            [CBUUID(string: "FE5A"), CBUUID(string: "FE5B")],
            for: svc)
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverCharacteristicsFor service: CBService,
                                error: Error?) {
        guard let chars = service.characteristics else { return }

        // Write our NI discovery token to the tag.
        if let tokenChar = chars.first(where: { $0.uuid == CBUUID(string: "FE5A") }) {
            Task { @MainActor in
                guard let token = self.niSession?.discoveryToken
                    ?? self.createSessionAndGetToken() else { return }
                let data = try? NSKeyedArchiver.archivedData(
                    withRootObject: token, requiringSecureCoding: true)
                if let data {
                    peripheral.writeValue(data, for: tokenChar, type: .withResponse)
                }
            }
        }

        // Subscribe to the tag's UWB-address notify characteristic.
        if let addrChar = chars.first(where: { $0.uuid == CBUUID(string: "FE5B") }) {
            peripheral.setNotifyValue(true, for: addrChar)
        }
    }

    @MainActor
    private func createSessionAndGetToken() -> NIDiscoveryToken? {
        if niSession == nil { niSession = NISession(); niSession?.delegate = self }
        return niSession?.discoveryToken
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didUpdateValueFor characteristic: CBCharacteristic,
                                error: Error?) {
        // The tag responds with ITS NI discovery token on the same
        // characteristic. Use it to start the ranging session.
        guard let data = characteristic.value,
              let token = try? NSKeyedUnarchiver.unarchivedObject(
                ofClass: NIDiscoveryToken.self, from: data) else { return }
        Task { @MainActor in
            self.startNiSession(with: token)
        }
    }
}

// MARK: - NI session callbacks (the ranging stream)

extension SignFinder: NISessionDelegate {
    nonisolated func session(_ session: NISession,
                             didUpdate nearbyObjects: [NINearbyObject]) {
        guard let obj = nearbyObjects.first else { return }
        Task { @MainActor in
            let distance = obj.distance ?? Float.greatestFiniteMagnitude
            let dir = obj.direction  // simd_float3? — needs both U1 and motion
            self.state = .ranging(distance: distance, direction: dir)
        }
    }

    nonisolated func session(_ session: NISession,
                             didRemove nearbyObjects: [NINearbyObject],
                             reason: NINearbyObject.RemovalReason) {
        Task { @MainActor in
            // Peer dropped — show a recoverable connecting state instead
            // of failing the whole flow. NI will re-pick-up automatically
            // when the tag responds again.
            self.state = .connecting
        }
    }

    nonisolated func sessionWasSuspended(_ session: NISession) {}
    nonisolated func sessionSuspensionEnded(_ session: NISession) {}
    nonisolated func session(_ session: NISession, didInvalidateWith error: Error) {
        Task { @MainActor in
            self.state = .unavailable(reason: "Session ended: \(error.localizedDescription)")
        }
    }
}
