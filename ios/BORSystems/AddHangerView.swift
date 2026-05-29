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
                    successStep
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
