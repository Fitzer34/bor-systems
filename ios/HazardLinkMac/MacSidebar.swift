import SwiftUI

/// The website's navy sidebar, on the Mac: brand at the top, the three disciplines as groups that
/// fold away, the signed-in person at the bottom. A system `List` cannot take this look (it keeps
/// its own material and selection colours), so the rows are plain buttons on a navy column.
struct MacSidebar: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var alerts: MacAlertWatcher

    @Binding var selection: MacSection?
    var signOut: () -> Void

    // Which groups are folded, kept between launches. A comma list keeps it to one stored value.
    @AppStorage("hl.mac.sidebar.folded") private var foldedRaw = ""

    private struct NavGroup: Identifiable {
        let id: String
        let title: String
        let icon: String
        let tint: Color
        let items: [MacSection]
    }

    private var groups: [NavGroup] {
        let caps = auth.capabilities
        var out: [NavGroup] = []
        var cleaning: [MacSection] = [.alerts, .floorPlans, .dispatch, .schedule, .inspections, .sds]
        if caps.canManageDevices { cleaning += [.gateways, .hangers] }
        out.append(NavGroup(id: "cleaning", title: "Cleaning", icon: "drop.fill", tint: Color(hex: 0x2DD4BF), items: cleaning))
        if caps.canSeeMaintenance {
            var m: [MacSection] = [.overview, .workOrders, .ppms, .assets, .parts, .meters, .contractors, .compliance, .slas, .permits]
            if caps.canSeeCompliance { m.append(.competency) }
            out.append(NavGroup(id: "maintenance", title: "Maintenance", icon: "wrench.and.screwdriver.fill", tint: Color(hex: 0xFBBF24), items: m))
        }
        out.append(NavGroup(id: "security", title: "Security", icon: "shield.lefthalf.filled", tint: Color(hex: 0x818CF8), items: [.security, .visitors]))
        var biz: [MacSection] = [.timesheets, .leave, .forms]
        if caps.canManageUsers { biz.append(.users) }
        if caps.canSeeInsights { biz += [.reports, .portals, .billing, .automations, .notificationsLog] }
        if caps.canSeeAdmin { biz += [.auditLog, .settings] }
        biz.append(.profile)
        out.append(NavGroup(id: "business", title: "Business & admin", icon: "briefcase.fill", tint: Color.hlSidebarText, items: biz))
        return out
    }

    private var folded: Set<String> { Set(foldedRaw.split(separator: ",").map(String.init)) }

    private func toggle(_ id: String) {
        var f = folded
        if f.contains(id) { f.remove(id) } else { f.insert(id) }
        foldedRaw = f.sorted().joined(separator: ",")
    }

    var body: some View {
        VStack(spacing: 0) {
            brand
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach([MacSection.dashboard, .sites, .assistant]) { s in
                        SidebarRow(section: s, tint: Color.hlPrimary, selected: selection == s) { selection = s }
                    }
                    ForEach(groups) { g in
                        groupHeader(g)
                        // A folded group still shows the row you are on, so you never lose your place.
                        ForEach(g.items.filter { !folded.contains(g.id) || $0 == selection }) { s in
                            SidebarRow(section: s, tint: g.tint, selected: selection == s,
                                       badge: s == .alerts ? alerts.openSpills : 0) { selection = s }
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 12)
            }
            footer
        }
        // The split view sizes a custom column from its content, and buttons on their own ask for
        // very little, so the width is stated here as well as on the column.
        .frame(minWidth: 232, idealWidth: 244, maxWidth: 300)
        .background(Color.hlSidebar.ignoresSafeArea())
    }

    private var brand: some View {
        HStack(spacing: 10) {
            Image("Logo").resizable().scaledToFit().frame(width: 28, height: 28)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            Text("HazardLink").font(.system(size: 16, weight: .heavy)).foregroundStyle(.white)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 14)
    }

    private func groupHeader(_ g: NavGroup) -> some View {
        let isFolded = folded.contains(g.id)
        return Button { toggle(g.id) } label: {
            HStack(spacing: 7) {
                Image(systemName: g.icon).font(.system(size: 10, weight: .bold)).foregroundStyle(g.tint)
                Text(g.title.uppercased()).font(.system(size: 10.5, weight: .bold)).tracking(0.7)
                    .foregroundStyle(Color.hlSidebarText)
                Spacer()
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Color.hlSidebarText.opacity(0.7))
                    .rotationEffect(.degrees(isFolded ? -90 : 0))
            }
            .padding(.horizontal, 8)
            .padding(.top, 16)
            .padding(.bottom, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(g.title), \(isFolded ? "folded" : "open")")
        .help(isFolded ? "Show \(g.title)" : "Fold \(g.title) away")
    }

    private var footer: some View {
        HStack(spacing: 9) {
            Circle().fill(Color.hlPrimary).frame(width: 28, height: 28)
                .overlay(Text(String((auth.user?.name ?? "?").prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .bold)).foregroundStyle(.white))
            VStack(alignment: .leading, spacing: 1) {
                Text(auth.user?.name ?? "").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                Text(auth.user?.role.rawValue.capitalized ?? "").font(.system(size: 11)).foregroundStyle(Color.hlSidebarText)
            }
            Spacer()
            Button(action: signOut) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.hlSidebarText)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Sign out")
            .accessibilityLabel("Sign out")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.hlSidebarRaised)
    }
}

private struct SidebarRow: View {
    let section: MacSection
    let tint: Color
    let selected: Bool
    var badge: Int = 0
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: section.icon)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(selected ? tint : Color.hlSidebarText)
                    .frame(width: 18)
                Text(section.title)
                    .font(.system(size: 13, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? Color.white : Color.hlSidebarText)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 10.5, weight: .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(HLTone.danger.solid, in: Capsule())
                        .accessibilityLabel("\(badge) open")
                }
            }
            .padding(.horizontal, 8)
            .frame(height: 30)
            .background(selected ? Color.hlSidebarActive : hovering ? Color.hlSidebarRaised : .clear,
                        in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay(alignment: .leading) {
                if selected {
                    RoundedRectangle(cornerRadius: 2).fill(tint).frame(width: 3, height: 16).offset(x: -1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}
