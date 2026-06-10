import SwiftUI
import UIKit

/// "Find sign" — a hot/cold precision finder driven by UWB distance to the sign's
/// tag. No camera, no line of sight required: distance ranges through walls and
/// around corners, so it guides staff to the right spot even when the sign isn't
/// visible yet. The screen glows red→green as you close in, and a haptic pulse
/// speeds up and strengthens the nearer you get — like a metal detector.
///
/// (Camera-assisted direction arrows are deliberately not used: on iPhone 14+
/// they need the camera pointed at the target with line of sight, which is the
/// opposite of when you actually need finding — and a big yellow sign you can
/// already see doesn't need an arrow.)
struct FindSignView: View {
    let alertId: String
    let zoneName: String?
    /// The alert's hanger — lets staff assign a tracker right here when none is
    /// paired yet, instead of dead-ending to the floor plan.
    var hangerId: String? = nil

    @StateObject private var finder = SignFinder()
    @StateObject private var haptics = HapticPulser()
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthStore
    @State private var showAssign = false
    @State private var pingScale: CGFloat = 1.0

    private var isStaff: Bool {
        auth.user?.role == .admin || auth.user?.role == .supervisor
    }

    /// Current distance while ranging (nil in every other state). Drives the
    /// haptics from one place via `.onChange`.
    private var rangingDistance: Float? {
        if case .ranging(let d, _) = finder.state { return d }
        return nil
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch finder.state {
            case .idle, .lookingUp:
                ProgressView("Looking up tag…").tint(.white)
            case .connecting:
                ProgressView("Connecting to sign…").tint(.white)
            case .ranging(let distance, _):
                rangingUI(distance: distance)
            case .signFound:
                FoundUI()
            case .noTagPaired:
                NoTagUI(canAssign: isStaff && hangerId != nil) { showAssign = true }
            case .unavailable(let reason):
                UnavailableUI(reason: reason)
            }
        }
        .navigationTitle(zoneName ?? "Find sign")
        .navigationBarTitleDisplayMode(.inline)
        .task { await finder.start(alertId: alertId) }
        .onChange(of: rangingDistance) { d in
            if let d { haptics.start(); haptics.update(distance: d) }
            else { haptics.stop() }
        }
        .onChange(of: haptics.tick) { _ in
            // A quick "pop" on each haptic pulse so you see and feel each beat.
            withAnimation(.easeOut(duration: 0.10)) { pingScale = 1.10 }
            withAnimation(.easeIn(duration: 0.24).delay(0.10)) { pingScale = 1.0 }
        }
        .onDisappear { finder.stop(); haptics.stop() }
        .sheet(isPresented: $showAssign) {
            if let hangerId {
                TrackerAssignSheet(hangerId: hangerId) { _ in
                    // Tracker pinned — kick the finder off again; it'll now
                    // resolve the tag and start ranging.
                    Task {
                        finder.stop()
                        await finder.start(alertId: alertId)
                    }
                }
            }
        }
    }

    // MARK: - Hot/cold ranging UI

    @ViewBuilder
    private func rangingUI(distance: Float) -> some View {
        let p = proximity(distance)
        let c = proximityColor(p)

        ZStack {
            // Whole screen glows in the proximity colour, brighter as you close in.
            RadialGradient(
                colors: [c.opacity(0.22 + 0.5 * p), .black],
                center: .center, startRadius: 6, endRadius: 470
            )
            .ignoresSafeArea()
            .animation(.easeInOut(duration: 0.3), value: p)

            VStack(spacing: 22) {
                Spacer()

                ZStack {
                    Circle().fill(c.opacity(0.16)).frame(width: 250, height: 250)
                    Circle()
                        .stroke(c, lineWidth: 10)
                        .frame(width: 250, height: 250)
                        .shadow(color: c.opacity(0.8), radius: 22)
                    VStack(spacing: 4) {
                        Text(formatDistance(distance))
                            .font(.system(size: 58, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .contentTransition(.numericText())
                        trendBadge
                    }
                }
                .scaleEffect(pingScale)
                .animation(.easeInOut(duration: 0.3), value: c)

                Text(proximityHint(distance))
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.85))

                Spacer()

                Button {
                    haptics.stop()
                    finder.markFound()
                } label: {
                    Text("I found it")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)
                .tint(.white)
                .foregroundStyle(.black)
                .padding(.horizontal, 24)
            }
            .padding()
        }
    }

    @ViewBuilder
    private var trendBadge: some View {
        switch haptics.trend {
        case 1:
            Label("Closer", systemImage: "chevron.up")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.green)
        case -1:
            Label("Further", systemImage: "chevron.down")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.red)
        default:
            Color.clear.frame(height: 20)
        }
    }

    // MARK: - Helpers

    private func formatDistance(_ m: Float) -> String {
        if m < 1.0 { return String(format: "%.0f cm", m * 100) }
        return String(format: "%.1f m", m)
    }

    /// 0 = far (≥8 m), 1 = on top of it (≤0.3 m).
    private func proximity(_ m: Float) -> Double {
        let clamped = Double(min(max(m, 0.3), 8.0))
        return 1.0 - (clamped - 0.3) / (8.0 - 0.3)
    }

    /// Red when far → amber → green up close. Hue 0 (red) … 0.33 (green).
    private func proximityColor(_ p: Double) -> Color {
        Color(hue: p * 0.33, saturation: 0.85, brightness: 1.0)
    }

    private func proximityHint(_ m: Float) -> String {
        if m < 0.4 { return "You're right on it" }
        if m < 1.0 { return "Right here — look around you" }
        if m < 2.5 { return "Very close" }
        if m < 5.0 { return "Getting closer" }
        return "Keep moving — follow the buzzes"
    }
}

