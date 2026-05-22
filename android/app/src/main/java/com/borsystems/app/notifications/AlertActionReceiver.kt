package com.borsystems.app.notifications

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.borsystems.app.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Handles the "Acknowledge" / "On my way" action buttons on alert
 * notifications. Fires the API call from the BroadcastReceiver so the
 * user doesn't have to open the app — mirrors iOS background-action
 * UNNotificationAction options.
 *
 * Wired in via PendingIntent.getBroadcast() from BorMessagingService;
 * registered in AndroidManifest.xml.
 */
class AlertActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ACK_ALERT    = "com.borsystems.app.ACK_ALERT"
        const val ACTION_ACK_DISPATCH = "com.borsystems.app.ACK_DISPATCH"
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        val alertId = intent.getStringExtra("alertId") ?: return

        CoroutineScope(Dispatchers.IO).launch {
            try {
                when (intent.action) {
                    ACTION_ACK_ALERT    -> ApiClient.acknowledgeAlert(alertId)
                    ACTION_ACK_DISPATCH -> ApiClient.acknowledgeDispatch(alertId)
                }
            } catch (_: Exception) {
                // Best-effort — if offline, the notification stays in
                // the tray and the user can try again later via the app.
            }
        }

        // Dismiss the notification banner once the action is taken.
        ContextCompat.getSystemService(ctx, NotificationManager::class.java)?.cancel(alertId.hashCode())
    }
}
