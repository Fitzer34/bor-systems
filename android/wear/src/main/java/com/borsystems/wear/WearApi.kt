package com.borsystems.wear

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal HTTP client for the watch. Same backend as the phone; only the
 * three endpoints the watch needs (list active, ack, close). Uses
 * java.net.HttpURLConnection to avoid pulling OkHttp into the Wear OS
 * APK (saves ~700 KB of binary size — meaningful on watch).
 */
object WearApi {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Serializable
    data class WatchAlertResponse(val alerts: List<WatchAlert>)

    suspend fun fetchActiveAlerts(): List<WatchAlert> {
        val raw = httpGet("/alerts/active")
        val res = json.decodeFromString<WatchAlertResponse>(raw)
        return res.alerts.filter { (it.kind ?: "spill") == "spill" }
    }

    suspend fun ack(id: String) { httpPost("/alerts/$id/acknowledge", null) }

    suspend fun close(id: String) {
        httpPost("/alerts/$id/close", """{"reason":"manual"}""")
    }

    // ─── HTTP helpers ─────────────────────────────────────────────

    private fun url(path: String): URL = URL(WearAuth.apiBase.value.trimEnd('/') + path)

    private suspend fun httpGet(path: String): String {
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val conn = url(path).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "GET"
                WearAuth.token.value?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                conn.connectTimeout = 10_000
                conn.readTimeout = 15_000
                if (conn.responseCode >= 400) {
                    throw RuntimeException("HTTP ${conn.responseCode}")
                }
                conn.inputStream.bufferedReader().use { it.readText() }
            } finally { conn.disconnect() }
        }
    }

    private suspend fun httpPost(path: String, body: String?): String {
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val conn = url(path).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "POST"
                conn.doOutput = body != null
                WearAuth.token.value?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
                if (body != null) {
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.bufferedWriter().use { it.write(body) }
                }
                conn.connectTimeout = 10_000
                conn.readTimeout = 15_000
                if (conn.responseCode >= 400) {
                    throw RuntimeException("HTTP ${conn.responseCode}")
                }
                conn.inputStream.bufferedReader().use { it.readText() }
            } finally { conn.disconnect() }
        }
    }
}

@Serializable
data class WatchAlert(
    val id: String,
    val kind: String? = null,
    val status: String? = null,
    val zoneName: String? = null,
    val floorName: String? = null,
)
