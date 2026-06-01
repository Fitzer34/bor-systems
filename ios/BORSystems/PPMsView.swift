import SwiftUI

// MARK: - List

/// Planned Preventive Maintenance — recurring contractor jobs with reminders.
/// Mirrors the web PPMs page. Admin + supervisor only (gated in MenuView and
/// by the backend).
struct PPMsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var ppms: [PPM] = []
    @State private var error: String?
    @State private var loaded = false
    @State private var showCreate = false

    private var canEdit: Bool { auth.user?.role == .admin || auth.user?.role == .supervisor }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if loaded && ppms.isEmpty {
                Text("No maintenance tasks yet. Tap + to add one.")
                    .foregroundStyle(.secondary)
            }
            ForEach(ppms) { p in
                NavigationLink {
                    PPMEditView(ppm: p, onChange: { Task { await refresh() } })
                } label: {
                    PPMRow(ppm: p)
                }
                .swipeActions {
                    Button("Done") { Task { await complete(p) } }.tint(.green)
                }
            }
        }
        .navigationTitle("PPMs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                }
            }
        }
        .refreshable { await refresh() }
        .task { await refresh() }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                PPMEditView(ppm: nil, onChange: { Task { await refresh() } })
            }
            .environmentObject(auth)
        }
    }

    private func refresh() async {
        do {
            ppms = try await APIClient.shared.ppms()
            error = nil
        } catch {
            self.error = "Could not load PPMs."
        }
        loaded = true
    }

    private func complete(_ p: PPM) async {
        do { try await APIClient.shared.completePPM(p.id); await refresh() }
        catch { self.error = "Could not mark done." }
    }
}

// MARK: - Row

private struct PPMRow: View {
    let ppm: PPM

    var body: some View {
        let s = ppmStatus(ppm)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(ppm.title).font(.body.weight(.medium))
                Spacer()
                Text(s.label).font(.caption.weight(.medium)).foregroundStyle(s.color)
            }
            HStack(spacing: 6) {
                Text(freqLabel(ppm.frequencyPerYear))
                if let c = ppm.contractorName, !c.isEmpty { Text("· \(c)") }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Create / edit

struct PPMEditView: View {
    let ppm: PPM?
    let onChange: () -> Void

    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var notes: String
    @State private var contractorName: String
    @State private var contactPhone: String
    @State private var contactEmail: String
    @State private var frequencyPerYear: Int
    @State private var dueDate: Date
    @State private var reminderLeadDays: Int
    @State private var active: Bool
    @State private var saving = false
    @State private var error: String?
    @State private var confirmingDelete = false

    private var isEdit: Bool { ppm != nil }
    private let freqOptions = [1, 2, 3, 4, 6, 12]

    init(ppm: PPM?, onChange: @escaping () -> Void) {
        self.ppm = ppm
        self.onChange = onChange
        _title = State(initialValue: ppm?.title ?? "")
        _notes = State(initialValue: ppm?.notes ?? "")
        _contractorName = State(initialValue: ppm?.contractorName ?? "")
        _contactPhone = State(initialValue: ppm?.contactPhone ?? "")
        _contactEmail = State(initialValue: ppm?.contactEmail ?? "")
        _frequencyPerYear = State(initialValue: ppm?.frequencyPerYear ?? 1)
        _dueDate = State(initialValue: ppm.flatMap { parseDateOnly($0.nextDueDate) }
            ?? Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date())
        _reminderLeadDays = State(initialValue: ppm?.reminderLeadDays ?? 14)
        _active = State(initialValue: ppm?.active ?? true)
    }

    var body: some View {
        Form {
            Section("What needs doing") {
                TextField("Task title", text: $title)
                TextField("Notes (optional)", text: $notes, axis: .vertical)
            }
            Section("Contractor") {
                TextField("Company name", text: $contractorName)
                TextField("Phone", text: $contactPhone).keyboardType(.phonePad)
                TextField("Email", text: $contactEmail)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            Section("Schedule") {
                Picker("How often", selection: $frequencyPerYear) {
                    ForEach(freqOptions, id: \.self) { Text(freqLabel($0)).tag($0) }
                }
                DatePicker("Next due", selection: $dueDate, displayedComponents: .date)
                Stepper("Remind \(reminderLeadDays) days before", value: $reminderLeadDays, in: 0...365)
                if isEdit {
                    Toggle("Active (off = pause reminders)", isOn: $active)
                }
            }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if isEdit {
                Section {
                    Button("Mark done now") { Task { await markDone() } }
                    Button("Delete PPM", role: .destructive) { confirmingDelete = true }
                }
            }
        }
        .navigationTitle(isEdit ? "Edit PPM" : "Add PPM")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await save() } } label: {
                    if saving { ProgressView() } else { Text(isEdit ? "Save" : "Add").bold() }
                }
                .disabled(saving || title.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if !isEdit {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .alert("Delete this PPM?", isPresented: $confirmingDelete) {
            Button("Delete", role: .destructive) { Task { await deletePPM() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func makeBody() -> APIClient.PPMBody {
        func clean(_ s: String) -> String? {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        return APIClient.PPMBody(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            notes: clean(notes),
            contractorName: clean(contractorName),
            contactPhone: clean(contactPhone),
            contactEmail: clean(contactEmail),
            frequencyPerYear: frequencyPerYear,
            nextDueDate: formatDateOnly(dueDate),
            reminderLeadDays: reminderLeadDays,
            active: active
        )
    }

    private func save() async {
        saving = true
        defer { saving = false }
        error = nil
        do {
            if let ppm {
                try await APIClient.shared.updatePPM(ppm.id, makeBody())
            } else {
                try await APIClient.shared.createPPM(makeBody())
            }
            onChange()
            dismiss()
        } catch APIError.http(_, let body) {
            error = body.lowercased().contains("email") ? "Check the contractor email address." : "Could not save — try again."
        } catch {
            self.error = "Could not save — try again."
        }
    }

    private func markDone() async {
        guard let ppm else { return }
        do { try await APIClient.shared.completePPM(ppm.id); onChange(); dismiss() }
        catch { self.error = "Could not mark done." }
    }

    private func deletePPM() async {
        guard let ppm else { return }
        do { try await APIClient.shared.deletePPM(ppm.id); onChange(); dismiss() }
        catch { self.error = "Could not delete." }
    }
}

// MARK: - Helpers

private func ppmStatus(_ p: PPM) -> (label: String, color: Color) {
    if !p.active { return ("Paused", .secondary) }
    let due = parseDateOnly(p.nextDueDate)
    let cal = Calendar.current
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: due)).day ?? 0
    if days < 0 { return ("Overdue \(-days)d", .red) }
    if days == 0 { return ("Due today", .orange) }
    if days <= p.reminderLeadDays { return ("Due in \(days)d", .orange) }
    return ("Due \(displayDate(p.nextDueDate))", .green)
}

private func freqLabel(_ n: Int) -> String {
    switch n {
    case 1: return "Annually"
    case 2: return "Twice a year"
    case 3: return "3× a year"
    case 4: return "Quarterly"
    case 6: return "Every 2 months"
    case 12: return "Monthly"
    default: return "\(n)× a year"
    }
}

private let dateOnlyFormatter: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

private func parseDateOnly(_ s: String) -> Date {
    dateOnlyFormatter.date(from: s) ?? Date()
}

private func formatDateOnly(_ d: Date) -> String {
    dateOnlyFormatter.string(from: d)
}

private func displayDate(_ s: String) -> String {
    guard let d = dateOnlyFormatter.date(from: s) else { return s }
    let out = DateFormatter()
    out.dateStyle = .medium
    return out.string(from: d)
}
