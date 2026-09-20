import SwiftUI
import Charts

/// Mac dashboard: the desk view of everything live in the org right now, laid out like the
/// website's dashboard. Estate numbers come from GET /sites/overview (the same rollup the Sites
/// page uses), the decision queue from permits, leave, timesheets and compliance.
/// Every number is fetched. A number that could not be fetched says so; it is never shown as 0.

private struct DashOverview: Decodable { let sites: [DashSite]; let totals: DashTotals }
private struct DashSite: Decodable, Identifiable {
    let buildingId: String
    let buildingName: String
    let hangers: Int
    let hangersOnline: Int
    let openSpills: Int
    let openJobs: Int
    let urgentJobs: Int
    let overduePpms: Int
    let openIncidents: Int
    let visitorsOnSite: Int
    let staffOnClock: Int
    var id: String { buildingId }
    var openWork: Int { openSpills + openJobs + openIncidents }
}
private struct DashTotals: Decodable {
    let sites: Int
    let openSpills: Int
    let openJobs: Int
    let urgentJobs: Int
    let overduePpms: Int
    let openIncidents: Int
    let visitorsOnSite: Int
    let staffOnClock: Int
    let hangers: Int
    let hangersOnline: Int
}
private struct DashJobs: Decodable { let jobs: [DashJob] }
private struct DashJob: Decodable, Identifiable {
    let id: String; let title: String; let status: String; let priority: String; let createdAt: Date
}
private struct DashPermits: Decodable { let permits: [DashPermit] }
private struct DashPermit: Decodable, Identifiable { let id: String }
private struct DashLeave: Decodable { let leave: [DashLeaveRow] }
private struct DashLeaveRow: Decodable, Identifiable { let id: String; let status: String }
private struct DashTime: Decodable { let entries: [DashTimeRow] }
private struct DashTimeRow: Decodable, Identifiable { let id: String; let status: String }
private struct DashCompliance: Decodable { let counts: DashCounts }
private struct DashCounts: Decodable { let total: Int; let ok: Int; let due_soon: Int; let overdue: Int }

/// One bar segment in the "open work by site" chart.
private struct SiteWork: Identifiable {
    let site: String
    let kind: String
    let count: Int
    var id: String { site + kind }
}

