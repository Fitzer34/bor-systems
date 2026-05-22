package com.borsystems.wear

import android.content.Context
import android.content.SharedPreferences
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Receives the phone app's auth token + API base URL via the Wearable
 * Data Layer (Android's WatchConnectivity equivalent).
 *
 * The phone app's PhoneWatchSync (added in companion app) publishes the
 * session to data path `/bor-auth` on every login/bootstrap/logout.
 * This class listens for that path and persists the latest value to
 * SharedPreferences so the watch app keeps working without the phone
 * in Bluetooth range.
 */
object WearAuth : DataClient.OnDataChangedListener {

    private const val PREFS = "bor_wear"
    private const val K_TOKEN = "token"
    private const val K_API   = "api_base"
    private const val PATH    = "/bor-auth"

    private lateinit var prefs: SharedPreferences

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> get() = _token

    private val _apiBase = MutableStateFlow("https://bor-systems-backend.onrender.com")
    val apiBase: StateFlow<String> get() = _apiBase

    fun init(ctx: Context) {
        prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        _token.value   = prefs.getString(K_TOKEN, null)
        _apiBase.value = prefs.getString(K_API, "https://bor-systems-backend.onrender.com")!!
        Wearable.getDataClient(ctx).addListener(this)
    }

    override fun onDataChanged(events: com.google.android.gms.wearable.DataEventBuffer) {
        for (e in events) {
            if (e.type != DataEvent.TYPE_CHANGED) continue
            if (e.dataItem.uri.path != PATH) continue
            val map = DataMapItem.fromDataItem(e.dataItem).dataMap
            val token = map.getString("token")
            val base  = map.getString("apiBase")
            val signedOut = map.getBoolean("signedOut", false)
            prefs.edit().apply {
                if (signedOut) remove(K_TOKEN) else if (token != null) putString(K_TOKEN, token)
                if (base != null) putString(K_API, base)
            }.apply()
            _token.value   = if (signedOut) null else token
            if (base != null) _apiBase.value = base
        }
    }
}
