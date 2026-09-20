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

    /// One line under the page title: what the screen is for, in plain words.
    var blurb: String {
        switch self {
        case .dashboard: return "Everything live across your sites."
        case .sites: return "Every building you look after, and how each one is doing right now."
        case .assistant: return "Ask about your own sites, jobs and records. Answers come from your data only."
        case .alerts: return "Wet floor signs that are out right now, who has them, and how long they have been open."
        case .floorPlans: return "Your floor plans with every sign pinned where it hangs."
        case .dispatch: return "Send a cleaner to a spot with a message they get on their phone."
        case .schedule: return "Who is working where, this week and next."
        case .inspections: return "Cleaning rounds and inspections, with what was checked and what failed."
        case .sds: return "Safety data sheets for the chemicals kept on site."
        case .gateways: return "The radio gateways that carry sign signals to HazardLink."
        case .hangers: return "Every smart sign hanger, where it hangs, its battery and when it was last heard from."
        case .overview: return "How maintenance is running: backlog, planned work, response times and spend."
        case .workOrders: return "Every maintenance job from logged to done."
        case .ppms: return "Planned preventive maintenance and when each task is next due."
        case .assets: return "The equipment you maintain, by site."
        case .parts: return "Spare parts, stock levels and what needs reordering."
        case .meters: return "Meter readings and the limits that trigger work."
        case .contractors: return "The contractors you use, their trades and their paperwork."
        case .compliance: return "Statutory checks and certificates, and what is coming due."
        case .slas: return "Response and fix targets, and how jobs are tracking against them."
        case .permits: return "Permits to work: requested, approved, live and closed."
        case .competency: return "Who is trained and certified for what, and what is about to lapse."
        case .security: return "Guard patrols and the incidents they report."
        case .visitors: return "Who is signed in on site right now, and who has been."
        case .timesheets: return "Hours clocked by your team, ready to approve."
        case .leave: return "Your team, who is off, and leave requests waiting on you."
        case .forms: return "Checklists and forms your team fills in on site."
        case .users: return "Who can sign in, their role and the sites they cover."
        case .reports: return "Spills, response times and workload over time."
        case .portals: return "Read-only links you share with clients."
        case .billing: return "Your plan, seats and invoices."
        case .automations: return "Rules that do routine work for you."
        case .notificationsLog: return "Every alert HazardLink sent, to whom, and whether it arrived."
        case .auditLog: return "A record of who changed what, and when."
        case .settings: return "Organisation settings."
        case .profile: return "Your details, password and two-step sign-in."
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
        case .alerts: MacSpillConsoleView()
        case .floorPlans: MacFloorPlansView()
        case .dispatch: MacDispatchView()
        case .schedule: MacScheduleView()
        case .inspections: MacInspectionsView()
        case .sds: MacSdsView()
        case .gateways: MacGatewaysView()
        case .hangers: MacHangersView()
        case .overview: MacMaintenanceOverviewView()
        case .workOrders: MacWorkOrdersView()
        case .ppms: MacPpmsView()
        case .assets: MacAssetsView()
        case .parts: MacPartsView()
        case .meters: MacMetersView()
        case .contractors: MacContractorsView()
        case .compliance: MacComplianceView()
        case .slas: MacSlasView()
        case .permits: MacPermitsView()
        case .competency: MacCompetencyView()
        case .security: MacSecurityView()
        case .visitors: MacVisitorsView()
        case .timesheets: MacTimesheetsView()
        case .leave: MacLeaveView()
        case .forms: MacFormsView()
        case .users: MacUsersView()
        case .reports: MacReportsView()
        case .portals: MacPortalsView()
        case .billing: MacBillingView()
        case .automations: MacAutomationsView()
        case .notificationsLog: MacNotificationsLogView()
        case .auditLog: MacAuditLogView()
        case .settings: MacSettingsView()
        case .profile: MacProfileView()
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
        // A plain row, not a NavigationSplitView: the split view puts a custom sidebar inside its
        // own scrolling container, which let the whole navy column (brand and footer included)
        // slide out of view. Here the column is a fixed width and only its list scrolls.
        HStack(spacing: 0) {
            MacSidebar(selection: $selection, signOut: {
                notifications.reset()
                alerts.stop()
                auth.logout()
            })
            .frame(width: 244)

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
            // With the window title hidden the toolbar has nothing pushing its buttons to the
            // right, and they landed on the traffic lights. This spacer does the pushing.
            ToolbarItem(placement: .navigation) { Spacer() }
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
