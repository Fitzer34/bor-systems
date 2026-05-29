import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var user: CurrentUser?
    @Published var isLoading = false
    @Published var lastError: String?

    init() {}

    var isLoggedIn: Bool { user != nil }

    func bootstrap() async {
        guard APIClient.shared.token != nil else { return }
        do {
            isLoading = true
            user = try await APIClient.shared.currentUser()
            syncWatch()
        } catch {
            // Token invalid — clear it so the login screen appears
            APIClient.shared.token = nil
            user = nil
        }
        isLoading = false
    }

    func login(email: String, password: String) async {
        isLoading = true
        lastError = nil
        do {
            let res = try await APIClient.shared.login(email: email, password: password)
            APIClient.shared.token = res.token
            user = res.user
            syncWatch()
        } catch {
            lastError = "Invalid email or password."
            APIClient.shared.token = nil
            user = nil
        }
        isLoading = false
    }

    func logout() {
        APIClient.shared.token = nil
        user = nil
        // Drop the in-memory WiFi password the device-setup wizard caches so
        // the next user on a shared device doesn't inherit it. SSID isn't
        // sensitive so we leave it.
        WiFiSession.clear()
        syncWatch()  // pushes signedOut=true to the watch
    }

    /// Forward the current auth state to the paired Apple Watch so the watch
    /// app can call the backend directly. Called on every login / logout /
    /// bootstrap; the system de-dupes identical contexts.
    private func syncWatch() {
        WatchSync.shared.push(
            token: APIClient.shared.token,
            apiBase: AppConfig.apiBaseURL)
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
            )
        } catch {
            lastError = "Could not change duty status."
        }
    }
}
