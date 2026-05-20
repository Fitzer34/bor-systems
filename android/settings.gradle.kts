// BOR Systems — Android workspace
//
// Two modules:
//   :app  — the phone app (Material 3 + Jetpack Compose, mirrors iOS)
//   :wear — Wear OS companion (mirrors the Apple Watch app)
//
// Backend, payload format, and auth flow are identical to iOS. Same
// JWT/Bearer scheme, same /alerts/active endpoint, same FCM topics
// (FCM is the Android equivalent of APNs and the backend already
// supports both — see backend/src/services/notifications.ts).

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "BORSystems"
include(":app")
include(":wear")