struct MacDashboardView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var alerts: MacAlertWatcher
    @EnvironmentObject var notifications: NotificationsStore

    @State private var overview: DashOverview?
    @State private var overviewDenied = false
    /// Feeds the server refused for this role (403). Their tiles are left out: a permission
    /// limit is not a fault and is not a zero.
    @State private var denied: Set<String> = []
    @State private var jobs: [DashJob]?
    @State private var permitsPending: Int?
    @State private var leavePending: Int?
    @State private var timePending: Int?
    @State private var compliance: DashCounts?
    @State private var loading = true
    @State private var lastUpdated: Date?
    @State private var failures: [String] = []
    @State private var pollTask: Task<Void, Never>?

    private let kpiCols = [GridItem(.adaptive(minimum: 190), spacing: 14)]

    private var openJobs: [DashJob]? {
        jobs?.filter { $0.status != "completed" && $0.status != "cancelled" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HLPageHeader(title: greeting, detail: subtitle) {
                    if let t = lastUpdated {
                        Text("Updated \(t.formatted(date: .omitted, time: .shortened))")
                            .font(.system(size: 12)).foregroundStyle(Color.hlInk3)
                    }
                    Button {
                        Task { await load() }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
                    .disabled(loading)
                }

                if !failures.isEmpty {
                    HLLoadError(message: "Couldn't load \(failures.joined(separator: ", ")). Those tiles say Not loaded and the rest is live.",
                                retry: { Task { await load() } })
                }

                estateSection
                decisionSection

                HStack(alignment: .top, spacing: 16) {
                    workBySiteCard
                    recentJobsCard
                }

                sitesCard
            }
            .padding(28)
            .frame(maxWidth: 1240, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .hlPage()
        .task {
            await load()
            startPolling()
        }
        .onDisappear { pollTask?.cancel() }
    }

    // MARK: Sections

    private var estateSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HLSectionTitle(text: "Live across your sites")
            LazyVGrid(columns: kpiCols, spacing: 14) {
                let t = overview?.totals
                // The alert watcher polls open spills on its own, so this tile stays live even
                // for roles that cannot read the estate rollup.
                let spills = t?.openSpills ?? alerts.openSpills
                HLKpiTile(label: "Open spills", icon: "drop.triangle",
                          value: "\(spills)",
                          foot: spills > 0 ? "wet floor signs out now" : "every site clear",
                          tone: spills > 0 ? .danger : .success,
                          action: { go(.alerts) })
                HLKpiTile(label: "Open work orders", icon: "hammer",
                          value: (t?.openJobs ?? openJobs?.count).map { "\($0)" },
                          foot: t.map { $0.urgentJobs > 0 ? "\($0.urgentJobs) urgent or emergency" : "none urgent" } ?? "logged to in progress",
                          tone: (t?.urgentJobs ?? 0) > 0 ? .warning : .maint, loading: loading,
                          action: { go(.workOrders) })
                if !overviewDenied {
                    HLKpiTile(label: "Overdue PPMs", icon: "arrow.triangle.2.circlepath",
                              value: t.map { "\($0.overduePpms)" },
                              foot: "planned jobs past their due date",
                              tone: (t?.overduePpms ?? 0) > 0 ? .warning : .maint, loading: loading,
                              action: { go(.ppms) })
                    HLKpiTile(label: "Open incidents", icon: "shield.lefthalf.filled",
                              value: t.map { "\($0.openIncidents)" },
                              foot: "security reports not yet resolved",
                              tone: (t?.openIncidents ?? 0) > 0 ? .danger : .secure, loading: loading,
                              action: { go(.security) })
                    HLKpiTile(label: "Visitors on site", icon: "person.badge.clock",
                              value: t.map { "\($0.visitorsOnSite)" },
                              foot: "signed in, not yet signed out",
                              tone: .secure, loading: loading,
                              action: { go(.visitors) })
                    HLKpiTile(label: "Staff on the clock", icon: "clock",
                              value: t.map { "\($0.staffOnClock)" },
                              foot: "clocked in right now",
                              tone: .clean, loading: loading,
                              action: { go(.timesheets) })
                    HLKpiTile(label: "Signs online", icon: "antenna.radiowaves.left.and.right",
                              value: t.map { "\($0.hangersOnline) of \($0.hangers)" },
                              foot: t.map { $0.hangers == 0 ? "no hangers registered yet" : "heard from in the last 26 hours" } ?? "",
                              tone: t.map { $0.hangers > 0 && $0.hangersOnline < $0.hangers ? .warning : .clean } ?? .clean,
                              loading: loading,
                              action: { go(.hangers) })
                }
            }
        }
    }

    private var decisionSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HLSectionTitle(text: "Waiting on a decision")
            LazyVGrid(columns: kpiCols, spacing: 14) {
                if !denied.contains("permits") {
                HLKpiTile(label: "Permits awaiting", icon: "flag",
                          value: permitsPending.map { "\($0)" }, foot: "need an approver",
                          tone: (permitsPending ?? 0) > 0 ? .warning : .neutral, loading: loading,
                          action: { go(.permits) })
                }
                if !denied.contains("leave") {
                HLKpiTile(label: "Leave requests", icon: "person.2",
                          value: leavePending.map { "\($0)" }, foot: "pending a yes or no",
                          tone: (leavePending ?? 0) > 0 ? .warning : .neutral, loading: loading,
                          action: { go(.leave) })
                }
                if !denied.contains("timesheets") {
                HLKpiTile(label: "Timesheets pending", icon: "clock.badge.checkmark",
                          value: timePending.map { "\($0)" }, foot: "this week, to approve",
                          tone: (timePending ?? 0) > 0 ? .warning : .neutral, loading: loading,
                          action: { go(.timesheets) })
                }
                if !denied.contains("compliance") {
                HLKpiTile(label: "Compliance overdue", icon: "checkmark.shield",
                          value: compliance.map { "\($0.overdue)" },
                          foot: compliance.map { $0.total == 0 ? "no items tracked yet" : "\($0.due_soon) due within 30 days" } ?? "",
                          tone: (compliance?.overdue ?? 0) > 0 ? .danger : .success, loading: loading,
                          action: { go(.compliance) })
                }
                HLKpiTile(label: "Unread notifications", icon: "bell",
                          value: "\(notifications.unreadCount)", foot: "in your bell",
                          tone: notifications.unreadCount > 0 ? .info : .neutral)
            }
        }
    }

    private var workBySiteCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Open work by site").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.hlInk)
                Spacer()
                Button("All sites") { go(.sites) }.buttonStyle(.link)
            }
            let rows = chartRows
            if overviewDenied {
                HLEmptyState(icon: "chart.bar", title: "Site rollup is for supervisors",
                             message: "Your role can't read the estate totals. The tiles above still show what you can see.")
            } else if overview == nil {
                if loading { ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40) }
                else { HLEmptyState(icon: "chart.bar", title: "Not loaded", message: "The site rollup didn't come back from the server.") }
            } else if rows.isEmpty {
                HLEmptyState(icon: "checkmark.circle", title: "Nothing open",
                             message: "No open spills, work orders or incidents at any site right now.")
            } else {
                Chart(rows) { r in
                    BarMark(x: .value("Open", r.count), y: .value("Site", r.site))
                        .foregroundStyle(by: .value("Type", r.kind))
                        .cornerRadius(3)
                }
                .chartForegroundStyleScale([
                    "Spills": HLTone.danger.solid,
                    "Work orders": Color.hlMaint,
                    "Incidents": Color.hlSecure,
                ])
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) }
                .chartLegend(position: .bottom, alignment: .leading)
                .frame(height: max(140, CGFloat(Set(rows.map(\.site)).count) * 34 + 50))
                .accessibilityLabel("Open spills, work orders and incidents for each site")
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .hlCard()
    }

    private var recentJobsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recent work orders").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.hlInk)
                Spacer()
                Button("Open board") { go(.workOrders) }.buttonStyle(.link)
            }
            if let open = openJobs {
                if open.isEmpty {
                    HLEmptyState(icon: "hammer", title: "No open work orders",
                                 message: "New jobs show here as soon as they are logged.")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(open.sorted { $0.createdAt > $1.createdAt }.prefix(7).enumerated()), id: \.element.id) { i, j in
                            if i > 0 { Divider().overlay(Color.hlLine) }
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(j.title).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Color.hlInk).lineLimit(1)
                                    Text(j.createdAt.formatted(.relative(presentation: .named)))
                                        .font(.system(size: 11.5)).foregroundStyle(Color.hlInk3)
                                }
                                Spacer(minLength: 8)
                                if j.priority == "emergency" || j.priority == "urgent" {
                                    HLPill(text: j.priority.capitalized, tone: j.priority == "emergency" ? .danger : .warning)
                                }
                                HLPill(text: j.status.replacingOccurrences(of: "_", with: " ").capitalized, tone: statusTone(j.status))
                            }
                            .padding(.vertical, 8)
                        }
                    }
                }
            } else if loading {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 40)
            } else {
                HLEmptyState(icon: "hammer", title: "Not loaded", message: "The work order list didn't come back from the server.")
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .hlCard()
    }

    @ViewBuilder private var sitesCard: some View {
        if let sites = overview?.sites, !sites.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Sites").font(.system(size: 15, weight: .bold)).foregroundStyle(Color.hlInk)
                    Spacer()
                    Button("Open sites") { go(.sites) }.buttonStyle(.link)
                }
                VStack(spacing: 0) {
                    ForEach(Array(sites.enumerated()), id: \.element.id) { i, s in
                        if i > 0 { Divider().overlay(Color.hlLine) }
                        HStack(spacing: 10) {
                            Circle().fill(siteTone(s).solid).frame(width: 9, height: 9)
                            Text(s.buildingName).font(.system(size: 13.5, weight: .semibold)).foregroundStyle(Color.hlInk).lineLimit(1)
                            Spacer(minLength: 8)
                            if s.openSpills > 0 { HLPill(text: "\(s.openSpills) spill\(s.openSpills == 1 ? "" : "s")", tone: .danger, dot: true) }
                            if s.openJobs > 0 { HLPill(text: "\(s.openJobs) job\(s.openJobs == 1 ? "" : "s")", tone: .maint) }
                            if s.overduePpms > 0 { HLPill(text: "\(s.overduePpms) PPM overdue", tone: .warning) }
                            if s.openIncidents > 0 { HLPill(text: "\(s.openIncidents) incident\(s.openIncidents == 1 ? "" : "s")", tone: .secure) }
                            if s.openWork == 0 && s.overduePpms == 0 { HLPill(text: "Clear", tone: .success) }
                            Text("\(s.staffOnClock) on shift").font(.system(size: 11.5)).foregroundStyle(Color.hlInk3)
                                .frame(width: 74, alignment: .trailing)
                        }
                        .padding(.vertical, 9)
                        .contentShape(Rectangle())
                        .onTapGesture { go(.sites) }
                    }
                }
            }
            .hlCard()
        }
    }

    // MARK: Derived

    private var chartRows: [SiteWork] {
        guard let sites = overview?.sites else { return [] }
        return sites.filter { $0.openWork > 0 }.prefix(10).flatMap { s in
            [SiteWork(site: s.buildingName, kind: "Spills", count: s.openSpills),
             SiteWork(site: s.buildingName, kind: "Work orders", count: s.openJobs),
             SiteWork(site: s.buildingName, kind: "Incidents", count: s.openIncidents)].filter { $0.count > 0 }
        }
    }

    private func siteTone(_ s: DashSite) -> HLTone {
        if s.openSpills > 0 { return .danger }
        if s.urgentJobs > 0 || s.openIncidents > 0 || s.overduePpms > 0 { return .warning }
        return .success
    }

    private func statusTone(_ status: String) -> HLTone {
        switch status {
        case "in_progress": return .info
        case "awarded", "scheduled": return .clean
        case "tendering", "quoted": return .secure
        case "on_hold": return .warning
        default: return .neutral
        }
    }

    private var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        let part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"
        let first = (auth.user?.name ?? "").split(separator: " ").first.map(String.init) ?? ""
        return "Good \(part)\(first.isEmpty ? "" : ", " + first)"
    }

    private var subtitle: String {
        guard let n = overview?.totals.sites else { return "Cleaning, maintenance and security, live." }
        return "Cleaning, maintenance and security across \(n) site\(n == 1 ? "" : "s"), live."
    }

    private func go(_ s: MacSection) {
        NotificationCenter.default.post(name: .macGoToSection, object: s)
    }

    // MARK: Loading

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if Task.isCancelled { break }
                await load(silent: true)
            }
        }
    }

    /// Runs one request and reports whether it failed because the role is not allowed (403),
    /// so a permission limit is never reported to the user as a server fault.
    private func fetch<T: Decodable>(_ path: String) async -> (T?, Bool) {
        do {
            let v: T = try await APIClient.shared.request(path)
            return (v, false)
        } catch APIError.http(let status, _) where status == 403 {
            return (nil, true)
        } catch {
            return (nil, false)
        }
    }

    private func load(silent: Bool = false) async {
        if !silent { loading = true }
        var cal = Calendar(identifier: .iso8601); cal.firstWeekday = 2
        let start = cal.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        let end = cal.date(byAdding: .day, value: 6, to: start) ?? Date()
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let timePath = "/time/entries?from=\(f.string(from: start))&to=\(f.string(from: end))"

        async let o: (DashOverview?, Bool) = fetch("/sites/overview")
        async let j: (DashJobs?, Bool) = fetch("/jobs")
        async let p: (DashPermits?, Bool) = fetch("/permits?status=requested")
        async let l: (DashLeave?, Bool) = fetch("/leave")
        async let c: (DashCompliance?, Bool) = fetch("/compliance")
        async let t: (DashTime?, Bool) = fetch(timePath)
        let (ov, jv, pv, lv, cv, tv) = await (o, j, p, l, c, t)

        var failed: [String] = []
        var refused: Set<String> = []
        if pv.1 { refused.insert("permits") }
        if lv.1 { refused.insert("leave") }
        if cv.1 { refused.insert("compliance") }
        if tv.1 { refused.insert("timesheets") }
        denied = refused
        if let v = ov.0 { overview = v } else if !ov.1 { failed.append("the site rollup") }
        overviewDenied = ov.1
        if let v = jv.0 { jobs = v.jobs } else if !jv.1 { failed.append("work orders") }
        if let v = pv.0 { permitsPending = v.permits.count } else if !pv.1 { failed.append("permits") }
        if let v = lv.0 { leavePending = v.leave.filter { $0.status == "pending" }.count } else if !lv.1 { failed.append("leave") }
        if let v = cv.0 { compliance = v.counts } else if !cv.1 { failed.append("compliance") }
        if let v = tv.0 { timePending = v.entries.filter { $0.status == "pending" }.count } else if !tv.1 { failed.append("timesheets") }

        failures = failed
        if failed.count < 6 { lastUpdated = Date() }
        loading = false
    }
}
