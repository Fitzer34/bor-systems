import SwiftUI

/// Permits to work on the phone: request from the yard, approve on the go.
/// Lifecycle requested → approved → active → closed, same /permits endpoints
/// and role rules as the web.

private struct PermitRow: Decodable, Identifiable {
    let id: String
    let type: String
    let typeLabel: String?
    let description: String
    let buildingName: String?
    let contractorName: String?
    let requirements: [String]?
    let startsAt: Date
    let endsAt: Date
    let status: String   // requested | approved | active | closed | rejected | cancelled
    let requestedByName: String?
}
private struct PermitsResponse: Decodable { let permits: [PermitRow] }
private struct PermitOneResponse: Decodable { let permit: PermitRow? }

private struct PermitBuilding: Decodable, Identifiable { let id: String; let name: String }
private struct PermitBuildingsResponse: Decodable { let buildings: [PermitBuilding] }

private struct PermitCreateBody: Encodable {
    let type: String
    let description: String
    let buildingId: String?
    let contractorName: String?
    let startsAt: String
    let endsAt: String
    let requirements: [String]
}
private struct PermitActionBody: Encodable { let action: String }

private let PERMIT_TYPES: [(key: String, label: String)] = [
    ("hot_works", "Hot works"),
    ("working_at_height", "Working at height"),
    ("confined_space", "Confined space"),
    ("electrical", "Electrical"),
    ("asbestos", "Asbestos"),
    ("excavation", "Excavation"),
    ("general", "General"),
]

struct PermitsView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var permits: [PermitRow] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var busy = false
    @State private var showRequest = false
    @State private var toast: String?

    private var isStaff: Bool {
        auth.user?.role == .admin || auth.user?.role == .supervisor
    }

    var body: some View {
        List {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let e = errorText {
                VStack(spacing: 8) {
                    Text(e).font(.subheadline).foregroundStyle(.secondary)
                    Button("Try again") { Task { await load() } }
                }
            } else if permits.isEmpty {
                Text("No permits yet. Request one when contractors need hot works, roof access or confined-space entry.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(permits) { p in
                    permitRow(p)
                }
            }
        }
        .navigationTitle("Permits")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showRequest = true } label: { Label("Request", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $showRequest) {
            PermitRequestSheet { body in
                Task { await create(body) }
            }
        }
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

    @ViewBuilder private func permitRow(_ p: PermitRow) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(p.typeLabel ?? p.type).font(.caption.weight(.bold)).foregroundStyle(.orange)
                Spacer()
                statusPill(p.status)
            }
            Text(p.description).font(.subheadline).lineLimit(3)
            HStack(spacing: 8) {
                if let b = p.buildingName { Label(b, systemImage: "building.2").font(.caption2) }
                if let c = p.contractorName, !c.isEmpty { Label(c, systemImage: "person").font(.caption2) }
            }
            .foregroundStyle(.secondary)
            Text("\(p.startsAt.formatted(date: .abbreviated, time: .shortened)) → \(p.endsAt.formatted(date: .omitted, time: .shortened))")
                .font(.caption2).foregroundStyle(.secondary)
            if p.status == "active" && Date() > p.endsAt {
                Text("Past its end time — close it out.").font(.caption).foregroundStyle(.orange)
            }
            actions(p)
        }
        .padding(.vertical, 3)
    }

    @ViewBuilder private func actions(_ p: PermitRow) -> some View {
        HStack {
            if p.status == "requested" && isStaff {
                Button("Approve") { Task { await act(p.id, "approve", "Permit approved. The requester is notified.") } }
                    .buttonStyle(.borderedProminent)
                Button("Reject") { Task { await act(p.id, "reject", "Permit rejected.") } }
                    .buttonStyle(.bordered)
            } else if p.status == "requested" && !isStaff {
                Text("An admin or supervisor approves permits.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            if p.status == "approved" {
                Button("Start work") { Task { await act(p.id, "activate", "Marked active on site.") } }
                    .buttonStyle(.borderedProminent)
            }
            if p.status == "active" || p.status == "approved" {
                Button("Close out") { Task { await act(p.id, "close", "Permit closed.") } }
                    .buttonStyle(.bordered)
            }
        }
        .font(.caption.weight(.semibold))
        .disabled(busy)
    }

    private func statusPill(_ s: String) -> some View {
        let (label, color): (String, Color) =
            s == "requested" ? ("Requested", .orange)
            : s == "approved" ? ("Approved", .blue)
            : s == "active" ? ("Active", .green)
            : s == "closed" ? ("Closed", .secondary)
            : s == "rejected" ? ("Rejected", .red)
            : ("Cancelled", .secondary)
        return Text(label)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }

    private func load() async {
        loading = true
        do {
            let r: PermitsResponse = try await APIClient.shared.request("/permits")
            permits = r.permits
            errorText = nil
        } catch {
            errorText = "Couldn't load permits."
        }
        loading = false
    }

    private func create(_ body: PermitCreateBody) async {
        busy = true
        defer { busy = false }
        do {
            let _: PermitOneResponse = try await APIClient.shared.request("/permits", method: "POST", body: body)
            await load()
            showToast("Permit requested. Admins and supervisors are notified.")
        } catch { showToast("Could not request. Check the times.") }
    }

    private func act(_ id: String, _ action: String, _ done: String) async {
        busy = true
        defer { busy = false }
        do {
            let _: PermitOneResponse = try await APIClient.shared.request("/permits/\(id)", method: "PATCH", body: PermitActionBody(action: action))
            await load()
            showToast(done)
        } catch { showToast("Could not update that permit.") }
    }

    private func showToast(_ t: String) {
        withAnimation { toast = t }
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation { toast = nil }
        }
    }
}

private struct PermitRequestSheet: View {
    let onSave: (PermitCreateBody) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var type = "hot_works"
    @State private var description = ""
    @State private var contractor = ""
    @State private var buildings: [PermitBuilding] = []
    @State private var buildingId = ""
    @State private var starts = Date()
    @State private var ends = Date().addingTimeInterval(4 * 3600)

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $type) {
                    ForEach(PERMIT_TYPES, id: \.key) { t in Text(t.label).tag(t.key) }
                }
                if !buildings.isEmpty {
                    Picker("Site", selection: $buildingId) {
                        Text("Portfolio-wide").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }
                }
                TextField("Contractor (optional)", text: $contractor)
                TextField("Describe the work, hazards and controls…", text: $description, axis: .vertical)
                    .lineLimit(3...6)
                DatePicker("Valid from", selection: $starts)
                DatePicker("Valid to", selection: $ends, in: starts...)
            }
            .navigationTitle("Request permit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Request") {
                        let iso = ISO8601DateFormatter()
                        onSave(PermitCreateBody(
                            type: type,
                            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                            buildingId: buildingId.isEmpty ? nil : buildingId,
                            contractorName: contractor.isEmpty ? nil : contractor,
                            startsAt: iso.string(from: starts),
                            endsAt: iso.string(from: ends),
                            requirements: []))
                        dismiss()
                    }
                    .disabled(description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .task {
                if let b: PermitBuildingsResponse = try? await APIClient.shared.request("/buildings") {
                    buildings = b.buildings
                }
            }
        }
    }
}
