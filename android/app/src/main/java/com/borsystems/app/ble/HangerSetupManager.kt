package com.borsystems.app.ble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * BLE hanger first-boot Wi-Fi onboarding — mirrors iOS HangerSetupManager.
 *
 * GATT UUIDs MUST match firmware/src/setup_mode/setup_mode.cpp and
 * pi/setup_mode.py exactly. The iPhone app uses identical IDs; reuse here
 * means a hanger flashed once works with phones on either platform.
 *
 * Flow:
 *   1. scan: look for the "BOR Setup" service UUID
 *   2. connect: open GATT, discover services + characteristics
 *   3. ready: app prompts user for SSID + password
 *   4. send: write SSID, password, then commit
 *   5. read status notify: tag reports "joining" then "connected" / "failed"
 *
 * Permissions are runtime on Android 12+ (BLUETOOTH_SCAN, BLUETOOTH_CONNECT)
 * and runtime + location on 6–11 (ACCESS_FINE_LOCATION). The screen layer
 * prompts before calling start().
 */
class HangerSetupManager(private val ctx: Context) {

    sealed class Phase {
        object Idle : Phase()
        object BluetoothOff : Phase()
        object MissingPermissions : Phase()
        object Scanning : Phase()
        data class Connecting(val name: String) : Phase()
        object Discovering : Phase()
        /** Characteristics resolved — waiting for SSID + password from user. */
        data class Ready(val devEui: String?) : Phase()
        object Sending : Phase()
        object Joining : Phase()
        object Connected : Phase()
        data class Failed(val message: String) : Phase()
    }

    companion object {
        // Same UUIDs as iOS HangerSetupManager + Pi/Heltec firmware.
        val SERVICE_UUID:  UUID = UUID.fromString("b08e0001-d4e2-4f5a-9c01-3f25d3a7c2a1")
        val CHR_SSID:      UUID = UUID.fromString("b08e0002-d4e2-4f5a-9c01-3f25d3a7c2a1")
        val CHR_PASSWORD:  UUID = UUID.fromString("b08e0003-d4e2-4f5a-9c01-3f25d3a7c2a1")
        val CHR_COMMIT:    UUID = UUID.fromString("b08e0004-d4e2-4f5a-9c01-3f25d3a7c2a1")
        val CHR_STATUS:    UUID = UUID.fromString("b08e0005-d4e2-4f5a-9c01-3f25d3a7c2a1")
        val CHR_DEVEUI:    UUID = UUID.fromString("b08e0006-d4e2-4f5a-9c01-3f25d3a7c2a1")
        val CCC_DESCRIPTOR: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    private val _phase = MutableStateFlow<Phase>(Phase.Idle)
    val phase: StateFlow<Phase> = _phase.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val btManager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? = btManager.adapter

    private var gatt: BluetoothGatt? = null
    private var ssidChar: BluetoothGattCharacteristic? = null
    private var passwordChar: BluetoothGattCharacteristic? = null
    private var commitChar: BluetoothGattCharacteristic? = null
    private var statusChar: BluetoothGattCharacteristic? = null

    // ─── Permission gate ───────────────────────────────────────────────

    private fun hasPermissions(): Boolean {
        val needed = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        return needed.all {
            ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun start() {
        if (!hasPermissions()) {
            _phase.value = Phase.MissingPermissions
            return
        }
        if (adapter?.isEnabled != true) {
            _phase.value = Phase.BluetoothOff
            return
        }

        _phase.value = Phase.Scanning
        val scanner = adapter.bluetoothLeScanner ?: run {
            _phase.value = Phase.Failed("BLE scanner unavailable")
            return
        }

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanner.startScan(listOf(filter), settings, scanCallback)
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        adapter?.bluetoothLeScanner?.stopScan(scanCallback)
        gatt?.disconnect()
        gatt?.close()
        gatt = null
    }

    // ─── User-driven send ──────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun submitCredentials(ssid: String, password: String) {
        val g = gatt ?: return
        val ssidC = ssidChar ?: return
        val passC = passwordChar ?: return
        val commitC = commitChar ?: return

        _phase.value = Phase.Sending

        // 1) Write SSID
        ssidC.value = ssid.toByteArray(Charsets.UTF_8)
        ssidC.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        if (!g.writeCharacteristic(ssidC)) {
            _phase.value = Phase.Failed("Failed to send SSID")
            return
        }
        // The remaining writes happen sequentially in onCharacteristicWrite.
        pendingPassword = password.toByteArray(Charsets.UTF_8)
        pendingCommit = byteArrayOf(0x01)
    }

    private var pendingPassword: ByteArray? = null
    private var pendingCommit: ByteArray? = null

    // ─── Scan + GATT callbacks ─────────────────────────────────────────

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            adapter?.bluetoothLeScanner?.stopScan(this)
            val device = result.device
            val name = device.name ?: result.scanRecord?.deviceName ?: "BOR-Setup"
            _phase.value = Phase.Connecting(name)
            gatt = device.connectGatt(ctx, false, gattCallback)
        }

        override fun onScanFailed(errorCode: Int) {
            _phase.value = Phase.Failed("Scan failed (code $errorCode)")
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                _phase.value = Phase.Discovering
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                g.close()
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val svc = g.getService(SERVICE_UUID)
            if (svc == null) {
                _phase.value = Phase.Failed("Service not found on device")
                return
            }
            ssidChar     = svc.getCharacteristic(CHR_SSID)
            passwordChar = svc.getCharacteristic(CHR_PASSWORD)
            commitChar   = svc.getCharacteristic(CHR_COMMIT)
            statusChar   = svc.getCharacteristic(CHR_STATUS)
            val devEuiChar = svc.getCharacteristic(CHR_DEVEUI)

            // Subscribe to status notifications.
            statusChar?.let {
                g.setCharacteristicNotification(it, true)
                it.getDescriptor(CCC_DESCRIPTOR)?.let { d ->
                    d.value = android.bluetooth.BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    g.writeDescriptor(d)
                }
            }

            // Read DevEUI synchronously — appears in the Ready phase so
            // the UI can show the user which hanger they're pairing.
            devEuiChar?.let { g.readCharacteristic(it) }
                ?: run { _phase.value = Phase.Ready(devEui = null) }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicRead(
            g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int,
        ) {
            if (c.uuid == CHR_DEVEUI) {
                val devEui = String(c.value ?: ByteArray(0), Charsets.UTF_8)
                _phase.value = Phase.Ready(devEui = devEui)
            }
        }

        @SuppressLint("MissingPermission")
        override fun onCharacteristicWrite(
            g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int,
        ) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                _phase.value = Phase.Failed("Write failed (status $status)")
                return
            }
            when (c.uuid) {
                CHR_SSID -> {
                    val pw = pendingPassword ?: return
                    pendingPassword = null
                    passwordChar?.let {
                        it.value = pw
                        g.writeCharacteristic(it)
                    }
                }
                CHR_PASSWORD -> {
                    val cm = pendingCommit ?: return
                    pendingCommit = null
                    commitChar?.let {
                        it.value = cm
                        g.writeCharacteristic(it)
                    }
                }
                CHR_COMMIT -> {
                    _phase.value = Phase.Joining
                    // Hanger will notify via CHR_STATUS when join completes.
                }
            }
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            if (c.uuid != CHR_STATUS) return
            val status = String(c.value ?: ByteArray(0), Charsets.UTF_8)
            when {
                status == "connected"        -> _phase.value = Phase.Connected
                status.startsWith("failed:") -> _phase.value = Phase.Failed(status.removePrefix("failed:"))
                status == "joining"          -> _phase.value = Phase.Joining
            }
        }
    }
}
