import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var user: CurrentUser?
    @Published var isLoading = false
    @Published var lastError: String?

    init() {}

    var isLoggedIn: Bool { user != nil }

    /// Set while sign-in is waiting on the 6-digit code. The login screens show the code step
    /// whenever this is not nil.
    @Published private(set) var twoFactorChallenge: String?

    func bootstrap() async {
        guard APIClient.shared.token != nil else { return }
        isLoading = true
        defer { isLoading = false }
        // The server sleeps when idle and can take a while to answer the first call. Only a
        // real "not signed in" answer clears the session; a slow or failed connection is retried
        // and never signs anyone out.
        for wait in [0, 3, 8] as [UInt64] {
            if wait > 0 { try? await Task.sleep(nanoseconds: wait * 1_000_000_000) }
            do {
                user = try await APIClient.shared.currentUser()
                lastError = nil
                syncWatch()
                return
            } catch APIError.unauthorized {
                APIClient.shared.token = nil
                user = nil
                return
            } catch {
                lastError = "Couldn't reach the server. Check your connection and sign in again."
            }
        }
    }

    func login(email: String, password: String) async {
        isLoading = true
        lastError = nil
        twoFactorChallenge = nil
        do {
            let res = try await APIClient.shared.login(email: email, password: password)
            if let token = res.token, let u = res.user {
                APIClient.shared.token = token
                user = u
                syncWatch()
            } else if let challenge = res.challengeToken {
                twoFactorChallenge = challenge
            } else {
                lastError = "The server sent an answer this app doesn't understand. Update the app and try again."
            }
        } catch {
            lastError = Self.signInMessage(for: error, wrongCredentials: "Invalid email or password.")
            APIClient.shared.token = nil
            user = nil
        }
        isLoading = false
    }

    /// Second step: the code from the authenticator app, or a recovery code.
    func completeTwoFactor(code: String) async {
        guard let challenge = twoFactorChallenge else { return }
        isLoading = true
        lastError = nil
        do {
            let res = try await APIClient.shared.completeTwoFactorLogin(
                challengeToken: challenge,
                code: code.trimmingCharacters(in: .whitespacesAndNewlines))
            APIClient.shared.token = res.token
            user = res.user
            twoFactorChallenge = nil
            syncWatch()
        } catch {
            lastError = Self.signInMessage(for: error, wrongCredentials: "That code didn't work. Check the app and try again. Codes change every 30 seconds.")
        }
        isLoading = false
    }

    func cancelTwoFactor() {
        twoFactorChallenge = nil
        lastError = nil
    }

    /// Says what actually went wrong. A dropped connection used to read as a wrong password.
    private static func signInMessage(for error: Error, wrongCredentials: String) -> String {
        switch error {
        case APIError.unauthorized: return wrongCredentials
        case APIError.http(let status, _) where status == 429: return "Too many attempts. Wait a minute and try again."
        case APIError.http(let status, _) where status >= 500: return "The server had a problem (\(status)). Try again in a moment."
        case APIError.http: return wrongCredentials
        case APIError.transport: return "Couldn't reach the server. Check your connection and try again."
        default: return "Something went wrong signing in. Try again."
        }
    }

    func logout() {
        APIClient.shared.token = nil
        user = nil
        // Drop the in-memory WiFi password the device-setup wizard caches so
        // the next user on a shared device doesn't inherit it. SSID isn't
        // sensitive so we leave it.
        #if os(iOS)
        WiFiSession.clear()
        #endif
        syncWatch()  // pushes signedOut=true to the watch
    }

    /// Forward the current auth state to the paired Apple Watch so the watch
    /// app can call the backend directly. Called on every login / logout /
    /// bootstrap; the system de-dupes identical contexts.
    private func syncWatch() {
        #if os(iOS)
        WatchSync.shared.push(
            token: APIClient.shared.token,
            apiBase: AppConfig.apiBaseURL)
        #endif
    }

    func setOnDuty(_ onDuty: Bool) async {
        guard let current = user else { return }
        do {
            try await APIClient.shared.setOnDuty(onDuty)
            user = CurrentUser(
                id: current.id,
                email: current.email,
                name: current.name,
                role: current.role,
                onDuty: onDuty,
                locale: current.locale,
                permissions: current.permissions,
                phoneE164: current.phoneE164,
                avatarUrl: current.avatarUrl,
                organisationName: current.organisationName,
                lastActiveAt: current.lastActiveAt,
                createdAt: current.createdAt,
            )
        } catch {
            lastError = "Could not change duty status."
        }
    }
}
