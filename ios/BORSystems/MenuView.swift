import SwiftUI

struct MenuView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        NavigationStack {
            List {
                if let u = auth.user {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(u.name).font(.headline)
                            Text("\(u.email) · \(u.role.rawValue.capitalized)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                        Toggle("On duty", isOn: Binding(
                            get: { u.onDuty },
                            set: { newValue in Task { await auth.setOnDuty(newValue) } }
                        ))
                    }
                }

                Section {
                    NavigationLink { EditProfileView() } label: { Label("My profile", systemImage: "person.crop.circle") }
                }

                if auth.user?.role == .admin || auth.user?.role == .supervisor {
                    Section("Manage") {
                        NavigationLink { HangersView() } label: { Label("Hangers", systemImage: "antenna.radiowaves.left.and.right") }
                        NavigationLink { UsersView() } label: { Label("Users", systemImage: "person.3") }
                        NavigationLink { ScheduleView() } label: { Label("Schedule", systemImage: "calendar") }
                    }

                    Section("Insights") {
                        NavigationLink { ReportsView() } label: { Label("Reports", systemImage: "chart.bar") }
                        NavigationLink { NotificationsLogView() } label: { Label("Notifications log", systemImage: "bell") }
                        if auth.user?.role == .admin {
                            NavigationLink { AuditLogView() } label: { Label("Audit log", systemImage: "doc.text.magnifyingglass") }
                        }
                    }

                    Section("System") {
                        NavigationLink { SettingsView() } label: { Label("Settings", systemImage: "gearshape") }
                    }
                }

                Section {
                    Button(role: .destructive) {
                        auth.logout()
                    } label: {
                        Label("Sign out", systemImage: "arrow.right.square")
                    }
                }
            }
            .navigationTitle("More")
        }
    }
}

#Preview {
    MenuView().environmentObject(AuthStore())
}
