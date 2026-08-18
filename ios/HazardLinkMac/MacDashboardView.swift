import SwiftUI

/// Mac dashboard: the desk view of everything live in the org right now.
/// Pure read: open spills, open work orders, permits awaiting approval,
/// pending leave and timesheets, compliance overdue, unread notifications.
/// Every number is fetched; nothing here is invented.

private struct DashSites: Decodable { let sites: [DashSite] }
private struct DashSite: Decodable, Identifiable {
    let buildingId: String; let buildingName: String; let openAlerts: Int
    var id: String { buildingId }
}
private struct DashJobs: Decodable { let jobs: [DashJob] }
private struct DashJob: Decodable, Identifiable {
    let id: String; let title: String; let status: String; let priority: String; let createdAt: Date
}
private struct DashPermits: Decodable { let permits: [DashPermit] }
private struct DashPermit: Decodable, Identifiable { let id: String; let status: String; let description: String; let typeLabel: String? }
private struct DashLeave: Decodable { let leave: [DashLeaveRow] }
private struct DashLeaveRow: Decodable, Identifiable { let id: String; let status: String }
private struct DashTime: Decodable { let entries: [DashTimeRow] }
private struct DashTimeRow: Decodable, Identifiable { let id: String; let status: String }
private struct DashCompliance: Decodable { let counts: DashCounts }
private struct DashCounts: Decodable { let total: Int; let ok: Int; let due_soon: Int; let overdue: Int }

struct MacDashboardView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var alerts: MacAlertWatcher
    @EnvironmentObject var notifications: NotificationsStore

    @State private var sites: [DashSite] = []
    @State private var openJobs: [DashJob] = []
    @State private var permitsPending = 0
    @State private var leavePending = 0
    @State private var timePending = 0
    @State private var compliance: DashCounts?
    @State private var loading = true
    @State private var errorText: String?

    private let cols = [GridItem(.adaptive(minimum: 200), spacing: 14)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(greeting).font(.title.weight(.bold))
                Text("Cleaning, maintenance and security across \(sites.count) site\(sites.count == 1 ? "" : "s"), live.")
                    .foregroundStyle(.secondary)

                if let e = errorText {
                    HStack { Text(e).foregroundStyle(.secondary); Button("Try again") { Task { await load() } } }
                }

                LazyVGrid(columns: cols, spacing: 14) {
                    tile("Open spills", value: "\(alerts.openSpills)", tone: alerts.openSpills > 0 ? .red : .green,
                         foot: alerts.openSpills > 0 ? "smart signs lifted" : "all sites clear")
                    tile("Open work orders", value: "\(openJobs.count)", tone: .blue, foot: "logged to in progress")
                    tile("Permits awaiting", value: "\(permitsPending)", tone: permitsPending > 0 ? .orange : .secondary, foot: "need an approver")
                    tile("Leave requests", value: "\(leavePending)", tone: leavePending > 0 ? .orange : .secondary, foot: "pending decision")
                    tile("Timesheets pending", value: "\(timePending)", tone: timePending > 0 ? .orange : .secondary, foot: "this week, to approve")
                    if let c = compliance {
                        tile("Compliance overdue", value: "\(c.overdue)", tone: c.overdue > 0 ? .red : .green,
                             foot: c.total == 0 ? "no items tracked yet" : "\(c.due_soon) due within 30 days")
                    }
                    tile("Unread notifications", value: "\(notifications.unreadCount)", tone: notifications.unreadCount > 0 ? .blue : .secondary, foot: "in your bell")
                }

                if !openJobs.isEmpty {
                    GroupBox("Recent work orders") {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(openJobs.prefix(8)) { j in
                                HStack {
                                    Text(j.title).lineLimit(1)
                                    Spacer()
                                    Text(j.priority.capitalized).font(.caption).foregroundStyle(j.priority == "emergency" ? .red : j.priority == "urgent" ? .orange : .secondary)
                                    Text(j.status.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption).foregroundStyle(.secondary).frame(width: 90, alignment: .trailing)
                                }
                                .padding(.vertical, 2)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                if !sites.isEmpty {
                    GroupBox("Sites") {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(sites) { s in
                                HStack {
                                    Circle().fill(s.openAlerts > 0 ? Color.orange : Color.green).frame(width: 8, height: 8)
                                    Text(s.buildingName)
                                    Spacer()
                                    Text(s.openAlerts > 0 ? "\(s.openAlerts) open" : "clear").font(.caption).foregroundStyle(.secondary)
                                }
                                .padding(.vertical, 2)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                if loading { ProgressView().padding(.top, 8) }
            }
            .padding(24)
            .frame(maxWidth: 1100, alignment: .leading)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        let part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"
        let first = (auth.user?.name ?? "").split(separator: " ").first.map(String.init) ?? ""
        return "Good \(part)\(first.isEmpty ? "" : ", " + first)"
    }

    private func tile(_ label: String, value: String, tone: Color, foot: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(tone)
            Text(foot).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
    }

    private func load() async {
        loading = true
        errorText = nil
        async let s: DashSites? = try? APIClient.shared.request("/sites/summary")
        async let j: DashJobs? = try? APIClient.shared.request("/jobs")
        async let p: DashPermits? = try? APIClient.shared.request("/permits?status=requested")
        async let l: DashLeave? = try? APIClient.shared.request("/leave")
        async let c: DashCompliance? = try? APIClient.shared.request("/compliance")
        let (sv, jv, pv, lv, cv) = await (s, j, p, l, c)
        sites = sv?.sites ?? []
        openJobs = (jv?.jobs ?? []).filter { $0.status != "completed" && $0.status != "cancelled" }
        permitsPending = pv?.permits.count ?? 0
        leavePending = (lv?.leave ?? []).filter { $0.status == "pending" }.count
        compliance = cv?.counts
        // This week's pending timesheets.
        var cal = Calendar(identifier: .iso8601); cal.firstWeekday = 2
        let start = cal.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        let end = cal.date(byAdding: .day, value: 6, to: start) ?? Date()
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        if let t: DashTime = try? await APIClient.shared.request("/time/entries?from=\(f.string(from: start))&to=\(f.string(from: end))") {
            timePending = t.entries.filter { $0.status == "pending" }.count
        }
        if sv == nil && jv == nil { errorText = "Couldn't reach the server." }
        loading = false
    }
}
