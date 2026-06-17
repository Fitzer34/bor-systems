import SwiftUI

struct MenuView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var showRegisterHanger = false
    @State private var showAddGateway = false

    var body: some View {
        NavigationStack {
            List {
                if let u = auth.user {
                    Section {
                        HStack(alignment: .center) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(u.name).font(.headline)
                                Text("\(u.email) · \(u.role.rawValue.capitalized)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            DutySwitch(isOn: u.onDuty) { newValue in
                                Task { await auth.setOnDuty(newValue) }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section {
                    NavigationLink { EditProfileView() } label: { Label("My profile", systemImage: "person.crop.circle") }
                }

                if auth.user?.role == .admin || auth.user?.role == .supervisor {
                    Section("Set up new hardware") {
                        // Gateway: needs WiFi → BLE onboarding flow.
                        Button {
                            showAddGateway = true
                        } label: {
                            Label("Add a gateway", systemImage: "wifi.router")
                                .foregroundStyle(.primary)
                        }
                        // Hanger: LoRa-only, no WiFi/BLE setup. Just register
                        // its DevEUI (shown on the hanger's OLED on first boot)
                        // and pick a zone.
                        Button {
                            showRegisterHanger = true
                        } label: {
                            Label("Register a hanger", systemImage: "antenna.radiowaves.left.and.right")
                                .foregroundStyle(.primary)
                        }
                    }

                    Section("Manage") {
                        NavigationLink { GatewaysView() } label: { Label("Gateways", systemImage: "wifi.router") }
                        NavigationLink { HangersView() } label: { Label("Hangers", systemImage: "antenna.radiowaves.left.and.right") }
                        NavigationLink { MaintenanceJobsView() } label: { Label("Maintenance jobs", systemImage: "hammer") }
                        NavigationLink { PPMsView() } label: { Label("PPMs", systemImage: "wrench.and.screwdriver") }
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
            .sheet(isPresented: $showRegisterHanger) {
                RegisterHangerSheet { }
                    .environmentObject(auth)
            }
            .sheet(isPresented: $showAddGateway) { AddGatewayView() }
        }
    }
}

#Preview {
    MenuView().environmentObject(AuthStore())
}
