package com.borsystems.app.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.TwoFactorStatus
import kotlinx.coroutines.launch

/**
 * Security — two-factor authentication management + change password.
 *
 * 2FA flow mirrors web pages/Profile.tsx TwoFactorSection: enrol → scan the QR
 * (the backend ships it as a data-URL PNG, rendered by Coil) → confirm a 6-digit
 * code → save one-time recovery codes → can later disable with a code. Uses the
 * /auth/2fa endpoints (status, enrol, enrol/confirm, disable). Change-password
 * posts to /users/me/password.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SecurityScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sign-in security") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { pad ->
        Column(
            Modifier
                .padding(pad)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            TwoFactorSection()
            HorizontalDivider()
            ChangePasswordSection()
        }
    }
}

@Composable
private fun TwoFactorSection() {
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<TwoFactorStatus?>(null) }
    var enrolSecret by remember { mutableStateOf<String?>(null) }
    var qrDataUrl by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var recoveryCodes by remember { mutableStateOf<List<String>?>(null) }
    var disableCode by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        status = runCatching { ApiClient.twoFactorStatus() }.getOrNull()
    }
    LaunchedEffect(Unit) { reload() }

    SectionHeader("Two-factor authentication")
    Text(
        "Use an authenticator app (Google Authenticator, 1Password, Authy, …) for a 6-digit code on every sign-in.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (status?.required == true && status?.enrolled == false) {
        Text(
            "Admin accounts should enable this.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.tertiary,
            fontWeight = FontWeight.SemiBold,
        )
    }

    recoveryCodes?.let { codes ->
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
            Column(Modifier.padding(16.dp)) {
                Text("Save these recovery codes", fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Each works once if you lose your authenticator. We won't show them again.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(Modifier.height(8.dp))
                codes.forEach { Text(it, fontFamily = FontFamily.Monospace) }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { recoveryCodes = null }) { Text("I've saved them") }
            }
        }
    }

    when {
        status == null -> CircularProgressIndicator()

        status?.enrolled == true -> {
            Text(
                "Enabled" + (status?.enrolledAt?.let { " since ${it.take(10)}" } ?: "") + ".",
                color = MaterialTheme.colorScheme.secondary,
                style = MaterialTheme.typography.bodyMedium,
            )
            Text("To turn off, enter a current 6-digit code (or a recovery code):", style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                value = disableCode,
                onValueChange = { disableCode = it },
                label = { Text("Code") },
                singleLine = true,
                // Recovery codes are hex-with-dash (e.g. a1b2c-d3e4f), so allow text.
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    scope.launch {
                        busy = true; error = null
                        try {
                            ApiClient.twoFactorDisable(disableCode.trim())
                            disableCode = ""
                            reload()
                        } catch (e: Exception) {
                            error = "Wrong code. Try a 6-digit code from your authenticator, or a recovery code."
                        } finally { busy = false }
                    }
                },
                enabled = disableCode.isNotBlank() && !busy,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Disabling…" else "Disable 2FA") }
        }

        enrolSecret != null -> {
            Text("1. Scan this QR code with your authenticator app.", style = MaterialTheme.typography.bodyMedium)
            qrDataUrl?.let { url ->
                AsyncImage(
                    model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current).data(url).build(),
                    contentDescription = "Scan with authenticator app",
                    modifier = Modifier.size(200.dp),
                )
            }
            Text(
                "Or type the secret manually: ${enrolSecret}",
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text("2. Enter the 6-digit code your app shows to confirm:", style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                value = code,
                onValueChange = { code = it },
                label = { Text("123 456") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = {
                        scope.launch {
                            busy = true; error = null
                            try {
                                val res = ApiClient.twoFactorConfirm(code.trim())
                                recoveryCodes = res.recoveryCodes
                                enrolSecret = null; qrDataUrl = null; code = ""
                                reload()
                            } catch (e: Exception) {
                                error = "That code didn't match. Try the next one your app shows."
                            } finally { busy = false }
                        }
                    },
                    enabled = code.trim().length >= 6 && !busy,
                ) { Text(if (busy) "Confirming…" else "Confirm and enable") }
                OutlinedButton(onClick = { enrolSecret = null; qrDataUrl = null; code = ""; error = null }) {
                    Text("Cancel")
                }
            }
        }

        else -> {
            Button(
                onClick = {
                    scope.launch {
                        busy = true; error = null
                        try {
                            val res = ApiClient.twoFactorEnrol()
                            enrolSecret = res.secret
                            qrDataUrl = res.qrDataUrl
                        } catch (e: Exception) {
                            error = "Could not start enrolment. If you already have 2FA enabled, disable it first."
                        } finally { busy = false }
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Starting…" else "Enable two-factor auth") }
        }
    }

    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
}

@Composable
private fun ChangePasswordSection() {
    val scope = rememberCoroutineScope()
    var oldPwd by remember { mutableStateOf("") }
    var newPwd by remember { mutableStateOf("") }
    var confirmPwd by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var busy by remember { mutableStateOf(false) }

    SectionHeader("Change password")
    Text(
        "Minimum 10 characters; include at least three of: lowercase, uppercase, digit, symbol.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    OutlinedTextField(
        value = oldPwd, onValueChange = { oldPwd = it },
        label = { Text("Current password") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = newPwd, onValueChange = { newPwd = it },
        label = { Text("New password (min 8 chars)") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = confirmPwd, onValueChange = { confirmPwd = it },
        label = { Text("Confirm new password") }, singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
    )
    Button(
        onClick = {
            result = null
            scope.launch {
                busy = true
                try {
                    ApiClient.changePassword(oldPwd, newPwd)
                    result = true to "Password changed."
                    oldPwd = ""; newPwd = ""; confirmPwd = ""
                } catch (e: Exception) {
                    result = false to "Could not change password — check current password."
                } finally { busy = false }
            }
        },
        enabled = oldPwd.isNotEmpty() && newPwd.length >= 8 && newPwd == confirmPwd && !busy,
        modifier = Modifier.fillMaxWidth(),
    ) { Text(if (busy) "Updating…" else "Change password") }
    result?.let { (ok, msg) ->
        Text(msg, color = if (ok) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary,
    )
}
