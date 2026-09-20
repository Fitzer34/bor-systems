import SwiftUI

/// The Mac window: sidebar (disciplines with their sub-features) → content.
/// Mirrors the web sidebar and the iPhone drawer, laid out for a desk.
enum MacSection: String, CaseIterable, Identifiable {
    // Pinned
    case dashboard, sites, assistant
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
        case .sites: return "Sites"
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
        case .sites: return "building.2"
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

    /// Key for the Go menu. The ten busiest sections take ⌘0 to ⌘9. The rest take ⌃⌘ plus a
    /// letter, because plain ⌘ plus a letter belongs to the system (⌘C copy, ⌘V paste, ⌘Z undo,
    /// ⌘W close, ⌘H hide, ⌘M minimise) and the app used to take those away from every text box.
    /// ⌃⌘F (full screen), ⌃⌘Q (lock) and ⌃⌘D (look up) are left alone.
    var shortcut: (key: KeyEquivalent, modifiers: EventModifiers)? {
        let cmd: EventModifiers = [.command]
        let ctrlCmd: EventModifiers = [.control, .command]
        switch self {
        case .dashboard: return ("0", cmd)
        case .alerts: return ("1", cmd)
        case .floorPlans: return ("2", cmd)
        case .dispatch: return ("3", cmd)
        case .schedule: return ("4", cmd)
        case .overview: return ("5", cmd)
        case .workOrders: return ("6", cmd)
        case .ppms: return ("7", cmd)
        case .timesheets: return ("8", cmd)
        case .leave: return ("9", cmd)
        case .settings: return (",", cmd)
        case .sites: return ("i", ctrlCmd)
        case .assistant: return ("j", ctrlCmd)
        case .inspections: return ("e", ctrlCmd)
        case .sds: return ("s", ctrlCmd)
        case .assets: return ("a", ctrlCmd)
        case .parts: return ("b", ctrlCmd)
        case .contractors: return ("c", ctrlCmd)
        case .slas: return ("t", ctrlCmd)
        case .security: return ("x", ctrlCmd)
        case .visitors: return ("v", ctrlCmd)
        case .portals: return ("w", ctrlCmd)
        case .billing: return ("z", ctrlCmd)
        case .automations: return ("o", ctrlCmd)
        case .gateways: return ("g", ctrlCmd)
        case .hangers: return ("h", ctrlCmd)
        case .meters: return ("m", ctrlCmd)
        case .compliance: return ("k", ctrlCmd)
        case .permits: return ("p", ctrlCmd)
        case .competency: return ("y", ctrlCmd)
        case .users: return ("u", ctrlCmd)
        case .reports: return ("r", ctrlCmd)
        case .notificationsLog: return ("n", ctrlCmd)
        case .auditLog: return ("l", ctrlCmd)
        case .forms, .profile: return nil
        }
    }

    /// The Go menu in the same groups as the sidebar.
    static let menuGroups: [[MacSection]] = [
        [.dashboard, .sites, .assistant],
        [.alerts, .floorPlans, .dispatch, .schedule, .inspections, .sds, .gateways, .hangers],
        [.overview, .workOrders, .ppms, .assets, .parts, .meters, .contractors, .compliance, .slas, .permits, .competency],
        [.security, .visitors],
        [.timesheets, .leave, .forms, .users, .reports, .portals, .billing, .automations, .notificationsLog, .auditLog, .settings, .profile],
    ]

