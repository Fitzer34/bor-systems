import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacMaintenanceOverviewView: View {
    var body: some View {
        HLHostedPage(title: MacSection.overview.title, detail: MacSection.overview.blurb) {
            MaintenanceKpisView()
        }
    }
}
