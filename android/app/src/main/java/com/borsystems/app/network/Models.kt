package com.borsystems.app.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire models — mirror ios/BORSystems/Models.swift exactly.
 *
 * Field names match the backend JSON. Use @SerialName when the Kotlin
 * convention (camelCase) diverges from the JSON convention.
 *
 * All models are @Serializable so kotlinx.serialization can decode them
 * via the JSON instance configured in ApiClient.
 */

@Serializable
enum class UserRole { admin, supervisor, cleaner }

@Serializable
data class CurrentUser(
    val id: String,
    val email: String,
    val name: String,
    val role: UserRole,
    val onDuty: Boolean,
    val locale: String? = null,
    val organisationName: String? = null,
    // New /users/me fields (decoder ignores any not yet sent by an older backend).
    val phoneE164: String? = null,
    val avatarUrl: String? = null,
    val lastActiveAt: String? = null,
    val createdAt: String? = null,
    /**
     * Effective module-visibility + sensitive-action permissions for this user's
     * role (defaults merged with any org override; admin = every key true). Keys
     * are `module.*` / `action.*` — see [com.borsystems.app.auth.Capabilities].
     * Empty when an older backend hasn't sent it; the capability layer then
     * falls back to a role baseline.
     */
    val permissions: Map<String, Boolean> = emptyMap(),
)

@Serializable
data class LoginResponse(
    val token: String,
    val user: CurrentUser,
)

@Serializable
enum class AlertStatus { open, acknowledged, closed }

/**
 * `spill` = sign was lifted unexpectedly (shows in the alert list).
 * `planned_cleaning` = cleaner pre-pressed the button to flag planned work
 * (shows only as a blue pin on the floor plan; hidden from list).
 */
@Serializable
enum class AlertKind {
    @SerialName("spill") spill,
    @SerialName("planned_cleaning") plannedCleaning,
}

@Serializable
data class ActiveAlert(
    val id: String,
    val hangerId: String,
    val status: AlertStatus,
    val kind: AlertKind = AlertKind.spill,
    val openedAt: String,
    val acknowledgedAt: String? = null,
    val acknowledgedBy: String? = null,
    val zoneId: String? = null,
    val zoneName: String? = null,
    val floorId: String? = null,
    val floorName: String? = null,
)

@Serializable
data class AlertsResponse(val alerts: List<ActiveAlert>)

@Serializable
enum class DispatchStatus { sent, acknowledged, completed }

@Serializable
data class DispatchItem(
    val id: String,
    val recipientUserId: String,
    val zoneId: String? = null,
    val zoneName: String? = null,
    val floorId: String? = null,
    val message: String,
    val status: DispatchStatus,
    val sentAt: String,
    val acknowledgedAt: String? = null,
    val completedAt: String? = null,
)

@Serializable
data class DispatchesResponse(val dispatches: List<DispatchItem>)

@Serializable
enum class CloseReason {
    @SerialName("sign_damaged") signDamaged,
    @SerialName("sign_missing") signMissing,
    manual,
}

// ─── Hangers ─────────────────────────────────────────────────────────────

@Serializable
enum class HangerStatus { active, out_of_service, decommissioned }

@Serializable
data class Hanger(
    val id: String,
    val devEui: String,
    val name: String? = null,
    val zoneId: String? = null,
    val status: HangerStatus,
    val audibleAlarmEnabled: Boolean = false,
    val batteryPct: Int? = null,
    val firmwareVersion: Int? = null,
    val lastSeenAt: String? = null,
    // Floor-plan / sensor-detail fields (GET /hangers now includes these).
    val lastLiftedAt: String? = null,
    val signal: Int? = null,
    val rssi: Int? = null,
    val reportsViaGatewayId: String? = null,
    val reportsViaGatewayName: String? = null,
)

@Serializable
data class HangersResponse(val hangers: List<Hanger>)

/**
 * A LoRa gateway (mains/Wi-Fi powered repeater). Has no floor coordinates, so on
 * the floor plan it appears in the side list + legend count only — never a pin.
 */
@Serializable
data class Gateway(
    val id: String,
    val name: String? = null,
    val buildingId: String? = null,
    val rssi: Int? = null,
    val lastSeenAt: String? = null,
)

