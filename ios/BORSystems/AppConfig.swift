import Foundation

enum AppConfig {
    /// Backend URL.
    /// - Simulator can reach the host machine via http://localhost:3000.
    /// - Real device on the same WiFi: replace with the Mac's LAN IP, e.g. http://192.168.1.42:3000.
    /// - Production: change to https://api.bor-systems.example.com once deployed.
    static let apiBaseURL = URL(string: "http://192.168.0.114:3000")!
}
