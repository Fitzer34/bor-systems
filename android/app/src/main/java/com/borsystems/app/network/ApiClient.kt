package com.borsystems.app.network

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.borsystems.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Single HTTP client for the whole app — mirrors ios/BORSystems/APIClient.swift.
 *
 * Token lives in EncryptedSharedPreferences (Android's Keychain equivalent),
 * so it survives reboots and is encrypted at rest with a hardware-backed key
 * on devices with TEE/SE.
 *
 * Every request signs in via Bearer token if present. 401s do NOT auto-clear
 * the token — same defensive choice as iOS (transient 401 during deploy
 * rollover used to kick users out mid-use).
 */
object ApiClient {
    private const val PREFS = "hazardlink_auth"
    private const val K_TOKEN = "token"

    private lateinit var prefs: android.content.SharedPreferences

    private val http: OkHttpClient by lazy {
        val log = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG)
                HttpLoggingInterceptor.Level.BASIC
            else
                HttpLoggingInterceptor.Level.NONE
        }
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(log)
            .build()
    }

    /**
     * Lenient JSON decoder — accept unknown fields so a backend that adds
     * new keys doesn't break old app installs.
     */
    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
    }

    fun init(ctx: Context) {
        val masterKey = MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            ctx,
            PREFS,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var token: String?
        get() = prefs.getString(K_TOKEN, null)
        set(value) {
            prefs.edit().apply {
                if (value.isNullOrEmpty()) remove(K_TOKEN) else putString(K_TOKEN, value)
            }.apply()
        }

    // ─── Generic request helpers ──────────────────────────────────────

    sealed class ApiException(msg: String) : Exception(msg) {
        class Unauthorized                   : ApiException("Not signed in.")
        class Http(val status: Int, val body: String) : ApiException("HTTP $status: ${body.take(120)}")
        class Decode(cause: Throwable)        : ApiException("Bad response: ${cause.message}")
        class Transport(cause: Throwable)     : ApiException("Network: ${cause.message}")
    }

    private val JSON_TYPE = "application/json".toMediaType()

    // Separate names so callers don't have to disambiguate overloads.
    // `request` for GETs and bodyless POSTs; `post` for POSTs with a body
    // (B is reified so kotlinx.serialization knows the serializer at the
    // call site — passing Any? at runtime fails because there's no
    // serializer for kotlin.Any).
    private suspend inline fun <reified T> request(
        path: String,
        method: String = "GET",
    ): T = requestImpl(path, method, null)

    private suspend inline fun <reified T, reified B : Any> post(
        path: String,
        body: B,
    ): T = requestImpl(path, "POST", json.encodeToString(kotlinx.serialization.serializer<B>(), body))

    private suspend inline fun <reified T, reified B : Any> patch(
        path: String,
        body: B,
    ): T = requestImpl(path, "PATCH", json.encodeToString(kotlinx.serialization.serializer<B>(), body))

    private suspend inline fun <reified T> requestImpl(
        path: String,
        method: String,
        bodyJson: String?,
    ): T = withContext(Dispatchers.IO) {
        val url = BuildConfig.API_BASE_URL.trimEnd('/') +
                  if (path.startsWith("/")) path else "/$path"

        val reqBody: RequestBody? = bodyJson?.toRequestBody(JSON_TYPE)

        val builder = Request.Builder().url(url).method(method, reqBody)
        token?.let { builder.addHeader("Authorization", "Bearer $it") }
        if (bodyJson != null) builder.addHeader("Content-Type", "application/json")

        val response = try {
            http.newCall(builder.build()).execute()
        } catch (e: IOException) {
            throw ApiException.Transport(e)
        }

        response.use { r ->
            // Sliding session: backend ships a refreshed token in this header
            // when ours is more than a day old. Swap it in silently so the
            // user never has to log in again as long as they keep using the app.
            r.header("X-Refreshed-Token")?.takeIf { it.isNotEmpty() }?.let { token = it }

            val raw = r.body?.string().orEmpty()
            when {
                r.code == 401 -> throw ApiException.Unauthorized()
                r.code >= 400 -> throw ApiException.Http(r.code, raw)
                else -> try {
                    if (T::class == Unit::class) Unit as T
                    else json.decodeFromString(raw)
                } catch (e: Exception) {
                    throw ApiException.Decode(e)
                }
            }
        }
    }

    // ─── Endpoints (mirror iOS APIClient extension) ───────────────────

    @kotlinx.serialization.Serializable
    private data class LoginBody(val email: String, val password: String)

    @kotlinx.serialization.Serializable
    private data class PushTokenBody(val pushToken: String)

    @kotlinx.serialization.Serializable
    private data class DutyBody(val onDuty: Boolean)

    @kotlinx.serialization.Serializable
    private data class CloseBody(val reason: String, val note: String? = null)

    @kotlinx.serialization.Serializable
    private data class ProfileBody(val name: String, val phoneE164: String? = null)

    @kotlinx.serialization.Serializable
    private data class PasswordBody(val currentPassword: String, val newPassword: String)

    suspend fun login(email: String, password: String): LoginResponse =
        post("/auth/login", LoginBody(email, password))

    suspend fun currentUser(): CurrentUser = request("/users/me")

    suspend fun updateProfile(name: String, phoneE164: String?): CurrentUser =
        patch<CurrentUser, ProfileBody>("/users/me", ProfileBody(name, phoneE164))

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        post<Unit, PasswordBody>(
            "/users/me/password",
            PasswordBody(currentPassword, newPassword),
        )
    }

    suspend fun setOnDuty(onDuty: Boolean) {
        post<Unit, DutyBody>("/auth/duty", DutyBody(onDuty))
    }

    suspend fun registerPushToken(fcmToken: String) {
        post<Unit, PushTokenBody>("/users/me/push-token", PushTokenBody(fcmToken))
    }

    suspend fun activeAlerts(): List<ActiveAlert> {
        val res = request<AlertsResponse>("/alerts/active")
        return res.alerts
    }

    suspend fun acknowledgeAlert(id: String) {
        request<Unit>("/alerts/$id/acknowledge", "POST")
    }

    suspend fun closeAlert(id: String, reason: CloseReason, note: String?) {
        val body = CloseBody(
            reason = when (reason) {
                CloseReason.signDamaged -> "sign_damaged"
                CloseReason.signMissing -> "sign_missing"
                CloseReason.manual      -> "manual"
            },
            note = note,
        )
        post<Unit, CloseBody>("/alerts/$id/close", body)
    }

    // ─── Dispatches ─────────────────────────────────────────────────

    @kotlinx.serialization.Serializable
    private data class DispatchBody(val recipientUserId: String, val zoneId: String?, val message: String)

    suspend fun listDispatches(): List<DispatchItem> {
        val res = request<DispatchesResponse>("/dispatches")
        return res.dispatches
    }
    suspend fun sendDispatch(recipientUserId: String, zoneId: String?, message: String): DispatchItem {
        return post<DispatchItem, DispatchBody>(
            "/dispatches",
            DispatchBody(recipientUserId, zoneId, message),
        )
    }
    suspend fun acknowledgeDispatch(id: String) {
        request<Unit>("/dispatches/$id/acknowledge", "POST")
    }
    suspend fun completeDispatch(id: String) {
        request<Unit>("/dispatches/$id/complete", "POST")
    }

    // ─── Hangers ────────────────────────────────────────────────────

    suspend fun listHangers(): List<Hanger> {
        val res = request<HangersResponse>("/hangers")
        return res.hangers
    }

    // ─── Buildings / floors / zones ─────────────────────────────────

    suspend fun listBuildings(): List<Building> {
        val res = request<BuildingsResponse>("/buildings")
        return res.buildings
    }
    suspend fun listFloors(buildingId: String): List<Floor> {
        val res = request<FloorsResponse>("/buildings/$buildingId/floors")
        return res.floors
    }
    suspend fun listZones(floorId: String): List<Zone> {
        val res = request<ZonesResponse>("/floors/$floorId/zones")
        return res.zones
    }

    // ─── Schedule ───────────────────────────────────────────────────

    suspend fun listShifts(): List<Shift> {
        val res = request<ShiftsResponse>("/shifts")
        return res.shifts
    }

    // ─── Settings ───────────────────────────────────────────────────

    suspend fun appSettings(): AppSettings = request("/settings")

    @kotlinx.serialization.Serializable
    private data class SettingBody(val value: Int? = null, val enabled: Boolean? = null)

    suspend fun setAckTimer(minutes: Int) {
        post<Unit, SettingBody>("/settings/ack-timer", SettingBody(value = minutes))
    }
    suspend fun setResolutionTimer(minutes: Int) {
        post<Unit, SettingBody>("/settings/resolution-timer", SettingBody(value = minutes))
    }
    suspend fun setExpectedCleaningTime(minutes: Int) {
        post<Unit, SettingBody>("/settings/expected-cleaning-time", SettingBody(value = minutes))
    }
    suspend fun setLowBatteryThreshold(pct: Int) {
        post<Unit, SettingBody>("/settings/low-battery-threshold", SettingBody(value = pct))
    }
    suspend fun setDefaultAudibleAlarm(enabled: Boolean) {
        post<Unit, SettingBody>("/settings/default-audible-alarm", SettingBody(enabled = enabled))
    }

    suspend fun spillsReport(fromIso: String, toIso: String): SpillsResponse =
        request("/reports/spills?from=$fromIso&to=$toIso")

    suspend fun auditLog(): List<AuditEntry> {
        val res = request<AuditResponse>("/admin/audit-log")
        return res.entries
    }

    // ─── Users ──────────────────────────────────────────────────────

    suspend fun listUsers(): List<UserSummary> {
        val res = request<UsersResponse>("/users")
        return res.users
    }

    // ─── Sites overview ─────────────────────────────────────────────

    suspend fun sitesSummary(): List<SiteSummary> {
        val res = request<SitesSummaryResponse>("/sites/summary")
        return res.sites
    }

    // ─── Sign-tag lookup (Find Sign UWB) ────────────────────────────

    @kotlinx.serialization.Serializable
    data class SignTagInfo(
        val tagId: String,
        val bleUuid: String,
        val uwbAddress: String,
        val batteryPct: Int? = null,
    )
    suspend fun fetchSignTagForAlert(alertId: String): SignTagInfo =
        request("/sign-tags/for-alert/$alertId")

    // ─── PPMs (planned preventive maintenance) ──────────────────────

    suspend fun listPpms(): List<PPM> = request<PPMsResponse>("/ppms").ppms
    suspend fun createPpm(body: PpmInput): Unit = post("/ppms", body)
    suspend fun updatePpm(id: String, body: PpmInput): Unit = patch("/ppms/$id", body)
    suspend fun completePpm(id: String): Unit = request("/ppms/$id/complete", "POST")
    suspend fun deletePpm(id: String): Unit = request("/ppms/$id", "DELETE")

    // ─── Maintenance jobs (CMMS work orders) ─────────────────────────
    // Mirror the iOS APIClient extension. Lifecycle only (tender/quote/award
    // stay on the web). start/cancel are bodyless POSTs — same as the alert
    // and dispatch acknowledge calls above.

    @kotlinx.serialization.Serializable
    private data class ScheduleJobBody(val scheduledStartAt: String)

    @kotlinx.serialization.Serializable
    private data class CompleteJobBody(val completionNote: String? = null)

    suspend fun maintenanceJobs(): List<MaintenanceJob> =
        request<MaintenanceJobsResponse>("/jobs").jobs

    suspend fun maintenanceJobDetail(id: String): JobDetailResponse =
        request("/jobs/$id")

    suspend fun scheduleJob(id: String, scheduledStartAt: String) {
        post<Unit, ScheduleJobBody>("/jobs/$id/schedule", ScheduleJobBody(scheduledStartAt))
    }

    suspend fun startJob(id: String) {
        request<Unit>("/jobs/$id/start", "POST")
    }

    suspend fun completeJob(id: String, note: String?) {
        post<Unit, CompleteJobBody>("/jobs/$id/complete", CompleteJobBody(note))
    }

    suspend fun cancelJob(id: String) {
        request<Unit>("/jobs/$id/cancel", "POST")
    }
}
