import SwiftUI
import ARKit
import RealityKit

/// A tiny, effectively-invisible ARView that runs a gravity-aligned world-
/// tracking session and hands it to `SignFinder` for camera-assisted DIRECTION
/// (the find-sign arrow on iPhone 14+).
///
/// Why a real view and not a bare `ARSession()`: Nearby Interaction rejects a
/// bare session with `invalidARConfiguration` — it needs a genuine, view-backed
/// AR session. This mirrors Qorvo's reference app (a hidden `ARView`), which is
/// the configuration that actually produces the arrow on this exact phone +
/// firmware. No camera preview is shown to the user; the view is 1pt.
struct CameraAssistARView: UIViewRepresentable {
    /// Called once with the running session so the finder can `setARSession`.
    let onSession: (ARSession) -> Void

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravity
        config.isCollaborationEnabled = false
        config.userFaceTrackingEnabled = false
        view.session.run(config)
        onSession(view.session)
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}
