import SwiftUI

/// Mac register screens: Assets, Parts and Contractors as searchable tables
/// (the desk-friendly shape). Read + the one-tap actions that matter; deeper
/// editing stays on the web where the full forms live.

// ── Assets ───────────────────────────────────────────────────────────

private struct AssetRow: Decodable, Identifiable {
    let id: String
    let name: String
    let category: String?
    let make: String?
    let model: String?
    let serial: String?
    let conditionScore: Int?
    let criticality: String?
    let warrantyExpiry: String?
    let installDate: String?
}
private struct AssetsResponse: Decodable { let assets: [AssetRow] }

struct MacAssetsView: View {
    @State private var rows: [AssetRow] = []
    @State private var query = ""
    @State private var loading = true
    @State private var errorText: String?

    fileprivate var filtered: [AssetRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return rows }
        return rows.filter { [$0.name, $0.category, $0.make, $0.model, $0.serial].compactMap { $0 }.joined(separator: " ").lowercased().contains(q) }
    }

    var body: some View {
        VStack(spacing: 0) {
            registerHeader(count: filtered.count, noun: "asset", query: $query)
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No assets yet", "Add assets on the web under Assets. They show here for quick lookup and condition tracking.") }
            else {
                Table(filtered) {
                    TableColumn("Asset") { a in Text(a.name).fontWeight(.medium) }
                    TableColumn("Category") { a in Text(a.category ?? "—").foregroundStyle(.secondary) }.width(140)
                    TableColumn("Make / model") { a in Text([a.make, a.model].compactMap { $0 }.joined(separator: " ")).foregroundStyle(.secondary) }
                    TableColumn("Serial") { a in Text(a.serial ?? "—").font(.system(.body, design: .monospaced)) }.width(160)
                    TableColumn("Condition") { a in
                        if let c = a.conditionScore { conditionDots(c) } else { Text("—").foregroundStyle(.secondary) }
                    }.width(110)
                    TableColumn("Criticality") { a in Text((a.criticality ?? "medium").capitalized).foregroundStyle(a.criticality == "high" ? .red : .secondary) }.width(90)
                }
            }
        }
        .task { await load() }
    }

    private func conditionDots(_ n: Int) -> some View {
        HStack(spacing: 3) {
            ForEach(1...5, id: \.self) { i in
                Circle().fill(i <= n ? (n >= 4 ? Color.green : n == 3 ? .orange : .red) : Color.gray.opacity(0.25)).frame(width: 8, height: 8)
            }
        }
    }

    private func load() async {
        loading = true
        do { let r: AssetsResponse = try await APIClient.shared.request("/assets"); rows = r.assets; errorText = nil }
        catch { errorText = "Couldn't load assets." }
        loading = false
    }
}

// ── Parts ────────────────────────────────────────────────────────────

private struct PartRow: Decodable, Identifiable {
    let id: String
    let name: String
    let sku: String?
    let unit: String?
    let stockQty: Int
    let reorderLevel: Int
    let unitCostCents: Int?
    let supplier: String?
}
private struct PartsResponse: Decodable { let parts: [PartRow] }
private struct StockPatch: Encodable { let stockQty: Int }
private struct PartOne: Decodable { let part: PartRow? }

struct MacPartsView: View {
    @State private var rows: [PartRow] = []
    @State private var query = ""
    @State private var loading = true
    @State private var errorText: String?
    @State private var busyId: String?

    fileprivate var filtered: [PartRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return rows }
        return rows.filter { [$0.name, $0.sku, $0.supplier].compactMap { $0 }.joined(separator: " ").lowercased().contains(q) }
    }
    fileprivate var lowCount: Int { rows.filter { $0.stockQty <= 0 || ($0.reorderLevel > 0 && $0.stockQty <= $0.reorderLevel) }.count }

    var body: some View {
        VStack(spacing: 0) {
            registerHeader(count: filtered.count, noun: "part", query: $query,
                           trailing: lowCount > 0 ? "\(lowCount) at or below reorder level" : nil)
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No parts yet", "Add parts on the web under Parts and inventory. Stock levels can be adjusted here.") }
            else {
                Table(filtered) {
                    TableColumn("Part") { p in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(p.name).fontWeight(.medium)
                            if let s = p.sku { Text(s).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    TableColumn("In stock") { p in
                        HStack(spacing: 6) {
                            Button { Task { await adjust(p, -1) } } label: { Image(systemName: "minus.circle") }.buttonStyle(.plain).disabled(busyId != nil || p.stockQty <= 0)
                            Text("\(p.stockQty)").frame(width: 34).monospacedDigit()
                                .foregroundStyle((p.stockQty <= 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel)) ? .red : .primary)
                            Button { Task { await adjust(p, +1) } } label: { Image(systemName: "plus.circle") }.buttonStyle(.plain).disabled(busyId != nil)
                            if let u = p.unit { Text(u).font(.caption).foregroundStyle(.secondary) }
                        }
                    }.width(170)
                    TableColumn("Reorder at") { p in Text("\(p.reorderLevel)").foregroundStyle(.secondary) }.width(90)
                    TableColumn("Unit cost") { p in Text(p.unitCostCents.map { String(format: "€%.2f", Double($0) / 100) } ?? "—").foregroundStyle(.secondary) }.width(90)
                    TableColumn("Supplier") { p in Text(p.supplier ?? "—").foregroundStyle(.secondary) }
                }
            }
        }
        .task { await load() }
    }

    private func adjust(_ p: PartRow, _ delta: Int) async {
        busyId = p.id
        defer { busyId = nil }
        let _: PartOne? = try? await APIClient.shared.request("/parts/\(p.id)", method: "PATCH", body: StockPatch(stockQty: max(0, p.stockQty + delta)))
        await load()
    }

    private func load() async {
        loading = true
        do { let r: PartsResponse = try await APIClient.shared.request("/parts"); rows = r.parts; errorText = nil }
        catch { errorText = "Couldn't load parts." }
        loading = false
    }
}

