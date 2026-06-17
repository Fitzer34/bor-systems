import SwiftUI

struct UsersView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var users: [UserRow] = []
    @State private var error: String?
    @State private var showCreate = false

    var body: some View {
        List {
            ForEach(users) { u in
                UserRowItem(user: u)
                    .swipeActions(allowsFullSwipe: false) {
                        let canManage = (auth.user?.role == .admin || auth.user?.role == .supervisor) && u.id != auth.user?.id
                        if canManage {
                            if u.deactivatedAt == nil {
                                Button("Deactivate") { Task { await deactivate(u) } }.tint(.orange)
                            }
                            Button("Erase", role: .destructive) { Task { await erase(u) } }
                        }
                        if auth.user?.role == .admin && u.deactivatedAt == nil && u.invitedAt != nil && u.inviteAcceptedAt == nil {
                            Button("Resend") { Task { await resend(u) } }.tint(.blue)
                        }
                    }
            }
            if let err = error {
                Section { Text(err).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Users")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if auth.user?.role == .admin {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
        }
        .sheet(isPresented: $showCreate) { CreateUserSheet { Task { await refresh() } } }
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func refresh() async {
        do { users = try await APIClient.shared.users() }
        catch { self.error = "Could not load users." }
    }
    private func deactivate(_ u: UserRow) async {
        do { try await APIClient.shared.deactivateUser(u.id); await refresh() }
        catch { self.error = "Failed." }
    }
    private func resend(_ u: UserRow) async {
        do { try await APIClient.shared.resendInvite(u.id); await refresh() }
        catch { self.error = "Couldn't resend the invite." }
    }
    private func erase(_ u: UserRow) async {
        do { try await APIClient.shared.eraseUser(u.id); await refresh() }
        catch { self.error = "Failed." }
    }
}

private struct UserRowItem: View {
    let user: UserRow
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(user.name).font(.body.weight(.medium))
                Spacer()
                Text(user.role.rawValue).font(.caption2).foregroundStyle(.secondary)
            }
            Text(user.email).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 6) {
                if user.deactivatedAt != nil {
                    Text("deactivated").font(.caption2).foregroundStyle(.gray)
                } else if user.invitedAt != nil && user.inviteAcceptedAt == nil {
                    Text("invited — pending").font(.caption2).foregroundStyle(.orange)
                } else if user.onDuty {
                    Text("on duty").font(.caption2).foregroundStyle(.green)
                } else {
                    Text("off duty").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct CreateUserSheet: View {
    let onCreated: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var role: UserRole = .cleaner
    @State private var error: String?
    @State private var sending = false
    @State private var sentMessage: String?   // success: invite emailed / user added
    @State private var inviteLink: String?     // fallback when email couldn't send

    var body: some View {
        NavigationStack {
            Form {
                if let msg = sentMessage {
                    Section {
                        Label(msg, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                        if let link = inviteLink {
                            Text("Email couldn't be sent — share this private link with them:")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(link).font(.caption2).textSelection(.enabled)
                        }
                    }
                    Section {
                        Button("Done") { onCreated(); dismiss() }.frame(maxWidth: .infinity)
                    }
                } else {
                    Section {
                        TextField("Name", text: $name)
                        TextField("Email", text: $email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("Phone (E.164, optional)", text: $phone)
                            .keyboardType(.phonePad)
                        Picker("Role", selection: $role) {
                            Text("Cleaner").tag(UserRole.cleaner)
                            Text("Supervisor").tag(UserRole.supervisor)
                            Text("Admin").tag(UserRole.admin)
                        }
                    } footer: {
                        Text("We'll email them a secure link to set their own password and sign in.")
                    }
                    if let err = error {
                        Section { Text(err).foregroundStyle(.red) }
                    }
                    Section {
                        Button {
                            Task { await send() }
                        } label: {
                            HStack {
                                if sending { ProgressView() }
                                Text("Send invite").frame(maxWidth: .infinity)
                            }
                        }
                        .disabled(!canSend)
                    }
                }
            }
            .navigationTitle("Invite staff")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } } }
        }
    }

    private var canSend: Bool {
        !name.isEmpty && email.contains("@") && !sending
    }

    private func send() async {
        sending = true; error = nil
        do {
            let res = try await APIClient.shared.inviteUser(email: email, name: name, role: role,
                                                            phoneE164: phone.isEmpty ? nil : phone)
            if res.emailSent == true {
                sentMessage = "Invite emailed to \(email)."
            } else if let url = res.inviteUrl {
                sentMessage = "\(name) added."
                inviteLink = url
            } else {
                sentMessage = "\(name) added."
            }
        } catch let APIError.http(_, body) {
            let reason = body.contains("email_taken") ? "Someone in your organisation already uses that email."
                : body.contains("invalid_input") ? "One of the fields is invalid (check email format, phone in +country format)."
                : "Could not send the invite."
            self.error = reason
        } catch {
            self.error = "Could not send the invite."
        }
        sending = false
    }
}
