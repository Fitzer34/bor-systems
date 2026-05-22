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
    val zoneId: String? = null,
    val status: HangerStatus,
    val audibleAlarmEnabled: Boolean = false,
    val batteryPct: Int? = null,
    val firmwareVersion: Int? = null,
    val lastSeenAt: String? = null,
)

@Serializable
data class HangersResponse(val hangers: List<Hanger>)

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
