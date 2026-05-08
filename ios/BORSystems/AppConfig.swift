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
}
