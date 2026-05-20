package com.borsystems.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.MaterialTheme as WearTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.TimeText

/**
 * Wear OS landing screen — placeholder until Batch 2.
 *
 * Will mirror the Apple Watch ActiveAlertsView: poll /alerts/active every
 * 15s, show a list with "I'm on it" / "It's done" actions, push token
 * synced from the phone via Wearable Data Layer (Wear OS equivalent of
 * WatchConnectivity).
 */
class WearMainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WearTheme {
                Scaffold(
                    timeText = { TimeText() }
                ) {
                    ActiveAlertsPlaceholder()
                }
            }
        }
    }
}

@Composable
private fun ActiveAlertsPlaceholder() {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "BOR Systems\n(Wear OS app — Batch 2)",
            style = WearTheme.typography.body2,
        )
    }
}
