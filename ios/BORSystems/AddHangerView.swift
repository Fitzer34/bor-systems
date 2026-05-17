import SwiftUI

/// "Add a hanger" — first-time Wi-Fi onboarding for a freshly-unboxed Pi.
///
/// Walks the customer through: scan → pick the hanger → enter Wi-Fi → wait
/// → done. Backed by HangerSetupManager which does the actual Core Bluetooth
/// dance and the BLE writes that land in pi/setup_mode.py.
struct AddHangerView: View {
    @StateObject private var manager = HangerSetupManager()
    @Environment(\.dismiss) private var dismiss

    @State private var ssid = ""
    @State private var password = ""

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
                                 detail: "iOS will ask you to pair — enter the 6-digit PIN printed on the hanger label.")
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
            .navigationTitle("Add a hanger")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        manager.cancel()
                        dismiss()
                    }
                }
            }
        }
        .interactiveDismissDisabled(true) // force the user to use Cancel so we clean up the BLE state
    }

    // MARK: Steps

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            stepHeader(icon: "antenna.radiowaves.left.and.right",
                       title: "Ready to set up your new hanger?",
                       subtitle: "Plug the hanger into power. Wait until the green LED is breathing. Then tap the button below — we'll find it over Bluetooth and connect it to your Wi-Fi.")

            Spacer()

            Button {
                manager.startScan()
            } label: {
                Text("Find my hanger")
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
                    Text("Looking for nearby hangers…").font(.body.weight(.medium))
                    Text("Make sure it's plugged in and the green LED is breathing.")
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
                       subtitle: "Enter your home or building Wi-Fi name and password. The hanger uses this to talk to the BOR cloud.")

            VStack(alignment: .leading, spacing: 8) {
                Text("Wi-Fi name (SSID)").font(.caption).foregroundStyle(.secondary)
                TextField("e.g. MyHome-5G", text: $ssid)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))

                Text("Wi-Fi password").font(.caption).foregroundStyle(.secondary)
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
            }

            Text("Tip — the hanger only supports 2.4 GHz Wi-Fi networks.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer()

            Button {
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
                       title: "Hanger is online!",
                       subtitle: manager.devEui.map { "DevEUI: \($0)\n\nNext step: register this hanger to a zone in BOR Systems → Hangers → Register." }
                           ?? "Next step: register this hanger to a zone in BOR Systems → Hangers → Register.",
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

    private func failureStep(message: String) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            stepHeader(icon: "exclamationmark.triangle.fill",
                       title: "Setup didn't work",
                       subtitle: message,
                       iconColor: .orange)

            Spacer()

            VStack(spacing: 10) {
                Button {
                    manager.startScan()
                } label: {
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
