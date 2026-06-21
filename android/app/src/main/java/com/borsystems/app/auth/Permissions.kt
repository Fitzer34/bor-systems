package com.borsystems.app.auth

import com.borsystems.app.network.CurrentUser
import com.borsystems.app.network.UserRole

/**
 * Capability layer — Android mirror of web `lib/permissions.tsx`.
 *
 * The signed-in user's *effective* permissions come from GET /users/me
 * (`permissions: Map<String, Boolean>` — module.* + action.* keys; admin has
 * every key true). [Capabilities.of] surfaces them through a `can(key)` helper
 * the nav, the More menu and in-screen actions all consume, so visibility logic
 * lives in one place.
 *
 * If an older backend session hasn't sent a permission map, we derive a safe
 * baseline from the user's role (the same DEFAULT_PERMISSIONS the server uses),
 * so nothing is accidentally hidden for admins.
 */

/** Module-visibility keys, mirrored from the backend catalogue. */
object Module {
    const val OPERATIONS = "module.operations"
    const val MAINTENANCE = "module.maintenance"
    const val COMPLIANCE = "module.compliance"
    const val BUSINESS = "module.business"
    const val INSIGHTS = "module.insights"
    const val ADMIN = "module.admin"
}

/** Sensitive-action keys, mirrored from the backend catalogue. */
object Action {
    const val APPROVE_PERMITS = "action.approve_permits"
    const val APPROVE_QUOTES = "action.approve_quotes"
    const val EDIT_COMPLIANCE = "action.edit_compliance"
    const val MANAGE_DEVICES = "action.manage_devices"
    const val MANAGE_AUTOMATIONS = "action.manage_automations"
    const val EXPORT_REPORTS = "action.export_reports"
    const val MANAGE_USERS = "action.manage_users"
    const val MANAGE_BILLING = "action.manage_billing"
    const val DELETE_RECORDS = "action.delete_records"
}

private val ALL_MODULES = listOf(
    Module.OPERATIONS, Module.MAINTENANCE, Module.COMPLIANCE,
    Module.BUSINESS, Module.INSIGHTS, Module.ADMIN,
)
private val ALL_ACTIONS = listOf(
    Action.APPROVE_PERMITS, Action.APPROVE_QUOTES, Action.EDIT_COMPLIANCE,
    Action.MANAGE_DEVICES, Action.MANAGE_AUTOMATIONS, Action.EXPORT_REPORTS,
    Action.MANAGE_USERS, Action.MANAGE_BILLING, Action.DELETE_RECORDS,
)
private val ALL_KEYS = ALL_MODULES + ALL_ACTIONS

private fun mapOfAll(value: Boolean): Map<String, Boolean> =
    ALL_KEYS.associateWith { value }

/**
 * Per-role default baselines — a client mirror of DEFAULT_PERMISSIONS on the
 * server. Only used to approximate what a role can see when the server hasn't
 * supplied a real map. The authoritative maps still come from /users/me.
 */
val DEFAULT_PERMISSIONS: Map<UserRole, Map<String, Boolean>> = mapOf(
    UserRole.admin to mapOfAll(true),
    UserRole.supervisor to (mapOfAll(false) + mapOf(
        Module.OPERATIONS to true,
        Module.MAINTENANCE to true,
        Module.COMPLIANCE to true,
        Module.BUSINESS to true,
        Module.INSIGHTS to true,
        Module.ADMIN to false,
        Action.APPROVE_PERMITS to true,
        Action.APPROVE_QUOTES to true,
        Action.EDIT_COMPLIANCE to true,
        Action.MANAGE_DEVICES to true,
        Action.MANAGE_AUTOMATIONS to false,
        Action.EXPORT_REPORTS to true,
        Action.MANAGE_USERS to false,
        Action.MANAGE_BILLING to false,
        Action.DELETE_RECORDS to true,
    )),
    UserRole.cleaner to (mapOfAll(false) + mapOf(
        Module.OPERATIONS to true,
    )),
)

/**
 * Resolved capabilities for one user. Build with [of]; query with [can].
 *
 * `can` honours the backend map when present. Admin is always allowed
 * (defensive — the server agrees), even if a key is somehow missing.
 */
class Capabilities private constructor(
    val role: UserRole,
    private val effective: Map<String, Boolean>,
) {
    fun can(key: String): Boolean {
        if (role == UserRole.admin) return true
        return effective[key] == true
    }

    /** True for admin or supervisor — the "staff" tier (vs field cleaners). */
    val isStaff: Boolean get() = role == UserRole.admin || role == UserRole.supervisor
    val isAdmin: Boolean get() = role == UserRole.admin

    companion object {
        /** Empty capabilities for a logged-out state — everything denied. */
        val NONE = Capabilities(UserRole.cleaner, emptyMap())

        fun of(user: CurrentUser?): Capabilities {
            if (user == null) return NONE
            val effective = if (user.permissions.isNotEmpty()) {
                user.permissions
            } else {
                // Older session without a map — fall back to the role baseline.
                DEFAULT_PERMISSIONS[user.role] ?: emptyMap()
            }
            return Capabilities(user.role, effective)
        }
    }
}
