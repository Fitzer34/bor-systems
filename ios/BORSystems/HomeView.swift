import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var discipline: DisciplineStore
    @State private var alerts: [ActiveAlert] = []
    @State private var dispatches: [DispatchItem] = []
    @State private var hangers: [Hanger] = []
    @State private var meters: [Meter] = []
    @State private var kpis: MaintKpis?
    @State private var error: String?
    @State private var refreshTask: Task<Void, Never>?
    @State private var showProfile = false
    /// Set when an APNs "Open" deep-link arrives — pushes AlertDetailView.
    @State private var deepLinkedAlert: ActiveAlert?
    /// Bumped every second to force re-evaluation of the offline computation
    /// even when the polled data is identical.
    @State private var tick = 0

    /// Battery LoRa hangers deep-sleep + check in once a DAY, so "online" =
    /// checked in within 26 h (one daily beat + 2 h margin). A lifted sign wakes
    /// the hanger instantly, so spill alerts never wait on this idle window.
    private static let onlineWindow: TimeInterval = 26 * 60 * 60

    /// The discipline whose dashboard to render — cleaners are locked to cleaning.
    private var activeDiscipline: Discipline {
        discipline.effective(for: auth.user?.role ?? .cleaner)
    }

    private var offlineHangerIds: Set<String> {
        let now = Date()
        var out = Set<String>()
        for h in hangers where h.status == .active {
            let seen = h.lastSeenAt
            let online = seen != nil && now.timeIntervalSince(seen!) <= Self.onlineWindow
            if !online { out.insert(h.id) }
        }
        return out
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let error = error {
                        Text(error).foregroundStyle(.red).font(.footnote)
                    }

                    disciplineHeader
                    kpiStrip

                    // Prioritised "what needs me" list, tailored to the active
                    // discipline. Self-contained — it fetches + ranks + deep-links.
                    NeedsAttentionView(discipline: activeDiscipline)

                    // Lower content is discipline-specific: cleaning + security
                    // lead with the live floor-plan feed; maintenance leads with
                    // its KPI scorecard.
                    disciplineDetail
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: ActiveAlert.self) { alert in
                AlertDetailView(alert: alert) {
                    await refresh()
                }
            }
            .navigationDestination(isPresented: Binding(
                get: { deepLinkedAlert != nil },
                set: { if !$0 { deepLinkedAlert = nil } }
            )) {
                if let alert = deepLinkedAlert {
                    AlertDetailView(alert: alert) { await refresh() }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let user = auth.user {
                        DutySwitch(isOn: user.onDuty) { newValue in
                            Task { await auth.setOnDuty(newValue) }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showProfile = true
                    } label: {
                        // Show the user's avatar when set, else the default glyph.
                        if let urlString = auth.user?.avatarUrl,
                           !urlString.isEmpty, let url = assetURL(urlString) {
                            AsyncImage(url: url) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                Image(systemName: "person.crop.circle")
                            }
                            .frame(width: 28, height: 28)
                            .clipShape(Circle())
                        } else {
                            Image(systemName: "person.crop.circle")
                        }
                    }
                }
            }
            .refreshable { await refresh() }
            .sheet(isPresented: $showProfile) {
                ProfileSheet()
                    .environmentObject(auth)
            }
            .task { startPolling() }
            .onDisappear { refreshTask?.cancel() }
            // Consume the APNs "Open" deep-link posted by AppDelegate. Resolve
            // the alert id against the live list and push its detail screen.
            .onReceive(NotificationCenter.default.publisher(for: .borOpenAlert)) { note in
                guard let id = note.userInfo?["alertId"] as? String else { return }
                Task {
                    if let list = try? await APIClient.shared.activeAlerts(),
                       let match = list.first(where: { $0.id == id }) {
                        deepLinkedAlert = match
                    }
                }
            }
        }
    }

    // MARK: Discipline header + KPIs

    private var disciplineHeader: some View {
        HStack(spacing: 10) {
            Image(systemName: activeDiscipline.systemImage)
                .font(.headline)
                .foregroundStyle(activeDiscipline.accent)
                .frame(width: 38, height: 38)
                .background(activeDiscipline.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 1) {
                Text(activeDiscipline.label)
                    .font(.title3.weight(.semibold))
                Text(greeting)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var greeting: String {
        let name = auth.user?.name.split(separator: " ").first.map(String.init) ?? ""
        return name.isEmpty ? "Here's what's happening" : "Hi \(name) — here's what's happening"
    }

    /// A compact KPI strip tailored to the active discipline.
    @ViewBuilder
    private var kpiStrip: some View {
        let cards = kpiCards
        if !cards.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(cards) { card in
                        KpiCard(card: card)
                    }
                }
            }
        }
    }

    private var kpiCards: [KpiCardData] {
        switch activeDiscipline {
        case .cleaning:
            let openSpills = alerts.filter { $0.kind == .spill && $0.status == .open }.count
            let inProgress = alerts.filter { $0.kind == .spill && $0.status == .acknowledged }.count
            let offline = offlineHangerIds.count
            return [
                KpiCardData(id: "spills", label: "Open spills", value: "\(openSpills)", tint: openSpills > 0 ? .red : .green),
                KpiCardData(id: "prog", label: "In progress", value: "\(inProgress)", tint: .orange),
                KpiCardData(id: "offline", label: "Offline", value: "\(offline)", tint: offline > 0 ? .orange : .green),
            ]
        case .maintenance:
            return [
                KpiCardData(id: "backlog", label: "Open backlog", value: kpis.map { "\($0.openBacklog)" } ?? "—", tint: (kpis?.openBacklog ?? 0) > 0 ? .orange : .green),
                KpiCardData(id: "due", label: "Meters due", value: "\(metersDue)", tint: metersDue > 0 ? .red : .green),
                KpiCardData(id: "pm", label: "PM compliance", value: kpis?.pmCompliancePct.map { "\($0)%" } ?? "—", tint: .blue),
            ]
        case .security:
            let openEvents = alerts.filter { $0.status == .open }.count
            let offline = offlineHangerIds.count
            return [
                KpiCardData(id: "events", label: "Active events", value: "\(openEvents)", tint: openEvents > 0 ? .red : .green),
                KpiCardData(id: "offline", label: "Devices offline", value: "\(offline)", tint: offline > 0 ? .orange : .green),
                KpiCardData(id: "onduty", label: "On duty", value: auth.user?.onDuty == true ? "Yes" : "No", tint: auth.user?.onDuty == true ? .green : .secondary),
            ]
        }
    }

    private var metersDue: Int {
        meters.filter { $0.status == "due" || $0.status == "due_soon" }.count
    }

    // MARK: Discipline detail

    @ViewBuilder
    private var disciplineDetail: some View {
        switch activeDiscipline {
        case .cleaning, .security:
            sectionHeader("Floor plans")
            SiteFloorPlansFeed()
        case .maintenance:
            sectionHeader("Maintenance at a glance")
            MaintenanceGlanceCard(kpis: kpis)
        }
    }

    private var navigationTitle: String {
        guard let u = auth.user else { return "HazardLink" }
        return "\(u.name) · \(u.role.rawValue)"
    }

    private func sectionHeader(_ text: String) -> some View {
        Text(text)
            .font(.title3.weight(.semibold))
            .padding(.top, 4)
    }

    private func startPolling() {
        refreshTask?.cancel()
        refreshTask = Task {
            // Hit the API every 5 seconds but bump `tick` every second so
            // the offline indicator flips purely from time elapsing.
            var i = 0
            while !Task.isCancelled {
                if i % 5 == 0 { await refresh() }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                tick &+= 1
                i += 1
            }
        }
    }

    private func refresh() async {
        do {
            async let alertsTask = APIClient.shared.activeAlerts()
            async let dispTask = APIClient.shared.dispatches()
            async let hangersTask = APIClient.shared.hangers()
            self.alerts = try await alertsTask
            self.dispatches = try await dispTask
            // Hangers are fetched only so we can flag "hanger offline". If the
            // fetch fails we just don't show the indicator.
            self.hangers = (try? await hangersTask) ?? self.hangers
            self.error = nil
            // Maintenance KPIs/meters only when that dashboard is showing.
            if activeDiscipline == .maintenance {
                self.kpis = (try? await APIClient.shared.maintenanceKpis()) ?? self.kpis
                self.meters = (try? await APIClient.shared.meters()) ?? self.meters
            }
            // Fire local notifications for any new alerts/dispatches we haven't seen
            LocalAlertNotifier.shared.observe(alerts: self.alerts, dispatches: self.dispatches)
        } catch APIError.unauthorized {
            self.error = "Couldn't refresh — tap to retry."
        } catch {
            self.error = "Could not refresh."
        }
    }
}

// MARK: - KPI card

struct KpiCardData: Identifiable {
    let id: String
    let label: String
    let value: String
    let tint: Color
}

private struct KpiCard: View {
    let card: KpiCardData
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(card.value)
                .font(.title2.weight(.bold))
                .foregroundStyle(card.tint)
            Text(card.label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 96, alignment: .leading)
        .padding(12)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color(.separator), lineWidth: 1))
    }
}

// MARK: - Maintenance glance card

private struct MaintenanceGlanceCard: View {
    let kpis: MaintKpis?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let k = kpis {
                row("Completed this month", "\(k.completedThisMonth)")
                Divider()
                row("Planned share", k.plannedSharePct.map { "\($0)%" } ?? "—")
                Divider()
                row("Spend (90d)", "€" + (k.spend90Cents / 100).formatted())
                Divider()
                row("Past expected life", "\(k.assetsPastLife)")
            } else {
                Text("Loading KPIs…")
                    .foregroundStyle(.secondary)
                    .padding(14)
            }
        }
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color(.separator), lineWidth: 1))
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.body.weight(.semibold))
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }
}
