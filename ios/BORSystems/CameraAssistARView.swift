import SwiftUI
import ARKit
import SceneKit

/// A near-invisible AR view that runs a world-tracking session and hands it to
/// `SignFinder` for camera-assisted DIRECTION (the find-sign arrow on iPhone 14+).
///
/// Why this exact shape:
///   • NI needs a *view-backed* session that **we** fully own. A bare
///     `ARSession()` and RealityKit `ARView`'s auto-managed session are both
///     rejected with `NIERROR_INVALID_AR_SESSION`.
///   • `ARSCNView` lets us assign our own `ARSession` and run a clean
///     `ARWorldTrackingConfiguration` (gravity-aligned, no extras), which is the
///     configuration NI accepts — this mirrors Qorvo's reference app.
/// No camera preview is shown to the user; the view renders at ~2% opacity.
struct CameraAssistARView: UIViewRepresentable {
    /// Called once with the running session so the finder can `setARSession`.
    let onSession: (ARSession) -> Void

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        let session = ARSession()
        view.session = session                 // we own the session, not SceneKit
        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravity
        config.isCollaborationEnabled = false
        config.userFaceTrackingEnabled = false
        session.run(config)
        onSession(session)
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {}
}
