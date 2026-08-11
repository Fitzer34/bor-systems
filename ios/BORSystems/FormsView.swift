import SwiftUI

/// Forms on the phone — the fill-in side. Templates are built on the web;
/// field staff open one here, fill it in and submit. Same /forms endpoints.

private struct FormField: Decodable, Identifiable {
    let id: String
    let label: String
    let type: String        // text | textarea | number | select | checkbox | date
    let required: Bool?
    let options: [String]?
}
private struct FormTpl: Decodable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let fields: [FormField]
    let active: Bool
    let submissionCount: Int?
}
private struct FormsListResponse: Decodable { let forms: [FormTpl] }

private struct FormBuildingRow: Decodable, Identifiable { let id: String; let name: String }
private struct FormBuildingsResponse: Decodable { let buildings: [FormBuildingRow] }

/// Mixed-type answer values: checkboxes go up as real booleans, numbers as
/// numbers, everything else as strings — matching what the web builder sends.
private enum FormAnswer: Encodable {
    case string(String)
    case bool(Bool)
    case number(Double)
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        }
    }
}
private struct FormSubmitBody: Encodable {
    let answers: [String: FormAnswer]
    let buildingId: String?
}
private struct FormSubmitResponse: Decodable {
    struct Sub: Decodable { let id: String }
    let submission: Sub?
}

struct FormsView: View {
    @State private var forms: [FormTpl] = []
    @State private var loading = true
    @State private var errorText: String?

    var body: some View {
        List {
            if loading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if let e = errorText {
                VStack(spacing: 8) {
                    Text(e).font(.subheadline).foregroundStyle(.secondary)
                    Button("Try again") { Task { await load() } }
                }
            } else if forms.isEmpty {
                Text("No forms yet. Build one on the web under Forms, and it appears here for the team to fill in.")
                    .font(.subheadline).foregroundStyle(.secondary)
            } else {
                ForEach(forms) { f in
                    NavigationLink {
                        FormFillView(form: f)
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(f.name).font(.subheadline.weight(.semibold))
                            if let d = f.description, !d.isEmpty {
                                Text(d).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Text("\(f.fields.count) questions · \(f.submissionCount ?? 0) submissions")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .navigationTitle("Forms")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        loading = true
        do {
            let r: FormsListResponse = try await APIClient.shared.request("/forms")
            forms = r.forms.filter { $0.active }
            errorText = nil
        } catch {
            errorText = "Couldn't load forms."
        }
        loading = false
    }
}

private struct FormFillView: View {
    let form: FormTpl
    @Environment(\.dismiss) private var dismiss

    @State private var text: [String: String] = [:]
    @State private var bools: [String: Bool] = [:]
    @State private var dates: [String: Date] = [:]
    @State private var buildings: [FormBuildingRow] = []
    @State private var buildingId = ""
    @State private var busy = false
    @State private var errorText: String?
    @State private var done = false

    var body: some View {
        Form {
            if let d = form.description, !d.isEmpty {
                Section { Text(d).font(.subheadline).foregroundStyle(.secondary) }
            }
            if !buildings.isEmpty {
                Section {
                    Picker("Site", selection: $buildingId) {
                        Text("No site").tag("")
                        ForEach(buildings) { b in Text(b.name).tag(b.id) }
                    }
                }
            }
            ForEach(form.fields) { f in
                Section {
                    fieldInput(f)
                } header: {
                    Text(f.label + ((f.required ?? false) ? " *" : ""))
                }
            }
            if let e = errorText {
                Section { Text(e).font(.subheadline).foregroundStyle(.red) }
            }
            Section {
                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if busy { ProgressView() } else { Text("Submit").fontWeight(.semibold) }
                        Spacer()
                    }
                }
                .disabled(busy)
            } footer: {
                Text("Submitting records it for the whole organisation, same as the web.")
            }
        }
        .navigationTitle(form.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let b: FormBuildingsResponse = try? await APIClient.shared.request("/buildings") {
                buildings = b.buildings
            }
        }
        .alert("Submitted", isPresented: $done) {
            Button("Done") { dismiss() }
        } message: {
            Text("Thanks — your answers are recorded.")
        }
    }

    @ViewBuilder private func fieldInput(_ f: FormField) -> some View {
        switch f.type {
        case "textarea":
            TextField("Type your answer…", text: binding(f.id), axis: .vertical)
                .lineLimit(3...6)
        case "number":
            TextField("0", text: binding(f.id)).keyboardType(.decimalPad)
        case "checkbox":
            Toggle("Yes", isOn: Binding(
                get: { bools[f.id] ?? false },
                set: { bools[f.id] = $0 }))
        case "select":
            Picker("Pick one", selection: binding(f.id)) {
                Text("—").tag("")
                ForEach(f.options ?? [], id: \.self) { o in Text(o).tag(o) }
            }
        case "date":
            DatePicker("Date", selection: Binding(
                get: { dates[f.id] ?? Date() },
                set: { dates[f.id] = $0 }), displayedComponents: .date)
        default:
            TextField("Type your answer…", text: binding(f.id))
        }
    }

    private func binding(_ id: String) -> Binding<String> {
        Binding(get: { text[id] ?? "" }, set: { text[id] = $0 })
    }

    private func submit() async {
        // Client-side required check with a named field, mirroring the web.
        for f in form.fields where (f.required ?? false) {
            let missing: Bool
            switch f.type {
            case "checkbox": missing = !(bools[f.id] ?? false)
            case "date": missing = dates[f.id] == nil
            default: missing = (text[f.id] ?? "").trimmingCharacters(in: .whitespaces).isEmpty
            }
            if missing {
                errorText = "\"\(f.label)\" is required."
                return
            }
        }
        busy = true
        defer { busy = false }
        var answers: [String: FormAnswer] = [:]
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        for f in form.fields {
            switch f.type {
            case "checkbox":
                answers[f.id] = .bool(bools[f.id] ?? false)
            case "date":
                if let d = dates[f.id] { answers[f.id] = .string(df.string(from: d)) }
            case "number":
                if let n = Double(text[f.id] ?? "") { answers[f.id] = .number(n) }
            default:
                let v = (text[f.id] ?? "").trimmingCharacters(in: .whitespaces)
                if !v.isEmpty { answers[f.id] = .string(v) }
            }
        }
        do {
            let _: FormSubmitResponse = try await APIClient.shared.request(
                "/forms/\(form.id)/submissions", method: "POST",
                body: FormSubmitBody(answers: answers, buildingId: buildingId.isEmpty ? nil : buildingId))
            errorText = nil
            done = true
        } catch {
            errorText = "Could not submit. Check the required answers and try again."
        }
    }
}
