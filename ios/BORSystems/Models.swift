import Foundation

enum UserRole: String, Codable {
    case admin, supervisor, cleaner
}

struct CurrentUser: Codable, Equatable {
    let id: String
    let email: String
    let name: String
    let role: UserRole
    let onDuty: Bool
    let locale: String?
}

struct LoginResponse: Codable {
    let token: String
    let user: CurrentUser
}

enum AlertStatus: String, Codable {
    case open, acknowledged, closed
}

enum AlertKind: String, Codable {
    case spill, plannedCleaning = "planned_cleaning"
}

struct ActiveAlert: Codable, Identifiable, Hashable {
    let id: String
    let hangerId: String
    let status: AlertStatus
    /// `spill` = sign was lifted unexpectedly (shows in the alert list).
    /// `plannedCleaning` = cleaner pre-pressed the button to flag planned
    /// work (shows only as a blue pin on the floor plan; hidden from list).
    /// Defaults to .spill so existing payloads without the field decode cleanly.
    var kind: AlertKind = .spill
    let openedAt: Date
    let acknowledgedAt: Date?
    let acknowledgedBy: String?
    let zoneId: String?
    let zoneName: String?
    let floorId: String?
    let floorName: String?
}

enum DispatchStatus: String, Codable {
    case sent, acknowledged, completed
}

struct DispatchItem: Codable, Identifiable, Hashable {
    let id: String
    let recipientUserId: String
    let zoneId: String?
    let zoneName: String?
    let floorId: String?
    let message: String
    let status: DispatchStatus
    let sentAt: Date
    let acknowledgedAt: Date?
    let completedAt: Date?
}

enum CloseReason: String, Codable {
    case signDamaged = "sign_damaged"
    case signMissing = "sign_missing"
    case manual
}

struct OkResponse: Codable { let ok: Bool }
struct AlertsResponse: Codable { let alerts: [ActiveAlert] }
struct DispatchesResponse: Codable { let dispatches: [DispatchItem] }

struct Building: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}
struct BuildingsResponse: Codable { let buildings: [Building] }

struct Floor: Codable, Identifiable, Hashable {
    let id: String
    let buildingId: String
    let name: String
    let orderIndex: Int
    let floorPlanUrl: String?
}
struct FloorsResponse: Codable { let floors: [Floor] }
struct FloorResponse: Codable { let floor: Floor }

struct Zone: Codable, Identifiable, Hashable {
    let id: String
    let floorId: String
    let name: String
    let pinX: Int?
    let pinY: Int?
}
struct ZonesResponse: Codable { let zones: [Zone] }

struct UserRow: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let email: String
    let role: UserRole
    let onDuty: Bool
    let deactivatedAt: Date?
}
struct UsersResponse: Codable { let users: [UserRow] }

enum HangerStatus: String, Codable {
    case active, outOfService = "out_of_service", decommissioned
}

struct Hanger: Codable, Identifiable, Hashable {
    let id: String
    let devEui: String
    let zoneId: String?
    let status: HangerStatus
    let audibleAlarmEnabled: Bool
    let batteryPct: Int?
    let firmwareVersion: String?
    let lastSeenAt: Date?
}
struct HangersResponse: Codable { let hangers: [Hanger] }

struct Shift: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let userName: String?
    let startsAt: Date
    let endsAt: Date
    let buildingId: String?
    let buildingName: String?
    let floorId: String?
    let floorName: String?
    let zoneId: String?
    let zoneName: String?
    let notes: String?
}
struct ShiftsResponse: Codable { let shifts: [Shift] }

struct AppSettings: Codable {
    let resolutionMinutes: Int
    let ackMinutes: Int
    let lowBatteryThreshold: Int
    let defaultAudibleAlarm: Bool
    let expectedCleaningMinutes: Int
}

struct Spill: Codable, Identifiable, Hashable {
    let alertId: String
    let openedAt: Date
    let acknowledgedAt: Date?
    let closedAt: Date?
    let closureReason: String?
    let zoneName: String?
    let floorName: String?
    let buildingName: String?
    let responseSeconds: Double?
    let resolutionSeconds: Double?
    var id: String { alertId }
}
struct SpillsResponse: Codable {
    let from: Date
    let to: Date
    let count: Int
    let spills: [Spill]
}

struct AuditEntry: Codable, Identifiable, Hashable {
    let id: String
    let actorUserId: String?
    let actorName: String?
    let actorEmail: String?
    let action: String
    let targetType: String?
    let targetId: String?
    let at: Date
}
struct AuditResponse: Codable { let entries: [AuditEntry] }

struct NotificationEntry: Codable, Identifiable, Hashable {
    let id: String
    let alertId: String?
    let userId: String?
    let recipientName: String?
    let recipientEmail: String?
    let channel: String
    let kind: String
    let sentAt: Date
    let delivered: Bool?
    let error: String?
}
struct NotificationsResponse: Codable { let entries: [NotificationEntry] }
