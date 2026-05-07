import SwiftUI

struct ReportsView: View {
    @State private var fromDate = Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date()
    @State private var toDate = Date()
    @State private var report: SpillsResponse?
    @State private var error: String?
    @State private var loading = false

    var body: some View {
        List {
            Section("Range") {
                DatePicker("From", selection: $fromDate, displayedComponents: .date)
                DatePicker("To", selection: $toDate, displayedComponents: .date)
                Button("Run report") { Task { await run() } }
                    .disabled(loading)
            }
            if loading { Section { ProgressView().frame(maxWidth: .infinity) } }
            if let r = report {
                Section("\(r.count) spill\(r.count == 1 ? "" : "s")") {
                    if r.spills.isEmpty {
                        Text("No spills in this range.").foregroundStyle(.secondary)
                    }
                    ForEach(r.spills) { s in
                        SpillRow(spill: s)
                    }
                }
            }
            if let err = error {
                Section { Text(err).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Reports")
        .navigationBarTitleDisplayMode(.inline)
        .task { await run() }
    }

    private func run() async {
        loading = true; error = nil
        do {
            let r = try await APIClient.shared.spillsReport(from: fromDate, to: toDate)
            self.report = r
        } catch {
            self.error = "Could not load report."
        }
        loading = false
    }
}

private struct SpillRow: View {
    let spill: Spill
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(spill.openedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption).foregroundStyle(.secondary)
            let location = [spill.buildingName, spill.floorName, spill.zoneName]
                .compactMap { $0 }.joined(separator: " / ")
            Text(location.isEmpty ? "—" : location).font(.body.weight(.medium))
            HStack(spacing: 14) {
                metric("Response", seconds: spill.responseSeconds)
                metric("Resolution", seconds: spill.resolutionSeconds)
                if let r = spill.closureReason {
                    Text(r.replacingOccurrences(of: "_", with: " "))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func metric(_ label: String, seconds: Double?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(format(seconds)).font(.caption.monospacedDigit())
        }
    }

    private func format(_ s: Double?) -> String {
        guard let s = s, s > 0 else { return "—" }
        if s < 60 { return "\(Int(s))s" }
        let m = Int(s / 60)
        let sec = Int(s.truncatingRemainder(dividingBy: 60))
        if m < 60 { return "\(m)m \(sec)s" }
        let h = m / 60
        return "\(h)h \(m % 60)m"
    }
}
