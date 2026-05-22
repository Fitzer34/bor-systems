package com.borsystems.app.wear

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/**
 * Pushes auth token + API base URL from the phone app to a paired
 * Wear OS watch via the Wearable Data Layer. Mirrors iOS WatchSync
 * (which uses WatchConnectivity).
 *
 * `setUrgent()` flushes the update faster so the watch is current within
 * seconds of a phone login.
 */
object PhoneWatchSync {
    private const val PATH = "/bor-auth"

    fun push(ctx: Context, token: String?, apiBase: String) {
        val req = PutDataMapRequest.create(PATH).apply {
            dataMap.putString("apiBase", apiBase)
            if (token.isNullOrBlank()) {
                dataMap.putBoolean("signedOut", true)
            } else {
                dataMap.putString("token", token)
            }
            // Force the data item to be considered "changed" on every push
            // so listeners refire even when the payload bytes are identical.
            dataMap.putLong("ts", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()

        Wearable.getDataClient(ctx).putDataItem(req)
    }
}
