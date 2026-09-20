import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacFormsView: View {
    var body: some View {
        HLHostedPage(title: MacSection.forms.title, detail: MacSection.forms.blurb) {
            FormsView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacUsersView: View {
    var body: some View {
        HLHostedPage(title: MacSection.users.title, detail: MacSection.users.blurb) {
            UsersView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacProfileView: View {
    var body: some View {
        HLHostedPage(title: MacSection.profile.title, detail: MacSection.profile.blurb) {
            ProfileView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacSettingsView: View {
    var body: some View {
        HLHostedPage(title: MacSection.settings.title, detail: MacSection.settings.blurb) {
            SettingsView()
        }
    }
}
