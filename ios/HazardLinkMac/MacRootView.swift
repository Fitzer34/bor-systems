import SwiftUI

/// The Mac window: sidebar (disciplines with their sub-features) → content.
/// Mirrors the web sidebar and the iPhone drawer, laid out for a desk.
enum MacSection: String, CaseIterable, Identifiable {
    // Pinned
    case dashboard, assistant
    // Cleaning
    case alerts, floorPlans, dispatch, schedule, inspections, sds, gateways, hangers
    // Maintenance
    case overview, workOrders, ppms, assets, parts, meters, contractors, compliance, slas, permits, competency
    // Security
    case security, visitors
    // Business & admin
    case timesheets, leave, forms, users, reports, portals, billing, automations, notificationsLog, auditLog, settings, profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: return "Dashboard"
        case .assistant: return "Ask HazardLink"
        case .alerts: return "Spill alerts"
        case .floorPlans: return "Floor plans"
        case .dispatch: return "Dispatch"
        case .schedule: return "Scheduling"
        case .inspections: return "Rounds & inspections"
        case .sds: return "Safety sheets"
        case .gateways: return "Gateways"
        case .hangers: return "Hangers"
        case .overview: return "Overview"
        case .workOrders: return "Work orders"
        case .ppms: return "PPM schedule"
        case .assets: return "Assets"
        case .parts: return "Parts and inventory"
        case .meters: return "Meters"
        case .contractors: return "Contractors"
        case .compliance: return "Compliance"
        case .slas: return "SLAs"
        case .permits: return "Permits"
        case .competency: return "Competency"
        case .security: return "Patrols & incidents"
        case .visitors: return "Visitors"
        case .timesheets: return "Timesheets"
        case .leave: return "Team & leave"
        case .forms: return "Forms"
        case .users: return "Users"
        case .reports: return "Reports"
        case .portals: return "Client portal"
        case .billing: return "Billing"
        case .automations: return "Automations"
        case .notificationsLog: return "Notifications log"
        case .auditLog: return "Audit log"
        case .settings: return "Settings"
        case .profile: return "My profile"
        }
    }

    var icon: String {
        switch self {
        case .dashboard: return "square.grid.2x2"
        case .assistant: return "sparkles"
        case .alerts: return "bell.badge"
        case .floorPlans: return "map"
        case .dispatch: return "paperplane"
        case .schedule: return "calendar"
        case .inspections: return "checklist"
        case .sds: return "flask"
        case .gateways: return "wifi.router"
        case .hangers: return "antenna.radiowaves.left.and.right"
        case .overview: return "chart.line.uptrend.xyaxis"
        case .workOrders: return "hammer"
        case .ppms: return "arrow.triangle.2.circlepath"
        case .assets: return "shippingbox"
        case .parts: return "cube.box"
        case .meters: return "gauge"
        case .contractors: return "person.text.rectangle"
        case .compliance: return "checkmark.shield"
        case .slas: return "timer"
        case .permits: return "flag"
        case .competency: return "checkmark.seal"
        case .security: return "shield.lefthalf.filled"
        case .visitors: return "person.badge.clock"
        case .timesheets: return "clock"
        case .leave: return "person.2"
        case .forms: return "doc.text"
        case .users: return "person.3"
        case .reports: return "chart.bar"
        case .portals: return "link"
        case .billing: return "creditcard"
        case .automations: return "bolt.badge.automatic"
        case .notificationsLog: return "bell.badge"
        case .auditLog: return "doc.text.magnifyingglass"
        case .settings: return "gearshape"
        case .profile: return "person.crop.circle"
        }
    }

    /// ⌘-key for the Go menu. Only the first nine sections get digits; the
    /// rest use letters that don't clash with system menus.
    var shortcut: KeyEquivalent {
        switch self {
        case .dashboard: return "0"
        case .assistant: return "j"
        case .alerts: return "1"
        case .floorPlans: return "2"
        case .dispatch: return "3"
        case .schedule: return "4"
        case .overview: return "5"
        case .workOrders: return "6"
        case .ppms: return "7"
        case .timesheets: return "8"
        case .leave: return "9"
        case .inspections: return "e"
        case .sds: return "s"
        case .assets: return "a"
        case .parts: return "b"
        case .contractors: return "c"
        case .slas: return "t"
        case .security: return "x"
        case .visitors: return "v"
        case .portals: return "w"
        case .billing: return "z"
        case .automations: return "o"
        case .gateways: return "g"
        case .hangers: return "h"
        case .meters: return "m"
        case .compliance: return "k"
        case .permits: return "p"
        case .competency: return "y"
        case .forms: return "f"
        case .users: return "u"
        case .reports: return "r"
        case .notificationsLog: return "l"
        case .auditLog: return "d"
        case .settings: return ","
        case .profile: return "i"
        }
    }

    @ViewBuilder var view: some View {
        switch self {
        case .dashboard: MacDashboardView()
        case .assistant: MacAssistantView()
        case .alerts: HomeView()
        case .floorPlans: MapView()
        case .dispatch: DispatchSendView()
        case .schedule: ScheduleView()
        case .inspections: MacInspectionsView()
        case .sds: MacSdsView()
        case .gateways: GatewaysView()
        case .hangers: HangersView()
        case .overview: MaintenanceKpisView()
        case .workOrders: MaintenanceJobsView()
        case .ppms: PPMsView()
        case .assets: MacAssetsView()
        case .parts: MacPartsView()
        case .meters: MetersView()
        case .contractors: MacContractorsView()
        case .compliance: ComplianceView()
        case .slas: MacSlasView()
        case .permits: PermitsView()
        case .competency: CompetencyView()
        case .security: MacSecurityView()
        case .visitors: MacVisitorsView()
        case .timesheets: TimesheetsView()
        case .leave: LeaveView()
        case .forms: FormsView()
        case .users: UsersView()
        case .reports: ReportsView()
        case .portals: MacPortalsView()
        case .billing: MacBillingView()
        case .automations: MacAutomationsView()
        case .notificationsLog: NotificationsLogView()
        case .auditLog: AuditLogView()
        case .settings: SettingsView()
        case .profile: ProfileView()
        }
    }
}

