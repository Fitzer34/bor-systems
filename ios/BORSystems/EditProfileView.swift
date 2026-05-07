import SwiftUI

struct EditProfileView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var name = ""
    @State private var phone = ""
    @State private var profileSaved = false
    @State private var profileError: String?

    @State private var oldPwd = ""
    @State private var newPwd = ""
    @State private var confirmPwd = ""
    @State private var pwdMessage: (kind: PwdKind, text: String)?
    enum PwdKind { case ok, err }

    var body: some View {
        Form {
            if let u = auth.user {
                Section("Account") {
                    LabeledContent("Email", value: u.email)
                    LabeledContent("Role", value: u.role.rawValue.capitalized)
                }
            }
            Section {
                TextField("Name", text: $name)
                TextField("Phone (E.164, e.g. +353…)", text: $phone)
                    .keyboardType(.phonePad)
                Button("Save") { Task { await saveProfile() } }
                    .disabled(name.isEmpty || !phoneValid)
                if profileSaved { Text("Saved").foregroundStyle(.green) }
                if let err = profileError { Text(err).foregroundStyle(.red) }
            } header: {
                Text("Profile")
            } footer: {
                Text("Phone is used for SMS escalation when a supervisor needs to be alerted urgently.")
            }

            Section {
                SecureField("Current password", text: $oldPwd)
                SecureField("New password (min 8 chars)", text: $newPwd)
                SecureField("Confirm new password", text: $confirmPwd)
                Button("Change password") { Task { await changePassword() } }
                    .disabled(oldPwd.isEmpty || newPwd.count < 8 || newPwd != confirmPwd)
                if let m = pwdMessage {
                    Text(m.text).foregroundStyle(m.kind == .ok ? .green : .red)
                }
            } header: {
                Text("Change password")
            }
        }
        .navigationTitle("My profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if name.isEmpty { name = auth.user?.name ?? "" }
        }
    }

    private var phoneValid: Bool {
        phone.isEmpty || phone.range(of: #"^\+[1-9]\d{6,14}$"#, options: .regularExpression) != nil
    }

    private func saveProfile() async {
        do {
            try await APIClient.shared.updateProfile(name: name, phoneE164: phone.isEmpty ? nil : phone)
            profileSaved = true
            profileError = nil
        } catch {
            profileError = "Could not save."
        }
    }
    private func changePassword() async {
        do {
            try await APIClient.shared.changePassword(currentPassword: oldPwd, newPassword: newPwd)
            pwdMessage = (.ok, "Password changed.")
            oldPwd = ""; newPwd = ""; confirmPwd = ""
        } catch {
            pwdMessage = (.err, "Could not change password — check current password.")
        }
    }
}
