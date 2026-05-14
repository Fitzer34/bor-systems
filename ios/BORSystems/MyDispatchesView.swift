import SwiftUI

/// What a cleaner sees when they tap the Dispatch tab.
///
/// Lists dispatches sent TO them by their supervisor — where they've been
/// asked to go, plus the message. Cleaners can acknowledge ("on my way")
/// and mark as completed; those are response actions, not edits to who the
/// dispatch was sent to. They can't create dispatches.
struct MyDispatchesView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var dispatches: [DispatchItem] = []
    @State private var error: String?
    @State private var busyId: String?

    var body: some View {
        let active = dispatches.filter { $0.status != .completed }
        let done = dispatches.filter { $0.status == .completed }

        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let err = error {
                    Text(err).foregroundStyle(.red).padding(.horizontal, 16)
                }

                if dispatches.isEmpty {
                    EmptyDispatchesHint().padding(.top, 60)
                }

                if !active.isEmpty {
                    sectionHeader("Active")
                    VStack(spacing: 0) {
                        ForEach(active) { d in
                            DispatchCard(dispatch: d,
                                         busy: busyId == d.id,
                                         onAcknowledge: { Task { await acknowledge(d) } },
                                         onComplete: { Task { await complete(d) } })
                            if d.id != active.last?.id { Divider().padding(.leading, 16) }
                        }
                    }
                    .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)
                }

                if !done.isEmpty {
                    sectionHeader("Completed")
                    VStack(spacing: 0) {
                        ForEach(done) { d in
                            DispatchCard(dispatch: d, busy: false, onAcknowledge: {}, onComplete: {})
                            if d.id != done.last?.id { Divider().padding(.leading, 16) }
                        }
                    }
                    .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal, 16)
                }
                Spacer().frame(height: 40)
            }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Dispatch")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.headline)
            .padding(.horizontal, 16)
    }

    private func refresh() async {
        do { dispatches = try await APIClient.shared.dispatches() }
        catch { self.error = "Could not load dispatches." }
    }

    private func acknowledge(_ d: DispatchItem) async {
        busyId = d.id; defer { busyId = nil }
        do {
            try await APIClient.shared.acknowledgeDispatch(d.id)
            await refresh()
        } catch let APIError.http(_, body) {
            self.error = friendlyDispatchError(body, action: "accept")
        } catch {
            self.error = "Could not accept dispatch."
        }
    }

    private func complete(_ d: DispatchItem) async {
        busyId = d.id; defer { busyId = nil }
        do {
            try await APIClient.shared.completeDispatch(d.id)
            await refresh()
        } catch let APIError.http(_, body) {
            self.error = friendlyDispatchError(body, action: "complete")
        } catch {
            self.error = "Could not complete dispatch."
        }
    }
}

private func friendlyDispatchError(_ body: String, action: String) -> String {
    if body.contains("not_your_dispatch") {
        return "This dispatch isn't assigned to you."
    }
    if body.contains("already_acknowledged") {
        return "Already accepted — pull to refresh."
    }
    if body.contains("already_completed") {
        return "Already marked done — pull to refresh."
    }
    if body.contains("dispatch_not_found") {
        return "Dispatch was deleted. Pull to refresh."
    }
    return "Could not \(action) dispatch."
}

private struct DispatchCard: View {
    let dispatch: DispatchItem
    let busy: Bool
    let onAcknowledge: () -> Void
    let onComplete: () -> Void

    var body: some View {
        let zone = dispatch.zoneName ?? "Unspecified zone"
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "mappin.and.ellipse").foregroundStyle(.secondary)
                Text(zone).font(.body.weight(.semibold))
                Spacer()
                statusChip
            }
            if !dispatch.message.isEmpty {
                Text(dispatch.message)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("Sent " + dispatch.sentAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption).foregroundStyle(.secondary)

            switch dispatch.status {
            case .sent:
                HStack {
                    Button { onAcknowledge() } label: {
                        Label("On my way", systemImage: "figure.walk")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy)
                }
            case .acknowledged:
                HStack {
                    Button { onComplete() } label: {
                        Label("Mark complete", systemImage: "checkmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(busy)
                }
            case .completed:
                EmptyView()
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var statusChip: some View {
        switch dispatch.status {
        case .sent:
            Text("NEW").font(.caption2.weight(.heavy))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(.blue, in: Capsule()).foregroundStyle(.white)
        case .acknowledged:
            Text("ON THE WAY").font(.caption2.weight(.heavy))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(.orange, in: Capsule()).foregroundStyle(.white)
        case .completed:
            Text("DONE").font(.caption2.weight(.heavy))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(.gray.opacity(0.4), in: Capsule()).foregroundStyle(.white)
        }
    }
}

private struct EmptyDispatchesHint: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "paperplane")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(.secondary)
            Text("Nothing for you right now").font(.headline)
            Text("When your supervisor sends you to a specific zone, it'll show up here.")
                .font(.footnote).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity)
    }
}
