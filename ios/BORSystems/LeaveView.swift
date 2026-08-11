import SwiftUI

/// Team & leave on the phone: book or request time off, see who's off,
/// and (for admins/supervisors) approve or decline pending requests.
/// Same /leave endpoints as the web Team section.

private struct LeaveRow: Decodable, Identifiable {
    let id: String
    let userId: String
    let type: String        // annual | sick | unpaid | other
    let startsOn: String    // YYYY-MM-DD (date-only, decoded as String)
    let endsOn: String
    let note: String?
    let status: String      // pending | approved | declined | cancelled
}
private struct LeaveListResponse: Decodable { let leave: [LeaveRow] }

private struct LeaveUser: Decodable, Identifiable { let id: String; let name: String }
private struct LeaveUsersResponse: Decodable { let users: [LeaveUser] }

private struct LeaveCreateBody: Encodable {
    let userId: String?
    let type: String
    let startsOn: String
    let endsOn: String
    let note: String?
}
private struct LeaveDecideBody: Encodable { let status: String }
private struct LeaveOneResponse: Decodable { let leave: LeaveRow? }

struct LeaveView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var rows: [LeaveRow] = []
    @State private var users: [LeaveUser] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var busy = false
    @State private var showBook = false
    @State private var toast: String?

    private var isStaff: Bool {
        auth.user?.role == .admin || auth.user?.role == .supervisor
    }
    private func userName(_ id: String) -> String {
        users.first(where: { $0.id == id })?.name ?? (id == auth.user?.id ? (auth.user?.name ?? "Me") : "Team member")
    }

    var body: some View {
        List {
            if isStaff && !pending.isEmpty {
                Section("Awaiting your decision") {
                    ForEach(pending) { r in
                        VStack(alignment: .leading, spacing: 6) {
                            rowHeader(r)
                            HStack {
                                Button("Approve") { Task { await decide(r.id, "approved") } }
                                    .buttonStyle(.borderedProminent)
                                Button("Decline") { Task { await decide(r.id, "declined") } }
                                    .buttonStyle(.bordered)
                            }
                            .font(.caption.weight(.semibold))
                            .disabled(busy)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }

            Section(isStaff ? "All leave" : "My leave") {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if let e = errorText {
                    VStack(spacing: 8) {
                        Text(e).font(.subheadline).foregroundStyle(.secondary)
                        Button("Try again") { Task { await load() } }
                    }
                } else if rows.isEmpty {
                    Text(isStaff
                         ? "No leave booked yet. Use Book time off to mark somebody off."
                         : "No leave yet. Request time off and your supervisor approves it.")
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    ForEach(rows) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            rowHeader(r)
                            if let n = r.note, !n.isEmpty {
                                Text(n).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .navigationTitle("Team & leave")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showBook = true
                } label: {
                    Label(isStaff ? "Book time off" : "Request time off", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showBook) {
            BookLeaveSheet(isStaff: isStaff, users: users) { body in
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

    private var pending: [LeaveRow] { rows.filter { $0.status == "pending" } }

    private func rowHeader(_ r: LeaveRow) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(userName(r.userId)).font(.subheadline.weight(.semibold))
                Text("\(r.type.capitalized) · \(r.startsOn) → \(r.endsOn)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            statusPill(r.status)
        }
    }

    private func statusPill(_ s: String) -> some View {
        let (label, color): (String, Color) =
            s == "approved" ? ("Approved", .green)
            : s == "pending" ? ("Pending", .orange)
            : s == "declined" ? ("Declined", .red)
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
            let r: LeaveListResponse = try await APIClient.shared.request("/leave")
            rows = r.leave.sorted { $0.startsOn > $1.startsOn }
            errorText = nil
        } catch {
            errorText = "Couldn't load leave."
        }
        if isStaff, users.isEmpty {
            if let u: LeaveUsersResponse = try? await APIClient.shared.request("/users") {
                users = u.users
            }
        }
        loading = false
    }

    private func create(_ body: LeaveCreateBody) async {
        busy = true
        defer { busy = false }
        do {
            let _: LeaveOneResponse = try await APIClient.shared.request("/leave", method: "POST", body: body)
            await load()
            showToast(isStaff && body.userId != nil ? "Time off booked." : "Request sent for approval.")
        } catch { showToast("Could not save. Check the dates.") }
    }

    private func decide(_ id: String, _ status: String) async {
        busy = true
        defer { busy = false }
        do {
            let _: LeaveOneResponse = try await APIClient.shared.request("/leave/\(id)", method: "PATCH", body: LeaveDecideBody(status: status))
            await load()
            showToast(status == "approved" ? "Approved." : "Declined.")
        } catch { showToast("Could not update that request.") }
    }

    private func showToast(_ t: String) {
        withAnimation { toast = t }
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation { toast = nil }
        }
    }
}

private struct BookLeaveSheet: View {
    let isStaff: Bool
    let users: [LeaveUser]
    let onSave: (LeaveCreateBody) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var userId: String = ""
    @State private var type = "annual"
    @State private var starts = Date()
    @State private var ends = Date()
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                if isStaff && !users.isEmpty {
                    Picker("Who", selection: $userId) {
                        Text("Myself").tag("")
                        ForEach(users) { u in Text(u.name).tag(u.id) }
                    }
                }
                Picker("Type", selection: $type) {
                    Text("Annual leave").tag("annual")
                    Text("Sick").tag("sick")
                    Text("Unpaid").tag("unpaid")
                    Text("Other").tag("other")
                }
                DatePicker("First day", selection: $starts, displayedComponents: .date)
                DatePicker("Last day", selection: $ends, in: starts..., displayedComponents: .date)
                TextField("Note (optional)", text: $note)
            }
            .navigationTitle(isStaff ? "Book time off" : "Request time off")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let f = DateFormatter()
                        f.dateFormat = "yyyy-MM-dd"
                        onSave(LeaveCreateBody(
                            userId: userId.isEmpty ? nil : userId,
                            type: type,
                            startsOn: f.string(from: starts),
                            endsOn: f.string(from: ends),
                            note: note.isEmpty ? nil : note))
                        dismiss()
                    }
                }
            }
        }
    }
}
