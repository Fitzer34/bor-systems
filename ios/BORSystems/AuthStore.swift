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
