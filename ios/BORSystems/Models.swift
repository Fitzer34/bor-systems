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
    /// Effective module-visibility + sensitive-action permissions for this
    /// user's role, computed server-side (defaults merged with any org
    /// override; admin = all true). Absent on older payloads / the 2FA-login
    /// response — `Capabilities` falls back to the role→capability map then.
    var permissions: [String: Bool]? = nil
    /// SMS-escalation number, profile fields and org/account metadata added by
    /// GET /users/me. All optional so the leaner login/2FA payloads still decode.
    var phoneE164: String? = nil
    var avatarUrl: String? = nil
    var organisationName: String? = nil
    var lastActiveAt: Date? = nil
    var createdAt: Date? = nil
}

struct LoginResponse: Codable {
    let token: String
    let user: CurrentUser
}

/// Planned Preventive Maintenance task. Dates are kept as plain strings —
/// `nextDueDate` is a date-only "YYYY-MM-DD" value the shared ISO8601 decoder
/// can't parse, so we format it ourselves for display.
struct PPM: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let notes: String?
    let contractorName: String?
    let contactPhone: String?
    let contactEmail: String?
    let frequencyPerYear: Int
    let nextDueDate: String        // "YYYY-MM-DD"
    let reminderLeadDays: Int
    let lastCompletedAt: String?   // ISO timestamp (display only)
    let active: Bool
}

struct PPMsResponse: Codable { let ppms: [PPM] }

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
    // Staff-invite state. Pending = invitedAt set, inviteAcceptedAt nil.
    var invitedAt: Date? = nil
    var inviteAcceptedAt: Date? = nil
}
struct UsersResponse: Codable { let users: [UserRow] }

enum HangerStatus: String, Codable {
    case active, outOfService = "out_of_service", decommissioned
}

/// The find-sign UWB tracker paired to a hanger (nil when none is assigned).
struct HangerTracker: Codable, Hashable {
    let id: String
    let bleUuid: String
    let batteryPct: Int?
    let lastSeenAt: Date?
}
struct Hanger: Codable, Identifiable, Hashable {
    let id: String
    let devEui: String
    /// Customer-set label. Falls back to DevEUI in the UI when null.
    let name: String?
    /// Free-form text about where exactly the hanger hangs within its zone.
    let locationNote: String?
    let zoneId: String?
    let status: HangerStatus
    let audibleAlarmEnabled: Bool
    let batteryPct: Int?
    let firmwareVersion: String?
    let lastSeenAt: Date?
    /// When the sign was last physically lifted off this hanger (spill event).
    /// Added by GET /hangers; nil if it's never been lifted.
    var lastLiftedAt: Date? = nil
    /// Best-available signal proxy: there's no per-hanger RSSI on a LoRa device,
    /// so the backend surfaces the reporting gateway's RSSI here (dBm), else nil.
    var signal: Int? = nil
    var rssi: Int? = nil
    /// The gateway whose packets this hanger flows through (resolved per
    /// building by the backend). nil when the hanger isn't located in a
    /// building that has a gateway.
    var reportsViaGatewayId: String? = nil
    var reportsViaGatewayName: String? = nil
    /// Paired find-sign tracker, if one is assigned.
    let tracker: HangerTracker?
}
struct HangersResponse: Codable { let hangers: [Hanger] }

/// One row per HazardLink gateway installed at a customer site. Returned
/// by GET /gateways. Self-registered by the firmware on boot — admins
/// don't type DevEUIs for gateways the way they do for hangers.
struct Gateway: Codable, Identifiable, Hashable {
    let id: String
    let devEui: String
    let name: String?
    let buildingId: String?
    /// Free-form note about where in the building the gateway lives.
    /// Used so a cleaner can find the device when it needs power-cycling.
    let locationNote: String?
    let ipAddress: String?
    let ssid: String?
    let rssi: Int?
    let firmwareVersion: String?
    let packetsForwarded: Int
    let uptimeSec: Int?
    let lastSeenAt: Date?
    let createdAt: Date
}
struct GatewaysResponse: Codable { let gateways: [Gateway] }

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

// MARK: - Notifications centre (per-user in-app feed)

