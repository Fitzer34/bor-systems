package com.borsystems.app.notifications

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.borsystems.app.MainActivity
import com.borsystems.app.R
import com.borsystems.app.network.ApiClient
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * FCM receiver — Android equivalent of iOS UNUserNotificationCenter delegate.
 *
 * - onNewToken: forward the token to the backend so the server can
 *   target this device for push.
 * - onMessageReceived: when the app is foregrounded (and on some
 *   Android versions even when backgrounded with a data-only payload)
 *   we render the notification banner here with action buttons that
 *   mirror iOS UNNotificationAction.
 *
 * The backend's notifications.ts sends the same `category` field for
 * Android via FCM as it does for iOS via APNs. We map that to the right
 * notification channel + actions here.
 */
class BorMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(Dispatchers.Main)

    override fun onNewToken(token: String) {
        // Push to backend whenever the FCM SDK rotates the token.
        scope.launch {
            try { ApiClient.registerPushToken(token) } catch (_: Exception) { /* offline → retry next launch */ }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val category = data["category"] ?: data["kind"] ?: "alert"
        val title = message.notification?.title ?: data["title"] ?: "BOR Systems"
        val body  = message.notification?.body  ?: data["body"]  ?: ""
        val alertId = data["alertId"]

        showNotification(category, title, body, alertId)
    }

    private fun showNotification(category: String, title: String, body: String, alertId: String?) {
        val notifMgr = ContextCompat.getSystemService(this, NotificationManager::class.java) ?: return

        // Map to a registered channel — BORSystemsApp creates these on init.
        val channelId = when (category) {
            "dispatch" -> "dispatch"
            "battery", "low_battery" -> "battery"
            else -> "alert"
        }

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            alertId?.let { putExtra("alertId", it) }
        }
        val openPi = PendingIntent.getActivity(
            this, alertId?.hashCode() ?: 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)  // TODO: drop a real white-only icon for the status bar
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openPi)

        // Action buttons matching iOS UNNotificationAction ids. When the
        // user taps these (from the lock screen, watch face, or Quick
        // Settings), the BroadcastReceiver fires the API call in the
        // background without launching the app.
        if (alertId != null) {
            when (category) {
                "alert" -> {
                    builder.addAction(
                        0, "Acknowledge",
                        actionPi(AlertActionReceiver.ACTION_ACK_ALERT, alertId),
                    )
                    builder.addAction(0, "Open", openPi)
                }
                "dispatch" -> {
                    builder.addAction(
                        0, "On my way",
                        actionPi(AlertActionReceiver.ACTION_ACK_DISPATCH, alertId),
                    )
                    builder.addAction(0, "Open", openPi)
                }
            }
        }

        val id = alertId?.hashCode() ?: System.currentTimeMillis().toInt()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED) {
            notifMgr.notify(id, builder.build())
        }
    }

    private fun actionPi(action: String, alertId: String): PendingIntent {
        val intent = Intent(this, AlertActionReceiver::class.java).apply {
            this.action = action
            putExtra("alertId", alertId)
        }
        return PendingIntent.getBroadcast(
            this, (action + alertId).hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