    @ViewBuilder var view: some View {
        switch self {
        case .dashboard: MacDashboardView()
        case .sites: MacSitesView(goTo: { NotificationCenter.default.post(name: .macGoToSection, object: $0) })
        case .assistant: MacAssistantView()
        case .alerts: HomeView()
        case .floorPlans: MacFloorPlansView()
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
    @State private var refreshTick = 0

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
        .onReceive(NotificationCenter.default.publisher(for: .macRefresh)) { _ in refreshTick += 1 }
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
        NavigationSplitView {
            MacSidebar(selection: $selection, signOut: {
                notifications.reset()
                alerts.stop()
                auth.logout()
            })
            .navigationSplitViewColumnWidth(min: 224, ideal: 244, max: 300)
            // The toggle is a dark glyph that would sit on the navy column; the sidebar is the
            // app's only navigation, so it stays put.
            .toolbar(removing: .sidebarToggle)
        } detail: {
            NavigationStack {
                if let s = selection {
                    s.view
                        .navigationTitle(s.title)
                        // Pull-to-refresh does nothing with a mouse. Refresh (⌘R) rebuilds the
                        // screen, which re-runs its load, so every section can be refreshed.
                        .id("\(s.rawValue)-\(refreshTick)")
                } else {
                    HLEmptyState(icon: "sidebar.left", title: "Pick a section", message: "Choose where to go from the sidebar.")
                }
            }
            .background(Color.hlPage)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    refreshTick += 1
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .help("Refresh this screen (⌘R)")
            }
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
                        .tint(Color.hlPrimary)
                        .preferredColorScheme(.light)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
    }
}

/// Mac sign-in: a white card on the light page, the same two steps as the website. The second
/// step only appears for accounts with two-step sign-in turned on.
struct MacLoginView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @FocusState private var codeFocused: Bool

    var body: some View {
        VStack(spacing: 18) {
            VStack(spacing: 8) {
                Image("Logo").resizable().scaledToFit().frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                Text("HazardLink").font(.system(size: 24, weight: .heavy)).foregroundStyle(Color.hlInk)
            }

            VStack(alignment: .leading, spacing: 14) {
                if auth.twoFactorChallenge != nil { codeStep } else { passwordStep }
            }
            .frame(width: 340)
            .hlCard(padding: 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .hlPage()
    }

    @ViewBuilder private var passwordStep: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Sign in").font(.system(size: 17, weight: .bold)).foregroundStyle(Color.hlInk)
            Text("Use the same email and password as the website.")
                .font(.system(size: 12.5)).foregroundStyle(Color.hlInk2)
        }
        field("Email") {
            TextField("you@company.ie", text: $email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.username)
        }
        field("Password") {
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .textContentType(.password)
                .onSubmit { Task { await auth.login(email: email, password: password) } }
        }
        errorLine
        Button {
            Task { await auth.login(email: email, password: password) }
        } label: {
            Group {
                if auth.isLoading { ProgressView().controlSize(.small) } else { Text("Sign in").fontWeight(.semibold) }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(email.isEmpty || password.isEmpty || auth.isLoading)
        .keyboardShortcut(.defaultAction)
    }

    @ViewBuilder private var codeStep: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Enter your code").font(.system(size: 17, weight: .bold)).foregroundStyle(Color.hlInk)
            Text("Open your authenticator app and type the 6-digit code for HazardLink. A recovery code works too.")
                .font(.system(size: 12.5)).foregroundStyle(Color.hlInk2)
                .fixedSize(horizontal: false, vertical: true)
        }
        field("Code") {
            TextField("6-digit code", text: $code)
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 15, weight: .medium).monospacedDigit())
                .focused($codeFocused)
                .onSubmit { Task { await auth.completeTwoFactor(code: code) } }
        }
        errorLine
        Button {
            Task { await auth.completeTwoFactor(code: code) }
        } label: {
            Group {
                if auth.isLoading { ProgressView().controlSize(.small) } else { Text("Verify and sign in").fontWeight(.semibold) }
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(code.isEmpty || auth.isLoading)
        .keyboardShortcut(.defaultAction)
        Button("Back to sign in") {
            code = ""
            auth.cancelTwoFactor()
        }
        .buttonStyle(.link)
        .frame(maxWidth: .infinity)
        .onAppear { codeFocused = true }
    }

    @ViewBuilder private var errorLine: some View {
        if let e = auth.lastError {
            Text(e).font(.system(size: 12.5)).foregroundStyle(HLTone.danger.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Error: \(e)")
        }
    }

    private func field<F: View>(_ label: String, @ViewBuilder _ content: () -> F) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.hlInk2)
            content()
        }
    }
}
