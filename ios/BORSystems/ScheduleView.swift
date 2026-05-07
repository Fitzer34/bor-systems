import SwiftUI

struct ScheduleView: View {
    @State private var shifts: [Shift] = []
    @State private var error: String?
    @State private var showCreate = false
    @State private var editingShift: Shift?
    @State private var filter: Filter = .upcoming

    enum Filter: String, CaseIterable, Identifiable {
        case past = "Past", current = "Now", upcoming = "Upcoming", all = "All"
        var id: String { rawValue }
    }

    var body: some View {
        let groups = grouped(shifts: filteredShifts)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("Filter", selection: $filter) {
                    ForEach(Filter.allCases) { f in Text(f.rawValue).tag(f) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16).padding(.top, 12)

                if let err = error {
                    Text(err).foregroundStyle(.red).padding(.horizontal, 16)
                }

                if groups.isEmpty {
                    EmptyScheduleHint().padding(.top, 60)
                }

                ForEach(groups, id: \.title) { group in
                    daySection(group)
                }
                Spacer().frame(height: 40)
            }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Schedule")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showCreate) {
            ShiftEditorSheet(existing: nil) { Task { await refresh() } }
        }
        .sheet(item: $editingShift) { shift in
            ShiftEditorSheet(existing: shift) { Task { await refresh() } }
        }
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private var filteredShifts: [Shift] {
        let now = Date()
        switch filter {
        case .past:     return shifts.filter { $0.endsAt <= now }
        case .current:  return shifts.filter { $0.startsAt <= now && $0.endsAt > now }
        case .upcoming: return shifts.filter { $0.startsAt > now }
        case .all:      return shifts
        }
    }

    private struct DayGroup {
        let title: String
        let date: Date
        let shifts: [Shift]
    }

    private func grouped(shifts: [Shift]) -> [DayGroup] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, d MMMM"
        let dayKey: (Date) -> Date = { cal.startOfDay(for: $0) }
        let dict = Dictionary(grouping: shifts) { dayKey($0.startsAt) }
        return dict.keys.sorted().map { day in
            let title: String = {
                if cal.isDate(day, inSameDayAs: today) { return "Today" }
                if let tomorrow = cal.date(byAdding: .day, value: 1, to: today),
                   cal.isDate(day, inSameDayAs: tomorrow) { return "Tomorrow" }
                if let yesterday = cal.date(byAdding: .day, value: -1, to: today),
                   cal.isDate(day, inSameDayAs: yesterday) { return "Yesterday" }
                return formatter.string(from: day)
            }()
            return DayGroup(title: title, date: day, shifts: dict[day]!.sorted { $0.startsAt < $1.startsAt })
        }
    }

    @ViewBuilder
    private func daySection(_ group: DayGroup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(group.title).font(.headline)
                Spacer()
                Text(group.shifts.count == 1 ? "1 shift" : "\(group.shifts.count) shifts")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)

            VStack(spacing: 0) {
                ForEach(group.shifts) { s in
                    Button { editingShift = s } label: { ShiftCard(shift: s) }
                        .buttonStyle(.plain)
                    if s.id != group.shifts.last?.id { Divider().padding(.leading, 16) }
                }
            }
            .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
        }
    }

    private func refresh() async {
        do { shifts = try await APIClient.shared.shifts() }
        catch { self.error = "Could not load shifts." }
    }
}

private struct ShiftCard: View {
    let shift: Shift

    var body: some View {
        let now = Date()
        let isNow = shift.startsAt <= now && shift.endsAt > now
        let isPast = shift.endsAt <= now
        let coverage: String = {
            let parts = [shift.buildingName, shift.floorName, shift.zoneName].compactMap { $0 }
            return parts.isEmpty ? "Whole site" : parts.joined(separator: " / ")
        }()
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 2) {
                Text(shift.startsAt.formatted(date: .omitted, time: .shortened))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                Text("–").font(.caption2).foregroundStyle(.secondary)
                Text(shift.endsAt.formatted(date: .omitted, time: .shortened))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
            }
            .frame(width: 64)

            Rectangle()
                .fill(isNow ? Color.green : (isPast ? Color.gray.opacity(0.4) : Color.blue))
                .frame(width: 3)
                .clipShape(Capsule())

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(shift.userName ?? "Deleted user")
                        .font(.body.weight(.medium))
                    if isNow {
                        Text("ON NOW")
                            .font(.caption2.weight(.heavy))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(.green, in: Capsule())
                            .foregroundStyle(.white)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                }
                Label(coverage, systemImage: "mappin.and.ellipse")
                    .font(.caption).foregroundStyle(.secondary)
                if let n = shift.notes, !n.isEmpty {
                    Text(n).font(.caption).italic().foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .opacity(isPast ? 0.65 : 1)
    }
}

/// Reuse for both create and edit. `existing == nil` → create.
struct ShiftEditorSheet: View {
    let existing: Shift?
    let onChange: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var cleaners: [UserRow] = []
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []

    @State private var userId = ""
    @State private var startsAt: Date = Date()
    @State private var endsAt: Date = Date().addingTimeInterval(8 * 60 * 60)
    @State private var buildingId = ""
    @State private var floorId = ""
    @State private var zoneId = ""
    @State private var notes = ""
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Cleaner") {
                    Picker("Cleaner", selection: $userId) {
                        Text("— pick a cleaner —").tag("")
                        ForEach(cleaners) { c in Text(c.name).tag(c.id) }
                    }
                }
                Section("When") {
                    DatePicker("Starts", selection: $startsAt)
                    DatePicker("Ends", selection: $endsAt)
                }
                Section("Coverage (optional)") {
                    Picker("Building", selection: $buildingId) {
                        Text("— whole site —").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }.onChange(of: buildingId) { newValue in
                        floorId = ""; zoneId = ""; floors = []; zones = []
                        if !newValue.isEmpty {
                            Task { floors = (try? await APIClient.shared.floors(buildingId: newValue).sorted { $0.orderIndex < $1.orderIndex }) ?? [] }
                        }
                    }
                    Picker("Floor", selection: $floorId) {
                        Text("— whole building —").tag("")
                        ForEach(floors) { f in Text(f.name).tag(f.id) }
                    }
                    .disabled(buildingId.isEmpty)
                    .onChange(of: floorId) { newValue in
                        zoneId = ""; zones = []
                        if !newValue.isEmpty {
                            Task { zones = (try? await APIClient.shared.zones(floorId: newValue)) ?? [] }
                        }
                    }
                    Picker("Zone", selection: $zoneId) {
                        Text("— whole floor —").tag("")
                        ForEach(zones) { z in Text(z.name).tag(z.id) }
                    }
                    .disabled(floorId.isEmpty)
                }
                Section("Notes") {
                    TextField("e.g. focus on toilets", text: $notes)
                }
                if let err = error {
                    Section { Text(err).foregroundStyle(.red) }
                }
                Section {
                    Button {
                        Task { await save() }
                    } label: {
                        HStack {
                            if working { ProgressView() }
                            Text(existing == nil ? "Add shift" : "Save changes").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!canSave)
                }
                if existing != nil {
                    Section {
                        Button("Delete shift", role: .destructive) {
                            Task { await delete() }
                        }
                    }
                }
            }
            .navigationTitle(existing == nil ? "New shift" : "Edit shift")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } } }
            .task { await loadInitial() }
        }
    }

    private var canSave: Bool { !userId.isEmpty && endsAt > startsAt && !working }

    private func loadInitial() async {
        async let users = APIClient.shared.users()
        async let buildings = APIClient.shared.buildings()
        cleaners = ((try? await users) ?? []).filter { $0.role == .cleaner && $0.deactivatedAt == nil }
        self.buildings = (try? await buildings) ?? []

        if let s = existing {
            userId = s.userId
            startsAt = s.startsAt
            endsAt = s.endsAt
            buildingId = s.buildingId ?? ""
            floorId = s.floorId ?? ""
            zoneId = s.zoneId ?? ""
            notes = s.notes ?? ""
            if !buildingId.isEmpty {
                floors = (try? await APIClient.shared.floors(buildingId: buildingId).sorted { $0.orderIndex < $1.orderIndex }) ?? []
            }
            if !floorId.isEmpty {
                zones = (try? await APIClient.shared.zones(floorId: floorId)) ?? []
            }
        } else {
            let cal = Calendar.current
            let next = cal.nextDate(after: Date(), matching: DateComponents(minute: 0), matchingPolicy: .nextTime) ?? Date()
            startsAt = next
            endsAt = next.addingTimeInterval(8 * 60 * 60)
        }
    }

    private func save() async {
        working = true; error = nil
        do {
            if let s = existing {
                try await APIClient.shared.updateShift(
                    s.id,
                    userId: userId,
                    startsAt: startsAt, endsAt: endsAt,
                    buildingId: buildingId.isEmpty ? nil : buildingId,
                    floorId: floorId.isEmpty ? nil : floorId,
                    zoneId: zoneId.isEmpty ? nil : zoneId,
                    notes: notes.isEmpty ? nil : notes,
                )
            } else {
                try await APIClient.shared.createShift(
                    userId: userId, startsAt: startsAt, endsAt: endsAt,
                    buildingId: buildingId.isEmpty ? nil : buildingId,
                    floorId: floorId.isEmpty ? nil : floorId,
                    zoneId: zoneId.isEmpty ? nil : zoneId,
                    notes: notes.isEmpty ? nil : notes,
                )
            }
            onChange()
            dismiss()
        } catch {
            self.error = "Could not save."
        }
        working = false
    }

    private func delete() async {
        guard let s = existing else { return }
        working = true; error = nil
        do {
            try await APIClient.shared.deleteShift(s.id)
            onChange()
            dismiss()
        } catch {
            self.error = "Could not delete."
        }
        working = false
    }
}

private struct EmptyScheduleHint: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "calendar")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(.secondary)
            Text("No shifts to show").font(.headline)
            Text("Tap + to create one.").font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