struct MacRootView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var notifications: NotificationsStore
    @EnvironmentObject var alerts: MacAlertWatcher

    @State private var selection: MacSection? = .dashboard
    @State private var showNotifications = false

    var body: some View {
        Group {
            if auth.isLoading && auth.user == nil {
                ProgressView("Signing you in…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if auth.user == nil {
                MacLoginView()
            } else {
                signedIn
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .macGoToSection)) { note in
            if let s = note.object as? MacSection { selection = s }
        }
        .onChange(of: auth.user?.id) { _, id in
            if id != nil {
                notifications.startPolling()
                alerts.start()
            } else {
                notifications.stopPolling()
                alerts.stop()
            }
        }
        .task {
            if auth.user != nil {
                notifications.startPolling()
                alerts.start()
            }
        }
    }

    private var signedIn: some View {
        let caps = auth.capabilities
        return NavigationSplitView {
            List(selection: $selection) {
                Section {
                    row(.dashboard)
                    row(.assistant)
                }
                Section {
                    row(.alerts, badge: alerts.openSpills)
                    row(.floorPlans)
                    row(.dispatch)
                    row(.schedule)
                    row(.inspections)
                    row(.sds)
                    if caps.canManageDevices {
                        row(.gateways)
                        row(.hangers)
                    }
                } header: {
                    groupHeader("Cleaning", icon: "drop.fill", tint: Color(red: 0.18, green: 0.83, blue: 0.75))
                }

                if caps.canSeeMaintenance {
                    Section {
                        row(.overview)
                        row(.workOrders)
                        row(.ppms)
                        row(.assets)
                        row(.parts)
                        row(.meters)
                        row(.contractors)
                        row(.compliance)
                        row(.slas)
                        row(.permits)
                        if caps.canSeeCompliance { row(.competency) }
                    } header: {
                        groupHeader("Maintenance", icon: "wrench.and.screwdriver.fill", tint: Color(red: 0.98, green: 0.75, blue: 0.14))
                    }
                }

                Section {
                    row(.security)
                    row(.visitors)
                } header: {
                    groupHeader("Security", icon: "shield.lefthalf.filled", tint: Color(red: 0.51, green: 0.55, blue: 0.97))
                }

                Section {
                    row(.timesheets)
                    row(.leave)
                    row(.forms)
                    if caps.canManageUsers { row(.users) }
                    if caps.canSeeInsights {
                        row(.reports)
                        row(.portals)
                        row(.billing)
                        row(.automations)
                        row(.notificationsLog)
                    }
                    if caps.canSeeAdmin {
                        row(.auditLog)
                        row(.settings)
                    }
                    row(.profile)
                } header: {
                    groupHeader("Business & admin", icon: "briefcase.fill", tint: .secondary)
                }
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 220, ideal: 240, max: 300)
            .safeAreaInset(edge: .bottom) {
                userFooter
            }
        } detail: {
            NavigationStack {
                if let s = selection {
                    s.view
                        .navigationTitle(s.title)
                } else {
                    Text("Pick a section").foregroundStyle(.secondary)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showNotifications.toggle()
                } label: {
                    Label("Notifications", systemImage: notifications.unreadCount > 0 ? "bell.badge.fill" : "bell")
                }
                .badge(notifications.unreadCount)
                .popover(isPresented: $showNotifications, arrowEdge: .top) {
                    NotificationsCenterView()
                        .environmentObject(auth)
                        .environmentObject(notifications)
                        .frame(width: 420, height: 520)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
    }

    private func row(_ s: MacSection, badge: Int = 0) -> some View {
        NavigationLink(value: s) {
            HStack {
                Label(s.title, systemImage: s.icon)
                Spacer()
                if badge > 0 {
                    Text("\(badge)")
                        .font(.caption2.weight(.bold)).foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(Color.red, in: Capsule())
                }
            }
        }
    }

    private func groupHeader(_ title: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(tint).font(.caption)
            Text(title)
        }
    }

    private var userFooter: some View {
        HStack(spacing: 8) {
            Circle().fill(Color.accentColor).frame(width: 26, height: 26)
                .overlay(Text(String((auth.user?.name ?? "?").prefix(1))).font(.caption.weight(.bold)).foregroundStyle(.white))
            VStack(alignment: .leading, spacing: 0) {
                Text(auth.user?.name ?? "").font(.caption.weight(.semibold)).lineLimit(1)
                Text(auth.user?.role.rawValue.capitalized ?? "").font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                notifications.reset()
                alerts.stop()
                auth.logout()
            } label: {
                Image(systemName: "rectangle.portrait.and.arrow.right")
            }
            .buttonStyle(.plain)
            .help("Sign out")
        }
        .padding(10)
        .background(.bar)
    }
}

/// Mac sign-in: a centred card. Reuses the same AuthStore.login flow the iPhone
/// uses (including the 2FA challenge handled inside AuthStore).
struct MacLoginView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 14) {
            Image("Logo").resizable().scaledToFit().frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 16))
            Text("HazardLink").font(.title.weight(.bold))
            Text("Sign in").foregroundStyle(.secondary)
            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
                .frame(width: 320)
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .frame(width: 320)
                .onSubmit { Task { await auth.login(email: email, password: password) } }
            if let e = auth.lastError {
                Text(e).font(.footnote).foregroundStyle(.red).frame(width: 320)
            }
            Button {
                Task { await auth.login(email: email, password: password) }
            } label: {
                if auth.isLoading { ProgressView().controlSize(.small).frame(width: 300) }
                else { Text("Sign in").frame(width: 300) }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty || auth.isLoading)
            .keyboardShortcut(.defaultAction)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
