import SwiftUI

/// The remaining web sections on the Mac: SLAs, Security (incidents +
/// patrols), Visitors, Billing, Client portal links, Rounds & inspections,
/// Safety sheets, Automations. Read-first desk views over the same
/// endpoints the web uses; the one-click actions that matter are wired,
/// deeper editing points to the web.

// ── SLAs ─────────────────────────────────────────────────────────────

private struct SlaResponse: Decodable { let policies: [SlaPolicy]; let stats: SlaStats }
private struct SlaPolicy: Decodable, Identifiable { let priority: String; let responseMinutes: Int; let resolveMinutes: Int; var id: String { priority } }
private struct SlaStats: Decodable { let windowDays: Int; let perPriority: [SlaPri]; let breaches: [SlaBreach] }
private struct SlaPri: Decodable, Identifiable { let priority: String; let jobs: Int; let responsePct: Int?; let resolvePct: Int?; var id: String { priority } }
private struct SlaBreach: Decodable, Identifiable { let jobId: String; let title: String; let priority: String; let kind: String; let minutes: Int; let targetMinutes: Int; let open: Bool; var id: String { jobId + kind } }

struct MacSlasView: View {
    @State private var data: SlaResponse?
    @State private var days = 30
    @State private var errorText: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Response and resolution targets by priority, measured from your real work orders.").foregroundStyle(.secondary)
                    Spacer()
                    Picker("Window", selection: $days) { Text("7 days").tag(7); Text("30 days").tag(30); Text("90 days").tag(90) }
                        .pickerStyle(.segmented).labelsHidden().frame(width: 240)
                }
                if let e = errorText { retryView(e) { Task { await load() } }.frame(height: 120) }
                else if let d = data {
                    HStack(alignment: .top, spacing: 14) {
                        ForEach(d.policies) { p in
                            let s = d.stats.perPriority.first { $0.priority == p.priority }
                            VStack(alignment: .leading, spacing: 8) {
                                Text(p.priority.capitalized).font(.headline)
                                    .foregroundStyle(p.priority == "emergency" ? .red : p.priority == "urgent" ? .orange : .primary)
                                metric("Response", target: p.responseMinutes, pct: s?.responsePct)
                                metric("Resolution", target: p.resolveMinutes, pct: s?.resolvePct)
                                Text("\(s?.jobs ?? 0) job\((s?.jobs ?? 0) == 1 ? "" : "s") in window").font(.caption2).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    GroupBox("Breaches") {
                        if d.stats.breaches.isEmpty {
                            Text(d.stats.perPriority.reduce(0) { $0 + $1.jobs } == 0
                                 ? "No work orders in this window yet."
                                 : "Every measured job hit its targets.").foregroundStyle(.secondary).padding(6)
                        } else {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(d.stats.breaches) { b in
                                    HStack {
                                        Text(b.title).lineLimit(1)
                                        Spacer()
                                        Text(b.kind == "response" ? "Response" : "Resolution").font(.caption).foregroundStyle(.secondary)
                                        Text(over(b)).font(.caption).foregroundStyle(.red).frame(width: 150, alignment: .trailing)
                                        if b.open { Text("still open").font(.caption2.weight(.bold)).foregroundStyle(.red) }
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    Text("Edit the targets on the web under SLAs.").font(.caption).foregroundStyle(.secondary)
                } else { ProgressView() }
            }
            .padding(24)
            .frame(maxWidth: 1000, alignment: .leading)
        }
        .task { await load() }
        .onChange(of: days) { _, _ in Task { await load() } }
    }

    private func metric(_ label: String, target: Int, pct: Int?) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text(fmt(target)).font(.caption.weight(.semibold))
            Text(pct.map { "\($0)% on target" } ?? "No data yet").font(.caption).foregroundStyle(pctColor(pct))
        }
    }
    private func pctColor(_ pct: Int?) -> Color {
        guard let p = pct else { return .secondary }
        return p >= 90 ? .green : p >= 70 ? .orange : .red
    }
    private func fmt(_ m: Int) -> String { m < 60 ? "\(m)m" : m < 1440 ? "\(m / 60)h" : "\(m / 1440)d" }
    private func over(_ b: SlaBreach) -> String { "\(fmt(max(0, b.minutes - b.targetMinutes))) over the \(fmt(b.targetMinutes)) target" }
    private func load() async {
        do { data = try await APIClient.shared.request("/slas?days=\(days)"); errorText = nil }
        catch { errorText = "Couldn't load SLAs." }
    }
}

// ── Security: incidents + patrols ────────────────────────────────────

private struct IncidentsResponse: Decodable { let incidents: [IncidentRow] }
private struct IncidentRow: Decodable, Identifiable {
    let id: String; let title: String; let kind: String?; let severity: String; let status: String
    let description: String?; let occurredAt: Date?; let createdAt: Date; let building: NamedRef?
}
private struct NamedRef: Decodable { let id: String; let name: String }
private struct CheckpointsResponse: Decodable { let checkpoints: [CheckpointRow] }
private struct CheckpointRow: Decodable, Identifiable { let id: String; let name: String; let locationNote: String?; let active: Bool; let building: NamedRef? }
private struct ScansResponse: Decodable { let scans: [ScanRow] }
private struct ScanRow: Decodable, Identifiable { let id: String; let guardName: String?; let note: String?; let flagged: Bool?; let scannedAt: Date; let checkpointName: String?; let buildingName: String? }
private struct IncidentPatch: Encodable { let status: String; let resolutionNote: String? }
private struct IncidentOne: Decodable { let incident: IncidentRow? }

struct MacSecurityView: View {
    @State private var incidents: [IncidentRow] = []
    @State private var checkpoints: [CheckpointRow] = []
    @State private var scans: [ScanRow] = []
    @State private var tab = 0
    @State private var loading = true
    @State private var errorText: String?
    @State private var busyId: String?

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) { Text("Incidents (\(incidents.filter { $0.status != "resolved" }.count) open)").tag(0); Text("Patrols").tag(1) }
                .pickerStyle(.segmented).padding(12).frame(maxWidth: 420)
            Divider()
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if tab == 0 { incidentsPane } else { patrolsPane }
        }
        .task { await load() }
    }

    private var incidentsPane: some View {
        Group {
            if incidents.isEmpty { emptyView("No incidents logged", "Guards log incidents from the phone or web. They appear here with severity and status.") }
            else {
                Table(incidents) {
                    TableColumn("Incident") { i in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(i.title).fontWeight(.medium)
                            if let d = i.description { Text(d).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                        }
                    }
                    TableColumn("Site") { i in Text(i.building?.name ?? "—").foregroundStyle(.secondary) }.width(150)
                    TableColumn("Severity") { i in
                        Text(i.severity.capitalized).font(.caption.weight(.bold))
                            .foregroundStyle(i.severity == "critical" || i.severity == "high" ? .red : i.severity == "medium" ? .orange : .secondary)
                    }.width(80)
                    TableColumn("When") { i in Text((i.occurredAt ?? i.createdAt).formatted(date: .abbreviated, time: .shortened)).foregroundStyle(.secondary) }.width(160)
                    TableColumn("Status") { i in
                        HStack {
                            Text(i.status.capitalized).font(.caption)
                            if i.status != "resolved" {
                                Button("Resolve") { Task { await resolve(i) } }.buttonStyle(.bordered).controlSize(.small).disabled(busyId != nil)
                            }
                        }
                    }.width(160)
                }
            }
        }
    }

    private var patrolsPane: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GroupBox("Checkpoints (\(checkpoints.count))") {
                    if checkpoints.isEmpty { Text("No checkpoints yet. Create them on the web and print the QR codes.").foregroundStyle(.secondary).padding(6) }
                    else {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(checkpoints) { c in
                                HStack {
                                    Circle().fill(c.active ? Color.green : Color.gray).frame(width: 8, height: 8)
                                    Text(c.name)
                                    if let n = c.locationNote { Text(n).font(.caption).foregroundStyle(.secondary) }
                                    Spacer()
                                    Text(c.building?.name ?? "").font(.caption).foregroundStyle(.secondary)
                                }.padding(.vertical, 2)
                            }
                        }.padding(.vertical, 4)
                    }
                }
                GroupBox("Recent scans") {
                    if scans.isEmpty { Text("No scans recorded yet.").foregroundStyle(.secondary).padding(6) }
                    else {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(scans.prefix(40)) { s in
                                HStack {
                                    if s.flagged == true { Image(systemName: "flag.fill").foregroundStyle(.orange) }
                                    Text(s.checkpointName ?? "Checkpoint").fontWeight(.medium)
                                    Text(s.guardName ?? "").foregroundStyle(.secondary)
                                    if let n = s.note, !n.isEmpty { Text(n).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                                    Spacer()
                                    Text(s.scannedAt.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                                }.padding(.vertical, 2)
                            }
                        }.padding(.vertical, 4)
                    }
                }
            }
            .padding(20)
        }
    }

    private func resolve(_ i: IncidentRow) async {
        busyId = i.id
        defer { busyId = nil }
        let _: IncidentOne? = try? await APIClient.shared.request("/incidents/\(i.id)", method: "PATCH", body: IncidentPatch(status: "resolved", resolutionNote: nil))
        await load()
    }

    private func load() async {
        loading = true
        async let i: IncidentsResponse? = try? APIClient.shared.request("/incidents")
        async let c: CheckpointsResponse? = try? APIClient.shared.request("/checkpoints")
        async let s: ScansResponse? = try? APIClient.shared.request("/checkpoint-scans")
        let (iv, cv, sv) = await (i, c, s)
        if iv == nil && cv == nil { errorText = "Couldn't load security data." } else { errorText = nil }
        incidents = iv?.incidents ?? []
        checkpoints = cv?.checkpoints ?? []
        scans = sv?.scans ?? []
        loading = false
    }
}

