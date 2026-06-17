import SwiftUI

/// A single work order: status, details, timeline, and lifecycle actions
/// (schedule → start → complete / cancel) — mirrors the web job modal.
struct MaintenanceJobDetailView: View {
    let jobId: String
    let onChange: () -> Void

    @State private var job: MaintenanceJob?
    @State private var events: [JobEvent] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var working = false

    @State private var showSchedule = false
    @State private var scheduleDate = Date()
    @State private var showComplete = false
    @State private var completeNote = ""
    @State private var confirmingCancel = false

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            if let job {
                Section {
                    HStack {
                        Text(jobStatusStyle(job.status).label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(jobStatusStyle(job.status).color)
                        if job.priority != "routine" {
                            Spacer()
                            Text(job.priority.capitalized)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(priorityColor(job.priority))
                        }
                    }
                    if let d = job.description, !d.isEmpty {
                        Text(d).font(.body)
                    }
                }

                actions(job)

                Section("Timeline") {
                    if events.isEmpty {
                        Text("No activity yet.").foregroundStyle(.secondary)
                    }
                    ForEach(events) { e in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.type.capitalized).font(.subheadline.weight(.medium))
                            if let det = e.detail, !det.isEmpty {
                                Text(det).font(.caption).foregroundStyle(.secondary)
                            }
                            if let ts = e.createdAt {
                                Text(shortTimestampLabel(ts)).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            } else if loaded {
                Text("Job not found.").foregroundStyle(.secondary)
            }
        }
        .navigationTitle(job?.title ?? "Job")
        .navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
        .sheet(isPresented: $showSchedule) { scheduleSheet }
        .alert("Mark complete", isPresented: $showComplete) {
            TextField("Completion note (optional)", text: $completeNote)
            Button("Complete") {
                Task { await act { try await APIClient.shared.completeJob(jobId, note: completeNote.isEmpty ? nil : completeNote) } }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Cancel this job?", isPresented: $confirmingCancel) {
            Button("Cancel job", role: .destructive) {
                Task { await act { try await APIClient.shared.cancelJob(jobId) } }
            }
            Button("Keep", role: .cancel) {}
        }
    }

    @ViewBuilder private func actions(_ job: MaintenanceJob) -> some View {
        if !jobIsClosed(job.status) {
            Section("Work order") {
                if job.status != "scheduled" && job.status != "in_progress" {
                    Button { scheduleDate = Date(); showSchedule = true } label: {
                        Label("Schedule", systemImage: "calendar.badge.plus")
                    }
                }
                if job.status == "scheduled" {
                    Button { Task { await act { try await APIClient.shared.startJob(jobId) } } } label: {
                        Label("Mark started", systemImage: "play.circle")
                    }
                }
                if job.status == "in_progress" {
                    Button { completeNote = ""; showComplete = true } label: {
                        Label("Mark complete", systemImage: "checkmark.circle")
                    }
                }
                Button(role: .destructive) { confirmingCancel = true } label: {
                    Label("Cancel job", systemImage: "xmark.circle")
                }
            }
            .disabled(working)
        } else if job.status == "completed" {
            Section {
                Label("Completed", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                if let n = job.completionNote, !n.isEmpty {
                    Text(n).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var scheduleSheet: some View {
        NavigationStack {
            Form {
                DatePicker("Start", selection: $scheduleDate)
            }
            .navigationTitle("Schedule job")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { showSchedule = false } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        showSchedule = false
                        Task { await act { try await APIClient.shared.scheduleJob(jobId, startAtISO: isoFormatter.string(from: scheduleDate)) } }
                    }.bold()
                }
            }
        }
    }

    private func refresh() async {
        do {
            let d = try await APIClient.shared.maintenanceJobDetail(jobId)
            job = d.job; events = d.events; error = nil
        } catch {
            self.error = "Could not load the job."
        }
        loaded = true
    }

    private func act(_ op: @escaping () async throws -> Void) async {
        working = true
        defer { working = false }
        do { try await op(); await refresh(); onChange() }
        catch { self.error = "Action failed — try again." }
    }
}

private let isoFormatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

private func shortTimestampLabel(_ iso: String) -> String {
    let frac = ISO8601DateFormatter()
    frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = frac.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return iso }
    let out = DateFormatter()
    out.dateStyle = .medium
    out.timeStyle = .short
    return out.string(from: date)
}
