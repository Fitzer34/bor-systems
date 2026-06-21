import SwiftUI

/// Authenticator-app (TOTP) two-factor management. Drives the 2FA endpoints:
///   GET  /auth/2fa/status         → enrolled? required?
///   POST /auth/2fa/enrol          → secret + otpauth QR (data: URL PNG)
///   POST /auth/2fa/enrol/confirm  → verify the 6-digit code, returns recovery codes
///   POST /auth/2fa/disable        → turn off with a current code or recovery code
struct TwoFactorView: View {
    @State private var status: TwoFactorStatus?
    @State private var loadError: String?

    // Enrolment flow
    @State private var enrol: TwoFactorEnrolResponse?
    @State private var enrolCode = ""
    @State private var recoveryCodes: [String]?
    @State private var working = false
    @State private var actionError: String?

    // Disable flow
    @State private var showDisable = false
    @State private var disableCode = ""

    var body: some View {
        Form {
            if let codes = recoveryCodes {
                recoveryCodesSection(codes)
            } else if let enrol = enrol {
                enrolmentSection(enrol)
            } else if let status = status {
                statusSection(status)
            } else if let loadError = loadError {
                Section { Text(loadError).foregroundStyle(.red) }
            } else {
                Section { HStack { ProgressView(); Text("Loading…").foregroundStyle(.secondary) } }
            }

            if let actionError = actionError {
                Section { Text(actionError).foregroundStyle(.red).font(.footnote) }
            }
        }
        .navigationTitle("Two-factor")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadStatus() }
        .alert("Turn off two-factor?", isPresented: $showDisable) {
            TextField("6-digit or recovery code", text: $disableCode)
                .keyboardType(.numberPad)
            Button("Turn off", role: .destructive) { Task { await disable() } }
            Button("Cancel", role: .cancel) { disableCode = "" }
        } message: {
            Text("Enter a current code from your authenticator app, or one of your recovery codes.")
        }
    }

    // MARK: Sections

    @ViewBuilder
    private func statusSection(_ status: TwoFactorStatus) -> some View {
        Section {
            HStack {
                Label("Status", systemImage: status.enrolled ? "lock.shield.fill" : "lock.open")
                Spacer()
                Text(status.enrolled ? "On" : "Off")
                    .foregroundStyle(status.enrolled ? .green : .secondary)
            }
            if status.enrolled, let at = status.enrolledAt {
                LabeledContent("Enabled", value: at.formatted(date: .abbreviated, time: .omitted))
            }
        } footer: {
            if status.required && !status.enrolled {
                Text("Your organisation recommends admins turn on two-factor authentication.")
                    .foregroundStyle(.orange)
            } else {
                Text("Two-factor adds a one-time code from an authenticator app on top of your password.")
            }
        }

        Section {
            if status.enrolled {
                Button(role: .destructive) {
                    showDisable = true
                } label: {
                    Label("Turn off two-factor", systemImage: "lock.open")
                }
            } else {
                Button {
                    Task { await beginEnrolment() }
                } label: {
                    HStack {
                        if working { ProgressView() }
                        Label("Set up two-factor", systemImage: "qrcode")
                    }
                }
                .disabled(working)
            }
        }
    }

    @ViewBuilder
    private func enrolmentSection(_ enrol: TwoFactorEnrolResponse) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                Text("1. Scan this QR in your authenticator app")
                    .font(.subheadline.weight(.semibold))
                if let image = qrImage(from: enrol.qrDataUrl) {
                    image
                        .resizable()
                        .interpolation(.none)
                        .scaledToFit()
                        .frame(width: 180, height: 180)
                        .frame(maxWidth: .infinity)
                }
                Text("Or enter this key manually:")
                    .font(.caption).foregroundStyle(.secondary)
                Text(enrol.secret)
                    .font(.system(.callout, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
            }
            .padding(.vertical, 4)
        }

        Section {
            TextField("6-digit code", text: $enrolCode)
                .keyboardType(.numberPad)
                .font(.system(.body, design: .monospaced))
            Button {
                Task { await confirmEnrolment() }
            } label: {
                HStack {
                    if working { ProgressView() }
                    Text("Verify & turn on")
                }
            }
            .disabled(working || enrolCode.count != 6)
        } header: {
            Text("2. Enter the code from the app")
        }
    }

    @ViewBuilder
    private func recoveryCodesSection(_ codes: [String]) -> some View {
        Section {
            ForEach(codes, id: \.self) { code in
                Text(code)
                    .font(.system(.callout, design: .monospaced))
                    .textSelection(.enabled)
            }
        } header: {
            Label("Save your recovery codes", systemImage: "checkmark.shield")
        } footer: {
            Text("Store these somewhere safe. Each can be used once to sign in if you lose your authenticator. They won't be shown again.")
        }
        Section {
            Button("Done") {
                recoveryCodes = nil
                Task { await loadStatus() }
            }
        }
    }

    // MARK: Data

    private func loadStatus() async {
        do {
            status = try await APIClient.shared.twoFactorStatus()
            loadError = nil
        } catch {
            loadError = "Could not load two-factor status."
        }
    }

    private func beginEnrolment() async {
        working = true
        defer { working = false }
        actionError = nil
        do {
            enrol = try await APIClient.shared.twoFactorEnrol()
        } catch {
            actionError = "Could not start setup — try again."
        }
    }

    private func confirmEnrolment() async {
        working = true
        defer { working = false }
        actionError = nil
        do {
            let res = try await APIClient.shared.twoFactorConfirm(code: enrolCode)
            recoveryCodes = res.recoveryCodes
            enrol = nil
            enrolCode = ""
        } catch {
            actionError = "That code didn't match. Check the app and try again."
        }
    }

    private func disable() async {
        working = true
        defer { working = false }
        actionError = nil
        let code = disableCode
        disableCode = ""
        do {
            try await APIClient.shared.twoFactorDisable(code: code)
            await loadStatus()
        } catch {
            actionError = "Couldn't turn off — the code didn't match."
        }
    }

    // MARK: Helpers

    /// Decode the backend's `data:image/png;base64,…` QR string into an Image.
    private func qrImage(from dataUrl: String) -> Image? {
        guard let commaIdx = dataUrl.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataUrl[dataUrl.index(after: commaIdx)...])),
              let ui = UIImage(data: data)
        else { return nil }
        return Image(uiImage: ui)
    }
}

#Preview {
    NavigationStack { TwoFactorView() }
}
