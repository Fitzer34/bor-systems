import SwiftUI

struct SettingsView: View {
    @State private var settings: AppSettings?
    @State private var ack = ""
    @State private var resolution = ""
    @State private var lowBattery = ""
    @State private var cleaning = ""
    @State private var audibleAlarm = false
    @State private var savedKey: String?
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                NumberSettingRow(label: "Acknowledgement timer", suffix: "minutes",
                                 value: $ack, valid: 1...120,
                                 isDirty: settings.map { Int(ack) != $0.ackMinutes } ?? false,
                                 saved: savedKey == "ack",
                                 save: save(.ack))
            } footer: {
                Text("If no cleaner taps 'I'm on it' within this many minutes, the alert escalates to all on-duty supervisors via push, SMS, and email.")
            }

            Section {
                NumberSettingRow(label: "Resolution timer", suffix: "minutes",
                                 value: $resolution, valid: 1...720,
                                 isDirty: settings.map { Int(resolution) != $0.resolutionMinutes } ?? false,
                                 saved: savedKey == "res",
                                 save: save(.resolution))
            } footer: {
                Text("If the sign isn't physically replaced on the hanger within this many minutes, the alert is rebroadcast to all on-duty cleaners and (if not already) escalated to supervisors.")
            }

            Section {
                NumberSettingRow(label: "Expected cleaning time", suffix: "minutes",
                                 value: $cleaning, valid: 1...240,
                                 isDirty: settings.map { Int(cleaning) != $0.expectedCleaningMinutes } ?? false,
                                 saved: savedKey == "clean",
                                 save: save(.cleaning))
            } footer: {
                Text("After 'I'm on it', a reminder push is sent to the cleaner after this many minutes asking them to put the sign back on the hanger.")
            }

            Section {
                NumberSettingRow(label: "Low-battery threshold", suffix: "%",
                                 value: $lowBattery, valid: 1...99,
                                 isDirty: settings.map { Int(lowBattery) != $0.lowBatteryThreshold } ?? false,
                                 saved: savedKey == "battery",
                                 save: save(.lowBattery))
            } footer: {
                Text("When a hanger's battery drops to this percentage, admins and supervisors get a 'Hanger battery low' notification.")
            }

            Section {
                Toggle("Default audible alarm on new hangers", isOn: $audibleAlarm)
                if let s = settings, s.defaultAudibleAlarm != audibleAlarm {
                    Button("Save") { Task { await save(.audible)() } }
                }
                if savedKey == "audible" { Text("Saved").foregroundStyle(.green) }
            } footer: {
                Text("Whether the optional buzzer is enabled by default when a new hanger is registered. Existing hangers are unaffected.")
            }

            if let error = error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    enum SaveKind { case ack, resolution, cleaning, lowBattery, audible }

    private func save(_ kind: SaveKind) -> () async -> Void {
        return {
            do {
                switch kind {
                case .ack:        try await APIClient.shared.setAckTimer(minutes: Int(ack) ?? 5)
                case .resolution: try await APIClient.shared.setResolutionTimer(minutes: Int(resolution) ?? 15)
                case .cleaning:   try await APIClient.shared.setExpectedCleaningTime(minutes: Int(cleaning) ?? 10)
                case .lowBattery: try await APIClient.shared.setLowBatteryThreshold(pct: Int(lowBattery) ?? 20)
                case .audible:    try await APIClient.shared.setDefaultAudibleAlarm(enabled: audibleAlarm)
                }
                savedKey = String(describing: kind).replacingOccurrences(of: "lowBattery", with: "battery")
                await load()
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                if savedKey != nil { savedKey = nil }
            } catch {
                self.error = "Could not save."
            }
        }
    }

    private func load() async {
        do {
            let s = try await APIClient.shared.appSettings()
            settings = s
            if ack.isEmpty        { ack = String(s.ackMinutes) }
            if resolution.isEmpty { resolution = String(s.resolutionMinutes) }
            if cleaning.isEmpty   { cleaning = String(s.expectedCleaningMinutes) }
            if lowBattery.isEmpty { lowBattery = String(s.lowBatteryThreshold) }
            audibleAlarm = s.defaultAudibleAlarm
        } catch {
            self.error = "Could not load settings."
        }
    }
}

private struct NumberSettingRow: View {
    let label: String
    let suffix: String
    @Binding var value: String
    let valid: ClosedRange<Int>
    let isDirty: Bool
    let saved: Bool
    let save: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline)
            HStack {
                TextField("", text: $value)
                    .keyboardType(.numberPad)
                    .frame(width: 80)
                    .textFieldStyle(.roundedBorder)
                Text(suffix).foregroundStyle(.secondary)
                Spacer()
                if isValidInt && isDirty {
                    Button("Save") { Task { await save() } }
                }
                if saved { Text("Saved").foregroundStyle(.green).font(.caption) }
            }
        }
    }

    private var isValidInt: Bool {
        guard let n = Int(value) else { return false }
        return valid.contains(n)
    }
}
