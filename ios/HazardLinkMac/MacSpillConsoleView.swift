import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacSpillConsoleView: View {
    var body: some View {
        HLHostedPage(title: MacSection.alerts.title, detail: MacSection.alerts.blurb) {
            HomeView()
        }
    }
}