/// One row in the signed-in user's notifications feed. Mirrors the
/// `user_notifications` table (GET /notifications). `entityType` / `entityId`
/// let the UI deep-link a tap through to the underlying alert / job / etc.
struct UserNotification: Codable, Identifiable, Hashable {
    let id: String
    let type: String          // event type, e.g. "spill.open", "wo.overdue"
    let title: String
    let body: String
    let entityType: String?   // "alert" | "job" | "ppm" | "part" | ...
    let entityId: String?
    let readAt: Date?
    let createdAt: Date

    var isUnread: Bool { readAt == nil }
}
struct UserNotificationsResponse: Codable { let notifications: [UserNotification] }
struct UnreadCountResponse: Codable { let count: Int }

/// Per-event-type delivery channel preferences (in-app / email / SMS).
/// in-app is always on server-side; the toggle is shown for completeness.
struct ChannelPrefs: Codable, Hashable {
    var inApp: Bool
    var email: Bool
    var sms: Bool
}
struct NotificationPrefsResponse: Codable { let preferences: [String: ChannelPrefs] }
struct UpdatePrefResponse: Codable { let eventType: String; let prefs: ChannelPrefs }

/// Status of the signed-in user's authenticator-app two-factor enrolment.
struct TwoFactorStatus: Codable {
    let enrolled: Bool
    let enrolledAt: Date?
    /// Org policy hint — admins are nudged to turn 2FA on.
    let required: Bool
}
struct TwoFactorEnrolResponse: Codable {
    let secret: String
    let otpauth: String
    /// data: URL PNG of the otpauth QR, ready to render in an AsyncImage / Image.
    let qrDataUrl: String
}
struct TwoFactorConfirmResponse: Codable {
    let ok: Bool
    /// One-time recovery codes — shown to the user exactly once.
    let recoveryCodes: [String]
}

// MARK: - Maintenance jobs (CMMS)

/// A maintenance work order. Mirrors the web Maintenance jobs board. Extra
/// server fields (org, building, quotes, etc.) are ignored by Codable.
struct MaintenanceJob: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let description: String?
    let status: String        // logged|scoped|tendering|awarded|scheduled|in_progress|completed|cancelled
    let priority: String      // routine|urgent|emergency
    let awardReason: String?
    let scheduledStartAt: String?  // ISO timestamp (display only)
    let completedAt: String?
    let completionNote: String?
    let createdAt: String?
}
struct MaintenanceJobsResponse: Codable { let jobs: [MaintenanceJob] }

/// A predictive-maintenance usage meter on an asset. The server computes the
/// status / remaining / pct fields from the reading vs the service interval.
struct Meter: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let unit: String?
    let assetName: String?
    let currentValue: Int
    let intervalValue: Int?
    let remaining: Int?
    let pct: Int?
    let status: String   // due | due_soon | ok | tracking
}
struct MetersResponse: Codable { let meters: [Meter] }

/// A staff certification / qualification with expiry (workforce competency).
struct StaffCertification: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let issuer: String?
    let userName: String?
    let userRole: String?
    let expiresOn: String?
    let status: String   // valid | expiring | expired
    let daysToExpiry: Int?
}
struct CertificationsResponse: Codable { let certifications: [StaffCertification] }

/// Maintenance KPI scorecard (read-only; all computed server-side).
struct MaintBadActor: Codable, Identifiable, Hashable {
    let assetId: String
    let name: String
    let criticality: String
    let reactiveJobs: Int
    let spendCents: Int
    var id: String { assetId }
}
struct MaintKpis: Codable {
    let pmCompliancePct: Int?
    let mttrDays: Double?
    let mtbfDays: Int?
    let openBacklog: Int
    let backlogOldestDays: Int
    let completedThisMonth: Int
    let plannedSharePct: Int?
    let spend90Cents: Int
    let assetsPastLife: Int
    let badActors: [MaintBadActor]
}

/// One line in a job's append-only timeline.
struct JobEvent: Codable, Identifiable, Hashable {
    let id: String
    let type: String          // logged|tendered|quoted|awarded|scheduled|started|completed|note…
    let detail: String?
    let createdAt: String?
}
struct JobDetailResponse: Codable {
    let job: MaintenanceJob
    let events: [JobEvent]
}
