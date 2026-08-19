import SwiftUI
import UniformTypeIdentifiers

/// Floor plans on the Mac: the managing view. Pick a site, see its floors,
/// upload or replace each floor's plan image (file picker or drag-and-drop),
/// add floors. The live sensor/alert overlay stays in the shared MapView,
/// reachable via "Open live view". Admin-only for uploads, as the backend
/// enforces; everyone can browse.

private struct NewFloorBody: Encodable { let name: String; let orderIndex: Int }
private struct UploadResponse: Decodable { let url: String }

struct MacFloorPlansView: View {
    @EnvironmentObject var auth: AuthStore

    @State private var buildings: [Building] = []
    @State private var selectedBuilding: String = ""
    @State private var floors: [Floor] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var busyFloor: String?
    @State private var toast: String?
    @State private var showAddFloor = false
    @State private var newFloorName = ""
    @State private var showLive = false
    @State private var dropTarget: String?
    @State private var showAddSite = false
    @State private var newSiteName = ""

    private var isAdmin: Bool { auth.user?.role == .admin }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Picker("Site", selection: $selectedBuilding) {
                    ForEach(buildings) { b in Text(b.name).tag(b.id) }
                }
                .frame(maxWidth: 320)
                .disabled(buildings.isEmpty)
                Spacer()
                if isAdmin {
                    Button { newSiteName = ""; showAddSite = true } label: { Label("Add site", systemImage: "building.2") }
                    Button { newFloorName = ""; showAddFloor = true } label: { Label("Add floor", systemImage: "plus") }
                        .disabled(selectedBuilding.isEmpty)
                }
                Button { showLive = true } label: { Label("Open live view", systemImage: "dot.radiowaves.left.and.right") }
                    .disabled(floors.isEmpty)
            }
            .padding(12)
            Divider()

            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let e = errorText {
                retryView(e) { Task { await loadAll() } }
            } else if buildings.isEmpty {
                emptyView("No sites yet", isAdmin ? "Use Add site above to create your first building, then add floors and drop the plan images on." : "An admin adds sites and uploads the plans.")
            } else if floors.isEmpty {
                emptyView("No floors on \(buildingName) yet", isAdmin
                          ? "Add the first floor, then drop a plan image (PNG or JPEG) onto it."
                          : "An admin adds floors and uploads the plans.")
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 16)], spacing: 16) {
                        ForEach(floors.sorted { $0.orderIndex < $1.orderIndex }) { f in
                            floorCard(f)
                        }
                    }
                    .padding(16)
                }
            }
        }
        .task { await loadAll() }
        .onChange(of: selectedBuilding) { _, _ in Task { await loadFloors() } }
        .sheet(isPresented: $showAddSite) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Add a site").font(.headline)
                TextField("Site name, e.g. Main Street Office", text: $newSiteName).textFieldStyle(.roundedBorder).frame(width: 320)
                HStack {
                    Spacer()
                    Button("Cancel") { showAddSite = false }
                    Button("Add") { Task { await addSite() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(newSiteName.trimmingCharacters(in: .whitespaces).isEmpty)
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding(20)
        }
        .sheet(isPresented: $showAddFloor) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Add a floor to \(buildingName)").font(.headline)
                TextField("Floor name, e.g. Ground floor", text: $newFloorName).textFieldStyle(.roundedBorder).frame(width: 320)
                HStack {
                    Spacer()
                    Button("Cancel") { showAddFloor = false }
                    Button("Add") { Task { await addFloor() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(newFloorName.trimmingCharacters(in: .whitespaces).isEmpty)
                        .keyboardShortcut(.defaultAction)
                }
            }
            .padding(20)
        }
        .sheet(isPresented: $showLive) {
            VStack(spacing: 0) {
                HStack {
                    Text("Live floor plan").font(.headline)
                    Spacer()
                    Button("Close") { showLive = false }.keyboardShortcut(.cancelAction)
                }
                .padding(12)
                Divider()
                MapView()
            }
            .frame(minWidth: 900, minHeight: 640)
        }
        .overlay(alignment: .bottom) {
            if let t = toast {
                Text(t).font(.footnote.weight(.medium)).foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.black.opacity(0.85), in: Capsule()).padding(.bottom, 18)
            }
        }
    }

    private var buildingName: String { buildings.first { $0.id == selectedBuilding }?.name ?? "this site" }

    // ── Floor card: preview + upload/replace ────────────────────────────
    @ViewBuilder private func floorCard(_ f: Floor) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(f.name).font(.headline)
                Spacer()
                if busyFloor == f.id { ProgressView().controlSize(.small) }
            }
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(dropTarget == f.id ? Color.accentColor.opacity(0.18) : Color.gray.opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(
                        dropTarget == f.id ? Color.accentColor : Color.gray.opacity(0.35),
                        style: StrokeStyle(lineWidth: dropTarget == f.id ? 2 : 1, dash: f.floorPlanUrl == nil ? [6, 4] : [])))
                if let u = f.floorPlanUrl, let url = URL(string: u) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let img): img.resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 8))
                        case .failure: Label("Plan image didn't load", systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
                        default: ProgressView()
                        }
                    }
                    .padding(6)
                } else {
                    VStack(spacing: 6) {
                        Image(systemName: "map").font(.system(size: 28)).foregroundStyle(.secondary)
                        Text(isAdmin ? "Drop a PNG or JPEG here" : "No plan uploaded yet").font(.callout).foregroundStyle(.secondary)
                        if isAdmin { Text("or use Upload plan below").font(.caption2).foregroundStyle(.secondary) }
                    }
                }
            }
            .frame(height: 200)
            .onDrop(of: [UTType.fileURL, UTType.png, UTType.jpeg], isTargeted: Binding(
                get: { dropTarget == f.id },
                set: { dropTarget = $0 ? f.id : (dropTarget == f.id ? nil : dropTarget) }
            )) { providers in
                guard isAdmin else { showToast("Only admins can upload floor plans."); return false }
                return handleDrop(providers, floor: f)
            }
            HStack {
                if isAdmin {
                    Button(f.floorPlanUrl == nil ? "Upload plan" : "Replace plan") { pickFile(for: f) }
                        .disabled(busyFloor != nil)
                }
                Spacer()
                if f.floorPlanUrl != nil {
                    Text("Plan on file").font(.caption).foregroundStyle(.green)
                } else {
                    Text("No plan").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
    }

    // ── Actions ────────────────────────────────────────────────────────
    private func pickFile(for f: Floor) {
        let panel = NSOpenPanel()
        panel.title = "Choose the floor plan image for \(f.name)"
        panel.allowedContentTypes = [.png, .jpeg]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            Task { await uploadPlan(url: url, floor: f) }
        }
    }

    private func handleDrop(_ providers: [NSItemProvider], floor: Floor) -> Bool {
        guard let p = providers.first else { return false }
        if p.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            p.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                var url: URL?
                if let d = item as? Data { url = URL(dataRepresentation: d, relativeTo: nil) }
                else if let u = item as? URL { url = u }
                if let url { Task { @MainActor in await uploadPlan(url: url, floor: floor) } }
            }
            return true
        }
        return false
    }

    private func uploadPlan(url: URL, floor: Floor) async {
        let ext = url.pathExtension.lowercased()
        let mime = ext == "png" ? "image/png" : (ext == "jpg" || ext == "jpeg") ? "image/jpeg" : nil
        guard let mime else { showToast("Floor plans must be PNG or JPEG."); return }
        guard let data = try? Data(contentsOf: url) else { showToast("Couldn't read that file."); return }
        busyFloor = floor.id
        defer { busyFloor = nil }
        do {
            let _: UploadResponse = try await APIClient.shared.upload(
                "/floors/\(floor.id)/floor-plan", fileData: data, filename: url.lastPathComponent, mimeType: mime)
            await loadFloors()
            showToast("Plan uploaded for \(floor.name).")
        } catch let e as APIError {
            if case .http(let s, _) = e, s == 403 { showToast("Only admins can upload floor plans.") }
            else if case .http(let s, _) = e, s == 413 { showToast("That image is too large. Keep plans under 8 MB.") }
            else { showToast("Upload failed. Try again.") }
        } catch { showToast("Upload failed. Try again.") }
    }

    private func addSite() async {
        let name = newSiteName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        showAddSite = false
        struct Body: Encodable { let name: String }
        struct Resp: Decodable { let building: Building }
        do {
            let r: Resp = try await APIClient.shared.request("/buildings", method: "POST", body: Body(name: name))
            await loadAll()
            selectedBuilding = r.building.id
            await loadFloors()
            showToast("\(name) added. Now add its floors.")
        } catch { showToast("Couldn't add the site.") }
    }

    private func addFloor() async {
        let name = newFloorName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !selectedBuilding.isEmpty else { return }
        showAddFloor = false
        do {
            let _: FloorResponse = try await APIClient.shared.request(
                "/buildings/\(selectedBuilding)/floors", method: "POST",
                body: NewFloorBody(name: name, orderIndex: (floors.map(\.orderIndex).max() ?? -1) + 1))
            await loadFloors()
            showToast("\(name) added. Drop its plan image onto the card.")
        } catch { showToast("Couldn't add the floor.") }
    }

    // ── Data ────────────────────────────────────────────────────────────
    private func loadAll() async {
        loading = true
        do {
            let r: BuildingsResponse = try await APIClient.shared.request("/buildings")
            buildings = r.buildings
            if selectedBuilding.isEmpty, let first = buildings.first { selectedBuilding = first.id }
            errorText = nil
        } catch { errorText = "Couldn't load sites." }
        await loadFloors()
        loading = false
    }

    private func loadFloors() async {
        guard !selectedBuilding.isEmpty else { floors = []; return }
        if let r: FloorsResponse = try? await APIClient.shared.request("/buildings/\(selectedBuilding)/floors") {
            floors = r.floors
        }
    }

    private func showToast(_ t: String) {
        withAnimation { toast = t }
        Task { try? await Task.sleep(nanoseconds: 2_800_000_000); withAnimation { toast = nil } }
    }
}
