import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacTimesheetsView: View {
    var body: some View {
        HLHostedPage(title: MacSection.timesheets.title, detail: MacSection.timesheets.blurb) {
            TimesheetsView()
        }
    }
}
