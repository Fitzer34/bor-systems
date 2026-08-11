import SwiftUI

/// Slide-out sidebar mirroring the web app's navigation: the three service
/// lines (Cleaning / Maintenance / Security) with their sub-features, plus
/// Business & admin. Opened from the floating menu chip or an edge swipe.
/// Tab rows switch the tab bar; everything else opens full screen.

enum DrawerDestination: String, Identifiable, CaseIterable {
    case gateways, hangers
    case maintenanceOverview, workOrders, ppms, meters
    case compliance, permits, competency
    case timesheets, leave, forms
    case users, reports, auditLog, notificationsLog, settings, profile

    var id: String { rawValue }

    @ViewBuilder var view: some View {
        switch self {
        case .gateways: GatewaysView()
        case .hangers: HangersView()
        case .maintenanceOverview: MaintenanceKpisView()
        case .workOrders: MaintenanceJobsView()
        case .ppms: PPMsView()
        case .meters: MetersView()
        case .compliance: ComplianceView()
        case .permits: PermitsView()
        case .competency: CompetencyView()
        case .timesheets: TimesheetsView()
        case .leave: LeaveView()
        case .forms: FormsView()
        case .users: UsersView()
        case .reports: ReportsView()
        case .auditLog: AuditLogView()
        case .notificationsLog: NotificationsLogView()
        case .settings: SettingsView()
        case .profile: ProfileView()
        }
    }
}

