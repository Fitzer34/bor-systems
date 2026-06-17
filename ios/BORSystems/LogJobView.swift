import SwiftUI

/// Log a maintenance work order from the phone: describe the problem in plain
/// words, let Claude structure it into a job (title / details / priority),
/// review, and submit. Mirrors the web "Log a job" + AI helpers. Voice
/// dictation layers onto the "Describe the problem" field next.
struct LogJobView: View {
    let onLogged: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var raw = ""            // freeform "what's wrong"
    @State private var title = ""
    @State private var detail = ""
    @State private var priority = "routine"

    @State private var aiConfigured = false
    @State private var structuring = false
    @State private var creating = false
    @State private var error: String?
    @State private var clarify: String?

    private let priorities = ["routine", "urgent", "emergency"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Describe the problem") {
                    TextField("e.g. AC not cooling in the server room, getting hot", text: $raw, axis: .vertical)
                        .lineLimit(2...5)
                    if aiConfigured {
                        Button {
                            Task { await structure() }
                        } label: {
                            Label(structuring ? "Structuring…" : "Structure with AI", systemImage: "sparkles")
                        }
                        .disabled(raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || structuring)
                    }
                    if let clarify, !clarify.isEmpty {
                        Label(clarify, systemImage: "questionmark.circle")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }

                Section("Work order") {
                    TextField("Title", text: $title)
                    TextField("Details (optional)", text: $detail, axis: .vertical)
                        .lineLimit(2...6)
                    Picker("Priority", selection: $priority) {
                        Text("Routine").tag("routine")
                        Text("Urgent").tag("urgent")
                        Text("Emergency").tag("emergency")
                    }
                }

                if let error {
                    Text(error).foregroundStyle(.red).font(.caption)
                }
            }
            .navigationTitle("Log a job")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Log") { Task { await create() } }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || creating)
                        .bold()
                }
            }
            .task { aiConfigured = (try? await APIClient.shared.aiStatus()) ?? false }
        }
    }

    private func structure() async {
        structuring = true; error = nil; clarify = nil
        defer { structuring = false }
        do {
            let r = try await APIClient.shared.parseWorkRequest(text: raw)
            title = r.title
            detail = r.description
            if priorities.contains(r.priority) { priority = r.priority }
            clarify = r.needsClarification.isEmpty ? nil : r.needsClarification
        } catch {
            self.error = "Couldn't structure that — try again, or fill it in below."
        }
    }

    private func create() async {
        creating = true; error = nil
        defer { creating = false }
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanDetail = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await APIClient.shared.createJob(
                title: cleanTitle,
                description: cleanDetail.isEmpty ? nil : cleanDetail,
                priority: priority
            )
            onLogged()
            dismiss()
        } catch {
            self.error = "Couldn't log the job — try again."
        }
    }
}
