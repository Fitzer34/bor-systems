// BOR Systems — phone app.
//
// Material 3 + Jetpack Compose. Mirrors the iOS app screen-for-screen:
//   LoginView    → ui/auth/LoginScreen.kt
//   MainTabView  → ui/MainScaffold.kt           (bottom bar with 5 tabs)
//   HomeView     → ui/home/HomeScreen.kt        (active alerts list)
//   HangersView  → ui/hangers/HangersScreen.kt  (TODO)
//   ...etc.

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
    // Apply google-services only when google-services.json is present —
    // keeps the project building before Firebase is set up.
    // id("com.google.gms.google-services")
}

android {
    namespace = "com.borsystems.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.borsystems.app"
        minSdk = 26          // Android 8.0 — ~95% device coverage
        targetSdk = 34       // Android 14
        versionCode = 1
        versionName = "0.1.0"

        // BOR Systems backend URL is hard-coded to the production Render
        // service. To point at a local dev server, override in a
        // signing-config or via gradle -P arg in CI.
        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"https://bor-systems-backend.onrender.com\""
        )
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        // Kotlin 2.0+ uses the Compose Compiler Gradle plugin internally —
        // version pin no longer needed.
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

dependencies {
    // ─── Compose BOM (one version pin for the whole UI stack) ──────────
    val composeBom = platform("androidx.compose:compose-bom:2024.09.02")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // ─── Core Android / lifecycle ──────────────────────────────────────
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("androidx.navigation:navigation-compose:2.8.0")

    // ─── Networking (mirrors iOS URLSession + JSONDecoder) ────────────
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // ─── Token storage (mirrors iOS Keychain) ─────────────────────────
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.datastore:datastore-preferences:1.1.1")

    // ─── Firebase Cloud Messaging (Android's APNs equivalent) ─────────
    // Uncomment + add google-services.json under app/ once you've set up
    // a Firebase project. Backend already supports FCM via
    // backend/src/services/notifications.ts (fcmReady()).
    // implementation(platform("com.google.firebase:firebase-bom:33.2.0"))
    // implementation("com.google.firebase:firebase-messaging-ktx")

    // ─── Bluetooth Low Energy (mirrors iOS CoreBluetooth) ─────────────
    // No external lib — Android's android.bluetooth.* package is fine.
    // Permissions declared in AndroidManifest.xml.
}