// ── Visitors ─────────────────────────────────────────────────────────

private struct VisitorsResponse: Decodable { let visitors: [VisitorRow] }
private struct VisitorRow: Decodable, Identifiable {
    let id: String; let name: String; let company: String?; let host: String?; let purpose: String?; let badge: String?
    let expectedAt: Date?; let signedInAt: Date?; let signedOutAt: Date?; let buildingId: String?
}
private struct VisitorAction: Decodable { let visitor: VisitorRow? }

struct MacVisitorsView: View {
    @State private var rows: [VisitorRow] = []
    @State private var day = Date()
    @State private var loading = true
    @State private var errorText: String?
    @State private var busyId: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                DatePicker("Day", selection: $day, displayedComponents: .date).labelsHidden()
                Button("Today") { day = Date() }
                Spacer()
                Text("\(rows.filter { $0.signedInAt != nil && $0.signedOutAt == nil }.count) on site now").font(.caption).foregroundStyle(.secondary)
            }.padding(12)
            Divider()
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No visitors this day", "Pre-book visitors on the web, or sign them in at reception. Sign in and out from here.") }
            else {
                Table(rows) {
                    TableColumn("Visitor") { v in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(v.name).fontWeight(.medium)
                            if let c = v.company { Text(c).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    TableColumn("Host") { v in Text(v.host ?? "—").foregroundStyle(.secondary) }.width(140)
                    TableColumn("Purpose") { v in Text(v.purpose ?? "—").foregroundStyle(.secondary) }
                    TableColumn("Expected") { v in Text(v.expectedAt?.formatted(date: .omitted, time: .shortened) ?? "—").foregroundStyle(.secondary) }.width(90)
                    TableColumn("Status") { v in
                        HStack {
                            if v.signedOutAt != nil { Text("Signed out \(v.signedOutAt!.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary) }
                            else if v.signedInAt != nil {
                                Text("On site since \(v.signedInAt!.formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.green)
                                Button("Sign out") { Task { await act(v, "sign-out") } }.buttonStyle(.bordered).controlSize(.small).disabled(busyId != nil)
                            } else {
                                Text("Expected").font(.caption).foregroundStyle(.secondary)
                                Button("Sign in") { Task { await act(v, "sign-in") } }.buttonStyle(.borderedProminent).controlSize(.small).disabled(busyId != nil)
                            }
                        }
                    }.width(260)
                }
            }
        }
        .task { await load() }
        .onChange(of: day) { _, _ in Task { await load() } }
    }

    private func act(_ v: VisitorRow, _ action: String) async {
        busyId = v.id
        defer { busyId = nil }
        let _: VisitorAction? = try? await APIClient.shared.request("/visitors/\(v.id)/\(action)", method: "POST")
        await load()
    }

    private func load() async {
        loading = true
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        do { let r: VisitorsResponse = try await APIClient.shared.request("/visitors?day=\(f.string(from: day))"); rows = r.visitors; errorText = nil }
        catch { errorText = "Couldn't load visitors." }
        loading = false
    }
}

// ── Billing ──────────────────────────────────────────────────────────

private struct InvoicesResponse: Decodable { let invoices: [InvoiceRow] }
private struct InvoiceRow: Decodable, Identifiable {
    let id: String; let number: String; let customerName: String?; let amountCents: Int; let currency: String
    let status: String; let issuedAt: Date?; let dueAt: Date?; let paidAt: Date?
}
private struct InvoiceStatusBody: Encodable { let status: String }
private struct InvoiceOne: Decodable { let invoice: InvoiceRow? }

struct MacBillingView: View {
    @State private var rows: [InvoiceRow] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var busyId: String?

    fileprivate var outstanding: Int { rows.filter { $0.status == "sent" || $0.status == "overdue" }.reduce(0) { $0 + $1.amountCents } }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Outstanding: \(money(outstanding))").font(.headline)
                Spacer()
                Text("\(rows.filter { $0.status == "overdue" }.count) overdue").font(.caption).foregroundStyle(.red)
                Text("Create and export invoices on the web under Billing.").font(.caption).foregroundStyle(.secondary)
            }.padding(12)
            Divider()
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No invoices yet", "Raise your first invoice on the web. Status changes can be made here.") }
            else {
                Table(rows) {
                    TableColumn("Number") { i in Text(i.number).font(.system(.body, design: .monospaced)) }.width(110)
                    TableColumn("Customer") { i in Text(i.customerName ?? "—") }
                    TableColumn("Amount") { i in Text(money(i.amountCents, i.currency)).monospacedDigit() }.width(110)
                    TableColumn("Due") { i in Text(i.dueAt?.formatted(date: .abbreviated, time: .omitted) ?? "—").foregroundStyle(i.status == "overdue" ? .red : .secondary) }.width(110)
                    TableColumn("Status") { i in
                        HStack {
                            statusPill(i.status)
                            if i.status == "draft" { Button("Send") { Task { await set(i, "sent") } }.controlSize(.small).disabled(busyId != nil) }
                            if i.status == "sent" || i.status == "overdue" { Button("Mark paid") { Task { await set(i, "paid") } }.controlSize(.small).disabled(busyId != nil) }
                        }
                    }.width(220)
                }
            }
        }
        .task { await load() }
    }

    private func statusPill(_ s: String) -> some View {
        let color: Color = s == "paid" ? .green : s == "overdue" ? .red : s == "sent" ? .blue : s == "void" ? .gray : .secondary
        return Text(s.capitalized).font(.caption2.weight(.bold)).padding(.horizontal, 7).padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule()).foregroundStyle(color)
    }
    private func money(_ c: Int, _ cur: String = "EUR") -> String {
        let sym = cur == "EUR" ? "€" : cur == "GBP" ? "£" : cur + " "
        return sym + String(format: "%.2f", Double(c) / 100)
    }
    private func set(_ i: InvoiceRow, _ status: String) async {
        busyId = i.id
        defer { busyId = nil }
        let _: InvoiceOne? = try? await APIClient.shared.request("/invoices/\(i.id)", method: "PATCH", body: InvoiceStatusBody(status: status))
        await load()
    }
    private func load() async {
        loading = true
        do { let r: InvoicesResponse = try await APIClient.shared.request("/invoices"); rows = r.invoices; errorText = nil }
        catch let e as APIError { if case .http(let s, _) = e, s == 403 { errorText = "Billing is admin-only." } else { errorText = "Couldn't load invoices." } }
        catch { errorText = "Couldn't load invoices." }
        loading = false
    }
}

