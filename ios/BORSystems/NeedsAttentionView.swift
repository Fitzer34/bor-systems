import SwiftUI

/// A prioritised, tappable "what needs me right now" list, tailored per
/// discipline. It pulls from the endpoints the app already has (alerts,
/// dispatches, hangers, maintenance KPIs, meters, PPMs) and ranks the most
/// urgent items to the top, mirroring the web's per-discipline dashboards.
///
/// Each row deep-links: spills → AlertDetailView; meters → MetersView; PPMs →
/// PPMsView; jobs → MaintenanceJobsView; offline/low-battery → HangersView.
struct NeedsAttentionView: View {
    let discipline: Discipline

    @EnvironmentObject var auth: AuthStore

    @State private var alerts: [ActiveAlert] = []
    @State private var dispatches: [DispatchItem] = []
    @State private var hangers: [Hanger] = []
    @State private var meters: [Meter] = []
    @State private var ppms: [PPM] = []
    @State private var kpis: MaintKpis?
    @State private var settings: AppSettings?
    @State private var loaded = false
    @State private var refreshTask: Task<Void, Never>?

    /// One ranked item in the list. `destination` carries the deep-link target.
    private struct Item: Identifiable {
        let id: String
        let icon: String
        let tint: Color
        let title: String
        let subtitle: String
        let priority: Int        // lower = more urgent (sorts first)
        let destination: Destination
    }

