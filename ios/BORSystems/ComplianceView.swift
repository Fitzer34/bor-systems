import SwiftUI

/// Statutory compliance register on the phone: see what's overdue or due
/// soon at a glance, and mark a check done on site — the due date rolls
/// forward automatically, same /compliance endpoints as the web.

private struct ComplianceItem: Decodable, Identifiable {
    let id: String
    let name: String
    let category: String
    let buildingName: String?
    let frequencyMonths: Int
    let lastDoneOn: String?   // date-only strings, not timestamps
    let nextDueOn: String?
    let contractorName: String?
    let documentUrl: String?
    let status: String        // overdue | due_soon | ok | unscheduled
}
private struct ComplianceCounts: Decodable {
    let total: Int
    let ok: Int
    let due_soon: Int
    let overdue: Int
    let unscheduled: Int
}
private struct ComplianceListResponse: Decodable {
    let items: [ComplianceItem]
    let counts: ComplianceCounts
}
private struct ComplianceOneResponse: Decodable {
    struct Item: Decodable { let id: String }
    let item: Item?
}
private struct ComplianceCompleteBody: Encodable { let doneOn: String }

private let CATEGORY_LABELS: [String: String] = [
    "fire": "Fire safety", "electrical": "Electrical", "gas": "Gas",
    "water": "Water hygiene", "lifts": "Lifts", "hvac": "HVAC", "other": "Other statutory",
]

struct ComplianceView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var items: [ComplianceItem] = []
    @State private var counts: ComplianceCounts?
    @State private var loading = true
    @State private var errorText: String?
    @State private var busy = false
    @State private var toast: String?

    private var isStaff: Bool {
        auth.user?.role == .admin || auth.user?.role == .supervisor
    }

    var body: some View {
        List {
            if let c = counts, c.total > 0 {
                Section {
                    HStack(spacing: 14) {
                        kpi("\(c.overdue)", "Overdue", c.overdue > 0 ? .red : .secondary)
                        kpi("\(c.due_soon)", "Due soon", c.due_soon > 0 ? .orange : .secondary)
                        kpi("\(c.ok)", "OK", .green)
                        kpi("\(c.unscheduled)", "Unscheduled", .secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }

            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let e = errorText {
                VStack(spacing: 8) {
                    Text(e).font(.subheadline).foregroundStyle(.secondary)
                    Button("Try again") { Task { await load() } }
                }
            } else if items.isEmpty {
                Text("No compliance items yet. Add your statutory checks on the web under Compliance, then track and complete them here.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(grouped, id: \.key) { cat, rows in
                    Section(CATEGORY_LABELS[cat] ?? cat.capitalized) {
                        ForEach(rows) { i in itemRow(i) }
                    }
                }
            }
        }
        .navigationTitle("Compliance")
        .task { await load() }
        .refreshable { await load() }
        .overlay(alignment: .bottom) {
            if let t = toast {
                Text(t)
                    .font(.footnote.weight(.medium)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.black.opacity(0.85), in: Capsule())
                    .padding(.bottom, 18)
            }
        }
    }

    private var grouped: [(key: String, value: [ComplianceItem])] {
        let order = ["fire", "electrical", "gas", "water", "lifts", "hvac", "other"]
        let dict = Dictionary(grouping: items, by: \.category)
        return order.compactMap { k in dict[k].map { (k, $0) } }
            + dict.keys.filter { !order.contains($0) }.sorted().map { ($0, dict[$0]!) }
    }

    @ViewBuilder private func itemRow(_ i: ComplianceItem) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(i.name).font(.subheadline.weight(.semibold))
                Spacer()
                statusPill(i.status)
            }
            HStack(spacing: 8) {
                if let b = i.buildingName { Label(b, systemImage: "building.2") }
                Label("Every \(i.frequencyMonths) mo", systemImage: "arrow.triangle.2.circlepath")
                if let d = i.nextDueOn { Label("Due \(d)", systemImage: "calendar") }
            }
            .font(.caption2).foregroundStyle(.secondary)
            if isStaff {
                Button {
                    Task { await markDone(i) }
                } label: {
                    Label("Mark as done today", systemImage: "checkmark.circle")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .disabled(busy)
            }
        }
        .padding(.vertical, 3)
    }

    private func kpi(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.weight(.bold)).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func statusPill(_ s: String) -> some View {
        let (label, color): (String, Color) =
            s == "overdue" ? ("Overdue", .red)
            : s == "due_soon" ? ("Due soon", .orange)
            : s == "ok" ? ("OK", .green)
            : ("Unscheduled", .secondary)
        return Text(label)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }

    private func load() async {
        loading = true
        do {
            let r: ComplianceListResponse = try await APIClient.shared.request("/compliance")
            items = r.items
            counts = r.counts
            errorText = nil
        } catch {
            errorText = "Couldn't load the compliance register."
        }
        loading = false
    }

    private func markDone(_ i: ComplianceItem) async {
        busy = true
        defer { busy = false }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        do {
            let _: ComplianceOneResponse = try await APIClient.shared.request(
                "/compliance/\(i.id)/complete", method: "POST",
                body: ComplianceCompleteBody(doneOn: f.string(from: Date())))
            await load()
            showToast("\(i.name) marked done. The next due date rolled forward.")
        } catch { showToast("Could not mark that done.") }
    }

    private func showToast(_ t: String) {
        withAnimation { toast = t }
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation { toast = nil }
        }
    }
}
