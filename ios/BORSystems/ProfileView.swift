import SwiftUI

/// The real "My profile" screen. Reachable from the More hub and from the
/// person-icon in the Alerts toolbar (via `ProfileSheet`, which now wraps this
/// in its own NavigationStack + a Done button).
///
/// Replaces the old stub that said "editing is on the web". Sections:
///   • Profile — editable name + SMS-escalation phone.
///   • Access & security — read-only role / sites(=org) / member-since /
///     last-active, plus links to two-factor and change-password, and a
///     notification-preferences link.
///   • Sign out.
struct ProfileView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var notifications: NotificationsStore

    @State private var name = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var profileSaved = false
    @State private var profileError: String?
    @State private var saving = false

    @State private var twoFactorEnrolled: Bool?

    var body: some View {
        Form {
            // ── Profile ──────────────────────────────────────────────
            Section {
                TextField("Name", text: $name)
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                TextField("Phone (E.164, e.g. +353…)", text: $phone)
                    .keyboardType(.phonePad)
                Button {
                    Task { await saveProfile() }
                } label: {
                    HStack {
                        if saving { ProgressView() }
                        Text("Save changes")
                    }
                }
                .disabled(saving || name.isEmpty || !phoneValid || !emailValid || !hasChanges)
                if profileSaved { Text("Saved").foregroundStyle(.green).font(.footnote) }
                if let err = profileError { Text(err).foregroundStyle(.red).font(.footnote) }
            } header: {
                Text("Profile")
            } footer: {
                Text("Phone is used for SMS escalation when a supervisor needs to be alerted urgently.")
            }

            // ── Access & security ────────────────────────────────────
            if let u = auth.user {
                Section("Access & security") {
                    LabeledContent("Role", value: u.role.rawValue.capitalized)
                    LabeledContent("Sites", value: u.organisationName?.isEmpty == false ? u.organisationName! : "—")
                    if let created = u.createdAt {
                        LabeledContent("Member since", value: created.formatted(date: .abbreviated, time: .omitted))
                    }
                    if let active = u.lastActiveAt {
                        LabeledContent("Last active", value: relativeTime(from: active))
                    }
                    NavigationLink {
                        TwoFactorView()
                    } label: {
                        HStack {
                            Label("Two-factor authentication", systemImage: "lock.shield")
                            Spacer()
                            twoFactorBadge
                        }
                    }
                    NavigationLink {
                        ChangePasswordView()
                    } label: {
                        Label("Change password", systemImage: "key")
                    }
                }
            }

            // ── Notifications ────────────────────────────────────────
            Section {
                NavigationLink {
                    NotificationPreferencesView()
                } label: {
                    Label("Notification preferences", systemImage: "bell.badge")
                }
            }

            // ── Sign out ─────────────────────────────────────────────
            Section {
                Button(role: .destructive) {
                    notifications.reset()
                    auth.logout()
                } label: {
                    Label("Sign out", systemImage: "arrow.right.square")
                }
            }
        }
        .navigationTitle("My profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if name.isEmpty { name = auth.user?.name ?? "" }
            if email.isEmpty { email = auth.user?.email ?? "" }
            if phone.isEmpty { phone = auth.user?.phoneE164 ?? "" }
        }
        .task {
            twoFactorEnrolled = (try? await APIClient.shared.twoFactorStatus())?.enrolled
        }
    }

    @ViewBuilder
    private var twoFactorBadge: some View {
        switch twoFactorEnrolled {
        case .some(true):
            Text("On").font(.caption).foregroundStyle(.green)
        case .some(false):
            Text("Off").font(.caption).foregroundStyle(.secondary)
        case nil:
            EmptyView()
        }
    }

    // MARK: Derived

    private var phoneValid: Bool {
        phone.isEmpty || phone.range(of: #"^\+[1-9]\d{6,14}$"#, options: .regularExpression) != nil
    }
    private var emailValid: Bool {
        email.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil
    }
    private var hasChanges: Bool {
        name != (auth.user?.name ?? "") ||
        phone != (auth.user?.phoneE164 ?? "") ||
        email.lowercased() != (auth.user?.email ?? "").lowercased()
    }

    // MARK: Actions

    private func saveProfile() async {
        saving = true
        defer { saving = false }
        profileSaved = false; profileError = nil
        do {
            // Name + phone go through the existing PATCH; email only when it
            // actually changed (the backend re-checks org uniqueness).
            try await APIClient.shared.updateProfile(name: name, phoneE164: phone.isEmpty ? nil : phone)
            if email.lowercased() != (auth.user?.email ?? "").lowercased() {
                try await APIClient.shared.updateEmail(email.lowercased())
            }
            // Re-pull /users/me so AuthStore.user (and the rest of the UI)
            // reflects the saved values.
            await auth.bootstrap()
            profileSaved = true
        } catch let APIError.http(status, _) where status == 409 {
            profileError = "That email is already in use."
        } catch {
            profileError = "Could not save changes."
        }
    }
}

// MARK: - ProfileSheet (toolbar avatar entry point)

/// Thin wrapper so the Alerts-tab avatar opens the real profile in a sheet with
/// a Done button. Previously this was a stub; now it presents `ProfileView`.
struct ProfileSheet: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ProfileView()
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { dismiss() }
                    }
                }
        }
    }
}

// MARK: - ChangePasswordView

/// Standalone change-password screen (split out of the old EditProfileView so it
/// can be linked from the Access & security section).
struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var oldPwd = ""
    @State private var newPwd = ""
    @State private var confirmPwd = ""
    @State private var working = false
    @State private var message: (kind: Kind, text: String)?
    enum Kind { case ok, err }

    var body: some View {
        Form {
            Section {
                SecureField("Current password", text: $oldPwd)
                SecureField("New password (min 8 chars)", text: $newPwd)
                SecureField("Confirm new password", text: $confirmPwd)
            } footer: {
                Text("Use at least 8 characters. You'll stay signed in on this device.")
            }
            Section {
                Button {
                    Task { await change() }
                } label: {
                    HStack {
                        if working { ProgressView() }
                        Text("Change password")
                    }
                }
                .disabled(working || oldPwd.isEmpty || newPwd.count < 8 || newPwd != confirmPwd)
                if let m = message {
                    Text(m.text).foregroundStyle(m.kind == .ok ? .green : .red).font(.footnote)
                }
            }
        }
        .navigationTitle("Change password")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func change() async {
        working = true
        defer { working = false }
        message = nil
        do {
            try await APIClient.shared.changePassword(currentPassword: oldPwd, newPassword: newPwd)
            message = (.ok, "Password changed.")
            oldPwd = ""; newPwd = ""; confirmPwd = ""
        } catch {
            message = (.err, "Could not change password — check your current password.")
        }
    }
}

#Preview {
    NavigationStack { ProfileView() }
        .environmentObject(AuthStore())
        .environmentObject(NotificationsStore())
}
