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
        // Backend emits ISO 8601 with fractional seconds, e.g. "2026-05-07T00:08:02.013Z".
        // ISO8601DateFormatter is thread-safe but not formally Sendable, so we
        // create instances inside the decode closure rather than capturing them.
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: s) { return date }
            let fallback = ISO8601DateFormatter()
            fallback.formatOptions = [.withInternetDateTime]
            return fallback.date(from: s) ?? Date()
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
        // Don't use URL.appendingPathComponent — it URL-encodes "?" and "&",
        // breaking any endpoint that takes a query string (e.g. /reports/spills,
        // /admin/audit-log?limit=…). Build the full URL string by hand so the
        // query stays intact.
        let base = AppConfig.apiBaseURL.absoluteString.trimmingCharacters(in: ["/"])
        let suffix = path.hasPrefix("/") ? path : "/\(path)"
        guard let url = URL(string: base + suffix) else {
            throw APIError.transport(URLError(.badURL))
        }
        var req = URLRequest(url: url)
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
        // Sliding session: backend ships a refreshed token in this header
        // when ours is more than a day old. Swap it in silently so the
        // user never has to log in again as long as they keep using the app.
        if let refreshed = http.value(forHTTPHeaderField: "X-Refreshed-Token"),
           !refreshed.isEmpty {
            self.token = refreshed
        }
        if http.statusCode == 401 {
            // DO NOT auto-clear the Keychain token here. A single transient
            // 401 (server cold-start race, deploy rollover, brief network
            // blip) used to nuke the session and throw the user back to the
            // login screen mid-use. The token is only cleared in the
            // explicit `bootstrap()` path on app launch or when the user
            // logs out manually.
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

    // MARK: Sign-tag (UWB precision finding)

    /// Look up the UWB tag paired to a specific alert's hanger. Returns
    /// the BLE UUID + UWB MAC the iOS NearbyInteraction session needs to
    /// connect to. Throws on no-paired-tag (404) → caller should fall
    /// back to the floor-plan view.
    struct SignTagInfo: Decodable {
        let tagId: String
        let bleUuid: String
        let uwbAddress: String
        let batteryPct: Int?
    }
    func fetchSignTagForAlert(alertId: String) async throws -> SignTagInfo {
        try await request("/sign-tags/for-alert/\(alertId)")
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

    // MARK: Buildings / floors / zones

    func buildings() async throws -> [Building] {
        let res: BuildingsResponse = try await request("/buildings")
        return res.buildings
    }
    func floors(buildingId: String) async throws -> [Floor] {
        let res: FloorsResponse = try await request("/buildings/\(buildingId)/floors")
        return res.floors
    }
    func floor(_ id: String) async throws -> Floor {
        let res: FloorResponse = try await request("/floors/\(id)")
        return res.floor
    }
    func zones(floorId: String) async throws -> [Zone] {
        let res: ZonesResponse = try await request("/floors/\(floorId)/zones")
        return res.zones
    }

    // ─── Inline create (used by the Add-Hanger location picker so the
    //     customer can spin up a building/floor/zone without leaving the
    //     onboarding wizard).
    struct CreateNameBody: Encodable { let name: String }
    struct CreateFloorBody: Encodable { let name: String; let orderIndex: Int }

    struct CreateBuildingResponse: Decodable { let building: Building }
    struct CreateFloorResponse: Decodable { let floor: Floor }
    struct CreateZoneResponse: Decodable { let zone: Zone }

    func createBuilding(name: String) async throws -> Building {
        let res: CreateBuildingResponse = try await request(
            "/buildings", method: "POST", body: CreateNameBody(name: name)
        )
        return res.building
    }
    func createFloor(buildingId: String, name: String, orderIndex: Int) async throws -> Floor {
        let res: CreateFloorResponse = try await request(
            "/buildings/\(buildingId)/floors", method: "POST",
            body: CreateFloorBody(name: name, orderIndex: orderIndex)
        )
        return res.floor
    }
    func createZone(floorId: String, name: String) async throws -> Zone {
        let res: CreateZoneResponse = try await request(
            "/floors/\(floorId)/zones", method: "POST", body: CreateNameBody(name: name)
        )
        return res.zone
    }

    // MARK: Users / dispatch sending (admin/supervisor)

    func users() async throws -> [UserRow] {
        let res: UsersResponse = try await request("/users")
        return res.users
    }
    struct SendDispatchBody: Encodable {
        let recipientUserId: String
        let zoneId: String?
        let message: String
        let alsoSms: Bool
    }
    func sendDispatch(to recipientId: String, zoneId: String?, message: String, alsoSms: Bool) async throws {
        let body = SendDispatchBody(recipientUserId: recipientId, zoneId: zoneId, message: message, alsoSms: alsoSms)
        let _: EmptyResponse = try await request("/dispatches", method: "POST", body: body)
    }

    // MARK: Profile self-service

    struct UpdateProfileBody: Encodable {
        let name: String?
        let phoneE164: String?
    }
    struct ChangePasswordBody: Encodable {
        let currentPassword: String
        let newPassword: String
    }
    func updateProfile(name: String?, phoneE164: String?) async throws {
        let _: EmptyResponse = try await request("/users/me", method: "PATCH",
            body: UpdateProfileBody(name: name, phoneE164: phoneE164))
    }
    func changePassword(currentPassword: String, newPassword: String) async throws {
        let _: EmptyResponse = try await request("/users/me/password", method: "POST",
            body: ChangePasswordBody(currentPassword: currentPassword, newPassword: newPassword))
    }

    // MARK: Hangers (admin/supervisor)

    func hangers() async throws -> [Hanger] {
        let res: HangersResponse = try await request("/hangers")
        return res.hangers
    }
    struct RegisterHangerBody: Encodable {
        let devEui: String
        let zoneId: String?
        let audibleAlarmEnabled: Bool
    }
    func registerHanger(devEui: String, zoneId: String?, audibleAlarmEnabled: Bool) async throws {
        let _: EmptyResponse = try await request("/hangers/register", method: "POST",
            body: RegisterHangerBody(devEui: devEui, zoneId: zoneId, audibleAlarmEnabled: audibleAlarmEnabled))
    }
    struct RelocateBody: Encodable { let zoneId: String }
    func relocateHanger(_ id: String, toZoneId zoneId: String) async throws {
        let _: EmptyResponse = try await request("/hangers/\(id)/relocate", method: "POST", body: RelocateBody(zoneId: zoneId))
    }
    func decommissionHanger(_ id: String) async throws {
        let _: EmptyResponse = try await request("/hangers/\(id)/decommission", method: "POST")
    }
    func recommissionHanger(_ id: String) async throws {
        let _: EmptyResponse = try await request("/hangers/\(id)/recommission", method: "POST")
    }

    // MARK: Gateways (admin/supervisor)

    func gateways() async throws -> [Gateway] {
        let res: GatewaysResponse = try await request("/gateways")
        return res.gateways
    }
    struct RenameGatewayBody: Encodable {
        let name: String?
        let buildingId: String?
    }
    func renameGateway(_ id: String, name: String? = nil, buildingId: String? = nil) async throws {
        let _: EmptyResponse = try await request("/gateways/\(id)", method: "PATCH",
            body: RenameGatewayBody(name: name, buildingId: buildingId))
    }
    func deleteGateway(_ id: String) async throws {
        let _: EmptyResponse = try await request("/gateways/\(id)", method: "DELETE")
    }

    // MARK: Users management (admin)

    struct CreateUserBody: Encodable {
        let email: String
        let name: String
        let password: String
        let role: String
        let phoneE164: String?
    }
    func createUser(email: String, name: String, password: String, role: UserRole, phoneE164: String?) async throws {
        let _: EmptyResponse = try await request("/users", method: "POST",
            body: CreateUserBody(email: email, name: name, password: password, role: role.rawValue, phoneE164: phoneE164))
    }
    func deactivateUser(_ id: String) async throws {
        let _: EmptyResponse = try await request("/users/\(id)/deactivate", method: "POST")
    }
    func eraseUser(_ id: String) async throws {
        let _: EmptyResponse = try await request("/users/\(id)", method: "DELETE")
    }

    // MARK: Schedule (shifts)

    func shifts() async throws -> [Shift] {
        let res: ShiftsResponse = try await request("/shifts")
        return res.shifts
    }
    struct CreateShiftBody: Encodable {
        let userId: String
        let startsAt: String
        let endsAt: String
        let buildingId: String?
        let floorId: String?
        let zoneId: String?
        let notes: String?
    }
    func createShift(userId: String, startsAt: Date, endsAt: Date,
                     buildingId: String?, floorId: String?, zoneId: String?, notes: String?) async throws {
        let iso = ISO8601DateFormatter()
        let _: EmptyResponse = try await request("/shifts", method: "POST",
            body: CreateShiftBody(
                userId: userId,
                startsAt: iso.string(from: startsAt),
                endsAt: iso.string(from: endsAt),
                buildingId: buildingId, floorId: floorId, zoneId: zoneId, notes: notes,
            ))
    }
    func deleteShift(_ id: String) async throws {
        let _: EmptyResponse = try await request("/shifts/\(id)", method: "DELETE")
    }
    struct UpdateShiftBody: Encodable {
        let userId: String?
        let startsAt: String?
        let endsAt: String?
        let buildingId: String?
        let floorId: String?
        let zoneId: String?
        let notes: String?
    }
    func updateShift(_ id: String, userId: String?, startsAt: Date?, endsAt: Date?,
                     buildingId: String?, floorId: String?, zoneId: String?, notes: String?) async throws {
        let iso = ISO8601DateFormatter()
        let _: EmptyResponse = try await request("/shifts/\(id)", method: "PATCH",
            body: UpdateShiftBody(
                userId: userId,
                startsAt: startsAt.map { iso.string(from: $0) },
                endsAt: endsAt.map { iso.string(from: $0) },
                buildingId: buildingId, floorId: floorId, zoneId: zoneId, notes: notes,
            ))
    }

    // MARK: Settings

    func appSettings() async throws -> AppSettings {
        try await request("/settings")
    }
    struct PutMinutesBody: Encodable { let minutes: Int }
    struct PutPctBody: Encodable { let pct: Int }
    struct PutBoolBody: Encodable { let enabled: Bool }
    func setAckTimer(minutes: Int) async throws {
        let _: EmptyResponse = try await request("/settings/ack-timer", method: "PUT", body: PutMinutesBody(minutes: minutes))
    }
    func setResolutionTimer(minutes: Int) async throws {
        let _: EmptyResponse = try await request("/settings/resolution-timer", method: "PUT", body: PutMinutesBody(minutes: minutes))
    }
    func setLowBatteryThreshold(pct: Int) async throws {
        let _: EmptyResponse = try await request("/settings/low-battery-threshold", method: "PUT", body: PutPctBody(pct: pct))
    }
    func setDefaultAudibleAlarm(enabled: Bool) async throws {
        let _: EmptyResponse = try await request("/settings/default-audible-alarm", method: "PUT", body: PutBoolBody(enabled: enabled))
    }
    func setExpectedCleaningTime(minutes: Int) async throws {
        let _: EmptyResponse = try await request("/settings/expected-cleaning-time", method: "PUT", body: PutMinutesBody(minutes: minutes))
    }

    // MARK: Reports + admin logs

    func spillsReport(from: Date, to: Date) async throws -> SpillsResponse {
        let iso = ISO8601DateFormatter()
        let qs = "?from=\(iso.string(from: from))&to=\(iso.string(from: to))"
        return try await request("/reports/spills\(qs)")
    }
    func auditLog(limit: Int = 200) async throws -> [AuditEntry] {
        let res: AuditResponse = try await request("/admin/audit-log?limit=\(limit)")
        return res.entries
    }
    func notificationsLog(limit: Int = 300) async throws -> [NotificationEntry] {
        let res: NotificationsResponse = try await request("/admin/notifications-log?limit=\(limit)")
        return res.entries
    }
}
