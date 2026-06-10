import SwiftUI
import NearbyInteraction
import CoreBluetooth
import simd

/// AirTag-style "Find sign" view using Apple's NearbyInteraction framework
/// + Ultra-Wideband ranging with the sign's embedded Qorvo DWM3001 tag.
///
/// Entry path:
///   1. Spill alert fires → user taps "Find sign" on the alert
///   2. Backend lookup for the alert's paired tag → returns BLE UUID
///   3. This view scans BLE, connects, exchanges UWB discovery tokens,
///      starts ranging, then renders a big arrow + cm-accurate distance
///
/// Fallback behaviour (handled by the parent navigator, not this view):
///   - No paired tag for this alert → push FloorPlanView instead
///   - Phone doesn't support UWB → push FloorPlanView with a banner
///     ("Your phone doesn't support precision finding — using floor plan")
struct FindSignView: View {
    let alertId: String
    let zoneName: String?
    /// The alert's hanger — lets staff assign a tracker right here when none
    /// is paired yet, instead of dead-ending to the floor plan.
    var hangerId: String? = nil

    @StateObject private var finder = SignFinder()
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthStore
    @State private var showAssign = false

    private var isStaff: Bool {
        auth.user?.role == .admin || auth.user?.role == .supervisor
    }

    var body: some View {
        ZStack {
            // Live (dimmed) camera. This BOTH powers camera-assisted direction
            // and — crucially — gives ARKit a real on-screen surface so the
            // camera/AR session actually starts. A near-invisible view fails to
            // start the camera, and NI then rejects it (INVALID_AR_SESSION).
            CameraAssistARView { session in finder.attachARSession(session) }
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            Color.black.opacity(0.62).ignoresSafeArea()

            switch finder.state {
            case .idle, .lookingUp:
                ProgressView("Looking up tag…")
            case .connecting:
                ProgressView("Connecting to sign…")
            case .ranging(let distance, let direction):
                rangingUI(distance: distance, direction: direction)
            case .signFound:
                FoundUI()
            case .noTagPaired:
                NoTagUI(canAssign: isStaff && hangerId != nil) {
                    showAssign = true
                }
            case .unavailable(let reason):
                UnavailableUI(reason: reason)
            }
        }
        .navigationTitle(zoneName ?? "Find sign")
        .navigationBarTitleDisplayMode(.inline)
        .task { await finder.start(alertId: alertId) }
        .onDisappear { finder.stop() }
        .sheet(isPresented: $showAssign) {
            if let hangerId {
                TrackerAssignSheet(hangerId: hangerId) { _ in
                    // Tracker pinned — kick the finder off again, it'll now
                    // resolve the tag and start ranging.
                    Task {
                        finder.stop()
                        await finder.start(alertId: alertId)
                    }
                }
            }
        }
    }

    // MARK: - Ranging UI

    @ViewBuilder
    private func rangingUI(distance: Float, direction: simd_float3?) -> some View {
        VStack(spacing: 20) {
            Spacer()

            // Direction arrow — rotates to point at the tag. When the user
            // turns the phone the arrow corrects in real time.
            if let dir = direction {
                Image(systemName: "arrow.up.circle.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 180, height: 180)
                    .foregroundStyle(distanceColor(distance))
                    .rotationEffect(.radians(Double(atan2(dir.x, -dir.z))))
                    .animation(.linear(duration: 0.1), value: dir)
            } else {
                // No direction yet (UWB session needs ~1s of motion to lock).
                Image(systemName: "scope")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 180, height: 180)
                    .foregroundStyle(.secondary)
            }

            // Distance — big number, AirTag-style.
            Text(formatDistance(distance))
                .font(.system(size: 64, weight: .semibold, design: .rounded))
                .foregroundStyle(distanceColor(distance))
                .contentTransition(.numericText())

            // Helper text. With no direction yet, prefer the live camera/
            // convergence coaching so the user knows exactly what to adjust.
            Text(noDirectionHint(distance: distance, direction: direction))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Spacer()

            Button {
                finder.markFound()
            } label: {
                Text("I found it")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 24)
        }
        .padding()
    }

    private func formatDistance(_ m: Float) -> String {
        if m < 1.0 { return String(format: "%.0f cm", m * 100) }
        return String(format: "%.1f m", m)
    }

    /// Green when within reach, amber as you get closer, red at distance.
    private func distanceColor(_ m: Float) -> Color {
        if m < 0.5  { return .green }
        if m < 2.0  { return .yellow }
        if m < 5.0  { return .orange }
        return .red
    }

    /// With no direction yet, pick the most useful nudge: "you're on top of it"
    /// up close, otherwise the live camera/convergence coaching from SignFinder.
    private func noDirectionHint(distance: Float, direction: simd_float3?) -> String {
        if direction != nil { return hintText(distance: distance, direction: direction) }
        if distance < 0.6 { return "You're right next to it — look around you" }
        return finder.coachingHint ?? "Point the phone at the sign and walk a few steps"
    }

    private func hintText(distance: Float, direction: simd_float3?) -> String {
        guard let d = direction else {
            return "Walk a few steps so we can find direction"
        }
        let behind = d.z < 0
        let left   = d.x < -0.3
        let right  = d.x >  0.3
        if behind             { return "Sign is behind you — turn around" }
        if left               { return "Sign is to your left" }
        if right              { return "Sign is to your right" }
        if distance < 0.5     { return "You're right next to it" }
        return "Keep walking forward"
    }
}

// MARK: - Empty states

private struct FoundUI: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .resizable().scaledToFit()
                .frame(width: 96, height: 96)
                .foregroundStyle(.green)
            Text("Sign found").font(.title2)
            Text("Place it back on the hanger when done.")
                .foregroundStyle(.secondary)
        }
    }
}

/// No tracker on this alert's hanger. Staff get a one-tap scan-to-assign so
/// the dead end fixes itself; cleaners are pointed at the floor plan.
private struct NoTagUI: View {
    let canAssign: Bool
    let onAssign: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
            Text("No tracker on this sign yet")
                .font(.headline)
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
                .font(.headline)
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
