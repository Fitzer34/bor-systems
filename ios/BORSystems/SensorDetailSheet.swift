import SwiftUI

/// Read-only sensor detail shown when a hanger pin is tapped on the map. Reuses
/// the same row vocabulary as HangerDetailView's "Live state" section (status,
/// battery, signal, last seen) and adds the new GET /hangers fields (last
/// lifted, reports-via gateway). When the hanger's zone has an open spill alert,
/// an "Open spill alert" button deep-links to AlertDetailView.
///
/// This is intentionally a lightweight sheet — full editing still lives in
/// HangerDetailView (More → Hangers). The map is for "what's happening right
/// now", so this leans on glanceable live state.
struct SensorDetailSheet: View {
    let hanger: Hanger
    let zoneName: String?
    let floorName: String?
    /// The open alert on this hanger's zone, if any — enables the deep-link.
    let openAlert: ActiveAlert?
    let lowBatteryThreshold: Int

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Identification") {
                    LabeledContent("Name", value: hanger.name?.isEmpty == false ? hanger.name! : "—")
                    // "HGR id" — the short device handle. We surface the DevEUI
                    // (the only stable id the device prints) as both the human
                    // "HGR id" and the raw DevEUI row, matching the web.
                    LabeledContent("HGR id", value: hangerShortId)
                        .font(.system(.body, design: .monospaced))
                    LabeledContent("DevEUI", value: hanger.devEui)
                        .font(.system(.body, design: .monospaced))
                }

                Section("Location") {
                    LabeledContent("Zone", value: zoneName ?? "Unassigned")
                    if let floorName = floorName {
                        LabeledContent("Floor", value: floorName)
                    }
                    if let note = hanger.locationNote, !note.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Where in the zone?").font(.caption).foregroundStyle(.secondary)
                            Text(note)
                        }
                    }
                }

                Section("Live state") {
                    statusRow
                    batteryRow
                    signalRow
                    if let last = hanger.lastSeenAt {
                        LabeledContent("Last seen", value: relativeTime(from: last))
                    } else {
                        LabeledContent("Last seen", value: "Never")
                    }
                    if let lifted = hanger.lastLiftedAt {
                        LabeledContent("Last lifted", value: relativeTime(from: lifted))
                    }
                    if let gw = hanger.reportsViaGatewayName ?? hanger.reportsViaGatewayId {
                        LabeledContent("Reports via", value: gw)
                    }
                }

                if let alert = openAlert {
                    Section {
                        NavigationLink {
                            AlertDetailView(alert: alert) { }
                        } label: {
                            Label("Open spill alert", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                        }
                    } footer: {
                        Text("This sign has been lifted — there's an active spill alert on its zone.")
                    }
                }
            }
            .navigationTitle("Sensor")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: Derived

    /// A short, friendly device handle derived from the DevEUI. The hanger
    /// prints "BOR" + hex; show the last 6 of that as a glanceable "HGR-…" id.
    private var hangerShortId: String {
        let eui = hanger.devEui
        let tail = eui.count > 6 ? String(eui.suffix(6)) : eui
        return "HGR-\(tail)"
    }

    @ViewBuilder
    private var statusRow: some View {
        let (label, color): (String, Color) = {
            switch hanger.status {
            case .outOfService:   return ("Out of service", .orange)
            case .decommissioned: return ("Decommissioned", .gray)
            case .active:
                if let zid = hanger.zoneId, openAlert != nil, hanger.zoneId == zid {
                    return ("Lifted — spill", .red)
                }
                if let seen = hanger.lastSeenAt,
                   Date().timeIntervalSince(seen) <= 26 * 60 * 60 {
                    return ("On rack", .green)
                }
                return ("Offline", .orange)
            }
        }()
        HStack {
            Text("Status")
            Spacer()
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 8, height: 8)
                Text(label).foregroundStyle(color)
            }
        }
    }

    @ViewBuilder
    private var batteryRow: some View {
        HStack {
            Text("Battery")
            Spacer()
            if let pct = hanger.batteryPct {
                let low = pct <= lowBatteryThreshold
                HStack(spacing: 6) {
                    if low {
                        Image(systemName: "battery.25").foregroundStyle(.red)
                    }
                    Text("\(pct)%").foregroundStyle(low ? .red : .primary)
                }
            } else {
                Text("—").foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var signalRow: some View {
        if let rssi = hanger.signal ?? hanger.rssi {
            LabeledContent("Signal", value: "\(rssi) dBm \(signalLabel(rssi))")
        }
    }

    private func signalLabel(_ rssi: Int) -> String {
        switch rssi {
        case (-45)...: return "(excellent)"
        case (-55)...: return "(strong)"
        case (-65)...: return "(good)"
        case (-75)...: return "(weak)"
        default:       return "(very weak)"
        }
    }
}
