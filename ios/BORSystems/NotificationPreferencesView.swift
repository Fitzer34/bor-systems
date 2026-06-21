import SwiftUI

/// Per-event-type delivery preferences: choose in-app / email / SMS for each
/// kind of notification. Backed by GET/PUT /notifications/preferences.
///
/// In-app is always on server-side (the feed row is written regardless), so the
/// in-app toggle is shown disabled-on for clarity rather than letting the user
/// switch off something that can't actually be switched off.
struct NotificationPreferencesView: View {
    @State private var prefs: [String: ChannelPrefs] = [:]
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Form {
            if loading {
                Section { HStack { ProgressView(); Text("Loading…").foregroundStyle(.secondary) } }
            } else if prefs.isEmpty {
                Section { Text("No notification types to configure yet.").foregroundStyle(.secondary) }
            } else {
                ForEach(sortedEventTypes, id: \.self) { eventType in
                    Section(Self.friendlyName(eventType)) {
                        // In-app: always on, shown disabled so it's clear it
                        // can't be turned off (the feed always records it).
                        Toggle(isOn: .constant(true)) {
                            Label("In-app", systemImage: "bell")
                        }
                        .disabled(true)

                        Toggle(isOn: binding(for: eventType, channel: .email)) {
                            Label("Email", systemImage: "envelope")
                        }
                        Toggle(isOn: binding(for: eventType, channel: .sms)) {
                            Label("SMS", systemImage: "message")
                        }
                    }
                }
            }
            if let error = error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private enum Channel { case email, sms }

    private var sortedEventTypes: [String] {
        prefs.keys.sorted { Self.friendlyName($0) < Self.friendlyName($1) }
    }

    /// Two-way binding that writes the toggle through to the backend and updates
    /// the local copy optimistically.
    private func binding(for eventType: String, channel: Channel) -> Binding<Bool> {
        Binding(
            get: {
                let p = prefs[eventType] ?? ChannelPrefs(inApp: true, email: false, sms: false)
                return channel == .email ? p.email : p.sms
            },
            set: { newValue in
                var p = prefs[eventType] ?? ChannelPrefs(inApp: true, email: false, sms: false)
                switch channel {
                case .email: p.email = newValue
                case .sms:   p.sms = newValue
                }
                prefs[eventType] = p
                Task { await save(eventType: eventType, channel: channel, value: newValue) }
            }
        )
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            prefs = try await APIClient.shared.notificationPreferences()
            error = nil
        } catch {
            self.error = "Could not load preferences."
        }
    }

    private func save(eventType: String, channel: Channel, value: Bool) async {
        do {
            switch channel {
            case .email: try await APIClient.shared.updateNotificationPreference(eventType: eventType, email: value)
            case .sms:   try await APIClient.shared.updateNotificationPreference(eventType: eventType, sms: value)
            }
        } catch {
            self.error = "Could not save that change."
            // Roll the local copy back so the toggle reflects the true state.
            await load()
        }
    }

    /// Map an event-type key to a human label. Falls back to title-casing the
    /// key so unknown server-side types still read reasonably.
    static func friendlyName(_ key: String) -> String {
        let known: [String: String] = [
            "spill.open":              "Spill opened",
            "spill.escalated":         "Spill escalated",
            "ppm.overdue":             "PPM overdue",
            "wo.overdue":              "Work order overdue",
            "part.low_stock":          "Part low stock",
            "cert.expiring":           "Certification expiring",
            "invoice.overdue":         "Invoice overdue",
            "lone_worker.overdue":     "Lone worker check-in overdue",
            "quote.awaiting_approval": "Quote awaiting approval",
            "patrol.missed":           "Security patrol missed",
        ]
        if let name = known[key] { return name }
        return key
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
    }
}

#Preview {
    NavigationStack { NotificationPreferencesView() }
}
