import Foundation
import NearbyInteraction
import CoreBluetooth
import simd
import AVFoundation
import ARKit

/// Drives UWB precision-finding against a Qorvo DWM3001 sign tag using Apple's
/// **Nearby Interaction Accessory Protocol** (`NINearbyAccessoryConfiguration`).
///
/// IMPORTANT: this is the THIRD-PARTY ACCESSORY model, not the iPhone↔iPhone
/// peer model. A DWM3001 can't produce an Apple `NIDiscoveryToken`; instead the
/// phone and tag exchange Apple "accessory configuration data" over BLE, then
/// range over UWB. (The earlier version used `NINearbyPeerConfiguration`, which
/// only works between two Apple devices — see docs/UWB_PLAN.md.)
///
/// BLE transport = Qorvo's NI GATT profile. Qorvo's firmware exposes ONE of two
/// services depending on the board/build (legacy Nordic-UART `6E40…` or the newer
/// Qorvo-NI `2E93…`), so — exactly like Qorvo's QorvoAccessorySample — we scan for
/// and bind to whichever the tag advertises. Verified against QorvoAccessorySample
/// v1.3.5 + the DWM3001CDK-QANI-FreeRTOS QNI 3.0.0 firmware flashed on the tag.
///
/// Accessory-protocol messages (match Qorvo sample / Apple NINearbyAccessorySample):
///   phone → tag:  0x0A initialize · 0x0B configureAndStart(+config) · 0x0C stop
///   tag → phone:  0x01 accessoryConfigurationData(+data) · 0x02 uwbDidStart · 0x03 uwbDidStop
@MainActor
final class SignFinder: NSObject, ObservableObject {

    // MARK: BLE / protocol constants (verified against the flashed QNI 3.0.0 firmware)
    // Qorvo NI firmware advertises one of these two profiles; we accept either.
    private enum BLEProfile {
        // Legacy Nordic UART Service (Apple NINearbyAccessorySample / older builds).
        static let nusService = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        static let nusRx      = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E") // write  phone → tag
        static let nusTx      = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E") // notify tag → phone
        // Qorvo NI Service (current DWM3001CDK QANI builds).
        static let qniService = CBUUID(string: "2E938FD0-6A61-11ED-A1EB-0242AC120002")
        static let qniRx      = CBUUID(string: "2E93998A-6A61-11ED-A1EB-0242AC120002") // write  phone → tag
        static let qniTx      = CBUUID(string: "2E939AF2-6A61-11ED-A1EB-0242AC120002") // notify tag → phone

        static let services  = [nusService, qniService]
        static let allChars  = [nusRx, nusTx, qniRx, qniTx]
        static func isRx(_ u: CBUUID) -> Bool { u == nusRx || u == qniRx }
        static func isTx(_ u: CBUUID) -> Bool { u == nusTx || u == qniTx }
    }
    private enum ToAccessory: UInt8 { case initialize = 0x0A, configureAndStart = 0x0B, stop = 0x0C }
    private enum FromAccessory: UInt8 { case configurationData = 0x01, uwbDidStart = 0x02, uwbDidStop = 0x03 }

    enum State {
        case idle
        case lookingUp
        case connecting
        case ranging(distance: Float, direction: simd_float3?)
        case signFound
        /// This alert's hanger has no tracker assigned yet — recoverable:
        /// the view offers staff a scan-to-assign right there.
        case noTagPaired
        case unavailable(reason: String)
    }

    @Published private(set) var state: State = .idle
    /// AirTag-style coaching shown while we have distance but no direction yet.
    /// Direction on iPhone 14+ is camera-assisted — it needs Camera access,
    /// movement and light, so we tell the user exactly what's missing.
    @Published private(set) var coachingHint: String?

