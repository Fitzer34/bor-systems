package com.borsystems.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.borsystems.app.network.ApiClient

/**
 * App-wide singleton. Initialises networking, the auth store, and the
 * notification channels FCM needs to deliver high-priority alerts.
 *
 * Mirrors iOS BORSystemsApp.swift — single entry point, all global state
 * bootstrapped here.
 */
class BORSystemsApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
        createNotificationChannels()
    }

    /**
     * Android (since 8.0) requires notification channels to be declared up
     * front. We declare three to match the iOS UNNotificationCategory IDs:
     *   alert    — spill alerts (high importance, override Do Not Disturb)
     *   dispatch — cleaner dispatch (high importance)
     *   battery  — low-battery warnings (default importance)
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return

        listOf(
            NotificationChannel(
                "alert",
                "Spill alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Wet-floor sign lifted — immediate response needed."
                enableLights(true)
                enableVibration(true)
            },
            NotificationChannel(
                "dispatch",
                "Dispatches",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Cleaning job dispatched to you."
                enableVibration(true)
            },
            NotificationChannel(
                "battery",
                "Low battery",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "A hanger battery is running low."
            }
        ).forEach { nm.createNotificationChannel(it) }
    }
}