// ── Client portals ───────────────────────────────────────────────────

private struct PortalsResponse: Decodable { let portals: [PortalRow] }
private struct PortalRow: Decodable, Identifiable { let id: String; let clientName: String; let buildingName: String; let path: String; let active: Bool; let createdAt: Date }

struct MacPortalsView: View {
    @State private var rows: [PortalRow] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var copied: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Read-only links, one per building's client. Create and revoke on the web under Client portal.").foregroundStyle(.secondary).font(.callout)
                Spacer()
            }.padding(12)
            Divider()
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No portal links yet", "Create one on the web to give a client a live window into their site.") }
            else {
                Table(rows) {
                    TableColumn("Client") { p in Text(p.clientName).fontWeight(.medium) }
                    TableColumn("Building") { p in Text(p.buildingName).foregroundStyle(.secondary) }
                    TableColumn("Status") { p in Text(p.active ? "Active" : "Revoked").font(.caption.weight(.bold)).foregroundStyle(p.active ? .green : .secondary) }.width(80)
                    TableColumn("Link") { p in
                        HStack {
                            Button(copied == p.id ? "Copied" : "Copy link") {
                                let url = "https://app.hazardlink.ie" + p.path
                                NSPasteboard.general.clearContents(); NSPasteboard.general.setString(url, forType: .string)
                                copied = p.id
                            }.controlSize(.small).disabled(!p.active)
                            Button("Open") { if let u = URL(string: "https://app.hazardlink.ie" + p.path) { NSWorkspace.shared.open(u) } }.controlSize(.small).disabled(!p.active)
                        }
                    }.width(180)
                }
            }
        }
        .task { await load() }
    }
    private func load() async {
        loading = true
        do { let r: PortalsResponse = try await APIClient.shared.request("/portals"); rows = r.portals; errorText = nil }
        catch { errorText = "Couldn't load portal links." }
        loading = false
    }
}

