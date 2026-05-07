import SwiftUI

/// Renders a floor-plan image with coloured pins overlaid on each pinned zone.
/// Pin colour: red = open alert, blue = acknowledged (cleaning in progress), green = idle.
struct FloorPlanWithPins: View {
    let planURL: URL
    let zones: [Zone]
    let alertedStatusByZoneId: [String: AlertStatus]

    var body: some View {
        AsyncImage(url: planURL) { phase in
            switch phase {
            case .empty:
                ProgressView().frame(maxWidth: .infinity, minHeight: 220)
            case .success(let image):
                GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        image.resizable().scaledToFit()
                            .frame(width: geo.size.width, height: geo.size.height)
                        ForEach(zones.filter { $0.pinX != nil && $0.pinY != nil }) { z in
                            pin(for: z, in: geo.size)
                        }
                    }
                }
                .aspectRatio(contentMode: .fit)
            case .failure:
                Text("Could not load plan image.")
                    .foregroundStyle(.secondary)
                    .padding(20)
            @unknown default:
                EmptyView()
            }
        }
    }

    private func pin(for z: Zone, in size: CGSize) -> some View {
        let status = alertedStatusByZoneId[z.id]
        let color: Color = status == .open ? .red : (status == .acknowledged ? .blue : .green)
        let pulsing = (status == .open || status == .acknowledged)
        let x = CGFloat(z.pinX ?? 0) / 1000.0 * size.width
        let y = CGFloat(z.pinY ?? 0) / 1000.0 * size.height
        return PulsingDot(color: color, animate: pulsing)
            .position(x: x, y: y)
    }
}

struct PulsingDot: View {
    let color: Color
    let animate: Bool
    @State private var pulse = false

    var body: some View {
        ZStack {
            if animate {
                Circle()
                    .stroke(color.opacity(0.6), lineWidth: 2)
                    .frame(width: pulse ? 28 : 18, height: pulse ? 28 : 18)
                    .opacity(pulse ? 0 : 0.8)
            }
            Circle()
                .fill(color)
                .overlay(Circle().stroke(.white, lineWidth: 2))
                .shadow(radius: 1.5)
                .frame(width: 14, height: 14)
        }
        .onAppear {
            if animate {
                withAnimation(.easeOut(duration: 1.0).repeatForever(autoreverses: false)) {
                    pulse = true
                }
            }
        }
    }
}

/// Builds the full URL for an asset path returned from the backend (e.g. "/uploads/floorplans/x.png").
func assetURL(_ path: String) -> URL? {
    guard !path.isEmpty else { return nil }
    let base = AppConfig.apiBaseURL.absoluteString.trimmingCharacters(in: ["/"])
    let suffix = path.hasPrefix("/") ? path : "/\(path)"
    return URL(string: base + suffix)
}

/// Tiny helper for showing relative time in lists.
func relativeTime(from date: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .abbreviated
    return formatter.localizedString(for: date, relativeTo: Date())
}