// MARK: - Haptic hot/cold engine

/// Drives a metal-detector-style haptic: pulses get faster and stronger the
/// closer you are, with a success tap when you arrive. Also reports whether
/// you're getting closer or further so the UI can show a trend.
@MainActor
final class HapticPulser: ObservableObject {
    /// Increments on every pulse — the view animates a "pop" off this.
    @Published var tick = 0
    /// +1 getting closer, -1 getting further, 0 steady.
    @Published var trend = 0

    private var timer: Timer?
    private let impact = UIImpactFeedbackGenerator(style: .medium)
    private let success = UINotificationFeedbackGenerator()
    private var distance: Float = 8
    private var lastTrendDistance: Float?
    private var arrived = false
    private var running = false

    func start() {
        guard !running else { return }
        running = true
        impact.prepare()
        scheduleNext()
    }

    func stop() {
        running = false
        timer?.invalidate(); timer = nil
        trend = 0
    }

    func update(distance d: Float) {
        distance = d
        // Trend with hysteresis so small jitter doesn't flip it.
        if let last = lastTrendDistance {
            if d < last - 0.1 { trend = 1; lastTrendDistance = d }
            else if d > last + 0.1 { trend = -1; lastTrendDistance = d }
        } else {
            lastTrendDistance = d
        }
        // Success tap once, when you arrive.
        if d < 0.4 {
            if !arrived { arrived = true; success.notificationOccurred(.success) }
        } else if d > 0.6 {
            arrived = false
        }
    }

    private func scheduleNext() {
        guard running else { return }
        let d = Double(min(max(distance, 0.3), 8.0))
        let t = (d - 0.3) / (8.0 - 0.3)            // 0 close … 1 far
        let interval = 0.07 + t * (1.25 - 0.07)    // rapid up close, slow far away
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.fire() }
        }
    }

    private func fire() {
        guard running else { return }
        if !arrived {
            let d = Double(min(max(distance, 0.3), 8.0))
            let t = (d - 0.3) / (8.0 - 0.3)
            let intensity = CGFloat(max(0.4, 1.0 - t))  // stronger up close
            impact.impactOccurred(intensity: intensity)
            tick &+= 1
        }
        scheduleNext()
    }
}

// MARK: - Other states

private struct FoundUI: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .resizable().scaledToFit()
                .frame(width: 96, height: 96)
                .foregroundStyle(.green)
            Text("Sign found").font(.title2).foregroundStyle(.white)
            Text("Place it back on the hanger when done.")
                .foregroundStyle(.secondary)
        }
    }
}

/// No tracker on this alert's hanger. Staff get a one-tap scan-to-assign so the
/// dead end fixes itself; cleaners are pointed at the floor plan.
private struct NoTagUI: View {
    let canAssign: Bool
    let onAssign: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("No tracker on this sign yet")
                .font(.headline).foregroundStyle(.white)
            Text(canAssign
                 ? "Hold your phone next to the sign's tracker and assign it — precision finding starts straight away."
                 : "Ask a supervisor to assign a tracker to this sign. Use the floor plan to locate it for now.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 24)
            if canAssign {
                Button(action: onAssign) {
                    Label("Assign tracker", systemImage: "plus.circle.fill")
                        .font(.headline)
                        .padding(.vertical, 12)
                        .padding(.horizontal, 24)
                }
                .buttonStyle(.borderedProminent)
                .padding(.top, 4)
            }
        }
        .padding()
    }
}

private struct UnavailableUI: View {
    let reason: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "location.slash.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("Precision finding unavailable")
                .font(.headline).foregroundStyle(.white)
            Text(reason)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            Text("Showing zone on floor plan instead.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