// ── Rounds & inspections ─────────────────────────────────────────────

private struct InspectionsResponse: Decodable { let inspections: [InspectionRow] }
private struct InspectionRow: Decodable, Identifiable { let id: String; let area: String?; let inspectorName: String?; let score: Int?; let note: String?; let createdAt: Date; let building: NamedRef? }

struct MacInspectionsView: View {
    @State private var rows: [InspectionRow] = []
    @State private var loading = true
    @State private var errorText: String?

    fileprivate var avg: Int? { let s = rows.compactMap(\.score); return s.isEmpty ? nil : s.reduce(0, +) / s.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(avg.map { "Average score \($0)%" } ?? "No scored inspections yet").font(.headline)
                Spacer()
                Text("Inspections are done on the phone with photos; results land here.").font(.caption).foregroundStyle(.secondary)
            }.padding(12)
            Divider()
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No inspections yet", "Cleaners and supervisors record inspections on the phone. Scores and notes appear here.") }
            else {
                Table(rows) {
                    TableColumn("Area") { r in Text(r.area ?? "Inspection").fontWeight(.medium) }
                    TableColumn("Site") { r in Text(r.building?.name ?? "—").foregroundStyle(.secondary) }.width(150)
                    TableColumn("Inspector") { r in Text(r.inspectorName ?? "—").foregroundStyle(.secondary) }.width(140)
                    TableColumn("Score") { r in
                        if let s = r.score { Text("\(s)%").fontWeight(.semibold).foregroundStyle(s >= 90 ? .green : s >= 70 ? .orange : .red) } else { Text("—").foregroundStyle(.secondary) }
                    }.width(70)
                    TableColumn("Note") { r in Text(r.note ?? "").foregroundStyle(.secondary).lineLimit(1) }
                    TableColumn("When") { r in Text(r.createdAt.formatted(date: .abbreviated, time: .shortened)).foregroundStyle(.secondary) }.width(160)
                }
            }
        }
        .task { await load() }
    }
    private func load() async {
        loading = true
        do { let r: InspectionsResponse = try await APIClient.shared.request("/inspections"); rows = r.inspections; errorText = nil }
        catch { errorText = "Couldn't load inspections." }
        loading = false
    }
}