    private var niSession: NISession?
    private var central: CBCentralManager?
    private var tagPeripheral: CBPeripheral?
    private var rxChar: CBCharacteristic?
    private var bleUuid: String?
    /// If the provisioned tag isn't matched by identifier/name but some NI tag is
    /// clearly in range, connect to it after a short grace period. Covers the
    /// common single-tag / bench case where the stored name isn't an exact match.
    private var fallbackCandidate: CBPeripheral?
    private var fallbackTask: Task<Void, Never>?
    /// A *view-backed* world-tracking AR session, shared with NISession to unlock
    /// DIRECTION (the arrow) on iPhone 14+ (Apple fuses camera + UWB). It comes
    /// from a hidden ARView in FindSignView — a bare `ARSession()` gets rejected
    /// with invalidARConfiguration, which is exactly what bit us. Camera
    /// assistance is best-effort: if it's missing or fails, we fall back to
    /// distance-only so the finder never dead-ends.
    private var externalARSession: ARSession?
    private var lastAccessoryData: Data?
    private var usedCameraAssist = false
    private var cameraAssistDisabled = false
    private var retriedPlain = false
    /// Camera assistance has localized the tag. On iPhone 14+ this is the gate
    /// for using `horizontalAngle` as the heading (obj.direction stays nil).
    private var isConverged = false

