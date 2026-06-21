package com.borsystems.app.notifications

import com.borsystems.app.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * In-app notifications hub — the Android counterpart to the web bell badge.
 *
 * Holds a live unread-count [StateFlow] the bottom-nav BadgedBox observes.
 * - [refresh] re-fetches the authoritative count from the backend.
 * - [bump] optimistically increments it the instant an FCM push arrives, so the
 *   badge updates even before the next poll (the web does this off the SSE
 *   `notification.created` event).
 * - Screens call [refresh] after marking items read so the badge settles.
 */
object NotificationCenter {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()

    /** Pull the real unread count. Silently ignores transient/offline failures. */
    fun refresh() {
        if (ApiClient.token == null) return
        scope.launch {
            try {
                _unread.value = ApiClient.unreadNotificationCount()
            } catch (_: Exception) { /* keep last known count */ }
        }
    }

    /** Optimistic +1 when a push lands (reconciled by the next [refresh]). */
    fun bump() {
        _unread.value = _unread.value + 1
    }

    /** Reset to zero locally (e.g. after mark-all-read), pending a [refresh]. */
    fun clear() {
        _unread.value = 0
    }
}
