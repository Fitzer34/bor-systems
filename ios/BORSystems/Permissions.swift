import Foundation

/// Honour the backend's permission model on the phone.
///
/// The web app gates nav sections and sensitive actions on a `permissions`
/// map the backend computes per (org, role): `module.*` keys decide which
/// sections of the app are visible, `action.*` keys decide which sensitive
/// operations a user may perform (see backend/services/permissions.ts).
///
/// `Capabilities` is the single source of truth the iOS UI asks before showing
/// a tab, a More-hub row, or an action button. It PREFERS the live backend map
/// when `GET /users/me` supplied one, and otherwise falls back to a role→
/// capability map that mirrors the server's `DEFAULT_PERMISSIONS` baseline so
/// the app still gates correctly against the leaner login / 2FA payloads (which
/// omit `permissions`).

// MARK: - Permission keys

/// The recognised permission keys, mirroring `PERMISSION_KEYS` on the backend.
/// Using an enum (rather than bare strings at call sites) keeps the gates
/// typo-proof and greppable.
enum Permission: String, CaseIterable {
    // module.* — which sections of the app nav a role can see.
    case moduleOperations  = "module.operations"
    case moduleMaintenance = "module.maintenance"
    case moduleCompliance  = "module.compliance"
    case moduleBusiness    = "module.business"
    case moduleInsights    = "module.insights"
    case moduleAdmin       = "module.admin"

    // action.* — sensitive actions a role may perform.
    case approvePermits    = "action.approve_permits"
    case approveQuotes     = "action.approve_quotes"
    case editCompliance    = "action.edit_compliance"
    case manageDevices     = "action.manage_devices"
    case manageAutomations = "action.manage_automations"
    case exportReports     = "action.export_reports"
    case manageUsers       = "action.manage_users"
    case manageBilling     = "action.manage_billing"
    case deleteRecords     = "action.delete_records"
}

// MARK: - Role baseline (fallback)

/// Per-role baselines, mirroring `DEFAULT_PERMISSIONS` on the backend. Used only
/// when the live `permissions` map is absent from the current user (older or
/// leaner payloads). When the backend map is present it always wins.
private let defaultPermissionsByRole: [UserRole: Set<Permission>] = [
    // admin — everything (also short-circuited as always-allowed below).
    .admin: Set(Permission.allCases),
    // supervisor — every module except admin; operational actions + exports,
    // but not the org-governance actions (users / billing / automations).
    .supervisor: [
        .moduleOperations, .moduleMaintenance, .moduleCompliance,
        .moduleBusiness, .moduleInsights,
        .approvePermits, .approveQuotes, .editCompliance,
        .manageDevices, .exportReports, .deleteRecords,
    ],
    // cleaner — "field staff": the operations section only, no sensitive actions.
    .cleaner: [
        .moduleOperations,
    ],
]

// MARK: - Capabilities

/// What the signed-in user is allowed to see and do. Build it from the current
/// user, then ask `can(_:)` at every gate.
struct Capabilities {
    let role: UserRole
    /// The live backend map keyed by raw permission string, if one was supplied.
    private let backend: [String: Bool]?

    init(user: CurrentUser?) {
        self.role = user?.role ?? .cleaner
        self.backend = user?.permissions
    }

    /// Whether the user holds a given permission. Admin is always allowed
    /// (matching the server, which never gates admin). Otherwise prefer the
    /// backend map; fall back to the role baseline when it's absent.
    func can(_ permission: Permission) -> Bool {
        if role == .admin { return true }
        if let backend, let value = backend[permission.rawValue] {
            return value
        }
        return defaultPermissionsByRole[role]?.contains(permission) ?? false
    }

    // MARK: Convenience gates used by the nav + screens

    /// Cleaning operations: live alerts, floor plans, dispatch, shifts.
    var canSeeOperations: Bool { can(.moduleOperations) }
    /// Work orders, meters, PPMs, contractors.
    var canSeeMaintenance: Bool { can(.moduleMaintenance) }
    /// SDS, certifications, inspections.
    var canSeeCompliance: Bool { can(.moduleCompliance) }
    /// Analytics, reports, dashboards.
    var canSeeInsights: Bool { can(.moduleInsights) }
    /// Settings, users, billing, devices, automations.
    var canSeeAdmin: Bool { can(.moduleAdmin) }

    /// Register / decommission hangers + gateways.
    var canManageDevices: Bool { can(.manageDevices) }
    /// Create / deactivate / delete staff.
    var canManageUsers: Bool { can(.manageUsers) }
    /// Download CSV / PDF exports.
    var canExportReports: Bool { can(.exportReports) }
    /// Hard-delete records.
    var canDeleteRecords: Bool { can(.deleteRecords) }

    /// Whether the user gets the org-wide dispatch SEND form (admins +
    /// supervisors) versus the read-only "dispatches sent to me" inbox.
    /// Maps to the operations module plus a coordinator role — cleaners
    /// only ever receive dispatches.
    var canSendDispatch: Bool {
        canSeeOperations && (role == .admin || role == .supervisor)
    }

    /// Whether to surface the management / insights / system hub on the More
    /// tab at all. Cleaners get a slimmed hub (profile + sign out only).
    var hasManagementHub: Bool {
        canSeeMaintenance || canSeeInsights || canSeeAdmin || canManageDevices
    }
}

extension AuthStore {
    /// Capabilities for the currently signed-in user. Recomputed each access so
    /// it always reflects the latest `user` snapshot.
    var capabilities: Capabilities { Capabilities(user: user) }
}
