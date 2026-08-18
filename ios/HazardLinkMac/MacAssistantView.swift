import SwiftUI

/// Ask HazardLink on the Mac: a chat pane over the org's real data via
/// POST /ai/ask (the grounded, tool-using assistant). Honest when the AI
/// isn't configured for this org (503) or the provider can't run it.

private struct AskBody: Encodable { let question: String }
private struct AskResponse: Decodable { let answer: String }
private struct AiStatus: Decodable { let configured: Bool; let assistant: Bool?; let provider: String? }

private struct ChatTurn: Identifiable {
    let id = UUID()
    let role: String   // user | assistant | error
    let text: String
}

struct MacAssistantView: View {
    @State private var status: AiStatus?
    @State private var turns: [ChatTurn] = []
    @State private var question = ""
    @State private var busy = false
    @FocusState private var focused: Bool

    private let starters = [
        "What's open right now across all sites?",
        "Which work orders are overdue?",
        "Who has permits pending approval?",
        "Any compliance items due this month?",
    ]

    var body: some View {
        VStack(spacing: 0) {
            if let s = status, !(s.configured && (s.assistant ?? true)) {
                unavailable(s)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            if turns.isEmpty {
                                Text("Ask about your organisation's real data. Answers come only from what's in HazardLink; the assistant says so when it doesn't know.")
                                    .foregroundStyle(.secondary)
                                    .padding(.bottom, 6)
                                ForEach(starters, id: \.self) { s in
                                    Button {
                                        question = s
                                        Task { await ask() }
                                    } label: {
                                        Text(s).frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                            ForEach(turns) { t in
                                HStack(alignment: .top) {
                                    if t.role == "user" { Spacer(minLength: 80) }
                                    Text(t.text)
                                        .textSelection(.enabled)
                                        .padding(12)
                                        .background(
                                            t.role == "user" ? Color.accentColor.opacity(0.18)
                                            : t.role == "error" ? Color.red.opacity(0.12)
                                            : Color.gray.opacity(0.14),
                                            in: RoundedRectangle(cornerRadius: 12))
                                    if t.role != "user" { Spacer(minLength: 80) }
                                }
                                .id(t.id)
                            }
                            if busy { ProgressView().controlSize(.small).padding(.leading, 12) }
                        }
                        .padding(20)
                        .frame(maxWidth: 900, alignment: .leading)
                    }
                    .onChange(of: turns.count) { _, _ in
                        if let last = turns.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                }
                Divider()
                HStack {
                    TextField("Ask HazardLink…", text: $question)
                        .textFieldStyle(.roundedBorder)
                        .focused($focused)
                        .onSubmit { Task { await ask() } }
                    Button {
                        Task { await ask() }
                    } label: {
                        Label("Ask", systemImage: "paperplane.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || question.trimmingCharacters(in: .whitespaces).count < 2)
                    .keyboardShortcut(.defaultAction)
                }
                .padding(12)
            }
        }
        .task {
            status = try? await APIClient.shared.request("/ai/status")
            focused = true
        }
    }

    private func unavailable(_ s: AiStatus) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles").font(.system(size: 34)).foregroundStyle(.secondary)
            Text("Assistant not switched on").font(.headline)
            Text(s.configured
                 ? "The org's AI provider (\(s.provider ?? "unknown")) runs the quick helpers but not the live assistant. Set an Anthropic key in Render to enable it."
                 : "No AI provider is configured for this organisation. Add a key in Render (Groq is free) and the assistant appears here.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func ask() async {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 2, !busy else { return }
        turns.append(ChatTurn(role: "user", text: q))
        question = ""
        busy = true
        defer { busy = false }
        do {
            let r: AskResponse = try await APIClient.shared.request("/ai/ask", method: "POST", body: AskBody(question: q))
            turns.append(ChatTurn(role: "assistant", text: r.answer))
        } catch let e as APIError {
            if case .http(let s, _) = e, s == 503 {
                turns.append(ChatTurn(role: "error", text: "The assistant isn't configured for this organisation."))
            } else if case .http(let s, _) = e, s == 429 {
                turns.append(ChatTurn(role: "error", text: "Today's AI budget is used up. It resets tomorrow."))
            } else {
                turns.append(ChatTurn(role: "error", text: "Could not get an answer. Try again."))
            }
        } catch {
            turns.append(ChatTurn(role: "error", text: "Could not reach the server."))
        }
    }
}
