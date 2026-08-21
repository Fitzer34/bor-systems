import SwiftUI

/// The estate structure on the Mac, matching the web: every site with its
/// key numbers first, then one site's page broken down by discipline —
/// Cleaning, Maintenance, Security. All numbers come from GET /sites/overview;
/// nothing on this screen is invented.

private struct SiteOverviewRow: Decodable, Identifiable {
    let buildingId: String
    let buildingName: String
    let floors: Int
    let floorsWithPlan: Int
    let zones: Int
    let hangers: Int
    let hangersOnline: Int
    let gateways: Int
    let openSpills: Int
    let openJobs: Int
    let urgentJobs: Int
    let overduePpms: Int
    let assets: Int
    let openIncidents: Int
    let visitorsOnSite: Int
    let staffOnClock: Int
    var id: String { buildingId }
}
private struct OverviewTotals: Decodable {
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
private struct OverviewResponse: Decodable { let sites: [SiteOverviewRow]; let totals: OverviewTotals }

struct MacSitesView: View {
    @EnvironmentObject var auth: AuthStore
    /// Jump into a full section (Work orders, Spill alerts…) from a site card.
    var goTo: (MacSection) -> Void = { _ in }

    @State private var data: OverviewResponse?
    @State private var failed = false
    @State private var selected: SiteOverviewRow?
    @State private var showAddSite = false
    @State private var newSiteName = ""
    @State private var toast: String?
    @State private var pollTask: Task<Void, Never>?

    private var isAdmin: Bool { auth.user?.role == .admin }

