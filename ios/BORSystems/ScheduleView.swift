import SwiftUI

struct ScheduleView: View {
    @State private var shifts: [Shift] = []
    @State private var error: String?
    @State private var showCreate = false

    var body: some View {
        List {
            if shifts.isEmpty {
                Text("No shifts scheduled.").foregroundStyle(.secondary)
            }
            ForEach(shifts) { s in
                ShiftRow(shift: s)
                    .swipeActions {
                        Button("Delete", role: .destructive) { Task { await delete(s) } }
                    }
            }
            if let err = error {
                Section { Text(err).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Schedule")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showCreate) { CreateShiftSheet { Task { await refresh() } } }
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func refresh() async {
        do { shifts = try await APIClient.shared.shifts() }
        catch { self.error = "Could not load shifts." }
    }
    private func delete(_ s: Shift) async {
        do { try await APIClient.shared.deleteShift(s.id); await refresh() }
        catch { self.error = "Failed." }
    }
}

private struct ShiftRow: View {
    let shift: Shift
    var body: some View {
        let now = Date()
        let isNow = shift.startsAt <= now && shift.endsAt > now
        let isPast = shift.endsAt <= now
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(shift.userName ?? "Deleted user").font(.body.weight(.medium))
                if isNow {
                    Text("on now")
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.green.opacity(0.18), in: Capsule())
                        .foregroundStyle(.green)
                }
                Spacer()
            }
            Text("\(shift.startsAt.formatted(date: .abbreviated, time: .shortened)) – \(shift.endsAt.formatted(date: .abbreviated, time: .shortened))")
                .font(.caption).foregroundStyle(.secondary)
            let where_ = [shift.buildingName, shift.floorName, shift.zoneName].compactMap { $0 }.joined(separator: " / ")
            Text(where_.isEmpty ? "Whole site" : where_).font(.caption).foregroundStyle(.secondary)
            if let n = shift.notes, !n.isEmpty {
                Text(n).font(.caption).italic()
            }
        }
        .opacity(isPast ? 0.5 : 1)
    }
}

private struct CreateShiftSheet: View {
    let onCreated: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var cleaners: [UserRow] = []
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []

    @State private var userId = ""
    @State private var startsAt: Date = {
        let cal = Calendar.current
        let next = cal.date(bySetting: .minute, value: 0, of: Date().addingTimeInterval(60 * 60)) ?? Date()
        return next
    }()
    @State private var endsAt: Date = Date().addingTimeInterval(8 * 60 * 60)
    @State private var buildingId = ""
    @State private var floorId = ""
    @State private var zoneId = ""
    @State private var notes = ""
    @State private var error: String?
    @State private var creating = false

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
                        Task { await create() }
                    } label: {
                        HStack {
                            if creating { ProgressView() }
                            Text("Add shift").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!canCreate)
                }
            }
            .navigationTitle("New shift")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } } }
            .task {
                async let users = APIClient.shared.users()
                async let buildings = APIClient.shared.buildings()
                self.cleaners = ((try? await users) ?? []).filter { $0.role == .cleaner && $0.deactivatedAt == nil }
                self.buildings = (try? await buildings) ?? []
            }
        }
    }

    private var canCreate: Bool {
        !userId.isEmpty && endsAt > startsAt && !creating
    }

    private func create() async {
        creating = true; error = nil
        do {
            try await APIClient.shared.createShift(
                userId: userId, startsAt: startsAt, endsAt: endsAt,
                buildingId: buildingId.isEmpty ? nil : buildingId,
                floorId: floorId.isEmpty ? nil : floorId,
                zoneId: zoneId.isEmpty ? nil : zoneId,
                notes: notes.isEmpty ? nil : notes,
            )
            onCreated()
            dismiss()
        } catch {
            self.error = "Could not create."
        }
        creating = false
    }
}
