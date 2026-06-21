import SwiftUI

struct MenuView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var discipline: DisciplineStore
    @EnvironmentObject var notifications: NotificationsStore

    @State private var showRegisterHanger = false
    @State private var showAddGateway = false

    var body: some View {
        // Gate every row on the same capability layer the tab bar uses, so the
        // More hub never shows a section the backend wouldn't let this user act
        // in. Cleaners fall through to a slim hub: profile, notifications, sign
        // out.
        let caps = auth.capabilities

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
                    NavigationLink { ProfileView() } label: { Label("My profile", systemImage: "person.crop.circle") }
                    NavigationLink {
                        NotificationsCenterView()
                    } label: {
                        HStack {
                            Label("Notifications", systemImage: "bell")
                            Spacer()
                            if notifications.unreadCount > 0 {
                                Text("\(notifications.unreadCount)")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 7).padding(.vertical, 2)
                                    .background(Color.red, in: Capsule())
                            }
                        }
                    }
                }

                // Discipline switcher — staff who work across service lines pick
                // which tailored dashboard the Alerts tab leads with. Cleaners
                // are locked to Cleaning, so the switcher is hidden for them.
                if auth.user?.role != .cleaner {
                    Section {
                        Picker(selection: Binding(
                            get: { discipline.current },
                            set: { discipline.set($0, role: auth.user?.role ?? .cleaner) }
                        )) {
                            ForEach(Discipline.allCases) { d in
                                Label(d.label, systemImage: d.systemImage).tag(d)
                            }
                        } label: {
                            Label("Active discipline", systemImage: "square.grid.2x2")
                        }
                        .pickerStyle(.navigationLink)
                    } header: {
                        Text("Dashboard")
                    } footer: {
                        Text("Tailors the Alerts tab to the service line you're working in.")
                    }
                }

                // Device onboarding — only users who may manage devices.
                if caps.canManageDevices {
                    Section("Set up new hardware") {
                        Button {
                            showAddGateway = true
                        } label: {
                            Label("Add a gateway", systemImage: "wifi.router")
                                .foregroundStyle(.primary)
                        }
                        Button {
                            showRegisterHanger = true
                        } label: {
                            Label("Register a hanger", systemImage: "antenna.radiowaves.left.and.right")
                                .foregroundStyle(.primary)
                        }
                    }
                }

                // Management — maintenance work lives behind the maintenance
                // module; device + user management behind their action keys.
                if caps.hasManagementHub {
                    Section("Manage") {
                        if caps.canManageDevices {
                            NavigationLink { GatewaysView() } label: { Label("Gateways", systemImage: "wifi.router") }
                            NavigationLink { HangersView() } label: { Label("Hangers", systemImage: "antenna.radiowaves.left.and.right") }
                        }
                        if caps.canSeeMaintenance {
                            NavigationLink { MaintenanceJobsView() } label: { Label("Maintenance jobs", systemImage: "hammer") }
                            NavigationLink { MetersView() } label: { Label("Meters", systemImage: "gauge") }
                            NavigationLink { PPMsView() } label: { Label("PPMs", systemImage: "wrench.and.screwdriver") }
                        }
                        if caps.canSeeCompliance {
                            NavigationLink { CompetencyView() } label: { Label("Competency", systemImage: "checkmark.seal") }
                        }
                        if caps.canManageUsers {
                            NavigationLink { UsersView() } label: { Label("Users", systemImage: "person.3") }
                        }
                        if caps.canSeeOperations {
                            NavigationLink { ScheduleView() } label: { Label("Schedule", systemImage: "calendar") }
                        }
                    }

                    if caps.canSeeInsights {
                        Section("Insights") {
                            NavigationLink { MaintenanceKpisView() } label: { Label("Maintenance KPIs", systemImage: "chart.line.uptrend.xyaxis") }
                            NavigationLink { ReportsView() } label: { Label("Reports", systemImage: "chart.bar") }
                            NavigationLink { NotificationsLogView() } label: { Label("Notifications log", systemImage: "bell.badge") }
                            if caps.canSeeAdmin {
                                NavigationLink { AuditLogView() } label: { Label("Audit log", systemImage: "doc.text.magnifyingglass") }
                            }
                        }
                    }

                    if caps.canSeeAdmin {
                        Section("System") {
                            NavigationLink { SettingsView() } label: { Label("Settings", systemImage: "gearshape") }
                        }
                    }
                }

                Section {
                    Button(role: .destructive) {
                        notifications.reset()
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
    MenuView()
        .environmentObject(AuthStore())
        .environmentObject(DisciplineStore())
        .environmentObject(NotificationsStore())
}
