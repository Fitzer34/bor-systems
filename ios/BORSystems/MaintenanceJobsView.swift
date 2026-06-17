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
        .refreshable { await refresh() }
        .task { await refresh() }
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
