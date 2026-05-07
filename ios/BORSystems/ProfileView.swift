import SwiftUI

struct ProfileSheet: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let u = auth.user {
                    Section("Signed in") {
                        LabeledContent("Name", value: u.name)
                        LabeledContent("Email", value: u.email)
                        LabeledContent("Role", value: u.role.rawValue.capitalized)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        auth.logout()
                        dismiss()
                    } label: {
                        Label("Sign out", systemImage: "arrow.right.square")
                    }
                }

                Section {
                    Text("Profile editing and password change are available in the web dashboard. A native version is coming.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    ProfileSheet().environmentObject(AuthStore())
}
