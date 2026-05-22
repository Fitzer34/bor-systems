# Zero Slip Systems — Android

Phone app + Wear OS companion. Mirrors the iOS app screen-for-screen.

## Layout

```
android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── app/                   # Phone app (Material 3 + Jetpack Compose)
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── res/
│       └── java/com/borsystems/app/
│           ├── BORSystemsApp.kt       # Application — notification channels
│           ├── MainActivity.kt        # single Activity, hosts Compose
│           ├── network/
│           │   ├── Models.kt           # mirrors iOS Models.swift
│           │   └── ApiClient.kt        # mirrors iOS APIClient.swift
│           ├── auth/
│           │   └── AuthStore.kt        # mirrors iOS AuthStore.swift
│           ├── ui/
│           │   ├── MainScaffold.kt     # mirrors iOS MainTabView
│           │   ├── auth/LoginScreen.kt # mirrors iOS LoginView
│           │   ├── home/HomeScreen.kt  # mirrors iOS HomeView (active alerts)
│           │   ├── placeholder/        # stubs for Batch 2 screens
│           │   └── theme/Theme.kt
│           └── notifications/
│               └── BorMessagingService.kt   # FCM receiver (stub)
└── wear/                  # Wear OS app (Batch 2)
    └── ...
```

## Build

Open the `android/` directory in Android Studio (Hedgehog 2024.x or newer).
Gradle sync, then **Run ▶ app** to a connected phone or emulator.

From the command line:

```sh
cd android
./gradlew assembleDebug        # build the APK
./gradlew installDebug         # install on a connected device
```

## What's done in Batch 1

- Project structure + Gradle build files
- Auth flow: `LoginScreen` → `AuthStore` → `ApiClient` → backend
- Active alerts: `HomeScreen` polls `/alerts/active` every 5 s, supports
  "I'm on it" (acknowledge) and "It's done" (close) — same UX as iOS
- Material 3 theming with dynamic colours on Android 12+
- Encrypted token storage (Android's Keychain equivalent)
- Notification channels declared (FCM-ready, just needs `google-services.json`)

## What's coming in Batch 2

- Hangers screen with online/offline indicators
- Map view with floor-plan thumbnails + alert pins
- Dispatch send/receive screens
- Schedule view
- Profile + Settings + Reports + Audit log
- BLE hanger setup wizard (matches iOS HangerSetupView)
- FCM full wire-up after Firebase project is created
- Wear OS active-alerts screen with phone↔watch sync via Wearable Data Layer

## Firebase setup (push notifications)

Until you've set up a Firebase project and dropped `google-services.json`
into `app/`, push notifications stay disabled. The backend webhook still
gets the events; the iOS app receives them via APNs as today.

When you're ready:

1. Create a Firebase project at https://console.firebase.google.com
2. Add an Android app with package `com.borsystems.app`
3. Download `google-services.json` → place in `android/app/`
4. In `app/build.gradle.kts` uncomment the `google-services` plugin and
   the `firebase-messaging-ktx` dependency
5. Add `FCM_PROJECT_ID`, `FCM_PRIVATE_KEY`, `FCM_CLIENT_EMAIL` env vars
   on Render — the backend's `notifications.ts` already supports FCM

The Android app then receives the same alerts/dispatches as the iOS app.
