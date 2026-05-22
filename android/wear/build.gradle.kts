// ZeroSlip — Wear OS companion app.
//
// Mirrors the Apple Watch app: glanceable active-alerts list with "I'm
// on it" / "It's done" actions. Same backend, same FCM topics.
//
// This module is scaffolded but the screens haven't been built yet —
// next batch. The module is in :wear so the root Gradle graph is
// complete; flipping it to an empty stub for now keeps `./gradlew
// assembleDebug` green.

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.borsystems.wear"
    compileSdk = 34

    defaultConfig {
        // Wear OS apps must use the phone's applicationId + ".wear" suffix
        // (or any prefix matching the phone). Kotlin package stays
        // com.borsystems.wear internally to skip a large find-replace.
        applicationId = "com.zeroslip.app.wear"
        minSdk = 30           // Wear OS 3.0
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures { compose = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.02")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")

    // Data layer between phone + watch (mirrors WatchConnectivity on iOS).
    implementation("com.google.android.gms:play-services-wearable:18.2.0")

    // Coroutines + serialization for the WearApi client.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.2")
}
