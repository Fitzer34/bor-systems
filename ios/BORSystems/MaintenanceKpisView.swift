import SwiftUI

/// Maintenance KPI scorecard (admin + supervisor) — reliability, work and cost
/// at a glance, plus the reliability "bad actors". Read-only; mirrors the web
/// KPIs page. All values are computed server-side from existing data.
struct MaintenanceKpisView: View {
    @State private var k: MaintKpis?
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if let k {
                Section("Reliability") {
                    kpiRow("PM compliance", k.pmCompliancePct.map { "\($0)%" } ?? "—")
                    kpiRow("MTTR", k.mttrDays.map { "\(trim($0))d" } ?? "—", "avg to close a reactive job")
                    kpiRow("MTBF", k.mtbfDays.map { "\($0)d" } ?? "—", "avg between failures / asset")
                }
                Section("Work & cost") {
                    kpiRow("Open backlog", "\(k.openBacklog)", k.openBacklog > 0 ? "oldest \(k.backlogOldestDays)d" : "all clear")
                    kpiRow("Completed this month", "\(k.completedThisMonth)")
                    kpiRow("Planned share", k.plannedSharePct.map { "\($0)%" } ?? "—", "planned vs reactive (90d)")
                    kpiRow("Spend (90d)", euro(k.spend90Cents), "awarded contractor cost")
                    kpiRow("Past expected life", "\(k.assetsPastLife)", "assets to review")
                }
                if !k.badActors.isEmpty {
                    Section("Reliability — bad actors") {
                        ForEach(k.badActors) { a in
                            HStack(alignment: .firstTextBaseline) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(a.name).font(.body.weight(.medium)).lineLimit(1)
                                    Text("\(a.reactiveJobs) reactive · \(euro(a.spendCents))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(a.criticality.capitalized)
                                    .font(.caption.weight(.medium)).foregroundStyle(critColor(a.criticality))
                            }
                        }
                    }
                }
            } else if loaded {
                Text("No data yet.").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Maintenance KPIs")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    @ViewBuilder private func kpiRow(_ label: String, _ value: String, _ sub: String? = nil) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                if let sub { Text(sub).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            Text(value).font(.body.weight(.semibold))
        }
    }

    private func trim(_ d: Double) -> String {
        d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d)
    }
    private func euro(_ cents: Int) -> String { "€" + (cents / 100).formatted() }
    private func critColor(_ c: String) -> Color {
        switch c { case "critical": return .red; case "high": return .orange; case "low": return .secondary; default: return .blue }
    }

    private func refresh() async {
        do { k = try await APIClient.shared.maintenanceKpis(); error = nil }
        catch { self.error = "Could not load KPIs." }
        loaded = true
    }
}
