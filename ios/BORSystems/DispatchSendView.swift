import SwiftUI

struct DispatchSendView: View {
    @State private var cleaners: [UserRow] = []
    @State private var buildings: [Building] = []
    @State private var floors: [Floor] = []
    @State private var zones: [Zone] = []

    @State private var recipientId: String = ""
    @State private var buildingId: String = ""
    @State private var floorId: String = ""
    @State private var zoneId: String = ""
    @State private var message: String = ""
    @State private var alsoSms: Bool = false

    @State private var error: String?
    @State private var sentBanner: String?
    @State private var sending = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Cleaner") {
                    Picker("Cleaner", selection: $recipientId) {
                        Text("— pick a cleaner —").tag("")
                        ForEach(cleaners) { c in
                            Text(c.onDuty ? "\(c.name) (on duty)" : c.name).tag(c.id)
                        }
                    }
                }
                Section("Where (optional)") {
                    Picker("Building", selection: $buildingId) {
                        Text("—").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }
                    .onChange(of: buildingId) { newValue in
                        floorId = ""; zoneId = ""; floors = []; zones = []
                        if !newValue.isEmpty { Task { await loadFloors(newValue) } }
                    }

                    Picker("Floor", selection: $floorId) {
                        Text("—").tag("")
                        ForEach(floors) { f in Text(f.name).tag(f.id) }
                    }
                    .disabled(buildingId.isEmpty)
                    .onChange(of: floorId) { newValue in
                        zoneId = ""; zones = []
                        if !newValue.isEmpty { Task { await loadZones(newValue) } }
                    }

                    Picker("Zone", selection: $zoneId) {
                        Text("—").tag("")
                        ForEach(zones) { z in Text(z.name).tag(z.id) }
                    }
                    .disabled(floorId.isEmpty)
                }
                Section("Message") {
                    TextEditor(text: $message)
                        .frame(minHeight: 100)
                }
                Section {
                    Toggle("Also send SMS", isOn: $alsoSms)
                }
                Section {
                    Button {
                        Task { await send() }
                    } label: {
                        HStack {
                            if sending { ProgressView() }
                            Text("Send dispatch").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!canSend)
                }
                if let banner = sentBanner {
                    Section { Text(banner).foregroundStyle(.green) }
                }
                if let error = error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Dispatch")
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadInitial() }
        }
    }

    private var canSend: Bool {
        !recipientId.isEmpty && !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sending
    }

    private func loadInitial() async {
        async let usersResult = APIClient.shared.users()
        async let buildingsResult = APIClient.shared.buildings()
        do {
            cleaners = try await usersResult.filter { $0.role == .cleaner && $0.deactivatedAt == nil }
            buildings = try await buildingsResult
        } catch {
            self.error = "Could not load cleaners."
        }
    }

    private func loadFloors(_ buildingId: String) async {
        do { floors = try await APIClient.shared.floors(buildingId: buildingId).sorted { $0.orderIndex < $1.orderIndex } }
        catch { self.error = "Could not load floors." }
    }
    private func loadZones(_ floorId: String) async {
        do { zones = try await APIClient.shared.zones(floorId: floorId) }
        catch { self.error = "Could not load zones." }
    }

    private func send() async {
        guard canSend else { return }
        sending = true; error = nil; sentBanner = nil
        do {
            try await APIClient.shared.sendDispatch(
                to: recipientId,
                zoneId: zoneId.isEmpty ? nil : zoneId,
                message: message,
                alsoSms: alsoSms,
            )
            let recipient = cleaners.first(where: { $0.id == recipientId })?.name ?? "cleaner"
            sentBanner = "Sent to \(recipient)."
            message = ""
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            sentBanner = nil
        } catch {
            self.error = "Could not send dispatch."
        }
        sending = false
    }
}
