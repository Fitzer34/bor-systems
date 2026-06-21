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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.borsystems.app.auth.AuthStore
import com.borsystems.app.network.ApiClient
import kotlinx.coroutines.launch

/**
 * Edit profile — mirrors iOS EditProfileView.swift.
 *
 * Edits personal details only (name, phone). Password changes and 2FA live
 * on SecurityScreen, reachable from ProfileScreen's "Sign-in security" row.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val user by AuthStore.user.collectAsState()

    var name by remember(user?.id) { mutableStateOf(user?.name ?: "") }
    var phone by remember(user?.id) { mutableStateOf("") }
    var profileSaved by remember { mutableStateOf(false) }
    var profileError by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My profile") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            user?.let { u ->
                SectionHeader("Account")
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Email", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(u.email, fontWeight = FontWeight.SemiBold)
                }
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Role", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(u.role.name.replaceFirstChar(Char::uppercase), fontWeight = FontWeight.SemiBold)
                }
            }

            HorizontalDivider()

            SectionHeader("Profile")
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text("Phone (E.164, e.g. +353…)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
            )
            val phoneValid = phone.isEmpty() || Regex("^\\+[1-9]\\d{6,14}$").matches(phone)
            Button(
                onClick = {
                    profileSaved = false; profileError = null
                    scope.launch {
                        try {
                            ApiClient.updateProfile(name, phone.ifBlank { null })
                            AuthStore.bootstrap()
                            profileSaved = true
                        } catch (e: Exception) {
                            profileError = "Could not save."
                        }
                    }
                },
                enabled = name.isNotBlank() && phoneValid,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save") }
            if (profileSaved) {
                Text("Saved", color = MaterialTheme.colorScheme.secondary)
            }
            profileError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Text(
                "Phone is used for SMS escalation when a supervisor needs to be alerted urgently.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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
