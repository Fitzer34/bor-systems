import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacWorkOrdersView: View {
    var body: some View {
        HLHostedPage(title: MacSection.workOrders.title, detail: MacSection.workOrders.blurb) {
            MaintenanceJobsView()
        }
    }
}
