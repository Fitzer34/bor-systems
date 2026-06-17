package com.borsystems.app.ui.maintenance

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Writes exported CSV bytes to a cache file and fires the system share sheet
 * (ACTION_SEND) via the app's FileProvider, so the user can save to Drive,
 * email or message it. Mirrors the iOS UIActivityViewController share.
 */
object CsvShare {
    fun share(context: Context, baseName: String, bytes: ByteArray) {
        val stamp = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val dir = File(context.cacheDir, "shares").apply { mkdirs() }
        val file = File(dir, "$baseName-$stamp.csv")
        file.writeBytes(bytes)

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(send, "Export work orders"))
    }
}
