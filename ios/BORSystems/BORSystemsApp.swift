import SwiftUI
import UIKit
import UserNotifications

@main
struct BORSystemsApp: App {
    @StateObject private var auth = AuthStore()
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .task { await auth.bootstrap() }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        registerNotificationCategories()
        return true
    }

    /// Register the UNNotificationCategory identifiers the backend's APNs
    /// payload references via the `category` field. These show up as quick-
    /// action buttons on:
    ///   - the iOS lock-screen banner (long-press)
    ///   - the Apple Watch notification (single tap)
    ///   - in-app foreground banners (when the user pulls them down)
    ///
    /// The backend → iOS contract:
    ///   category="alert"    → spill — needs Acknowledge / Open
    ///   category="dispatch" → cleaner dispatched — needs On my way / Open
    ///   category="battery"  → low battery — informational, Open only
    private func registerNotificationCategories() {
        // Spill alert: cleaner can ack from the watch without taking out
        // the iPhone. Marked `foreground` because we want to load the alert
        // detail screen if they tap "Open"; ack is `destructive: false`
        // so it gets a normal-coloured button (not red).
        let ackAlert = UNNotificationAction(
            identifier: "ALERT_ACK",
            title: "Acknowledge",
            options: [])
        let openAlert = UNNotificationAction(
            identifier: "ALERT_OPEN",
            title: "Open",
            options: [.foreground])
        let alertCat = UNNotificationCategory(
            identifier: "alert",
            actions: [ackAlert, openAlert],
            intentIdentifiers: [],
            options: [])

        // Dispatch: cleaner has been told to go clean a zone. Quick "On my
        // way" sends the acknowledge from the watch, "Open" launches the
        // app at the dispatch detail.
        let ackDispatch = UNNotificationAction(
            identifier: "DISPATCH_ACK",
            title: "On my way",
            options: [])
        let openDispatch = UNNotificationAction(
            identifier: "DISPATCH_OPEN",
            title: "Open",
            options: [.foreground])
        let dispatchCat = UNNotificationCategory(
            identifier: "dispatch",
            actions: [ackDispatch, openDispatch],
            intentIdentifiers: [],
            options: [])

        // Low battery: informational; admin can launch the app to see which
        // hangers need swapping.
        let openBattery = UNNotificationAction(
            identifier: "BATTERY_OPEN",
            title: "Open",
            options: [.foreground])
        let batteryCat = UNNotificationCategory(
            identifier: "battery",
            actions: [openBattery],
            intentIdentifiers: [],
            options: [])

        UNUserNotificationCenter.current().setNotificationCategories([
            alertCat, dispatchCat, batteryCat,
        ])
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            try? await APIClient.shared.registerPushToken(token)
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Silently ignore in dev — no APNs entitlement set up yet.
    }

    // Show banner even when app is foregrounded
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    /// Handle the action button taps from notifications. Called for both
    /// iPhone lock-screen actions and Apple Watch action taps.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        let alertId = userInfo["alertId"] as? String

        switch response.actionIdentifier {
        case "ALERT_ACK":
            // Background ack — no UI launch. Works from the watch.
            if let id = alertId {
                Task { try? await APIClient.shared.acknowledgeAlert(id) }
            }

        case "DISPATCH_ACK":
            if let id = alertId {
                Task { try? await APIClient.shared.acknowledgeDispatch(id) }
            }

        case "ALERT_OPEN", "DISPATCH_OPEN", "BATTERY_OPEN",
             UNNotificationDefaultActionIdentifier:
            // Foreground actions are handled by the OS launching the app;
            // the deep-link logic lives in ContentView watching for the
            // `pendingAlertId` published value.
            if let id = alertId {
                NotificationCenter.default.post(
                    name: .borOpenAlert,
                    object: nil,
                    userInfo: ["alertId": id])
            }

        default:
            break
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let borOpenAlert = Notification.Name("BOROpenAlertNotification")
}