// ── Contractors ──────────────────────────────────────────────────────

private struct ContractorRow: Decodable, Identifiable {
    let id: String
    let name: String
    let contactName: String?
    let email: String?
    let phone: String?
    let tier: String?
    let services: String?
    let county: String?
    let insuranceExpiry: String?
    let claimedAt: Date?
    let publicListed: Bool?
}
private struct ContractorsResponse: Decodable { let contractors: [ContractorRow] }

struct MacContractorsView: View {
    @State private var rows: [ContractorRow] = []
    @State private var query = ""
    @State private var loading = true
    @State private var errorText: String?

    fileprivate var filtered: [ContractorRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        if q.isEmpty { return rows }
        return rows.filter { [$0.name, $0.contactName, $0.services, $0.county].compactMap { $0 }.joined(separator: " ").lowercased().contains(q) }
    }

    var body: some View {
        VStack(spacing: 0) {
            registerHeader(count: filtered.count, noun: "contractor", query: $query)
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No contractors yet", "Add contractors on the web, or pull them in from the public directory under Contractors.") }
            else {
                Table(filtered) {
                    TableColumn("Contractor") { c in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(c.name).fontWeight(.medium)
                            if let s = c.services { Text(s).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                        }
                    }
                    TableColumn("Contact") { c in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(c.contactName ?? "—")
                            if let e = c.email { Text(e).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    TableColumn("Tier") { c in tierPill(c.tier) }.width(100)
                    TableColumn("Insurance") { c in
                        Text(insuranceLabel(c.insuranceExpiry)).foregroundStyle(insuranceTone(c.insuranceExpiry))
                    }.width(150)
                    TableColumn("Profile") { c in
                        Text(c.claimedAt != nil ? "Claimed" : "Not claimed").font(.caption).foregroundStyle(c.claimedAt != nil ? .green : .secondary)
                    }.width(90)
                }
            }
        }
        .task { await load() }
    }

    private func tierPill(_ t: String?) -> some View {
        let (label, color): (String, Color) =
            t == "preferred" ? ("Preferred", .green)
            : t == "blocked" ? ("Blocked", .red)
            : t == "on_notice" ? ("On notice", .orange)
            : ("Approved", .secondary)
        return Text(label).font(.caption2.weight(.bold)).padding(.horizontal, 7).padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule()).foregroundStyle(color)
    }
    private func insuranceLabel(_ d: String?) -> String {
        guard let d else { return "Not on file" }
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        return d < today ? "Expired \(d)" : "Expires \(d)"
    }
    private func insuranceTone(_ d: String?) -> Color {
        guard let d else { return .secondary }
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        return d < today ? .red : .primary
    }

    private func load() async {
        loading = true
        do { let r: ContractorsResponse = try await APIClient.shared.request("/contractors"); rows = r.contractors; errorText = nil }
        catch { errorText = "Couldn't load contractors." }
        loading = false
    }
}

// ── Shared bits ──────────────────────────────────────────────────────

@ViewBuilder
func registerHeader(count: Int, noun: String, query: Binding<String>, trailing: String? = nil) -> some View {
    HStack {
        TextField("Search", text: query).textFieldStyle(.roundedBorder).frame(maxWidth: 320)
        Spacer()
        if let t = trailing { Text(t).font(.caption).foregroundStyle(.orange) }
        Text("\(count) \(noun)\(count == 1 ? "" : "s")").font(.caption).foregroundStyle(.secondary)
    }
    .padding(12)
    Divider()
}

func retryView(_ text: String, retry: @escaping () -> Void) -> some View {
    VStack(spacing: 8) {
        Text(text).foregroundStyle(.secondary)
        Button("Try again", action: retry)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}

func emptyView(_ title: String, _ body: String) -> some View {
    VStack(spacing: 6) {
        Text(title).font(.headline)
        Text(body).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 420)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}
