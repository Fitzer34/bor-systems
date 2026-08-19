import SwiftUI

/// Place and manage wet-floor-sign pins on one floor's plan, from the desk.
///
/// The concept: every HazardLink sign hangs on a hanger sensor. The hanger
/// belongs to a *zone*, and a zone is a pin on the floor plan (pinX/pinY are
/// per-mille of the plan image, 0..1000, the same units the web and iPhone
/// render). When the sign is lifted the hanger raises a spill alert, and the
/// zone's pin goes red on every client. So the setup job is: upload the plan,
/// click where each sign lives, give the pin a name, and put a sign on it.
///
/// This view does exactly that. Click the plan to place, drag a pin to move,
/// pick a pin to rename/remove it or assign/unassign a sign.
struct MacPinEditorView: View {
    let floor: Floor
    let siteName: String
    let isAdmin: Bool
    var onClose: () -> Void

    @State private var zones: [Zone] = []
    @State private var hangers: [Hanger] = []
    @State private var alerts: [ActiveAlert] = []
    @State private var loading = true
    @State private var selectedZoneId: String?
    @State private var pendingPin: CGPoint?          // per-mille, awaiting a name
    @State private var placingZoneId: String?        // existing zone (e.g. created on the phone) being put on the plan
    @State private var pendingName = ""
    @State private var renameText = ""
    @State private var assignHangerId = ""
    @State private var dragging: (id: String, x: Int, y: Int)?
    @State private var toast: String?
    @State private var pollTask: Task<Void, Never>?
    @FocusState private var nameFocused: Bool

