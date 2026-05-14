import SwiftUI

/// Renders a floor-plan image with coloured pins overlaid on each pinned zone.
/// Pin styles:
///   - red pulsing  → open alert
///   - blue pulsing → acknowledged (cleaning in progress)
///   - grey dashed  → hanger offline (no recent heartbeat)
///   - green        → idle
/// Alert state wins over offline state when both apply on the same zone.
struct FloorPlanWithPins: View {
    let planURL: URL
    let zones: [Zone]
    let alertedStatusByZoneId: [String: AlertStatus]
    var offlineZoneIds: Set<String> = []

    var body: some View {
        AsyncImage(url: planURL) { phase in
            switch phase {
            case .empty:
                ProgressView().frame(maxWidth: .infinity, minHeight: 220)
            case .success(let image):
                // Put the image as the layout primary, then overlay pins via a
                // GeometryReader pinned to the image's actual rendered size.
                // This is the only way SwiftUI lets pin coords (0..1000) map to
                // the *image* rectangle and not the surrounding container.
                image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .overlay(
                        GeometryReader { geo in
                            ForEach(zones.filter { $0.pinX != nil && $0.pinY != nil }) { z in
                                pin(for: z, in: geo.size)
                            }
                        }
                    )
            case .failure:
                Text("Could not load plan image.")
                    .foregroundStyle(.secondary)
                    .padding(20)
            @unknown default:
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private func pin(for z: Zone, in size: CGSize) -> some View {
        let status = alertedStatusByZoneId[z.id]
        let x = CGFloat(z.pinX ?? 0) / 1000.0 * size.width
        let y = CGFloat(z.pinY ?? 0) / 1000.0 * size.height
        if let status = status {
            let color: Color = status == .open ? .red : .blue
            PulsingDot(color: color, animate: true)
                .position(x: x, y: y)
        } else if offlineZoneIds.contains(z.id) {
            OfflinePin().position(x: x, y: y)
        } else {
            PulsingDot(color: .green, animate: false)
                .position(x: x, y: y)
        }
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

/// The pin shown when a zone's hanger has stopped phoning home.
/// Amber so it's visually distinct from the green idle pin without
/// pulsing or shouting for attention like the red/blue alert pins.
/// A small "OFFLINE" label sits to the right of the dot so the meaning
/// is clear at a glance — no hover/tap required.
struct OfflinePin: View {
    var body: some View {
        HStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(Color.orange.opacity(0.85))
                    .frame(width: 16, height: 16)
                Circle()
                    .strokeBorder(Color.orange, style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                    .frame(width: 16, height: 16)
                Text("?")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
            }
            .shadow(radius: 1)
            Text("OFFLINE")
                .font(.system(size: 8, weight: .heavy))
                .foregroundStyle(Color.orange)
                .padding(.horizontal, 3)
                .padding(.vertical, 1)
                .background(Color.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 2))
        }
    }
}

/// Builds the full URL for an asset returned from the backend.
///
/// Handles two cases:
/// - Absolute URL (e.g. "https://images.bor-systems.com/floorplans/x.png") — returned unchanged.
///   This is what the live backend returns when R2 storage is configured.
/// - Relative path (e.g. "/uploads/floorplans/x.png") — appended to apiBaseURL.
///   This is what local-dev backend returns when files are written to disk.
func assetURL(_ path: String) -> URL? {
    guard !path.isEmpty else { return nil }
    if path.hasPrefix("http://") || path.hasPrefix("https://") {
        return URL(string: path)
    }
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
