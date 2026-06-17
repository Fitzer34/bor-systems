import SwiftUI

/// Workforce competency — staff certifications with expiry (admin + supervisor).
/// Read-only on mobile: check who's qualified and what's lapsing in the field.
/// Adding/editing certs stays on the web. Mirrors the web Competency page.
struct CompetencyView: View {
    @State private var certs: [StaffCertification] = []
    @State private var error: String?
    @State private var loaded = false

    private func rank(_ s: String) -> Int {
        switch s { case "expired": return 0; case "expiring": return 1; default: return 2 }
    }
    private var sorted: [StaffCertification] {
        certs.sorted { a, b in
            if rank(a.status) != rank(b.status) { return rank(a.status) < rank(b.status) }
            return (a.expiresOn ?? "9999") < (b.expiresOn ?? "9999")
        }
    }
    private var expired: Int { certs.filter { $0.status == "expired" }.count }
    private var expiring: Int { certs.filter { $0.status == "expiring" }.count }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if expired > 0 || expiring > 0 {
                Section {
                    if expired > 0 { Label("\(expired) expired", systemImage: "xmark.seal").foregroundStyle(.red) }
                    if expiring > 0 { Label("\(expiring) expiring soon", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                }
            }
            if loaded && certs.isEmpty {
                Text("No certifications logged yet. Add them on the web dashboard.")
                    .foregroundStyle(.secondary)
            }
            ForEach(sorted) { c in CertRow(cert: c) }
        }
        .navigationTitle("Competency")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func refresh() async {
        do { certs = try await APIClient.shared.certifications(); error = nil }
        catch { self.error = "Could not load certifications." }
        loaded = true
    }
}

private struct CertRow: View {
    let cert: StaffCertification
    var body: some View {
        let s = certStatusStyle(cert)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(cert.name).font(.body.weight(.medium)).lineLimit(1)
                Spacer()
                Text(s.label).font(.caption.weight(.medium)).foregroundStyle(s.color)
            }
            HStack(spacing: 6) {
                Text(cert.userName ?? "—")
                if let r = cert.userRole { Text("· \(r.capitalized)") }
                if let iss = cert.issuer, !iss.isEmpty { Text("· \(iss)") }
                if let exp = cert.expiresOn { Spacer(); Text("expires \(exp)") }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(.vertical, 2)
    }
}

func certStatusStyle(_ c: StaffCertification) -> (label: String, color: Color) {
    switch c.status {
    case "expired":
        if let d = c.daysToExpiry { return ("Expired \(abs(d))d ago", .red) }
        return ("Expired", .red)
    case "expiring":
        return ("Expires in \(c.daysToExpiry ?? 0)d", .orange)
    default:
        return (c.expiresOn == nil ? "No expiry" : "Valid", .green)
    }
}