    /// Hand in the AR session from the view layer (called once it's running).
    func attachARSession(_ session: ARSession) {
        externalARSession = session
        print("🧭 SignFinder: AR session attached")
        // If we already started ranging distance-only because the AR session
        // wasn't ready in time, restart now with camera assistance.
        if niSession != nil, !usedCameraAssist, !cameraAssistDisabled,
           cameraAuthorized, let data = lastAccessoryData {
            print("🧭 SignFinder: AR attached late — re-running WITH camera assist")
            startSession(with: data)
        }
    }

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
            // 404 from /sign-tags/for-alert — nothing assigned to this hanger.
            state = .noTagPaired
            return
        }

        // 3. Scan/connect over BLE (the scan starts once Bluetooth reports poweredOn).
        state = .connecting
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func stop() {
        send(.stop)
        fallbackTask?.cancel(); fallbackTask = nil
        fallbackCandidate = nil
        niSession?.invalidate()
        niSession = nil
        if let p = tagPeripheral { central?.cancelPeripheralConnection(p) }
        tagPeripheral = nil
        rxChar = nil
        central = nil
        // The hidden ARView owns its session and tears it down on disappear.
        lastAccessoryData = nil
        usedCameraAssist = false
        retriedPlain = false
        cameraAssistDisabled = false
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
            central.scanForPeripherals(withServices: BLEProfile.services, options: nil)
            // Grace period: if the provisioned tag isn't matched by id/name but an
            // NI tag is clearly in range, connect to it so a single-tag setup
            // "just works". (For multi-tag sites, provision an exact name — see
            // didDiscover — so we never pick the wrong one.)
            self.fallbackTask?.cancel()
            self.fallbackTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard self.tagPeripheral == nil, let cand = self.fallbackCandidate else { return }
                self.tagPeripheral = cand
                cand.delegate = self
                central.stopScan()
                central.connect(cand, options: nil)
            }
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didDiscover peripheral: CBPeripheral,
                                    advertisementData: [String : Any],
                                    rssi RSSI: NSNumber) {
        // peripheral.identifier is stable per-phone but differs across phones, so
        // we ALSO accept a match on the advertised name (portable). The backend's
        // bleUuid field can hold either form.
        let advName = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name
        Task { @MainActor in
            guard self.tagPeripheral == nil else { return }
            if let expected = self.bleUuid, !expected.isEmpty {
                let matchesId   = peripheral.identifier.uuidString.caseInsensitiveCompare(expected) == .orderedSame
                let matchesName = advName?.caseInsensitiveCompare(expected) == .orderedSame
                guard matchesId || matchesName else {
                    // Not our provisioned tag — remember the first one seen as a
                    // fallback in case nothing matches (single-tag convenience).
                    if self.fallbackCandidate == nil { self.fallbackCandidate = peripheral }
                    return
                }
            }
            self.fallbackTask?.cancel(); self.fallbackTask = nil
            self.tagPeripheral = peripheral
            peripheral.delegate = self
            central.stopScan()
            central.connect(peripheral, options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices(BLEProfile.services)
    }

    nonisolated func centralManager(_ central: CBCentralManager,
                                    didFailToConnect peripheral: CBPeripheral, error: Error?) {
        Task { @MainActor in self.state = .unavailable(reason: "Couldn't connect to the tag.") }
    }
}

// MARK: - GATT discovery + accessory-protocol kickoff

extension SignFinder: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for svc in services where BLEProfile.services.contains(svc.uuid) {
            peripheral.discoverCharacteristics(BLEProfile.allChars, for: svc)
        }
    }

    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                didDiscoverCharacteristicsFor service: CBService,
                                error: Error?) {
        guard let chars = service.characteristics else { return }
        Task { @MainActor in
            // Bind rx (write) + tx (notify) from whichever profile this service exposes.
            if let rx = chars.first(where: { BLEProfile.isRx($0.uuid) }) {
                self.rxChar = rx
            }
            if let tx = chars.first(where: { BLEProfile.isTx($0.uuid) }) {
                peripheral.setNotifyValue(true, for: tx)
            }
            // Once we have a write characteristic, kick off the handshake:
            // ask the tag for its accessory configuration data.
            if self.rxChar != nil {
                self.send(.initialize)
            }
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
            lastAccessoryData = accessoryData
            let config = try NINearbyAccessoryConfiguration(data: accessoryData)
            // Camera assistance (= the direction arrow on iPhone 14+) is best
            // effort: enable it only when Camera is granted AND we have a real,
            // view-backed AR session. Otherwise range distance-only — reliable,
            // and never a dead end. If it fails anyway, didInvalidateWith retries
            // distance-only.
            // Distance-only ranging — the hot/cold haptic finder doesn't need
            // camera-assisted direction, so we skip camera/AR entirely (no
            // permission prompt, reliable, works through walls and round corners).
            usedCameraAssist = false

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
        let directDir = obj.direction
        let hAngle = obj.horizontalAngle
        Task { @MainActor in
            let distance = obj.distance ?? Float.greatestFiniteMagnitude
            var dir = directDir
            // iPhone 14+ never fills obj.direction — once camera assistance has
            // converged, derive the heading from the horizontal angle (azimuth).
            // This is exactly what Qorvo's reference app does on 14+/16.
            if dir == nil, self.isConverged, let h = hAngle {
                dir = simd_float3(sin(h), 0, -cos(h))
            }
            self.state = .ranging(distance: distance, direction: dir)
        }
    }

    /// Camera-assistance convergence updates — tells us *why* there's no
    /// direction yet so we can coach the user (move / more light / camera off).
    nonisolated func session(_ session: NISession,
                             didUpdateAlgorithmConvergence convergence: NIAlgorithmConvergence,
                             for object: NINearbyObject?) {
        Task { @MainActor in
            print("🧭 SignFinder: convergence \(convergence.status)")
            switch convergence.status {
            case .converged:
                self.isConverged = true
                self.coachingHint = nil
            case .notConverged(let reasons):
                self.isConverged = false
                self.coachingHint = self.cameraDenied
                    ? "Turn on Camera in Settings to get the direction arrow"
                    : Self.directionHint(for: reasons)
            @unknown default:
                self.isConverged = false
                self.coachingHint = nil
            }
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
            print("🧭 SignFinder: session invalidated — \(error)")
            // If camera-assisted ranging fails (e.g. the AR config is rejected),
            // retry ONCE distance-only so Find sign still works rather than
            // dead-ending. Distance is the workhorse; the arrow is the bonus.
            if self.usedCameraAssist, !self.retriedPlain, let data = self.lastAccessoryData {
                self.retriedPlain = true
                self.cameraAssistDisabled = true
                self.niSession?.invalidate()
                self.niSession = nil
                self.startSession(with: data)
                return
            }
            self.state = .unavailable(reason: "Session ended: \(error.localizedDescription)")
        }
    }
}

// MARK: - Direction coaching (camera-assisted NI on iPhone 14+)

extension SignFinder {
    /// True when the user has explicitly denied camera access — camera
    /// assistance (and so the direction arrow) can't run without it.
    var cameraDenied: Bool {
        let s = AVCaptureDevice.authorizationStatus(for: .video)
        return s == .denied || s == .restricted
    }

    var cameraAuthorized: Bool {
        AVCaptureDevice.authorizationStatus(for: .video) == .authorized
    }

    /// Map the session's "why aren't we converged" reasons to a plain-English nudge.
    static func directionHint(for reasons: [NIAlgorithmConvergenceStatus.Reason]) -> String {
        if reasons.contains(.insufficientLighting) { return "It's too dark — point the phone somewhere brighter" }
        if reasons.contains(.insufficientHorizontalSweep) { return "Sweep the phone slowly left and right" }
        if reasons.contains(.insufficientVerticalSweep) { return "Tilt the phone slowly up and down" }
        if reasons.contains(.insufficientMovement) { return "Keep moving — walk a few steps" }
        return "Point the phone toward the sign and keep moving"
    }
}
