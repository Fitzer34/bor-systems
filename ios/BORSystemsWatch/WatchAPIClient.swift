import Foundation

/// Minimal API client for the watch. Same backend, much smaller surface —
/// only the endpoints the watch actually needs.
@MainActor
final class WatchAPIClient {
    static let shared = WatchAPIClient()

    private var token: String?    { WatchAuthStore.shared.token }
    private var apiBase: String   { WatchAuthStore.shared.apiBase }

    struct Alert: Codable, Identifiable, Hashable {
        let id: String
        let zoneName: String?
        let floorName: String?
        let buildingName: String?
        let openedAt: String
        let acknowledgedAt: String?
        let closedAt: String?
    }

    // MARK: - Active alerts

    func fetchActiveAlerts() async throws -> [Alert] {
        try await get("/alerts/active", as: [Alert].self)
    }

    // MARK: - Actions

    func acknowledgeAlert(_ id: String) async throws {
        try await post("/alerts/\(id)/acknowledge")
    }

    // MARK: - HTTP helpers

    private func get<T: Decodable>(_ path: String, as: T.Type) async throws -> T {
        let (data, _) = try await send(path: path, method: "GET", body: nil)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post(_ path: String) async throws {
        _ = try await send(path: path, method: "POST", body: nil)
    }

    private func send(path: String, method: String, body: Data?)
        async throws -> (Data, URLResponse)
    {
        guard let url = URL(string: apiBase + path) else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let t = token {
            req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        req.timeoutInterval = 15
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, http.statusCode >= 400 {
            throw URLError(.init(rawValue: http.statusCode))
        }
        return (data, resp)
    }
}
