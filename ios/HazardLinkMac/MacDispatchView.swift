import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacDispatchView: View {
    var body: some View {
        HLHostedPage(title: MacSection.dispatch.title, detail: MacSection.dispatch.blurb) {
            DispatchSendView()
        }
    }
}