// ── Safety sheets (SDS) ──────────────────────────────────────────────

private struct SdsResponse: Decodable { let sheets: [SdsRow] }
private struct SdsRow: Decodable, Identifiable {
    let id: String; let productName: String; let manufacturer: String?; let signalWord: String?; let verified: Bool?; let sdsPdfUrl: String?; let reviewDate: String?; let discipline: String?
}

struct MacSdsView: View {
    @State private var rows: [SdsRow] = []
    @State private var query = ""
    @State private var loading = true
    @State private var errorText: String?

    fileprivate var filtered: [SdsRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? rows : rows.filter { ($0.productName + " " + ($0.manufacturer ?? "")).lowercased().contains(q) }
    }

    var body: some View {
        VStack(spacing: 0) {
            registerHeader(count: filtered.count, noun: "sheet", query: $query,
                           trailing: rows.filter { $0.verified != true }.isEmpty ? nil : "\(rows.filter { $0.verified != true }.count) awaiting verification")
            if loading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            else if let e = errorText { retryView(e) { Task { await load() } } }
            else if rows.isEmpty { emptyView("No safety data sheets yet", "Scan a product barcode on the phone or add sheets on the web. The chemical library shows here for quick lookup.") }
            else {
                Table(filtered) {
                    TableColumn("Product") { s in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.productName).fontWeight(.medium)
                            if let m = s.manufacturer { Text(m).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    TableColumn("Signal word") { s in
                        Text(s.signalWord ?? "—").font(.caption.weight(.bold)).foregroundStyle(s.signalWord?.lowercased() == "danger" ? .red : s.signalWord?.lowercased() == "warning" ? .orange : .secondary)
                    }.width(100)
                    TableColumn("Verified") { s in Text(s.verified == true ? "Yes" : "Not yet").font(.caption).foregroundStyle(s.verified == true ? .green : .orange) }.width(80)
                    TableColumn("Review") { s in Text(s.reviewDate ?? "—").foregroundStyle(.secondary) }.width(100)
                    TableColumn("Sheet") { s in
                        if let u = s.sdsPdfUrl, let url = URL(string: u) {
                            Button("Open PDF") { NSWorkspace.shared.open(url) }.controlSize(.small)
                        } else { Text("—").foregroundStyle(.secondary) }
                    }.width(100)
                }
            }
        }
        .task { await load() }
    }
    private func load() async {
        loading = true
        do { let r: SdsResponse = try await APIClient.shared.request("/sds"); rows = r.sheets; errorText = nil }
        catch { errorText = "Couldn't load safety sheets." }
        loading = false
    }
}

// ── Automations ──────────────────────────────────────────────────────

/// The automations that run for every org, described exactly as the backend
/// implements them (see services/*-reminder.ts, escalation-timer.ts,
/// routes/dockets.ts). Read-only on the Mac; nothing here is configurable
/// yet, and this list says so rather than pretending.
struct MacAutomationsView: View {
    private let items: [(String, String, String)] = [
        ("Spill escalation", "bell.badge", "A lifted sign nobody acknowledges escalates on a timer to supervisors, then admins, by in-app, email and (when configured) SMS."),
        ("Overdue work orders", "hammer", "Any scheduled work order past its start time raises a daily overdue notification to admins and supervisors."),
        ("PPM reminders", "arrow.triangle.2.circlepath", "Planned maintenance emails the contractor ahead of the due date and chases until it's scheduled."),
        ("Cert and compliance expiry", "checkmark.shield", "Staff certs inside 60 days of expiry, and compliance items past due, are flagged daily with a digest email."),
        ("Docket auto-send and auto-complete", "doc.text", "Awarding a job emails the contractor a completion docket. A docket marked fixed with photo evidence completes the job itself; further repairs become a new job and quote request."),
        ("Overdue invoices", "creditcard", "Sent invoices past their due date flip to overdue and notify billing admins."),
        ("Missed patrols", "figure.walk", "An active security checkpoint with no scan in 24 hours raises a missed-patrol notification."),
        ("Lone-worker overdue", "person.wave.2", "A lone-worker session that misses its check-in escalates immediately."),
        ("Low stock", "shippingbox", "Parts at or below their reorder level are flagged daily."),
        ("Portal requests", "link", "A client raising a request through their portal link creates a real job and notifies the team instantly."),
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("These run automatically for your organisation. Per-user delivery channels are set under Notifications on the web.")
                    .foregroundStyle(.secondary)
                ForEach(items, id: \.0) { it in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: it.1).font(.title3).frame(width: 30).foregroundStyle(.primary).symbolRenderingMode(.hierarchical)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(it.0).font(.headline)
                            Text(it.2).font(.callout).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("Active").font(.caption2.weight(.bold)).padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Color.green.opacity(0.15), in: Capsule()).foregroundStyle(.green)
                    }
                    .padding(12)
                    .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(24)
            .frame(maxWidth: 900, alignment: .leading)
        }
    }
}