    private let scale: CGFloat = 1000

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(siteName) · \(floor.name)").font(.headline)
                    if let pid = placingZoneId, let z = zones.first(where: { $0.id == pid }) {
                        Text("Click the plan where \(z.name) lives.").font(.caption).foregroundStyle(Color.accentColor)
                    } else {
                        Text(isAdmin ? "Click the plan where a sign lives to place a pin. Drag a pin to move it."
                                     : "Pins show where each sign lives. An admin can place or move them.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                legend
                Button("Done") { onClose() }.keyboardShortcut(.cancelAction)
            }
            .padding(12)
            Divider()

            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HSplitView {
                    planCanvas
                        .frame(minWidth: 520, maxWidth: .infinity, maxHeight: .infinity)
                        .layoutPriority(1)
                    sidePanel
                        .frame(minWidth: 260, idealWidth: 300, maxWidth: 360)
                }
            }
        }
        .frame(minWidth: 960, minHeight: 640)
        .task { await loadAll(); startPolling() }
        .onDisappear { pollTask?.cancel() }
        .overlay(alignment: .bottom) {
            if let t = toast {
                Text(t).font(.footnote.weight(.medium)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.black.opacity(0.85), in: Capsule()).padding(.bottom, 18)
            }
        }
    }

    // MARK: derived

    private var liftedZoneIds: Set<String> {
        var ids = Set<String>()
        for a in alerts where a.kind == .spill && (a.status == .open || a.status == .acknowledged) {
            if let z = a.zoneId { ids.insert(z) }
        }
        return ids
    }
    private func hangers(in zoneId: String) -> [Hanger] { hangers.filter { $0.zoneId == zoneId } }
    private var unplacedHangers: [Hanger] { hangers.filter { $0.zoneId == nil } }
    private var selectedZone: Zone? { zones.first { $0.id == selectedZoneId } }
    private func zoneState(_ z: Zone) -> (Color, String) {
        if liftedZoneIds.contains(z.id) { return (.red, "Sign lifted, spill open") }
        if !hangers(in: z.id).isEmpty { return (.green, "Sign in place") }
        return (.gray, "No sign assigned yet")
    }

    // MARK: plan canvas

    private var legend: some View {
        HStack(spacing: 10) {
            legendDot(.red, "Sign lifted")
            legendDot(.green, "Sign in place")
            legendDot(.gray, "No sign")
        }
        .font(.caption2).foregroundStyle(.secondary)
    }
    private func legendDot(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { Circle().fill(c).frame(width: 8, height: 8); Text(t) }
    }

    @ViewBuilder private var planCanvas: some View {
        if let u = floor.floorPlanUrl, let url = URL(string: u) {
            GeometryReader { geo in
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFit()
                            .overlay { GeometryReader { ig in pinsOverlay(size: ig.size) } }
                            .frame(width: geo.size.width, height: geo.size.height)
                    case .failure:
                        VStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle").font(.system(size: 28)).foregroundStyle(.orange)
                            Text("The plan image didn't load.").foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity, maxHeight: .infinity)
                    default:
                        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            .background(Color.gray.opacity(0.08))
        } else {
            VStack(spacing: 8) {
                Image(systemName: "map").font(.system(size: 32)).foregroundStyle(.secondary)
                Text("No plan uploaded for \(floor.name) yet.").font(.headline)
                Text("Close this and use Upload plan on the floor card first. Pins need a plan to sit on.")
                    .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity).padding(24)
        }
    }

    /// The overlay is sized exactly to the rendered image (scaledToFit), so
    /// x/size.width is the per-mille fraction every client agrees on.
    private func pinsOverlay(size: CGSize) -> some View {
        ZStack(alignment: .topLeading) {
            // Click-to-place surface.
            Color.clear.contentShape(Rectangle())
                .onTapGesture(coordinateSpace: .local) { p in
                    guard isAdmin, size.width > 0, size.height > 0 else { return }
                    let px = Int((p.x / size.width * scale).rounded()).clamped(0, 1000)
                    let py = Int((p.y / size.height * scale).rounded()).clamped(0, 1000)
                    if let pid = placingZoneId, let z = zones.first(where: { $0.id == pid }) {
                        placingZoneId = nil
                        Task { await moveZone(z, x: px, y: py); selectedZoneId = z.id; showToast("\(z.name) is now on the plan.") }
                        return
                    }
                    pendingPin = CGPoint(x: px, y: py)
                    pendingName = ""
                    selectedZoneId = nil
                    nameFocused = true
                }
                .cursorCrosshair(isAdmin)

            ForEach(zones.filter { $0.pinX != nil && $0.pinY != nil }) { z in
                let (x, y) = currentPos(z)
                pinView(z)
                    .position(x: CGFloat(x) / scale * size.width, y: CGFloat(y) / scale * size.height)
                    .gesture(
                        DragGesture(minimumDistance: 3, coordinateSpace: .local)
                            .onChanged { v in
                                guard isAdmin else { return }
                                // Local coordinates are relative to the pin view; convert using the start location.
                                let base = CGPoint(x: CGFloat(z.pinX ?? 0) / scale * size.width,
                                                   y: CGFloat(z.pinY ?? 0) / scale * size.height)
                                let nx = Int(((base.x + v.translation.width) / size.width * scale).rounded()).clamped(0, 1000)
                                let ny = Int(((base.y + v.translation.height) / size.height * scale).rounded()).clamped(0, 1000)
                                dragging = (z.id, nx, ny)
                            }
                            .onEnded { _ in
                                guard isAdmin, let d = dragging, d.id == z.id else { dragging = nil; return }
                                dragging = nil
                                Task { await moveZone(z, x: d.x, y: d.y) }
                            }
                    )
                    .onTapGesture { selectedZoneId = z.id; renameText = z.name; pendingPin = nil }
            }

            if let p = pendingPin {
                Circle().fill(Color.accentColor).frame(width: 18, height: 18)
                    .overlay(Circle().stroke(.white, lineWidth: 2))
                    .shadow(radius: 3)
                    .position(x: p.x / scale * size.width, y: p.y / scale * size.height)
                    .allowsHitTesting(false)
            }
        }
    }

    private func currentPos(_ z: Zone) -> (Int, Int) {
        if let d = dragging, d.id == z.id { return (d.x, d.y) }
        return (z.pinX ?? 0, z.pinY ?? 0)
    }

    private func pinView(_ z: Zone) -> some View {
        let (color, _) = zoneState(z)
        let lifted = liftedZoneIds.contains(z.id)
        let selected = selectedZoneId == z.id
        return ZStack {
            if lifted {
                Circle().fill(color.opacity(0.35)).frame(width: 34, height: 34)
                    .modifier(PulseModifier())
            }
            Circle().fill(color).frame(width: selected ? 22 : 18, height: selected ? 22 : 18)
                .overlay(Circle().stroke(.white, lineWidth: selected ? 3 : 2))
                .shadow(radius: 2)
        }
        .overlay(alignment: .top) {
            Text(z.name).font(.caption2.weight(.semibold))
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(.ultraThinMaterial, in: Capsule())
                .offset(y: -22).fixedSize()
        }
        .contentShape(Circle())
        .help(zoneState(z).1)
    }

    // MARK: side panel

    private var sidePanel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let p = pendingPin {
                    GroupBox("Name this pin") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Where is the sign? Use a name the cleaner will recognise.")
                                .font(.caption).foregroundStyle(.secondary)
                            TextField("e.g. Lobby entrance, Canteen door", text: $pendingName)
                                .textFieldStyle(.roundedBorder).focused($nameFocused)
                                .onSubmit { Task { await createZone(at: p) } }
                            HStack {
                                Button("Cancel") { pendingPin = nil }
                                Spacer()
                                Button("Place pin") { Task { await createZone(at: p) } }
                                    .buttonStyle(.borderedProminent)
                                    .disabled(pendingName.trimmingCharacters(in: .whitespaces).isEmpty)
                            }
                        }.padding(4)
                    }
                } else if let z = selectedZone {
                    let (color, label) = zoneState(z)
                    GroupBox {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 8) {
                                Circle().fill(color).frame(width: 10, height: 10)
                                Text(label).font(.callout.weight(.medium))
                                Spacer()
                            }
                            if z.pinX == nil || z.pinY == nil {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("Not on the plan yet").font(.caption.weight(.semibold)).foregroundStyle(.orange)
                                    Text("This location was added without a spot on the plan (for example from the phone during sign setup). A lift here still raises an alert, but nobody can see where on the floor it is.")
                                        .font(.caption2).foregroundStyle(.secondary)
                                    if isAdmin && floor.floorPlanUrl != nil {
                                        Button(placingZoneId == z.id ? "Click the plan…" : "Place on plan") { placingZoneId = z.id; pendingPin = nil }
                                            .buttonStyle(.borderedProminent).controlSize(.small)
                                            .disabled(placingZoneId == z.id)
                                    }
                                }
                                .padding(8)
                                .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                            }
                            if isAdmin {
                                HStack {
                                    TextField("Pin name", text: $renameText).textFieldStyle(.roundedBorder)
                                        .onSubmit { Task { await renameZone(z) } }
                                    Button("Save") { Task { await renameZone(z) } }
                                        .disabled(renameText.trimmingCharacters(in: .whitespaces).isEmpty || renameText == z.name)
                                }
                            }
                            Divider()
                            Text("Signs on this pin").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            let here = hangers(in: z.id)
                            if here.isEmpty {
                                Text("No sign assigned. Until one is, a lift here can't light this pin.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            ForEach(here) { h in
                                HStack {
                                    Image(systemName: "sensor.tag.radiowaves.forward").foregroundStyle(.secondary)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(h.name ?? h.devEui).font(.callout)
                                        Text(h.devEui).font(.caption2).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if isAdmin {
                                        Button("Unassign") { Task { await unassign(h) } }.controlSize(.small)
                                    }
                                }
                            }
                            if isAdmin {
                                if hangers.isEmpty {
                                    Text("No signs registered yet. Register one under Hangers, then assign it here.")
                                        .font(.caption2).foregroundStyle(.secondary)
                                } else if unplacedHangers.isEmpty {
                                    Text("Every registered sign is already on a pin. Register more under Hangers.")
                                        .font(.caption2).foregroundStyle(.secondary)
                                } else {
                                    HStack {
                                        Picker("Assign", selection: $assignHangerId) {
                                            Text("Choose a sign").tag("")
                                            ForEach(unplacedHangers) { h in Text(h.name ?? h.devEui).tag(h.id) }
                                        }
                                        Button("Assign") { Task { await assign(assignHangerId, to: z) } }
                                            .disabled(assignHangerId.isEmpty)
                                    }
                                }
                                Divider()
                                Button(role: .destructive) { Task { await deleteZone(z) } } label: {
                                    Label("Remove pin", systemImage: "trash")
                                }
                                .disabled(!here.isEmpty)
                                .help(here.isEmpty ? "Delete this pin" : "Unassign its signs first")
                            }
                        }.padding(4)
                    } label: { Text(z.name).font(.headline) }
                } else {
                    GroupBox("How it works") {
                        VStack(alignment: .leading, spacing: 6) {
                            howRow("1", "Click the plan where a wet-floor sign lives and name the pin.")
                            howRow("2", "Assign the sign's sensor to that pin.")
                            howRow("3", "When the sign is lifted the pin turns red here, on the web and on every phone, and a spill alert opens.")
                        }.padding(4)
                    }
                    if !unplacedHangers.isEmpty {
                        Text("\(unplacedHangers.count) registered sign\(unplacedHangers.count == 1 ? "" : "s") not on any pin yet.")
                            .font(.caption).foregroundStyle(.orange)
                    }
                }

                Text("Pins on \(floor.name)").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                if zones.isEmpty {
                    Text(isAdmin ? "None yet. Click the plan to place the first one." : "None yet.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(zones) { z in
                    let (c, l) = zoneState(z)
                    Button { selectedZoneId = z.id; renameText = z.name; pendingPin = nil; if placingZoneId != z.id { placingZoneId = nil } } label: {
                        HStack(spacing: 8) {
                            Circle().fill(c).frame(width: 9, height: 9)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(z.name).font(.callout)
                                Text(l).font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if z.pinX == nil || z.pinY == nil { Text("not on plan").font(.caption2.weight(.semibold)).foregroundStyle(.orange) }
                        }
                        .padding(6)
                        .background(selectedZoneId == z.id ? Color.accentColor.opacity(0.12) : Color.clear, in: RoundedRectangle(cornerRadius: 6))
                        .contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }
            .padding(12)
        }
    }

    private func howRow(_ n: String, _ t: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(n).font(.caption2.weight(.bold)).frame(width: 16, height: 16)
                .background(Color.accentColor.opacity(0.15), in: Circle())
            Text(t).font(.caption)
        }
    }

    // MARK: actions

    private func createZone(at p: CGPoint) async {
        let name = pendingName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        do {
            let z = try await APIClient.shared.createZone(floorId: floor.id, name: name, pinX: Int(p.x), pinY: Int(p.y))
            pendingPin = nil; pendingName = ""
            await loadZones()
            selectedZoneId = z.id; renameText = z.name
            showToast("Pin placed. Now assign a sign to it.")
        } catch { showToast("Couldn't place the pin.") }
    }
    private func moveZone(_ z: Zone, x: Int, y: Int) async {
        do { try await APIClient.shared.updateZone(z.id, pinX: x, pinY: y); await loadZones() }
        catch { showToast("Couldn't move the pin."); await loadZones() }
    }
    private func renameZone(_ z: Zone) async {
        let n = renameText.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty, n != z.name else { return }
        do { try await APIClient.shared.updateZone(z.id, name: n); await loadZones(); showToast("Renamed.") }
        catch { showToast("Couldn't rename the pin.") }
    }
    private func deleteZone(_ z: Zone) async {
        do { try await APIClient.shared.deleteZone(z.id); selectedZoneId = nil; await loadZones(); showToast("Pin removed.") }
        catch { showToast("Couldn't remove the pin. Unassign its signs first.") }
    }
    private func assign(_ hangerId: String, to z: Zone) async {
        guard !hangerId.isEmpty else { return }
        do {
            try await APIClient.shared.relocateHanger(hangerId, toZoneId: z.id)
            assignHangerId = ""
            await loadHangers()
            showToast("Sign assigned to \(z.name).")
        } catch { showToast("Couldn't assign that sign.") }
    }
    private func unassign(_ h: Hanger) async {
        do { try await APIClient.shared.unassignHanger(h.id); await loadHangers(); showToast("Sign taken off the pin.") }
        catch { showToast("Couldn't unassign that sign.") }
    }

    // MARK: data

    private func loadAll() async {
        loading = true
        await loadZones(); await loadHangers(); await loadAlerts()
        loading = false
    }
    private func loadZones() async {
        if let z = try? await APIClient.shared.zones(floorId: floor.id) { zones = z }
    }
    private func loadHangers() async {
        if let h = try? await APIClient.shared.hangers() { hangers = h }
    }
    private func loadAlerts() async {
        if let a = try? await APIClient.shared.activeAlerts() { alerts = a }
    }
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                if Task.isCancelled { break }
                await loadAlerts(); await loadHangers()
            }
        }
    }
    private func showToast(_ t: String) {
        withAnimation { toast = t }
        Task { try? await Task.sleep(nanoseconds: 2_600_000_000); withAnimation { toast = nil } }
    }
}

private struct PulseModifier: ViewModifier {
    @State private var on = false
    func body(content: Content) -> some View {
        content
            .scaleEffect(on ? 1.35 : 0.9)
            .opacity(on ? 0.2 : 0.8)
            .animation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true), value: on)
            .onAppear { on = true }
    }
}

private extension Int {
    func clamped(_ lo: Int, _ hi: Int) -> Int { Swift.min(hi, Swift.max(lo, self)) }
}

private extension View {
    @ViewBuilder func cursorCrosshair(_ enabled: Bool) -> some View {
        if enabled {
            self.onContinuousHover { phase in
                switch phase {
                case .active: NSCursor.crosshair.set()
                case .ended: NSCursor.arrow.set()
                }
            }
        } else { self }
    }
}