struct SideMenuView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var notifications: NotificationsStore
    @Binding var isOpen: Bool
    @Binding var selectedTab: Int
    let open: (DrawerDestination) -> Void

    // Match the web sidebar's discipline tints.
    private let cleaningTint = Color(red: 0.18, green: 0.83, blue: 0.75)   // teal
    private let maintenanceTint = Color(red: 0.98, green: 0.75, blue: 0.14) // amber
    private let securityTint = Color(red: 0.51, green: 0.55, blue: 0.97)   // indigo

    @State private var expanded: Set<String> = ["cleaning", "maintenance", "security", "business"]

    var body: some View {
        let caps = auth.capabilities

        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                // Header
                HStack(spacing: 10) {
                    Image(systemName: "shield.fill")
                        .foregroundStyle(.white)
                        .padding(8)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 9))
                    Text("HazardLink").font(.title3.weight(.bold))
                    Spacer()
                    Button { withAnimation(.easeOut(duration: 0.2)) { isOpen = false } } label: {
                        Image(systemName: "xmark")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .padding(8)
                    }
                }
                .padding(.bottom, 8)

                // Pinned essentials
                tabRow("Dashboard", icon: "square.grid.2x2", tab: 0)
                Button { open(.profile) } label: { row("My profile", icon: "person.crop.circle") }
                Button { selectedTab = 4; close() } label: {
                    HStack {
                        row("Notifications", icon: "bell")
                        if notifications.unreadCount > 0 {
                            Text("\(notifications.unreadCount)")
                                .font(.caption2.weight(.bold)).foregroundStyle(.white)
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(Color.red, in: Capsule())
                        }
                    }
                }

                divider()

                // ── Cleaning ─────────────────────────────────────────
                group("cleaning", label: "Cleaning", icon: "drop.fill", tint: cleaningTint) {
                    tabRow("Spill alerts", icon: "bell.badge", tab: 0)
                    tabRow("Floor plans", icon: "map", tab: 1)
                    tabRow("Dispatch", icon: "paperplane", tab: 2)
                    tabRow("Scheduling", icon: "calendar", tab: 3)
                    if caps.canManageDevices {
                        Button { open(.gateways) } label: { row("Gateways", icon: "wifi.router") }
                        Button { open(.hangers) } label: { row("Hangers", icon: "antenna.radiowaves.left.and.right") }
                    }
                }

                // ── Maintenance ──────────────────────────────────────
                if caps.canSeeMaintenance {
                    group("maintenance", label: "Maintenance", icon: "wrench.and.screwdriver.fill", tint: maintenanceTint) {
                        Button { open(.maintenanceOverview) } label: { row("Overview", icon: "chart.line.uptrend.xyaxis") }
                        Button { open(.workOrders) } label: { row("Work orders", icon: "hammer") }
                        Button { open(.ppms) } label: { row("PPM schedule", icon: "arrow.triangle.2.circlepath") }
                        Button { open(.meters) } label: { row("Meters", icon: "gauge") }
                        Button { open(.compliance) } label: { row("Compliance", icon: "checkmark.shield") }
                        Button { open(.permits) } label: { row("Permits", icon: "flag") }
                        if caps.canSeeCompliance {
                            Button { open(.competency) } label: { row("Competency", icon: "checkmark.seal") }
                        }
                    }
                }

                // ── Security ─────────────────────────────────────────
                group("security", label: "Security", icon: "shield.lefthalf.filled", tint: securityTint) {
                    tabRow("Dispatch board", icon: "paperplane", tab: 2)
                    tabRow("Guard schedule", icon: "calendar", tab: 3)
                    Text("Patrols, incidents and visitors are on the web app for now.")
                        .font(.caption2).foregroundStyle(.secondary)
                        .padding(.leading, 40).padding(.vertical, 2)
                }

                divider()

                // ── Business & admin ─────────────────────────────────
                group("business", label: "Business & admin", icon: "briefcase.fill", tint: Color.secondary) {
                    Button { open(.timesheets) } label: { row("Timesheets", icon: "clock") }
                    Button { open(.leave) } label: { row("Team & leave", icon: "person.2") }
                    Button { open(.forms) } label: { row("Forms", icon: "doc.text") }
                    if caps.canManageUsers {
                        Button { open(.users) } label: { row("Users", icon: "person.3") }
                    }
                    if caps.canSeeInsights {
                        Button { open(.reports) } label: { row("Reports", icon: "chart.bar") }
                        Button { open(.notificationsLog) } label: { row("Notifications log", icon: "bell.badge") }
                    }
                    if caps.canSeeAdmin {
                        Button { open(.auditLog) } label: { row("Audit log", icon: "doc.text.magnifyingglass") }
                        Button { open(.settings) } label: { row("Settings", icon: "gearshape") }
                    }
                }

                divider()

                Button(role: .destructive) {
                    notifications.reset()
                    auth.logout()
                } label: {
                    row("Sign out", icon: "arrow.right.square", tint: .red)
                }
                .padding(.bottom, 24)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
        }
        .background(.background)
    }

    private func close() {
        withAnimation(.easeOut(duration: 0.2)) { isOpen = false }
    }

    private func divider() -> some View {
        Divider().padding(.vertical, 6)
    }

    // A discipline group with a tinted icon chip and expandable children.
    @ViewBuilder
    private func group(_ key: String, label: String, icon: String, tint: Color,
                       @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                withAnimation(.easeInOut(duration: 0.18)) {
                    if expanded.contains(key) { expanded.remove(key) } else { expanded.insert(key) }
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: icon)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(tint)
                        .frame(width: 26, height: 26)
                        .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 7))
                    Text(label).font(.subheadline.weight(.semibold))
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(expanded.contains(key) ? 0 : -90))
                }
                .padding(.vertical, 9)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if expanded.contains(key) {
                VStack(alignment: .leading, spacing: 0) { content() }
                    .padding(.leading, 6)
            }
        }
    }

    private func row(_ label: String, icon: String, tint: Color = .primary) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(tint == .primary ? Color.secondary : tint)
                .frame(width: 24)
            Text(label).font(.subheadline).foregroundStyle(tint)
            Spacer()
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }

    // Rows that jump to one of the main tabs.
    private func tabRow(_ label: String, icon: String, tab: Int) -> some View {
        Button {
            selectedTab = tab
            close()
        } label: {
            row(label, icon: icon)
        }
    }
}
