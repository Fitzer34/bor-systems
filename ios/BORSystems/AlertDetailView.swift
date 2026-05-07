import SwiftUI

struct AlertDetailView: View {
    let alert: ActiveAlert
    let onChange: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var isWorking = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("\(alert.floorName ?? "Unknown floor") — \(alert.zoneName ?? "Unassigned")")
                    .font(.title3.weight(.semibold))
                Text("Opened \(alert.openedAt, style: .relative) ago · Status: \(alert.status.rawValue)")
                    .foregroundStyle(.secondary)

                if alert.status == .open {
                    Button {
                        Task { await acknowledge() }
                    } label: {
                        Text("I'm on it")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .background(Color.blue, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.white)
                    .disabled(isWorking)
                }

                Text("Optional note (logged with closure)")
                    .font(.caption).foregroundStyle(.secondary)
                TextEditor(text: $note)
                    .frame(minHeight: 80)
                    .padding(8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))

                HStack(spacing: 12) {
                    closeButton(title: "Sign damaged", color: .orange, reason: .signDamaged)
                    closeButton(title: "Sign missing", color: .red,    reason: .signMissing)
                }

                Button {
                    Task { await close(reason: .manual) }
                } label: {
                    Text("Manually close")
                        .font(.footnote)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .foregroundStyle(.secondary)

                if let error = error {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }

                Text("The alert auto-closes when the sign is physically replaced on the hanger.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Alert")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func closeButton(title: String, color: Color, reason: CloseReason) -> some View {
        Button {
            Task { await close(reason: reason) }
        } label: {
            Text(title)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
        .foregroundStyle(color)
        .disabled(isWorking)
    }

    private func acknowledge() async {
        guard !isWorking else { return }
        isWorking = true; error = nil
        do {
            try await APIClient.shared.acknowledgeAlert(alert.id)
            await onChange()
        } catch {
            self.error = "Could not acknowledge — already acknowledged or closed."
        }
        isWorking = false
    }

    private func close(reason: CloseReason) async {
        guard !isWorking else { return }
        isWorking = true; error = nil
        do {
            try await APIClient.shared.closeAlert(alert.id, reason: reason, note: note.isEmpty ? nil : note)
            await onChange()
            dismiss()
        } catch {
            self.error = "Could not close alert."
        }
        isWorking = false
    }
}
