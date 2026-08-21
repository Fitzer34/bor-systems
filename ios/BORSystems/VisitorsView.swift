import SwiftUI

/// The visitor day sheet on the phone: who's on site right now, who's
/// expected, who's been and gone — plus walk-in sign-in and expected
/// bookings. Same endpoints as the web (GET/POST /visitors + sign-in/out).
/// The "on site now" list is the roll-call in an evacuation, so it must
/// always be the live truth.

private struct Visitor: Decodable, Identifiable {
    let id: String
    let name: String
    let company: String?
    let host: String?
    let purpose: String?
    let badge: String?
    let expectedAt: Date?
    let signedInAt: Date?
    let signedOutAt: Date?
}
private struct VisitorsResponse: Decodable { let visitors: [Visitor] }

struct VisitorsView: View {
    @State private var visitors: [Visitor] = []
    @State private var failed = false
    @State private var loading = true
    @State private var tab = 0     // 0 on site · 1 expected · 2 history
    @State private var sheetMode: SheetMode?

    private enum SheetMode: Identifiable {
        case walkIn, expected
        var id: Int { self == .walkIn ? 0 : 1 }
    }

    private var onSite: [Visitor] { visitors.filter { $0.signedInAt != nil && $0.signedOutAt == nil } }
    private var expected: [Visitor] { visitors.filter { $0.signedInAt == nil } }
    private var history: [Visitor] { visitors.filter { $0.signedOutAt != nil } }

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if failed {
                VStack(spacing: 10) {
                    Text("Could not load the visitor sheet.").foregroundStyle(.secondary)
                    Button("Retry") { Task { await load() } }.buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 0) {
                    Picker("", selection: $tab) {
                        Text("On site (\(onSite.count))").tag(0)
                        Text("Expected (\(expected.count))").tag(1)
                        Text("History (\(history.count))").tag(2)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.vertical, 8)

                    List {
                        let rows = tab == 0 ? onSite : tab == 1 ? expected : history
                        if rows.isEmpty {
                            Text(tab == 0 ? "Nobody signed in right now."
                                 : tab == 1 ? "Nobody booked in. Use Expected to book ahead."
                                 : "No completed visits today.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                        ForEach(rows) { v in row(v) }
                    }
                    .listStyle(.plain)
                }
            }
        }
        .navigationTitle("Visitors")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button { sheetMode = .walkIn } label: { Label("Sign in walk-in", systemImage: "figure.walk") }
                    Button { sheetMode = .expected } label: { Label("Expected visitor", systemImage: "calendar.badge.plus") }
                } label: { Label("Add", systemImage: "plus") }
            }
        }
        .sheet(item: $sheetMode) { m in
            VisitorFormSheet(signInNow: m == .walkIn) { await load() }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func row(_ v: Visitor) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(v.name).font(.body.weight(.medium))
            Text([v.company, v.host.map { "hosted by \($0)" }, v.purpose,
                  v.signedInAt.map { "in " + $0.formatted(date: .omitted, time: .shortened) },
                  v.signedOutAt.map { "out " + $0.formatted(date: .omitted, time: .shortened) },
                  v.signedInAt == nil ? v.expectedAt.map { "expected " + $0.formatted(date: .omitted, time: .shortened) } : nil]
                  .compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 8) {
                if v.signedInAt == nil {
                    Button("Arrived") { Task { await act(v, "sign-in") } }
                        .buttonStyle(.borderedProminent).controlSize(.small)
                } else if v.signedOutAt == nil {
                    Button("Sign out") { Task { await act(v, "sign-out") } }
                        .buttonStyle(.bordered).controlSize(.small)
                }
            }
            .font(.caption)
        }
        .padding(.vertical, 2)
    }

    private func load() async {
        do {
            let r: VisitorsResponse = try await APIClient.shared.request("/visitors")
            visitors = r.visitors
            failed = false
        } catch { if visitors.isEmpty { failed = true } }
        loading = false
    }

    private func act(_ v: Visitor, _ action: String) async {
        struct R: Decodable { let visitor: Visitor? }
        if let _: R = try? await APIClient.shared.request("/visitors/\(v.id)/\(action)", method: "POST") {
            await load()
        }
    }
}

private struct VisitorFormSheet: View {
    let signInNow: Bool
    var onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var company = ""
    @State private var host = ""
    @State private var purpose = ""
    @State private var buildings: [Building] = []
    @State private var buildingId = ""
    @State private var expectedAt = Date().addingTimeInterval(3600)
    @State private var sending = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Who") {
                    TextField("Visitor name", text: $name)
                    TextField("Company (optional)", text: $company)
                    TextField("Host (optional)", text: $host)
                    TextField("Purpose (optional)", text: $purpose)
                }
                Section("Where") {
                    Picker("Site", selection: $buildingId) {
                        Text("Not site-specific").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }
                }
                if !signInNow {
                    Section("When") {
                        DatePicker("Expected", selection: $expectedAt)
                    }
                }
                if let e = error { Text(e).font(.caption).foregroundStyle(.red) }
            }
            .navigationTitle(signInNow ? "Sign in walk-in" : "Expected visitor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button(sending ? "Saving…" : (signInNow ? "Sign in" : "Book")) { Task { await send() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || sending)
                }
            }
            .task { buildings = (try? await APIClient.shared.buildings()) ?? [] }
        }
    }

    private func send() async {
        sending = true
        defer { sending = false }
        struct B: Encodable {
            let name: String; let company: String?; let host: String?; let purpose: String?
            let buildingId: String?; let expectedAt: String?; let signInNow: Bool
        }
        struct R: Decodable { let visitor: Visitor? }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        do {
            let _: R = try await APIClient.shared.request("/visitors", method: "POST", body: B(
                name: name.trimmingCharacters(in: .whitespaces),
                company: company.isEmpty ? nil : company,
                host: host.isEmpty ? nil : host,
                purpose: purpose.isEmpty ? nil : purpose,
                buildingId: buildingId.isEmpty ? nil : buildingId,
                expectedAt: signInNow ? nil : iso.string(from: expectedAt),
                signInNow: signInNow))
            await onDone()
            dismiss()
        } catch {
            self.error = "Couldn't save. Check your connection and try again."
        }
    }
}
