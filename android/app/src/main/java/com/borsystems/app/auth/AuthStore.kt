package com.borsystems.app.auth

import android.content.Context
import com.borsystems.app.BuildConfig
import com.borsystems.app.network.ApiClient
import com.borsystems.app.network.CurrentUser
import com.borsystems.app.wear.PhoneWatchSync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Auth state holder — mirrors ios/BORSystems/AuthStore.swift.
 *
 * `user` is null before login. Compose observes it via collectAsState()
 * and re-routes between LoginScreen and MainScaffold automatically.
 *
 * `bootstrap()` runs once on app launch: if there's a stored token in
 * EncryptedSharedPreferences, validate it via /users/me and populate user.
 * If the token is bad (401) we clear it; for any other failure we leave
 * it alone (transient server issues shouldn't kick the user out).
 */
object AuthStore {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var appContext: Context? = null

    fun setContext(ctx: Context) { appContext = ctx.applicationContext }

    private val _user = MutableStateFlow<CurrentUser?>(null)
    val user: StateFlow<CurrentUser?> = _user.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    fun bootstrap() {
        if (ApiClient.token == null) return
        scope.launch {
            _isLoading.value = true
            try {
                _user.value = ApiClient.currentUser()
                syncWatch()
            } catch (e: ApiClient.ApiException.Unauthorized) {
                ApiClient.token = null
                _user.value = null
            } catch (_: Exception) {
                // Transient failure — keep the token, let the user retry
                // (offline launch, server cold-start, etc.).
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun login(email: String, password: String) {
        scope.launch {
            _isLoading.value = true
            _lastError.value = null
            try {
                val resp = ApiClient.login(email = email, password = password)
                ApiClient.token = resp.token
                _user.value = resp.user
                syncWatch()
            } catch (_: ApiClient.ApiException.Unauthorized) {
                _lastError.value = "Invalid email or password."
                ApiClient.token = null
                _user.value = null
            } catch (e: Exception) {
                _lastError.value = e.message ?: "Login failed."
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun logout() {
        ApiClient.token = null
        _user.value = null
        syncWatch()  // pushes signedOut=true to the watch
    }

    /**
     * Forward the current session to the paired Wear OS watch.
     * No-op if the watch app isn't installed or no watch is paired.
     */
    private fun syncWatch() {
        val ctx = appContext ?: return
        PhoneWatchSync.push(ctx, ApiClient.token, BuildConfig.API_BASE_URL)
    }

    fun setOnDuty(onDuty: Boolean) {
        val current = _user.value ?: return
        scope.launch {
            try {
                ApiClient.setOnDuty(onDuty)
                _user.value = current.copy(onDuty = onDuty)
            } catch (_: Exception) {
                _lastError.value = "Could not change duty status."
            }
        }
    }
}