@Serializable
data class GatewaysResponse(val gateways: List<Gateway>)

// ─── Buildings / Floors / Zones ──────────────────────────────────────────

@Serializable
data class Building(
    val id: String,
    val name: String,
    val orderIndex: Int = 0,
)

@Serializable
data class BuildingsResponse(val buildings: List<Building>)

@Serializable
data class Floor(
    val id: String,
    val buildingId: String,
    val name: String,
    val floorPlanUrl: String? = null,
    val orderIndex: Int = 0,
)

@Serializable
data class FloorsResponse(val floors: List<Floor>)

@Serializable
data class Zone(
    val id: String,
    val floorId: String,
    val name: String,
    val polygon: String? = null,
    // Pin position on the floor-plan image, 0–1000 in each axis (null = unplaced).
    val pinX: Int? = null,
    val pinY: Int? = null,
)

@Serializable
data class ZonesResponse(val zones: List<Zone>)

// ─── Schedule / Shifts ───────────────────────────────────────────────────

@Serializable
data class Shift(
    val id: String,
    val userId: String,
    val startsAt: String,
    val endsAt: String,
    val userName: String? = null,
)

@Serializable
data class ShiftsResponse(val shifts: List<Shift>)

// ─── Settings ────────────────────────────────────────────────────────────

// ─── Reports / audit log ─────────────────────────────────────────────────

@Serializable
data class Spill(
    val alertId: String,
    val openedAt: String,
    val acknowledgedAt: String? = null,
    val closedAt: String? = null,
    val closureReason: String? = null,
    val zoneName: String? = null,
    val floorName: String? = null,
    val buildingName: String? = null,
    val responseSeconds: Double? = null,
    val resolutionSeconds: Double? = null,
)

@Serializable
data class SpillsResponse(
    val from: String,
    val to: String,
    val count: Int,
    val spills: List<Spill>,
)

@Serializable
data class AuditEntry(
    val id: String,
    val at: String,
    val actorName: String? = null,
    val action: String,
    val targetType: String? = null,
    val targetId: String? = null,
)

@Serializable
data class AuditResponse(val entries: List<AuditEntry>)

@Serializable
data class AppSettings(
    val resolutionTimerMinutes: Int = 15,
    val acknowledgementTimerMinutes: Int = 5,
    val lowBatteryThreshold: Int = 20,
    val defaultAudibleAlarmEnabled: Boolean = false,
    val expectedCleaningTimeMinutes: Int = 10,
)

// ─── Users ───────────────────────────────────────────────────────────────

@Serializable
data class UserSummary(
    val id: String,
    val email: String,
    val name: String,
    val role: UserRole,
    val onDuty: Boolean,
    val deactivatedAt: String? = null,
    // Staff-invite state. Pending = invitedAt set, inviteAcceptedAt null.
    val invitedAt: String? = null,
    val inviteAcceptedAt: String? = null,
)

@Serializable
data class UsersResponse(val users: List<UserSummary>)

// ─── Sites overview (multi-building rollup) ──────────────────────────────

@Serializable
data class SiteSummary(
    val buildingId: String,
    val buildingName: String,
    val hangerCount: Int,
    val onlineCount: Int,
    val lowBatteryCount: Int,
    val openAlerts: Int,
    val thirtyDaySpills: Int,
    val avgResponseSeconds: Int? = null,
)

@Serializable
data class SitesSummaryResponse(val sites: List<SiteSummary>)

// ─── PPMs (planned preventive maintenance) ──────────────────────────

@Serializable
data class PPM(
    val id: String,
    val title: String,
    val notes: String? = null,
    val contractorName: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val frequencyPerYear: Int,
    val nextDueDate: String,             // "YYYY-MM-DD"
    val reminderLeadDays: Int = 14,
    val lastCompletedAt: String? = null, // ISO timestamp (display only)
    val active: Boolean = true,
)

@Serializable
data class PPMsResponse(val ppms: List<PPM>)

