import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacComplianceView: View {
    var body: some View {
        HLHostedPage(title: MacSection.compliance.title, detail: MacSection.compliance.blurb) {
            ComplianceView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacCompetencyView: View {
    var body: some View {
        HLHostedPage(title: MacSection.competency.title, detail: MacSection.competency.blurb) {
            CompetencyView()
        }
    }
}
