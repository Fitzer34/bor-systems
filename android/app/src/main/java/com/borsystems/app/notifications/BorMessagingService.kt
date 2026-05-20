package com.borsystems.app.notifications

/**
 * Firebase Cloud Messaging receiver — the Android equivalent of iOS APNs
 * delegate methods in BORSystemsApp.swift.
 *
 * Stubbed for now: real implementation lights up once you've added a
 * Firebase project, placed `google-services.json` in app/, and uncommented
 * the firebase-messaging dependency in app/build.gradle.kts.
 *
 * When wired up, this class will:
 *   - extend FirebaseMessagingService
 *   - override onNewToken: forward to ApiClient.registerPushToken()
 *   - override onMessageReceived: post a NotificationCompat banner with
 *     the action buttons matching iOS UNNotificationCategory ids
 *     ("alert" → Acknowledge/Open, "dispatch" → On my way/Open, etc.)
 */
class BorMessagingService {
    // Intentionally empty — see file-level comment.
    // TODO: implement once Firebase project exists.
}
