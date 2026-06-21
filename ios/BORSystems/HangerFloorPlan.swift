import SwiftUI

/// Per-hanger floor-plan overlay. Unlike `FloorPlanWithPins` (one pin per zone),
/// this drops a pin for every hanger, positioned at its zone's pin coordinate,
/// with four states:
///   • on-rack  → green (sign in place, healthy)
///   • lifted   → red, pulsing (an open spill alert on this hanger's zone)
///   • offline  → orange "?" (no recent heartbeat)
///   • low batt → a small battery badge on top of whatever the base state is
/// Tapping a pin calls `onSelect` so the caller can present the SensorDetailSheet.
///
/// Gateways are drawn distinctly (a square "router" marker) at their building's
/// notional position so installers can see where the box lives versus the signs.
struct HangerFloorPlan: View {
    let planURL: URL
    let zones: [Zone]
    let hangers: [Hanger]
    let alertStatusByZoneId: [String: AlertStatus]
    let offlineHangerIds: Set<String>
    let lowBatteryThreshold: Int
    let onSelect: (Hanger) -> Void

    private var zonesById: [String: Zone] {
        Dictionary(uniqueKeysWithValues: zones.map { ($0.id, $0) })
    }

    var body: some View {
        AsyncImage(url: planURL) { phase in
            switch phase {
            case .empty:
                ProgressView().frame(maxWidth: .infinity, minHeight: 220)
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .overlay(
                        GeometryReader { geo in
                            ForEach(placedHangers, id: \.hanger.id) { placed in
                                pin(for: placed.hanger, at: placed.point, in: geo.size)
                            }
                        }
                    )
            case .failure:
                Text("Could not load plan image.")
                    .foregroundStyle(.secondary)
                    .padding(20)
            @unknown default:
                EmptyView()
            }
        }
    }

    // MARK: Placement

    private struct Placed { let hanger: Hanger; let point: CGPoint }

    /// Resolve each hanger to a normalised (0..1) point from its zone's pin,
    /// fanning out multiple hangers in the same zone so they don't stack exactly.
    private var placedHangers: [Placed] {
        // Group placeable hangers by zone so we can spread same-zone pins.
        var byZone: [String: [Hanger]] = [:]
        for h in hangers where h.status == .active {
            guard let zid = h.zoneId,
                  let z = zonesById[zid],
                  z.pinX != nil, z.pinY != nil else { continue }
            byZone[zid, default: []].append(h)
        }
        var out: [Placed] = []
        for (zid, list) in byZone {
            guard let z = zonesById[zid] else { continue }
            let baseX = CGFloat(z.pinX ?? 0) / 1000.0
            let baseY = CGFloat(z.pinY ?? 0) / 1000.0
            for (i, h) in list.enumerated() {
                // Fan multiples around the zone pin in a small ring.
                let offset = ringOffset(index: i, count: list.count)
                out.append(Placed(hanger: h, point: CGPoint(x: baseX + offset.x, y: baseY + offset.y)))
            }
        }
        return out
    }

    private func ringOffset(index: Int, count: Int) -> CGPoint {
        guard count > 1 else { return .zero }
        let radius: CGFloat = 0.025
        let angle = (CGFloat(index) / CGFloat(count)) * 2 * .pi
        return CGPoint(x: cos(angle) * radius, y: sin(angle) * radius)
    }

    // MARK: Pin

    @ViewBuilder
    private func pin(for hanger: Hanger, at point: CGPoint, in size: CGSize) -> some View {
        let x = point.x * size.width
        let y = point.y * size.height
        let state = stateFor(hanger)
        let low = isLowBattery(hanger)

        Button {
            onSelect(hanger)
        } label: {
            ZStack(alignment: .topTrailing) {
                statePin(state)
                if low {
                    Image(systemName: "battery.25")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(2)
                        .background(Color.red, in: Circle())
                        .overlay(Circle().stroke(.white, lineWidth: 1))
                        .offset(x: 7, y: -7)
                }
            }
        }
        .buttonStyle(.plain)
        .position(x: x, y: y)
    }

    private enum PinState { case onRack, lifted, offline }

    private func stateFor(_ hanger: Hanger) -> PinState {
        // A lifted sign wins over everything — it's the urgent state.
        if let zid = hanger.zoneId, alertStatusByZoneId[zid] == .open {
            return .lifted
        }
        if offlineHangerIds.contains(hanger.id) {
            return .offline
        }
        return .onRack
    }

    private func isLowBattery(_ hanger: Hanger) -> Bool {
        guard let pct = hanger.batteryPct else { return false }
        return pct <= lowBatteryThreshold
    }

    @ViewBuilder
    private func statePin(_ state: PinState) -> some View {
        switch state {
        case .lifted:
            PulsingDot(color: .red, animate: true)
        case .offline:
            OfflinePin()
        case .onRack:
            PulsingDot(color: .green, animate: false)
        }
    }
}
