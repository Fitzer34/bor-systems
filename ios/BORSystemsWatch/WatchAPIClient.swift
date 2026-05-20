import Foundation

/// Minimal API client for the watch. Same backend as the iPhone app, just
/// fewer endpoints — only the ones the watch actually needs.
@MainActor
final class WatchAPIClient {
    static let shared = WatchAPIClient()

    private var token: String?    { WatchAuthStore.shared.token }
    private var apiBase: String   { WatchAuthStore.shared.apiBase }

    /// Shape MUST match what backend/src/routes/alerts.ts returns for
    /// `/alerts/active`. Only fields we actually render are declared —
    /// extras are ignored by JSONDecoder.
    struct Alert: Codable, Identifiable, Hashable {
        let id: String
        let kind: String?           // "spill" or "planned_cleaning"
        let status: String?         // "open" or "acknowledged"
        let zoneName: String?
        let floorName: String?
    }

    private struct AlertsResponse: Decodable {
        let alerts: [Alert]
    }

    private struct CloseBody: Encodable {
        let reason: String
        let note: String?
    }

    // MARK: - Active alerts

    func fetchActiveAlerts() async throws -> [Alert] {
        let res = try await get("/alerts/active", as: AlertsResponse.self)
        // Hide planned-cleaning sessions from the watch — they're not real
        // alerts the cleaner needs to react to. iOS + web do the same.
        return res.alerts.filter { ($0.kind ?? "spill") == "spill" }
    }

    // MARK: - Actions

    /// "I'm on it" — flips an open alert to acknowledged. After this, the
    /// "It's done" button appears so the cleaner can close it from the wrist.
    func acknowledgeAlert(_ id: String) async throws {
        try await postEmpty("/alerts/\(id)/acknowledge")
    }

    /// "It's done" — closes the alert. Uses reason="manual" because the
    /// watch UI doesn't have room for a reason picker; iOS/web still have
    /// the full picker if more detail is needed.
    func closeAlert(_ id: String) async throws {
        try await postJson("/alerts/\(id)/close",
                           body: CloseBody(reason: "manual", note: nil))
    }

    // MARK: - HTTP helpers

    private func get<T: Decodable>(_ path: String, as: T.Type) async throws -> T {
        let (data, _) = try await send(path: path, method: "GET", body: nil)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            // Surface the actual decode error rather than silently swallowing.
            throw WatchAPIError.decode(error, body: String(data: data, encoding: .utf8) ?? "")
        }
    }

    private func postEmpty(_ path: String) async throws {
        _ = try await send(path: path, method: "POST", body: nil)
    }

    private func postJson<B: Encodable>(_ path: String, body: B) async throws {
        let data = try JSONEncoder().encode(body)
        _ = try await send(path: path, method: "POST", body: data)
    }

    private func send(path: String, method: String, body: Data?)
        async throws -> (Data, URLResponse)
    {
        guard let url = URL(string: apiBase + path) else {
            throw WatchAPIError.badURL(apiBase + path)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let t = token, !t.isEmpty {
            req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
        } else {
            throw WatchAPIError.notSignedIn
        }
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        req.timeoutInterval = 15

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else {
            throw WatchAPIError.transport("no http response")
        }
        if http.statusCode == 401 {
            throw WatchAPIError.unauthorized
        }
        if http.statusCode >= 400 {
            throw WatchAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? "")
        }
        return (data, resp)
    }
}

/// Watch errors carry enough detail for the UI to show what's actually
/// broken (instead of the previous "errored, returned nothing" behaviour).
enum WatchAPIError: LocalizedError {
    case badURL(String)
    case notSignedIn
    case unauthorized
    case http(status: Int, body: String)
    case decode(Error, body: String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .badURL(let s):                 return "Bad URL: \(s)"
        case .notSignedIn:                   return "No auth token on watch yet — open the iPhone app."
        case .unauthorized:                  return "Signed out (401) — sign in again on iPhone."
        case .http(let s, let body):         return "HTTP \(s): \(body.prefix(80))"
        case .decode(let e, let body):       return "Bad response (\(e.localizedDescription)): \(body.prefix(80))"
        case .transport(let s):              return "Network: \(s)"
        }
    }
}