    var body: some View {
        Group {
            if let s = selected {
                siteDetail(s)
            } else {
                estate
            }
        }
        .task { await load() ; startPolling() }
        .onDisappear { pollTask?.cancel() }
        .overlay(alignment: .bottom) {
            if let t = toast {
                Text(t).font(.footnote.weight(.medium)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.black.opacity(0.85), in: Capsule()).padding(.bottom, 18)
            }
        }
        .sheet(isPresented: $showAddSite) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Add a site").font(.headline)
                Text("A site is a building your team looks after. Floors, plans and sign pins hang off it.")
                    .font(.caption).foregroundStyle(.secondary)
                TextField("Site name, e.g. Main Street Office", text: $newSiteName).textFieldStyle(.roundedBorder).frame(width: 320)
                HStack {
                    Spacer()
                    Button("Cancel") { showAddSite = false }
                    Button("Add") { Task { await addSite() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(newSiteName.trimmingCharacters(in: .whitespaces).isEmpty)
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding(20)
        }
    }

    // ── Estate overview ────────────────────────────────────────────────
    private var estate: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Your sites").font(.title2.bold())
                        Text("The whole estate at a glance. Open a site for its Cleaning, Maintenance and Security breakdown.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if isAdmin {
                        Button { newSiteName = ""; showAddSite = true } label: { Label("Add site", systemImage: "plus") }
                            .buttonStyle(.borderedProminent)
                    }
                }

                if failed {
                    retryView("Could not load the sites overview.") { Task { await load() } }
                } else if let d = data {
                    HStack(spacing: 10) {
                        estateKpi("Sites", "\(d.totals.sites)", sub: "\(d.totals.hangers) smart signs", tint: .secondary)
                        estateKpi("Live spills", "\(d.totals.openSpills)", sub: d.totals.openSpills > 0 ? "signs on the floor" : "every site clear",
                                  tint: d.totals.openSpills > 0 ? .red : .green)
                        estateKpi("Open work orders", "\(d.totals.openJobs)", sub: "\(d.totals.urgentJobs) urgent · \(d.totals.overduePpms) PPM overdue", tint: .orange)
                        estateKpi("Open incidents", "\(d.totals.openIncidents)", sub: "across all sites",
                                  tint: d.totals.openIncidents > 0 ? .orange : .green)
                        estateKpi("People on site", "\(d.totals.staffOnClock + d.totals.visitorsOnSite)",
                                  sub: "\(d.totals.staffOnClock) staff · \(d.totals.visitorsOnSite) visitors", tint: .blue)
                    }

                    if d.sites.isEmpty {
                        emptyView("No sites yet", isAdmin ? "Add your first site, then its floors, plans and sign pins." : "An admin adds sites.")
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 14)], spacing: 14) {
                            ForEach(d.sites) { s in siteCard(s) }
                        }
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(16)
        }
    }

    private func estateKpi(_ label: String, _ value: String, sub: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title.bold()).foregroundStyle(tint)
            Text(sub).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
    }

    private func siteCard(_ s: SiteOverviewRow) -> some View {
        Button { selected = s } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Circle().fill(s.openSpills > 0 ? Color.red : (s.urgentJobs > 0 || s.openIncidents > 0) ? Color.orange : Color.green)
                        .frame(width: 9, height: 9)
                    Text(s.buildingName).font(.headline)
                    Spacer()
                    Text(s.openSpills > 0 ? "Live spill" : (s.urgentJobs > 0 || s.openIncidents > 0) ? "Needs attention" : "Operational")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Text("\(s.floors) floor\(s.floors == 1 ? "" : "s")\(s.floors > 0 ? (s.floorsWithPlan < s.floors ? " · \(s.floors - s.floorsWithPlan) missing a plan" : " · plans on file") : "")")
                    .font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    miniCount("\(s.openSpills)", "Spills", s.openSpills > 0 ? .red : .primary)
                    miniCount("\(s.openJobs)", "Jobs", .primary)
                    miniCount("\(s.openIncidents)", "Incidents", s.openIncidents > 0 ? .orange : .primary)
                    miniCount("\(s.hangers)", "Signs", .primary)
                }
                Text("\(s.staffOnClock) on the clock · \(s.visitorsOnSite) visitor\(s.visitorsOnSite == 1 ? "" : "s") on site")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func miniCount(_ n: String, _ l: String, _ tint: Color) -> some View {
        VStack(spacing: 0) {
            Text(n).font(.title3.bold()).foregroundStyle(tint)
            Text(l).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    // ── One site, broken down by discipline ────────────────────────────
    private func siteDetail(_ s: SiteOverviewRow) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Button { selected = nil } label: { Label("All sites", systemImage: "chevron.left") }
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 8) {
                            Text(s.buildingName).font(.title2.bold())
                            if s.openSpills > 0 {
                                Text("\(s.openSpills) live spill\(s.openSpills == 1 ? "" : "s")")
                                    .font(.caption.weight(.semibold)).foregroundStyle(.white)
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(Color.red, in: Capsule())
                            } else {
                                Text("Operational").font(.caption.weight(.semibold)).foregroundStyle(.green)
                            }
                        }
                        Text("\(s.floors) floor\(s.floors == 1 ? "" : "s") · \(s.hangers) smart sign\(s.hangers == 1 ? "" : "s") (\(s.hangersOnline) online) · \(s.staffOnClock) staff on the clock · \(s.visitorsOnSite) visitor\(s.visitorsOnSite == 1 ? "" : "s") on site")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { goTo(.floorPlans) } label: { Label("Floor plans", systemImage: "map") }
                }

                disciplineCard(
                    tint: Color(red: 0.05, green: 0.58, blue: 0.53), icon: "drop.fill", title: "Cleaning",
                    desc: "Wet-floor signs, spills and plans at this site",
                    stats: [("\(s.openSpills)", "Live spills", s.openSpills > 0 ? Color.red : .green),
                            ("\(s.hangers)", "Smart signs", .primary),
                            ("\(s.hangersOnline)", "Online", .primary),
                            ("\(s.floorsWithPlan)/\(s.floors)", "Plans on file", .primary)],
                    note: s.openSpills > 0 ? "A sign is off its rack — the pin is red on the floor plan." : "No live spills. Every sign at \(s.buildingName) is on its rack.",
                    jumps: [("Spill alerts", .alerts), ("Floor plans", .floorPlans), ("Devices", .hangers)])

                disciplineCard(
                    tint: Color(red: 0.71, green: 0.45, blue: 0.04), icon: "wrench.and.screwdriver.fill", title: "Maintenance",
                    desc: "Work orders, PPM and assets at this site",
                    stats: [("\(s.openJobs)", "Open work orders", .primary),
                            ("\(s.urgentJobs)", "Urgent", s.urgentJobs > 0 ? .orange : .primary),
                            ("\(s.overduePpms)", "PPM overdue", s.overduePpms > 0 ? .orange : .primary),
                            ("\(s.assets)", "Assets", .primary)],
                    note: s.openJobs == 0 ? "No open work orders at this site." : "\(s.openJobs) open — the board has the detail.",
                    jumps: [("Work orders", .workOrders), ("PPM", .ppms), ("Assets", .assets)])

                disciplineCard(
                    tint: Color(red: 0.26, green: 0.22, blue: 0.79), icon: "shield.lefthalf.filled", title: "Security",
                    desc: "Incidents, patrols and visitors at this site",
                    stats: [("\(s.openIncidents)", "Open incidents", s.openIncidents > 0 ? .orange : .primary),
                            ("\(s.visitorsOnSite)", "Visitors on site", .primary),
                            ("\(s.staffOnClock)", "Staff on the clock", .primary),
                            ("\(s.gateways)", "Gateways", .primary)],
                    note: s.openIncidents == 0 ? "No open incidents at this site." : "\(s.openIncidents) open — see the incident log.",
                    jumps: [("Incidents", .security), ("Visitors", .visitors)])
            }
            .padding(16)
        }
    }

    private func disciplineCard(tint: Color, icon: String, title: String, desc: String,
                                stats: [(String, String, Color)], note: String,
                                jumps: [(String, MacSection)]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: icon).foregroundStyle(tint)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).font(.headline)
                    Text(desc).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                ForEach(jumps, id: \.0) { j in
                    Button(j.0) { goTo(j.1) }.controlSize(.small)
                }
            }
            HStack(spacing: 10) {
                ForEach(stats, id: \.1) { st in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(st.0).font(.title3.bold()).foregroundStyle(st.2)
                        Text(st.1).font(.caption2).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
                }
            }
            Text(note).font(.caption).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
        .overlay(alignment: .top) { Rectangle().fill(tint).frame(height: 3).clipShape(RoundedRectangle(cornerRadius: 2)) }
    }

    // ── Data ───────────────────────────────────────────────────────────
    private func load() async {
        do {
            let r: OverviewResponse = try await APIClient.shared.request("/sites/overview")
            data = r
            failed = false
            if let sel = selected { selected = r.sites.first { $0.buildingId == sel.buildingId } ?? sel }
        } catch { if data == nil { failed = true } }
    }
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                if Task.isCancelled { break }
                await load()
            }
        }
    }
    private func addSite() async {
        let name = newSiteName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        showAddSite = false
        struct Body: Encodable { let name: String }
        struct Resp: Decodable { let building: Building }
        do {
            let _: Resp = try await APIClient.shared.request("/buildings", method: "POST", body: Body(name: name))
            await load()
            showToast("\(name) added. Now add its floors under Floor plans.")
        } catch { showToast("Couldn't add the site.") }
    }
    private func showToast(_ t: String) {
        withAnimation { toast = t }
        Task { try? await Task.sleep(nanoseconds: 2_800_000_000); withAnimation { toast = nil } }
    }
}
