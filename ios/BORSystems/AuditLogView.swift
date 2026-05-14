import SwiftUI

struct AuditLogView: View {
    @State private var entries: [AuditEntry] = []
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        List(entries) { e in
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(e.actorName ?? "system")
                        .font(.body.weight(.medium))
                    Spacer()
                    Text(e.at, style: .relative)
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Text(e.action).font(.caption.monospaced()).foregroundStyle(.secondary)
                if let t = e.targetType { Text("\(t): \(e.targetId ?? "")").font(.caption2).foregroundStyle(.tertiary) }
            }
        }
        .navigationTitle("Audit log")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            // Distinguish "still loading" from "loaded but empty" so the
            // spinner doesn't stay on screen forever when the org has no
            // recorded actions yet.
            if !loaded {
                ProgressView()
            } else if let err = error {
                Text(err).foregroundStyle(.red).font(.footnote)
            } else if entries.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(.secondary)
                    Text("No audit entries yet")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Actions like deactivating users or changing settings will show up here.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
            }
        }
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func refresh() async {
        do {
            entries = try await APIClient.shared.auditLog()
            error = nil
        } catch {
            self.error = "Could not load audit log."
        }
        loaded = true
    }
}

struct NotificationsLogView: View {
    @State private var entries: [NotificationEntry] = []
    @State private var error: String?
    @State private var loaded = false

    var body: some View {
        List(entries) { n in
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(n.recipientName ?? "deleted user").font(.body.weight(.medium))
                    Spacer()
                    Text(n.sentAt, style: .relative).font(.caption2).foregroundStyle(.secondary)
                }
                if let email = n.recipientEmail { Text(email).font(.caption).foregroundStyle(.tertiary) }
                HStack(spacing: 8) {
                    Text(n.channel).font(.caption2.monospaced())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.gray.opacity(0.15), in: Capsule())
                    Text(n.kind).font(.caption2.monospaced())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.gray.opacity(0.15), in: Capsule())
                    Spacer()
                    if n.delivered == true {
                        Text("delivered").font(.caption2).foregroundStyle(.green)
                    } else if let err = n.error {
                        Text(err.prefix(28)).font(.caption2).foregroundStyle(.red).lineLimit(1)
                    } else {
                        Text("pending").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if !loaded {
                ProgressView()
            } else if let err = error {
                Text(err).foregroundStyle(.red).font(.footnote)
            } else if entries.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "bell.slash")
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(.secondary)
                    Text("No notifications yet")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Pushes, SMS and emails the system sends will show up here.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
            }
        }
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func refresh() async {
        do {
            entries = try await APIClient.shared.notificationsLog()
            error = nil
        } catch {
            self.error = "Could not load notifications log."
        }
        loaded = true
    }
}
