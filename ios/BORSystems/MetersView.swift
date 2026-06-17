import SwiftUI

// MARK: - List

/// Predictive maintenance — usage meters (admin + supervisor). Field staff log
/// readings here at the asset; the server flags each meter due by actual usage.
/// Mirrors the web Meters page (creating meters stays on the web for now).
struct MetersView: View {
    @State private var meters: [Meter] = []
    @State private var error: String?
    @State private var loaded = false
    @State private var reading: Meter?

    private func rank(_ s: String) -> Int {
        switch s { case "due": return 0; case "due_soon": return 1; case "ok": return 2; default: return 3 }
    }
    private var sorted: [Meter] { meters.sorted { rank($0.status) < rank($1.status) } }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if loaded && meters.isEmpty {
                Text("No meters yet. Add them on the web dashboard, then log readings here.")
                    .foregroundStyle(.secondary)
            }
            ForEach(sorted) { m in
                Button { reading = m } label: { MeterRow(meter: m) }
                    .buttonStyle(.plain)
            }
        }
        .navigationTitle("Meters")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task { await refresh() }
        .sheet(item: $reading) { m in
            MeterReadingSheet(meter: m, onDone: { Task { await refresh() } })
        }
    }

    private func refresh() async {
        do { meters = try await APIClient.shared.meters(); error = nil }
        catch { self.error = "Could not load meters." }
        loaded = true
    }
}

// MARK: - Row

private struct MeterRow: View {
    let meter: Meter
    var body: some View {
        let s = meterStatusStyle(meter.status)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(meter.assetName ?? meter.name).font(.body.weight(.medium)).lineLimit(1)
                Spacer()
                Text(s.label).font(.caption.weight(.medium)).foregroundStyle(s.color)
            }
            HStack {
                Text(meter.name).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text("\(meter.currentValue)\(unitSuffix)").font(.callout.weight(.semibold))
            }
            if let interval = meter.intervalValue, interval > 0 {
                ProgressView(value: Double(min(100, max(0, meter.pct ?? 0))), total: 100).tint(s.color)
                if let rem = meter.remaining {
                    Text(rem > 0 ? "\(rem)\(unitSuffix) to next service" : "Overdue by \(-rem)\(unitSuffix)")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
    private var unitSuffix: String { meter.unit.map { " \($0)" } ?? "" }
}

func meterStatusStyle(_ s: String) -> (label: String, color: Color) {
    switch s {
    case "due": return ("Service due", .red)
    case "due_soon": return ("Due soon", .orange)
    case "ok": return ("OK", .green)
    default: return ("Tracking", .secondary)
    }
}

// MARK: - Log-reading sheet

private struct MeterReadingSheet: View {
    let meter: Meter
    let onDone: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var value: String
    @State private var note: String = ""
    @State private var busy = false
    @State private var error: String?

    init(meter: Meter, onDone: @escaping () -> Void) {
        self.meter = meter
        self.onDone = onDone
        _value = State(initialValue: String(meter.currentValue))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(meter.assetName ?? "Meter") {
                    LabeledContent("Meter", value: meter.name)
                    if let u = meter.unit { LabeledContent("Unit", value: u) }
                }
                Section("New reading") {
                    TextField("Value", text: $value).keyboardType(.numberPad)
                    TextField("Note (optional)", text: $note)
                }
                if let error { Text(error).foregroundStyle(.red) }
                Section {
                    Button { Task { await save() } } label: {
                        if busy { ProgressView() } else { Text("Save reading") }
                    }
                    .disabled(busy || Int(value) == nil)
                    Button("Mark serviced") { Task { await service() } }.disabled(busy)
                }
            }
            .navigationTitle("Log reading")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func save() async {
        guard let v = Int(value) else { return }
        busy = true; defer { busy = false }
        do {
            try await APIClient.shared.logMeterReading(meter.id, value: v, note: note.isEmpty ? nil : note)
            onDone(); dismiss()
        } catch { self.error = "Could not save the reading." }
    }

    private func service() async {
        busy = true; defer { busy = false }
        do {
            try await APIClient.shared.serviceMeter(meter.id)
            onDone(); dismiss()
        } catch { self.error = "Could not mark serviced." }
    }
}
