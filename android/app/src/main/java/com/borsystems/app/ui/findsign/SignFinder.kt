package com.borsystems.app.ui.findsign

import android.content.Context
import androidx.core.uwb.RangingMeasurement
import androidx.core.uwb.RangingParameters
import androidx.core.uwb.RangingResult
import androidx.core.uwb.UwbAddress
import androidx.core.uwb.UwbComplexChannel
import androidx.core.uwb.UwbControleeSessionScope
import androidx.core.uwb.UwbDevice
import androidx.core.uwb.UwbManager
import com.borsystems.app.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/**
 * Android UWB ranging session — mirrors iOS SignFinder.swift.
 *
 * Flow:
 *   1. Look up the tag paired to this alert (backend /sign-tags/for-alert)
 *   2. If phone has UWB AND a tag exists, request a UwbControleeSessionScope
 *      from UwbManager, then run() with the tag's UWB address
 *   3. Collect RangingResult flow → emit distance + bearing to the UI
 *
 * If UWB is unavailable on this phone we surface a clear "Unavailable"
 * state and the parent navigator can push the floor-plan fallback.
 *
 * BLE pairing detail: the Qorvo DWM3001 firmware advertises BLE service
 * 0xFE59 with the configured UUID. In the proper implementation we'd
 * connect over BLE first to wake the tag's UWB radio and exchange
 * session keys. For this scaffold the UWB session uses static
 * preamble/channel/STS config matching the firmware defaults.
 */
class SignFinder(private val ctx: Context) {

    sealed class State {
        object Idle : State()
        object LookingUp : State()
        object Connecting : State()
        data class Ranging(val distance: Float, val bearingDegrees: Float?) : State()
        object SignFound : State()
        data class Unavailable(val reason: String) : State()
    }

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var rangingJob: Job? = null

    fun start(alertId: String) {
        scope.launch {
            // Look up tag in backend.
            _state.value = State.LookingUp
            val tag = try {
                ApiClient.fetchSignTagForAlert(alertId)
            } catch (_: Exception) {
                _state.value = State.Unavailable(
                    "No precision-finding tag is paired with this sign. Using floor plan instead.")
                return@launch
            }

            // Check phone hardware support.
            val manager = try { UwbManager.createInstance(ctx) } catch (_: Throwable) {
                _state.value = State.Unavailable(
                    "This phone doesn't have a UWB chip. Pixel 6 Pro+ and Galaxy S21 Ultra+ are supported.")
                return@launch
            }

            _state.value = State.Connecting

            rangingJob = scope.launch {
                try {
                    val controlee = manager.controleeSessionScope()
                    val tagAddress = UwbAddress(hexToBytes(tag.uwbAddress))
                    val params = RangingParameters(
                        uwbConfigType = RangingParameters.CONFIG_UNICAST_DS_TWR,
                        sessionId = tag.uwbAddress.hashCode(),
                        subSessionId = 0,
                        sessionKeyInfo = ByteArray(8) { 0 },        // matches tag firmware
                        subSessionKeyInfo = null,
                        complexChannel = UwbComplexChannel(channel = 9, preambleIndex = 11),
                        peerDevices = listOf(UwbDevice(tagAddress)),
                        updateRateType = RangingParameters.RANGING_UPDATE_RATE_FREQUENT,
                    )

                    controlee.prepareSession(params).collect { result ->
                        when (result) {
                            is RangingResult.RangingResultPosition -> {
                                val pos = result.position
                                val distance = pos.distance?.value ?: Float.MAX_VALUE
                                val bearing  = pos.azimuth?.value
                                _state.value = State.Ranging(distance, bearing)
                            }
                            is RangingResult.RangingResultPeerDisconnected -> {
                                _state.value = State.Connecting
                            }
                        }
                    }
                } catch (e: Exception) {
                    _state.value = State.Unavailable("Ranging error: ${e.message}")
                }
            }
        }
    }

    fun stop() {
        rangingJob?.cancel()
        rangingJob = null
    }

    fun markFound() {
        stop()
        _state.value = State.SignFound
    }

    private fun hexToBytes(hex: String): ByteArray {
        val clean = hex.replace(":", "").replace(" ", "")
        return ByteArray(clean.length / 2) { i ->
            ((Character.digit(clean[i * 2], 16) shl 4) +
              Character.digit(clean[i * 2 + 1], 16)).toByte()
        }
    }
}
