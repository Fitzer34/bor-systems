# ─── R8 / ProGuard rules for release (minify + resource shrink) ──────────
#
# The release buildType enables R8. Without these keep rules the app would
# compile but crash at runtime: kotlinx.serialization generates synthetic
# $$serializer classes and Companion serializer() methods that R8 strips as
# "unused", so the first API decode throws SerializationException. Every model
# in network/Models.kt is @Serializable, so these rules are load-bearing.

# Keep annotations (needed by reflection-free serialization + Compose).
-keepattributes *Annotation*, InnerClasses, Signature, RuntimeVisibleAnnotations, AnnotationDefault

# ─── kotlinx.serialization (official rules) ──────────────────────────────
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep the generated serializers and Companion.serializer() for our models.
-keep,includedescriptorclasses class com.borsystems.app.**$$serializer { *; }
-keepclassmembers class com.borsystems.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.borsystems.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep @kotlinx.serialization.Serializable class com.borsystems.app.** { *; }

# ─── OkHttp / Okio ───────────────────────────────────────────────────────
# Platform-specific code referenced reflectively; safe to silence.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ─── Firebase Cloud Messaging ────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
