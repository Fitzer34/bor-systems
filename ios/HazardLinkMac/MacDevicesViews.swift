import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacHangersView: View {
    var body: some View {
        HLHostedPage(title: MacSection.hangers.title, detail: MacSection.hangers.blurb) {
            HangersView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacGatewaysView: View {
    var body: some View {
        HLHostedPage(title: MacSection.gateways.title, detail: MacSection.gateways.blurb) {
            GatewaysView()
        }
    }
}
