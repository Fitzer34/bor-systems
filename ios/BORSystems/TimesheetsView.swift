import SwiftUI

/// Time & attendance on the phone: the clock in/out card every role gets,
/// this week's entries, and one-tap approval for admins/supervisors.
/// Mirrors the web Timesheets section against the same /time/* endpoints.

private struct TSOpenEntry: Decodable {
    let id: String
    let clockInAt: Date
    let buildingId: String?
    let hoursOpen: Double?
}
private struct TSStatusResponse: Decodable { let open: TSOpenEntry? }

private struct TSEntry: Decodable, Identifiable {
    let id: String
    let userId: String
    let userName: String?
    let buildingName: String?
    let clockInAt: Date
    let clockOutAt: Date?
    let breakMinutes: Int
    let status: String   // open | pending | approved
    let note: String?
    let hours: Double?
}
private struct TSEntriesResponse: Decodable { let entries: [TSEntry] }

private struct TSBuilding: Decodable, Identifiable { let id: String; let name: String }
private struct TSBuildingsResponse: Decodable { let buildings: [TSBuilding] }

private struct TSClockInBody: Encodable { let buildingId: String? }
private struct TSClockOutBody: Encodable { let breakMinutes: Int }
private struct TSApproveAllBody: Encodable { let from: String; let to: String }
private struct TSEntryResponse: Decodable {
    // Present so `request` has something to decode; we refetch after actions.
    let entry: TSEntry?
}
private struct TSApproveAllResponse: Decodable { let approved: Int }

