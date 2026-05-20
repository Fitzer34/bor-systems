package com.borsystems.app.ui.placeholder

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

/**
 * Placeholder for screens we haven't built yet — Dispatch, Schedule,
 * Hangers, More. Each one gets its own dedicated screen in subsequent
 * batches; this just keeps the nav graph intact.
 */
@Composable
fun PlaceholderScreen(name: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("$name (coming next batch)", style = MaterialTheme.typography.titleMedium)
    }
}