/** Create/update payload for a PPM (sent as the request body). */
@Serializable
data class PpmInput(
    val title: String,
    val notes: String? = null,
    val contractorName: String? = null,
    val contactPhone: String? = null,
    val contactEmail: String? = null,
    val frequencyPerYear: Int,
    val nextDueDate: String,
    val reminderLeadDays: Int,
    val active: Boolean,
)

// ─── Maintenance jobs (CMMS work orders) ─────────────────────────────
// Mirror ios/BORSystems/Models.swift. `status`/`priority` are plain Strings
// (not enums) so a new backend status never crashes decoding. The backend
// returns the full job row + a quotes array we don't need here — ignored
// via ignoreUnknownKeys.

@Serializable
data class MaintenanceJob(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: String,
    val priority: String = "routine",
    val awardReason: String? = null,
    val scheduledStartAt: String? = null,
    val completedAt: String? = null,
    val completionNote: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class MaintenanceJobsResponse(val jobs: List<MaintenanceJob>)

/** A predictive-maintenance usage meter on an asset (server computes status). */
@Serializable
data class Meter(
    val id: String,
    val name: String,
    val unit: String? = null,
    val assetName: String? = null,
    val currentValue: Int,
    val intervalValue: Int? = null,
    val remaining: Int? = null,
    val pct: Int? = null,
    val status: String,   // due | due_soon | ok | tracking
)

@Serializable
data class MetersResponse(val meters: List<Meter>)

/** A staff certification / qualification with expiry (workforce competency). */
@Serializable
data class StaffCertification(
    val id: String,
    val name: String,
    val issuer: String? = null,
    val userName: String? = null,
    val userRole: String? = null,
    val expiresOn: String? = null,
    val status: String,   // valid | expiring | expired
    val daysToExpiry: Int? = null,
)

@Serializable
data class CertificationsResponse(val certifications: List<StaffCertification>)

/** Maintenance KPI scorecard (all computed server-side). */
@Serializable
data class MaintBadActor(
    val assetId: String,
    val name: String,
    val criticality: String,
    val reactiveJobs: Int,
    val spendCents: Int,
)

@Serializable
data class MaintKpis(
    val pmCompliancePct: Int? = null,
    val mttrDays: Double? = null,
    val mtbfDays: Int? = null,
    val openBacklog: Int,
    val backlogOldestDays: Int,
    val completedThisMonth: Int,
    val plannedSharePct: Int? = null,
    val spend90Cents: Int,
    val assetsPastLife: Int,
    val badActors: List<MaintBadActor> = emptyList(),
)

@Serializable
data class JobEvent(
    val id: String,
    val type: String,
    val detail: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class JobDetailResponse(
    val job: MaintenanceJob,
    val events: List<JobEvent> = emptyList(),
)

// ─── Notifications centre ────────────────────────────────────────────────
// Mirror the web lib/notifications.tsx shapes. One feed row exactly as the
// backend user_notifications table stores it; everything beyond id/type/title
// degrades gracefully.

@Serializable
data class NotificationItem(
    val id: String,
    val type: String,          // event type, e.g. "spill.open", "wo.overdue"
    val title: String,
    val body: String,
    val entityType: String? = null, // "alert" | "job" | "ppm" | "part" | …
    val entityId: String? = null,
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable
data class NotificationsResponse(val notifications: List<NotificationItem>)

@Serializable
data class UnreadCountResponse(val count: Int)

/** Per-event-type delivery channel choices (in-app is always on server-side). */
@Serializable
data class ChannelPrefs(
    val inApp: Boolean = true,
    val email: Boolean = false,
    val sms: Boolean = false,
)

@Serializable
data class NotificationPrefsResponse(val preferences: Map<String, ChannelPrefs>)

// ─── Two-factor auth ─────────────────────────────────────────────────────
// Mirror backend routes/two-factor.ts response shapes.

@Serializable
data class TwoFactorStatus(
    val enrolled: Boolean,
    val enrolledAt: String? = null,
    val required: Boolean = false,
)

@Serializable
data class TwoFactorEnrol(
    val secret: String,
    val otpauth: String,
    val qrDataUrl: String,
)

@Serializable
data class TwoFactorConfirm(
    val ok: Boolean = true,
    val recoveryCodes: List<String> = emptyList(),
)
