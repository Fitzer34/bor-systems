import SwiftUI

// MARK: - List

/// Maintenance work orders — the CMMS jobs board (admin + supervisor). Mirrors
/// the web Maintenance page. Tendering/quotes stay on the web for now; this view
/// manages the work-order lifecycle (schedule → start → complete / cancel).
struct MaintenanceJobsView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var jobs: [MaintenanceJob] = []
    @State private var error: String?
    @State private var loaded = false
    @State private var exporting = false
    @State private var sheet: Sheet?

    private enum Sheet: Identifiable {
        case share(URL)
        case log
        var id: String {
            switch self {
            case .share(let u): return "share:\(u.absoluteString)"
            case .log: return "log"
            }
        }
    }

    private var openJobs: [MaintenanceJob] { jobs.filter { !jobIsClosed($0.status) } }
    private var closedJobs: [MaintenanceJob] { jobs.filter { jobIsClosed($0.status) } }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if loaded && jobs.isEmpty {
                Text("No jobs yet.").foregroundStyle(.secondary)
            }
            ForEach(openJobs) { row($0) }
            if !closedJobs.isEmpty {
                Section("Closed") { ForEach(closedJobs) { row($0) } }
            }
        }
        .navigationTitle("Maintenance")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { sheet = .log } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Log a job")
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { Task { await exportCsv() } } label: {
                    if exporting { ProgressView() } else { Image(systemName: "square.and.arrow.up") }
                }
                .disabled(exporting || jobs.isEmpty)
                .accessibilityLabel("Export CSV")
            }
        }
        .sheet(item: $sheet) { s in
            switch s {
            case .share(let url): ActivityView(items: [url])
            case .log: LogJobView(onLogged: { Task { await refresh() } })
            }
        }
        .refreshable { await refresh() }
        .task { await refresh() }
    }

    private func exportCsv() async {
        exporting = true
        defer { exporting = false }
        do { sheet = .share(try await APIClient.shared.maintenanceJobsCSV()) }
        catch { self.error = "Could not export CSV." }
    }

    @ViewBuilder private func row(_ j: MaintenanceJob) -> some View {
        NavigationLink {
            MaintenanceJobDetailView(jobId: j.id, onChange: { Task { await refresh() } })
        } label: {
            JobRow(job: j)
        }
    }

    private func refresh() async {
        do { jobs = try await APIClient.shared.maintenanceJobs(); error = nil }
        catch { self.error = "Could not load jobs." }
        loaded = true
    }
}

// MARK: - Row

private struct JobRow: View {
    let job: MaintenanceJob
    var body: some View {
        let s = jobStatusStyle(job.status)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(job.title).font(.body.weight(.medium)).lineLimit(2)
                Spacer()
                Text(s.label).font(.caption.weight(.medium)).foregroundStyle(s.color)
            }
            HStack(spacing: 6) {
                if job.priority != "routine" {
                    Text(job.priority.capitalized).font(.caption.weight(.semibold)).foregroundStyle(priorityColor(job.priority))
                }
                if let d = job.description, !d.isEmpty { Text(d).lineLimit(1) }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Shared helpers (also used by the detail view — same module)

func jobIsClosed(_ status: String) -> Bool { status == "completed" || status == "cancelled" }

func jobStatusStyle(_ status: String) -> (label: String, color: Color) {
    switch status {
    case "logged": return ("Logged", .secondary)
    case "scoped": return ("Scoped", .secondary)
    case "tendering": return ("Tendering", .blue)
    case "awarded": return ("Awarded", .indigo)
    case "scheduled": return ("Scheduled", .indigo)
    case "in_progress": return ("In progress", .orange)
    case "completed": return ("Completed", .green)
    case "cancelled": return ("Cancelled", .secondary)
    default: return (status.capitalized, .secondary)
    }
}

func priorityColor(_ p: String) -> Color {
    switch p {
    case "emergency": return .red
    case "urgent": return .orange
    default: return .secondary
    }
}

// MARK: - CSV share

/// Identifiable wrapper so a freshly-written CSV file URL can drive `.sheet(item:)`.
struct ShareItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Thin SwiftUI bridge to `UIActivityViewController` — the system share sheet,
/// which lets the user save the CSV to Files, AirDrop or email it, etc.
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
