import Foundation

enum AppConfig {
    /// Backend URL.
    ///
    /// Defaults to the live production backend so the app works on any device
    /// out of the box.
    ///
    /// To develop against your local Mac instead, comment out the production
    /// line and uncomment the local one (use your Mac's LAN IP for real
    /// devices, `http://localhost:3000` for the simulator).
    static let apiBaseURL = URL(string: "https://bor-systems-backend.onrender.com")!

    // Local dev examples:
    // static let apiBaseURL = URL(string: "http://localhost:3000")!
    // static let apiBaseURL = URL(string: "http://192.168.0.114:3000")!

    // MARK: - App Store reviewer demo mode
    //
    // Shows a "Use demo account" button on the login screen that pre-fills
    // the seeded reviewer credentials. We want this in DEBUG and TestFlight,
    // and the same credentials are pasted into App Store Connect's "Sign-In
    // Required" field for reviewers — so leaving it visible in production
    // too is harmless. If you'd rather hide it in App Store builds, flip
    // `demoModeEnabled` to use `#if DEBUG` instead.
    static let demoModeEnabled = true
    static let demoEmail = "reviewer@bor-systems.demo"
    static let demoPassword = "BorReview2026!Demo"
}
