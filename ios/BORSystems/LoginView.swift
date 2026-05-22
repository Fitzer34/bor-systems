import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focused: Field?
    enum Field { case email, password }

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()
            VStack(spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("HazardLink")
                        .font(.title2.weight(.semibold))
                    Text("Sign in")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .focused($focused, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focused = .password }

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .focused($focused, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { Task { await submit() } }

                if let err = auth.lastError {
                    Text(err).foregroundStyle(.red).font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        if auth.isLoading { ProgressView().tint(.white) }
                        Text("Sign in").bold()
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .background(Color.black, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .foregroundStyle(.white)
                .disabled(auth.isLoading || email.isEmpty || password.isEmpty)
                .opacity((email.isEmpty || password.isEmpty) ? 0.5 : 1)

                // Demo-account shortcut. Visible only in DEBUG builds and
                // TestFlight builds; we strip it from App Store releases by
                // checking the Info.plist key set by the build phase.
                if AppConfig.demoModeEnabled {
                    Button {
                        email = AppConfig.demoEmail
                        password = AppConfig.demoPassword
                        Task { await submit() }
                    } label: {
                        Text("Use demo account")
                            .font(.footnote)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                    }
                    .foregroundStyle(.secondary)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.3))
                    )
                }

                Text("By signing in you agree to our [Terms](https://bor-systems.com/terms) and [Privacy Policy](https://bor-systems.com/privacy).")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .tint(.secondary)
            }
            .padding(20)
            .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(20)
        }
    }

    private func submit() async {
        await auth.login(email: email, password: password)
    }
}

#Preview {
    LoginView().environmentObject(AuthStore())
}