    private enum Destination: Hashable {
        case alert(ActiveAlert)
        case meters
        case ppms
        case jobs
        case hangers
        case none
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "bolt.heart")
                    .foregroundStyle(discipline.accent)
                Text("Needs attention")
                    .font(.title3.weight(.semibold))
            }

            let items = rankedItems
            if items.isEmpty && loaded {
                Text("Nothing needs you right now.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Color(.separator), style: StrokeStyle(lineWidth: 1, dash: [6, 4])))
            } else {
                ForEach(items) { item in
                    NavigationLink(value: item.destination) {
                        AttentionRow(data: NeedsAttentionRowData(
                            icon: item.icon, tint: item.tint, title: item.title,
                            subtitle: item.subtitle,
                            hasDestination: item.destination != .none))
                    }
                    .buttonStyle(.plain)
                    .disabled(item.destination == .none)
                }
            }
        }
        .navigationDestination(for: Destination.self) { dest in
            switch dest {
            case .alert(let a): AlertDetailView(alert: a) { await refresh() }
            case .meters:       MetersView()
            case .ppms:         PPMsView()
            case .jobs:         MaintenanceJobsView()
            case .hangers:      HangersView()
            case .none:         EmptyView()
            }
        }
        .task {
            await refresh()
            refreshTask?.cancel()
            refreshTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 8_000_000_000)
                    await refresh()
                }
            }
        }
        .onDisappear { refreshTask?.cancel() }
    }

    // MARK: Ranking

    private var lowBatteryThreshold: Int { settings?.lowBatteryThreshold ?? 20 }

    private static let onlineWindow: TimeInterval = 26 * 60 * 60

    private var offlineHangers: [Hanger] {
        let now = Date()
        return hangers.filter { h in
            guard h.status == .active else { return false }
            return !(h.lastSeenAt.map { now.timeIntervalSince($0) <= Self.onlineWindow } ?? false)
        }
    }

    private var rankedItems: [Item] {
        switch discipline {
        case .cleaning:    return cleaningItems
        case .maintenance: return maintenanceItems
        case .security:    return securityItems
        }
    }

    /// Cleaning: open spills first, then my active dispatches, then device
    /// health (offline / low battery).
    private var cleaningItems: [Item] {
        var out: [Item] = []
        for a in alerts where a.kind == .spill && a.status == .open {
            out.append(Item(
                id: "alert-\(a.id)",
                icon: "exclamationmark.triangle.fill", tint: .red,
                title: "Spill — \(a.zoneName ?? "Unassigned")",
                subtitle: "\(a.floorName ?? "Unknown floor") · opened \(relativeTime(from: a.openedAt))",
                priority: 0, destination: .alert(a)))
        }
        let myId = auth.user?.id ?? ""
        for d in dispatches where d.status != .completed && d.recipientUserId == myId {
            out.append(Item(
                id: "disp-\(d.id)",
                icon: "paperplane.fill", tint: .blue,
                title: d.zoneName.map { "Go to \($0)" } ?? "Dispatch",
                subtitle: d.message,
                priority: 1, destination: .none))
        }
        out.append(contentsOf: deviceHealthItems(basePriority: 5))
        return out.sorted { $0.priority < $1.priority }
    }

    /// Maintenance: due/overdue meters, open backlog, overdue PPMs.
    private var maintenanceItems: [Item] {
        var out: [Item] = []
        for m in meters where m.status == "due" || m.status == "due_soon" {
            let urgent = m.status == "due"
            out.append(Item(
                id: "meter-\(m.id)",
                icon: "gauge", tint: urgent ? .red : .orange,
                title: "\(m.name) \(urgent ? "due" : "due soon")",
                subtitle: [m.assetName, m.remaining.map { "\($0) \(m.unit ?? "")" + " remaining" }].compactMap { $0 }.joined(separator: " · "),
                priority: urgent ? 0 : 2, destination: .meters))
        }
        if let k = kpis, k.openBacklog > 0 {
            out.append(Item(
                id: "backlog",
                icon: "hammer.fill", tint: .orange,
                title: "\(k.openBacklog) open work order\(k.openBacklog == 1 ? "" : "s")",
                subtitle: k.backlogOldestDays > 0 ? "oldest \(k.backlogOldestDays)d" : "in the backlog",
                priority: 1, destination: .jobs))
        }
        let overduePPMs = ppms.filter { isOverdue($0) }
        if !overduePPMs.isEmpty {
            out.append(Item(
                id: "ppm-overdue",
                icon: "wrench.and.screwdriver.fill", tint: .red,
                title: "\(overduePPMs.count) PPM\(overduePPMs.count == 1 ? "" : "s") overdue",
                subtitle: overduePPMs.first?.title ?? "",
                priority: 0, destination: .ppms))
        }
        return out.sorted { $0.priority < $1.priority }
    }

    /// Security: lead with open alerts (lifted signs double as intrusion-style
    /// events here) + device health. Security-specific patrol endpoints aren't
    /// wired into the phone yet, so this leans on the shared signals.
    private var securityItems: [Item] {
        var out: [Item] = []
        for a in alerts where a.status == .open {
            out.append(Item(
                id: "alert-\(a.id)",
                icon: "shield.lefthalf.filled", tint: .red,
                title: "Active event — \(a.zoneName ?? "Unassigned")",
                subtitle: "\(a.floorName ?? "Unknown floor") · \(relativeTime(from: a.openedAt))",
                priority: 0, destination: .alert(a)))
        }
        out.append(contentsOf: deviceHealthItems(basePriority: 3))
        return out.sorted { $0.priority < $1.priority }
    }

    private func deviceHealthItems(basePriority: Int) -> [Item] {
        var out: [Item] = []
        let offline = offlineHangers
        if !offline.isEmpty {
            out.append(Item(
                id: "offline",
                icon: "antenna.radiowaves.left.and.right.slash", tint: .orange,
                title: "\(offline.count) device\(offline.count == 1 ? "" : "s") offline",
                subtitle: "Not reporting in — tap to review",
                priority: basePriority, destination: .hangers))
        }
        let lowBatt = hangers.filter { h in
            h.status == .active && (h.batteryPct.map { $0 <= lowBatteryThreshold } ?? false)
        }
        if !lowBatt.isEmpty {
            out.append(Item(
                id: "lowbatt",
                icon: "battery.25", tint: .red,
                title: "\(lowBatt.count) low batter\(lowBatt.count == 1 ? "y" : "ies")",
                subtitle: "Swap soon to avoid blind spots",
                priority: basePriority + 1, destination: .hangers))
        }
        return out
    }

    private func isOverdue(_ ppm: PPM) -> Bool {
        guard ppm.active else { return false }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let due = f.date(from: ppm.nextDueDate) else { return false }
        return due < Calendar.current.startOfDay(for: Date())
    }

    // MARK: Data

    private func refresh() async {
        // Always need alerts + device health. Maintenance pulls meters/ppms/kpis.
        async let alertsTask = APIClient.shared.activeAlerts()
        async let dispTask = APIClient.shared.dispatches()
        async let hangersTask = APIClient.shared.hangers()
        self.alerts = (try? await alertsTask) ?? self.alerts
        self.dispatches = (try? await dispTask) ?? self.dispatches
        self.hangers = (try? await hangersTask) ?? self.hangers
        if settings == nil { settings = try? await APIClient.shared.appSettings() }

        if discipline == .maintenance {
            async let metersTask = APIClient.shared.meters()
            async let ppmsTask = APIClient.shared.ppms()
            async let kpisTask = APIClient.shared.maintenanceKpis()
            self.meters = (try? await metersTask) ?? self.meters
            self.ppms = (try? await ppmsTask) ?? self.ppms
            self.kpis = (try? await kpisTask) ?? self.kpis
        }
        loaded = true
    }
}

// MARK: - Row

private struct AttentionRow: View {
    let data: NeedsAttentionRowData

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: data.icon)
                .foregroundStyle(data.tint)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(data.title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                if !data.subtitle.isEmpty {
                    Text(data.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            if data.hasDestination {
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .padding(14)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(data.tint.opacity(0.35), lineWidth: 1))
    }
}

/// Minimal data the row needs — keeps `AttentionRow` decoupled from the private
/// `Item` type inside `NeedsAttentionView`.
struct NeedsAttentionRowData {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String
    let hasDestination: Bool
}
