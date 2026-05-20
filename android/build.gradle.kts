// Root project build config — declares plugin versions used by sub-modules.

plugins {
    id("com.android.application") version "8.5.0" apply false
    id("com.android.library")     version "8.5.0" apply false
    id("org.jetbrains.kotlin.android") version "2.0.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.0.0" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}
