import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacPpmsView: View {
    var body: some View {
        HLHostedPage(title: MacSection.ppms.title, detail: MacSection.ppms.blurb) {
            PPMsView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacMetersView: View {
    var body: some View {
        HLHostedPage(title: MacSection.meters.title, detail: MacSection.meters.blurb) {
            MetersView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacPermitsView: View {
    var body: some View {
        HLHostedPage(title: MacSection.permits.title, detail: MacSection.permits.blurb) {
            PermitsView()
        }
    }
}
