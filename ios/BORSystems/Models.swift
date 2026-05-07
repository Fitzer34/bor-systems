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

struct ActiveAlert: Codable, Identifiable, Hashable {
    let id: String
    let hangerId: String
    let status: AlertStatus
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