struct TimesheetsView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var open: TSOpenEntry?
    @State private var entries: [TSEntry] = []
    @State private var buildings: [TSBuilding] = []
    @State private var selectedBuilding: String = ""
    @State private var breakMinutes: String = "0"
    @State private var weekOffset = 0
    @State private var loading = true
    @State private var busy = false
    @State private var errorText: String?
    @State private var toast: String?

    private var isStaff: Bool {
        auth.user?.role == .admin || auth.user?.role == .supervisor
    }

    var body: some View {
        List {
            clockCard

            Section {
                HStack {
                    Button { weekOffset -= 1; Task { await loadEntries() } } label: {
                        Image(systemName: "chevron.left")
                    }
                    Spacer()
                    Text(weekLabel).font(.subheadline.weight(.semibold))
                    Spacer()
                    Button { weekOffset += 1; Task { await loadEntries() } } label: {
                        Image(systemName: "chevron.right")
                    }
                    .disabled(weekOffset >= 0)
                }
                .buttonStyle(.borderless)
            }

            if isStaff && pendingCount > 0 {
                Section {
                    Button {
                        Task { await approveAll() }
                    } label: {
                        Label("Approve \(pendingCount) pending", systemImage: "checkmark.circle")
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(busy)
                }
            }

            Section(isStaff ? "This week's entries" : "My entries") {
                if loading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if let e = errorText {
                    VStack(spacing: 8) {
                        Text(e).font(.subheadline).foregroundStyle(.secondary)
                        Button("Try again") { Task { await loadAll() } }
                    }
                } else if entries.isEmpty {
                    Text("No hours logged this week yet.")
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    ForEach(entries) { e in
                        entryRow(e)
                    }
                }
            }

            if !entries.isEmpty {
                Section {
                    HStack {
                        Text("Total approved").font(.subheadline)
                        Spacer()
                        Text(String(format: "%.2f h", entries.filter { $0.status == "approved" }.compactMap(\.hours).reduce(0, +)))
                            .font(.subheadline.weight(.bold))
                    }
                } footer: {
                    Text("Approved hours are what the payroll export on the web includes.")
                }
            }
        }
        .navigationTitle("Timesheets")
        .task { await loadAll() }
        .refreshable { await loadAll() }
        .overlay(alignment: .bottom) {
            if let t = toast {
                Text(t)
                    .font(.footnote.weight(.medium)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.black.opacity(0.85), in: Capsule())
                    .padding(.bottom, 18)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // ── Clock in / out card ──────────────────────────────────────────
    @ViewBuilder private var clockCard: some View {
        Section {
            if let o = open {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Clocked in since \(o.clockInAt.formatted(date: .omitted, time: .shortened))",
                          systemImage: "clock.fill")
                        .font(.subheadline.weight(.semibold))
                    if let h = o.hoursOpen, h >= 16 {
                        Text("Open for \(String(format: "%.0f", h)) h. Forgot to clock out?")
                            .font(.caption).foregroundStyle(.orange)
                    }
                    HStack {
                        TextField("Break min", text: $breakMinutes)
                            .keyboardType(.numberPad)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 90)
                        Button {
                            Task { await clockOut() }
                        } label: {
                            Label("Clock out", systemImage: "checkmark")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(busy)
                    }
                }
                .padding(.vertical, 4)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Label("You're clocked out", systemImage: "clock")
                        .font(.subheadline.weight(.semibold))
                    Text("Clock in when you start. Your hours land in this timesheet.")
                        .font(.caption).foregroundStyle(.secondary)
                    HStack {
                        Picker("Site", selection: $selectedBuilding) {
                            Text("No site").tag("")
                            ForEach(buildings) { b in Text(b.name).tag(b.id) }
                        }
                        .labelsHidden()
                        Spacer()
                        Button {
                            Task { await clockIn() }
                        } label: {
                            Label("Clock in", systemImage: "play.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(busy)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private func entryRow(_ e: TSEntry) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(isStaff ? (e.userName ?? "—") : e.clockInAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.subheadline.weight(.semibold))
                Text("\(e.clockInAt.formatted(date: .abbreviated, time: .shortened)) → \(e.clockOutAt?.formatted(date: .omitted, time: .shortened) ?? "…")")
                    .font(.caption).foregroundStyle(.secondary)
                if let b = e.buildingName { Text(b).font(.caption2).foregroundStyle(.secondary) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                if let h = e.hours {
                    Text(String(format: "%.2f h", h)).font(.subheadline.weight(.bold))
                }
                statusPill(e.status)
                if isStaff && e.status == "pending" {
                    Button("Approve") { Task { await approve(e.id) } }
                        .font(.caption.weight(.semibold))
                        .buttonStyle(.bordered)
                        .disabled(busy)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func statusPill(_ s: String) -> some View {
        let (label, color): (String, Color) =
            s == "approved" ? ("Approved", .green)
            : s == "pending" ? ("Pending", .orange)
            : ("On the clock", .teal)
        return Text(label)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }

    // ── Data ─────────────────────────────────────────────────────────
    private var pendingCount: Int { entries.filter { $0.status == "pending" }.count }

    private var weekDates: (from: String, to: String) {
        var cal = Calendar(identifier: .iso8601)
        cal.firstWeekday = 2
        let now = cal.date(byAdding: .weekOfYear, value: weekOffset, to: Date()) ?? Date()
        let start = cal.dateInterval(of: .weekOfYear, for: now)?.start ?? now
        let end = cal.date(byAdding: .day, value: 6, to: start) ?? now
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return (f.string(from: start), f.string(from: end))
    }

    private var weekLabel: String {
        weekOffset == 0 ? "This week" : "\(weekDates.from) → \(weekDates.to)"
    }

    private func loadAll() async {
        loading = true
        errorText = nil
        async let s: TSStatusResponse? = try? APIClient.shared.request("/time/status")
        async let b: TSBuildingsResponse? = try? APIClient.shared.request("/buildings")
        open = (await s)?.open
        buildings = (await b)?.buildings ?? []
        await loadEntries()
        loading = false
    }

    private func loadEntries() async {
        do {
            let w = weekDates
            let r: TSEntriesResponse = try await APIClient.shared.request("/time/entries?from=\(w.from)&to=\(w.to)")
            entries = r.entries.sorted { $0.clockInAt > $1.clockInAt }
            errorText = nil
        } catch {
            errorText = "Couldn't load timesheets."
        }
    }

    private func clockIn() async {
        busy = true
        defer { busy = false }
        do {
            let _: TSEntryResponse = try await APIClient.shared.request(
                "/time/clock-in", method: "POST",
                body: TSClockInBody(buildingId: selectedBuilding.isEmpty ? nil : selectedBuilding))
            await loadAll()
            showToast("Clocked in. The clock is running.")
        } catch { showToast("Could not clock in. Try again.") }
    }

    private func clockOut() async {
        busy = true
        defer { busy = false }
        do {
            let _: TSEntryResponse = try await APIClient.shared.request(
                "/time/clock-out", method: "POST",
                body: TSClockOutBody(breakMinutes: Int(breakMinutes) ?? 0))
            await loadAll()
            showToast("Clocked out. Hours are pending approval.")
        } catch { showToast("Could not clock out. Try again.") }
    }

    private func approve(_ id: String) async {
        busy = true
        defer { busy = false }
        do {
            let _: TSEntryResponse = try await APIClient.shared.request("/time/entries/\(id)/approve", method: "POST")
            await loadEntries()
            showToast("Approved.")
        } catch { showToast("Could not approve that entry.") }
    }

    private func approveAll() async {
        busy = true
        defer { busy = false }
        do {
            let w = weekDates
            let r: TSApproveAllResponse = try await APIClient.shared.request(
                "/time/approve-all", method: "POST", body: TSApproveAllBody(from: w.from, to: w.to))
            await loadEntries()
            showToast("Approved \(r.approved) entr\(r.approved == 1 ? "y" : "ies").")
        } catch { showToast("Could not approve. Try again.") }
    }

    private func showToast(_ t: String) {
        withAnimation { toast = t }
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation { toast = nil }
        }
    }
}
