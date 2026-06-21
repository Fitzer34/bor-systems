import SwiftUI
import Combine

/// The service line a staff member is currently working in. The web app tailors
/// each dashboard (Cleaning / Maintenance / Security) to the discipline; we
/// mirror that on the phone with a client-side switcher.
///
/// This is a *view* preference, not an authorisation boundary — permissions
/// (see Permissions.swift) still gate what's actually reachable. It only decides
/// which KPIs and "needs attention" framing the Home tab leads with.
enum Discipline: String, CaseIterable, Identifiable {
    case cleaning
    case maintenance
    case security

    var id: String { rawValue }

    var label: String {
        switch self {
        case .cleaning:    return "Cleaning"
        case .maintenance: return "Maintenance"
        case .security:    return "Security"
        }
    }

    var systemImage: String {
        switch self {
        case .cleaning:    return "sparkles"
        case .maintenance: return "wrench.and.screwdriver"
        case .security:    return "shield.lefthalf.filled"
        }
    }

    var accent: Color {
        switch self {
        case .cleaning:    return .blue
        case .maintenance: return .orange
        case .security:    return .purple
        }
    }
}

/// Persists the chosen discipline in UserDefaults and publishes changes so the
/// Home tab re-renders. Cleaners are locked to Cleaning regardless of any stored
/// value — they only ever do cleaning ops, and the switcher is hidden for them.
@MainActor
final class DisciplineStore: ObservableObject {
    @Published private(set) var current: Discipline

    private static let key = "selected_discipline"

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.key)
        self.current = stored.flatMap(Discipline.init(rawValue:)) ?? .cleaning
    }

    /// Switch the active discipline. No-op for cleaners (locked to cleaning).
    func set(_ discipline: Discipline, role: UserRole) {
        guard role != .cleaner else { return }
        current = discipline
        UserDefaults.standard.set(discipline.rawValue, forKey: Self.key)
    }

    /// The discipline to actually render for a given role — cleaners are always
    /// shown the cleaning dashboard even if an older stored value says otherwise.
    func effective(for role: UserRole) -> Discipline {
        role == .cleaner ? .cleaning : current
    }
}
