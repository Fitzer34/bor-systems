import SwiftUI

/// The estate on the phone, same shape as the web and Mac: every site with
/// its key numbers, then one site broken down by discipline — Cleaning,
/// Maintenance, Security. All numbers come from GET /sites/overview.

private struct SiteRow: Decodable, Identifiable {
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
private struct SiteTotals: Decodable {
    let sites: Int; let openSpills: Int; let openJobs: Int; let urgentJobs: Int
    let overduePpms: Int; let openIncidents: Int; let visitorsOnSite: Int
    let staffOnClock: Int; let hangers: Int; let hangersOnline: Int
}
private struct SitesResponse: Decodable { let sites: [SiteRow]; let totals: SiteTotals }

struct SitesView: View {
    @State private var data: SitesResponse?
    @State private var failed = false

    var body: some View {
        Group {
            if failed {
                VStack(spacing: 10) {
                    Text("Could not load the sites overview.").foregroundStyle(.secondary)
                    Button("Retry") { Task { await load() } }.buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let d = data {
                List {
                    Section {
                        estateSummary(d.totals)
                            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    }
                    Section("Sites") {
                        if d.sites.isEmpty {
                            Text("No sites yet. An admin adds them on the web or Mac app.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        ForEach(d.sites) { s in
                            NavigationLink { SiteDetailView(site: s) } label: { siteRow(s) }
                        }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Sites")
        .task { await load() }
        .refreshable { await load() }
    }

    private func estateSummary(_ t: SiteTotals) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The whole estate").font(.headline)
            HStack(spacing: 8) {
                kpi("\(t.openSpills)", "Spills", t.openSpills > 0 ? .red : .green)
                kpi("\(t.openJobs)", "Jobs", .primary)
                kpi("\(t.openIncidents)", "Incidents", t.openIncidents > 0 ? .orange : .primary)
                kpi("\(t.staffOnClock + t.visitorsOnSite)", "On site", .blue)
            }
            Text("\(t.sites) site\(t.sites == 1 ? "" : "s") · \(t.hangers) smart sign\(t.hangers == 1 ? "" : "s") (\(t.hangersOnline) online) · \(t.urgentJobs) urgent · \(t.overduePpms) PPM overdue")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func kpi(_ n: String, _ l: String, _ tint: Color) -> some View {
        VStack(spacing: 0) {
            Text(n).font(.title2.bold()).foregroundStyle(tint)
            Text(l).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private func siteRow(_ s: SiteRow) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(s.openSpills > 0 ? Color.red : (s.urgentJobs > 0 || s.openIncidents > 0) ? Color.orange : Color.green)
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.buildingName).font(.body.weight(.semibold))
                Text("\(s.openSpills) spill\(s.openSpills == 1 ? "" : "s") · \(s.openJobs) job\(s.openJobs == 1 ? "" : "s") · \(s.openIncidents) incident\(s.openIncidents == 1 ? "" : "s") · \(s.hangers) sign\(s.hangers == 1 ? "" : "s")")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func load() async {
        do {
            data = try await APIClient.shared.request("/sites/overview")
            failed = false
        } catch { if data == nil { failed = true } }
    }
}

private struct SiteDetailView: View {
    let site: SiteRow

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(site.buildingName).font(.title3.bold())
                        if site.openSpills > 0 {
                            Text("\(site.openSpills) live spill\(site.openSpills == 1 ? "" : "s")")
                                .font(.caption.weight(.semibold)).foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Color.red, in: Capsule())
                        } else {
                            Text("Operational").font(.caption.weight(.semibold)).foregroundStyle(.green)
                        }
                    }
                    Text("\(site.floors) floor\(site.floors == 1 ? "" : "s") · \(site.hangers) smart sign\(site.hangers == 1 ? "" : "s") (\(site.hangersOnline) online) · \(site.staffOnClock) staff on the clock · \(site.visitorsOnSite) visitor\(site.visitorsOnSite == 1 ? "" : "s")")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
            }

            disciplineSection(
                tint: Color(red: 0.05, green: 0.58, blue: 0.53), icon: "drop.fill", title: "Cleaning",
                stats: [("\(site.openSpills)", "Live spills", site.openSpills > 0 ? Color.red : .green),
                        ("\(site.hangers)", "Smart signs", .primary),
                        ("\(site.hangersOnline)", "Online", .primary),
                        ("\(site.floorsWithPlan)/\(site.floors)", "Plans", .primary)],
                note: site.openSpills > 0
                    ? "A sign is off its rack — the pin is red on the floor plan."
                    : "No live spills. Every sign here is on its rack.")

            disciplineSection(
                tint: Color(red: 0.71, green: 0.45, blue: 0.04), icon: "wrench.and.screwdriver.fill", title: "Maintenance",
                stats: [("\(site.openJobs)", "Open jobs", .primary),
                        ("\(site.urgentJobs)", "Urgent", site.urgentJobs > 0 ? .orange : .primary),
                        ("\(site.overduePpms)", "PPM overdue", site.overduePpms > 0 ? .orange : .primary),
                        ("\(site.assets)", "Assets", .primary)],
                note: site.openJobs == 0 ? "No open work orders at this site." : "\(site.openJobs) open — the Work orders board has the detail.")

            disciplineSection(
                tint: Color(red: 0.26, green: 0.22, blue: 0.79), icon: "shield.lefthalf.filled", title: "Security",
                stats: [("\(site.openIncidents)", "Incidents", site.openIncidents > 0 ? .orange : .primary),
                        ("\(site.visitorsOnSite)", "Visitors", .primary),
                        ("\(site.staffOnClock)", "On the clock", .primary),
                        ("\(site.gateways)", "Gateways", .primary)],
                note: site.openIncidents == 0 ? "No open incidents at this site." : "\(site.openIncidents) open — see Incidents.")
        }
        .navigationTitle(site.buildingName)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func disciplineSection(tint: Color, icon: String, title: String,
                                   stats: [(String, String, Color)], note: String) -> some View {
        Section {
            HStack(spacing: 8) {
                ForEach(stats, id: \.1) { st in
                    VStack(spacing: 0) {
                        Text(st.0).font(.headline).foregroundStyle(st.2)
                        Text(st.1).font(.caption2).foregroundStyle(.secondary)
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            Text(note).font(.caption).foregroundStyle(.secondary)
        } header: {
            Label(title, systemImage: icon).foregroundStyle(tint)
        }
    }
}
