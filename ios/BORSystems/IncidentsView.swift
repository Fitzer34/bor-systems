import SwiftUI

/// Security incidents on the phone: the live log, report-from-the-spot, and
/// resolve. Same endpoints as the web (GET/POST /incidents, PATCH to change
/// status). Guards report from where they stand — that's the whole point of
/// having this native.

private struct IncidentBuildingRef: Decodable { let id: String; let name: String }
private struct Incident: Decodable, Identifiable {
    let id: String
    let title: String
    let kind: String?
    let severity: String
    let status: String
    let description: String?
    let createdAt: Date?
    let building: IncidentBuildingRef?
}
private struct IncidentsResponse: Decodable { let incidents: [Incident] }

struct IncidentsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var incidents: [Incident] = []
    @State private var failed = false
    @State private var loading = true
    @State private var showReport = false

    private var isStaff: Bool {
        let r = auth.user?.role
        return r == .admin || r == .supervisor
    }

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if failed {
                VStack(spacing: 10) {
                    Text("Could not load incidents.").foregroundStyle(.secondary)
                    Button("Retry") { Task { await load() } }.buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    let open = incidents.filter { $0.status != "resolved" }
                    let closed = incidents.filter { $0.status == "resolved" }
                    Section(open.isEmpty ? "No open incidents" : "Open") {
                        ForEach(open) { i in row(i) }
                    }
                    if !closed.isEmpty {
                        Section("Resolved") { ForEach(closed.prefix(20)) { i in row(i) } }
                    }
                }
            }
        }
        .navigationTitle("Incidents")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showReport = true } label: { Label("Report", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showReport) {
            ReportIncidentSheet { await load() }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func sevColor(_ s: String) -> Color {
        s == "critical" || s == "high" ? .red : s == "medium" ? .orange : .secondary
    }

    private func row(_ i: Incident) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Circle().fill(i.status == "resolved" ? Color.green : sevColor(i.severity)).frame(width: 8, height: 8)
                Text(i.title).font(.body.weight(.medium))
            }
            Text([i.severity, i.kind, i.building?.name,
                  i.createdAt.map { $0.formatted(date: .abbreviated, time: .shortened) }]
                  .compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.secondary)
            if let d = i.description, !d.isEmpty {
                Text(d).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            if isStaff && i.status != "resolved" {
                Button("Mark resolved") { Task { await setStatus(i, "resolved") } }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.bordered).controlSize(.small)
                    .padding(.top, 2)
            }
        }
        .padding(.vertical, 2)
    }

    private func load() async {
        do {
            let r: IncidentsResponse = try await APIClient.shared.request("/incidents")
            incidents = r.incidents
            failed = false
        } catch { if incidents.isEmpty { failed = true } }
        loading = false
    }

    private func setStatus(_ i: Incident, _ status: String) async {
        struct B: Encodable { let status: String }
        struct R: Decodable { let incident: Incident? }
        if let _: R = try? await APIClient.shared.request("/incidents/\(i.id)", method: "PATCH", body: B(status: status)) {
            await load()
        }
    }
}

private struct ReportIncidentSheet: View {
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var severity = "medium"
    @State private var kind = ""
    @State private var description = ""
    @State private var buildings: [Building] = []
    @State private var buildingId = ""
    @State private var sending = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("What happened") {
                    TextField("Short title, e.g. Forced door at loading bay", text: $title)
                    Picker("Severity", selection: $severity) {
                        Text("Low").tag("low"); Text("Medium").tag("medium")
                        Text("High").tag("high"); Text("Critical").tag("critical")
                    }
                    TextField("Kind (optional), e.g. intrusion, theft", text: $kind)
                }
                Section("Where") {
                    Picker("Site", selection: $buildingId) {
                        Text("Not site-specific").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }
                }
                Section("Detail") {
                    TextField("What did you see? (optional)", text: $description, axis: .vertical)
                        .lineLimit(3...6)
                }
                if let e = error { Text(e).font(.caption).foregroundStyle(.red) }
            }
            .navigationTitle("Report incident")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button(sending ? "Sending…" : "Report") { Task { await send() } }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                }
            }
            .task { buildings = (try? await APIClient.shared.buildings()) ?? [] }
        }
    }

    private func send() async {
        sending = true
        defer { sending = false }
        struct B: Encodable {
            let title: String; let severity: String
            let kind: String?; let description: String?; let buildingId: String?
        }
        struct R: Decodable { let incident: Incident? }
        do {
            let _: R = try await APIClient.shared.request("/incidents", method: "POST", body: B(
                title: title.trimmingCharacters(in: .whitespaces),
                severity: severity,
                kind: kind.trimmingCharacters(in: .whitespaces).isEmpty ? nil : kind.trimmingCharacters(in: .whitespaces),
                description: description.trimmingCharacters(in: .whitespaces).isEmpty ? nil : description.trimmingCharacters(in: .whitespaces),
                buildingId: buildingId.isEmpty ? nil : buildingId))
            await onDone()
            dismiss()
        } catch {
            self.error = "Couldn't send the report. Check your connection and try again."
        }
    }
}
