import Foundation

enum APIError: Error, LocalizedError {
    case unauthorized
    case http(status: Int, body: String)
    case decode(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Not signed in."
        case .http(let s, _): return "Server error \(s)."
        case .decode(let e): return "Bad response: \(e.localizedDescription)"
        case .transport(let e): return e.localizedDescription
        }
    }
}

@MainActor
final class APIClient {
    static let shared = APIClient()
    private init() {}

    private static let tokenKey = "auth_token"

    var token: String? {
        get { Keychain.get(Self.tokenKey) }
        set {
            if let v = newValue { Keychain.set(v, for: Self.tokenKey) }
            else { Keychain.remove(Self.tokenKey) }
        }
    }

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        // Backend emits ISO 8601 with fractional seconds, e.g. "2026-05-07T00:08:02.013Z"
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            return formatter.date(from: s) ?? fallback.date(from: s) ?? Date()
        }
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil
    ) async throws -> T {
        var req = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent(path))
        req.httpMethod = method
        if let token = token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body = body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(URLError(.badServerResponse))
        }
        if http.statusCode == 401 {
            self.token = nil
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decode(error)
        }
    }
}

struct EmptyResponse: Decodable { init() {} }

/// Erased Encodable so APIClient.request() can take any Encodable body.
private struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { self._encode = wrapped.encode }
    func encode(to encoder: Encoder) throws { try _encode(encoder) }
}

// MARK: - API endpoints

extension APIClient {
    struct LoginBody: Encodable { let email: String; let password: String }
    struct DutyBody: Encodable { let onDuty: Bool }
    struct CloseBody: Encodable { let reason: String; let note: String? }
    struct PushTokenBody: Encodable { let pushToken: String }

    func login(email: String, password: String) async throws -> LoginResponse {
        try await request("/auth/login", method: "POST", body: LoginBody(email: email, password: password))
    }
    func currentUser() async throws -> CurrentUser {
        try await request("/users/me")
    }
    func setOnDuty(_ onDuty: Bool) async throws {
        let _: EmptyResponse = try await request("/auth/duty", method: "POST", body: DutyBody(onDuty: onDuty))
    }
    func registerPushToken(_ token: String) async throws {
        let _: EmptyResponse = try await request("/users/me/push-token", method: "POST", body: PushTokenBody(pushToken: token))
    }

    func activeAlerts() async throws -> [ActiveAlert] {
        let res: AlertsResponse = try await request("/alerts/active")
        return res.alerts
    }
    func acknowledgeAlert(_ id: String) async throws {
        let _: EmptyResponse = try await request("/alerts/\(id)/acknowledge", method: "POST")
    }
    func closeAlert(_ id: String, reason: CloseReason, note: String?) async throws {
        let _: EmptyResponse = try await request("/alerts/\(id)/close", method: "POST", body: CloseBody(reason: reason.rawValue, note: note))
    }

    func dispatches() async throws -> [DispatchItem] {
        let res: DispatchesResponse = try await request("/dispatches")
        return res.dispatches
    }
    func acknowledgeDispatch(_ id: String) async throws {
        let _: EmptyResponse = try await request("/dispatches/\(id)/acknowledge", method: "POST")
    }
    func completeDispatch(_ id: String) async throws {
        let _: EmptyResponse = try await request("/dispatches/\(id)/complete", method: "POST")
    }
}
