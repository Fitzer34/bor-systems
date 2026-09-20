import SwiftUI

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacNotificationsLogView: View {
    var body: some View {
        HLHostedPage(title: MacSection.notificationsLog.title, detail: MacSection.notificationsLog.blurb) {
            NotificationsLogView()
        }
    }
}

/// Placeholder: the iPhone screen in a Mac frame, until the Mac-built screen replaces it.
struct MacAuditLogView: View {
    var body: some View {
        HLHostedPage(title: MacSection.auditLog.title, detail: MacSection.auditLog.blurb) {
            AuditLogView()
        }
    }
}
