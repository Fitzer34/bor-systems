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
    @State private var password = ""
    @State private var phone = ""
    @State private var role: UserRole = .cleaner
    @State private var error: String?
    @State private var creating = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Password (10+ chars, mix of types)", text: $password)
                    TextField("Phone (E.164, optional)", text: $phone)
                        .keyboardType(.phonePad)
                    Picker("Role", selection: $role) {
                        Text("Cleaner").tag(UserRole.cleaner)
                        Text("Supervisor").tag(UserRole.supervisor)
                        Text("Admin").tag(UserRole.admin)
                    }
                }
                if let err = error {
                    Section { Text(err).foregroundStyle(.red) }
                }
                Section {
                    Button {
                        Task { await create() }
                    } label: {
                        HStack {
                            if creating { ProgressView() }
                            Text("Create user").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!canCreate)
                }
            }
            .navigationTitle("New user")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } } }
        }
    }

    private var canCreate: Bool {
        !name.isEmpty && email.contains("@") && password.count >= 10 && !creating
    }

    private func create() async {
        creating = true; error = nil
        do {
            try await APIClient.shared.createUser(email: email, name: name, password: password, role: role,
                                                  phoneE164: phone.isEmpty ? nil : phone)
            onCreated()
            dismiss()
        } catch let APIError.http(_, body) {
            // Surface the specific reason returned by the backend so the
            // admin knows whether to fix the password, change the email, etc.
            let reason = body.contains("password_too_short") ? "Password is too short — needs at least 10 characters."
                : body.contains("password_too_common") ? "Password is too common — pick something less guessable."
                : body.contains("password_too_simple") ? "Password needs at least 3 of: lowercase, uppercase, digit, symbol."
                : body.contains("password_too_long") ? "Password is too long."
                : body.contains("email_taken") ? "Someone in your organisation already uses that email."
                : body.contains("invalid_input") ? "One of the fields is invalid (check email format, phone in +country format)."
                : "Could not create user."
            self.error = reason
        } catch {
            self.error = "Could not create user."
        }
        creating = false
    }
}
