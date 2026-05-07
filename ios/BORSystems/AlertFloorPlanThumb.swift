import SwiftUI

/// Compact floor-plan thumbnail used on each row of the active-alerts list.
struct AlertFloorPlanThumb: View {
    let floorId: String?
    let alertedZoneId: String?
    let status: AlertStatus

    @State private var floor: Floor?
    @State private var zones: [Zone] = []

    var body: some View {
        Group {
            if let url = planURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .overlay(
                                GeometryReader { geo in
                                    ForEach(zones.filter { $0.pinX != nil && $0.pinY != nil }) { z in
                                        let isAlerted = (z.id == alertedZoneId)
                                        let color: Color = isAlerted ? (status == .acknowledged ? .blue : .red) : .green
                                        Circle()
                                            .fill(color)
                                            .overlay(Circle().stroke(.white, lineWidth: 1.5))
                                            .frame(width: isAlerted ? 12 : 6, height: isAlerted ? 12 : 6)
                                            .position(
                                                x: CGFloat(z.pinX ?? 0) / 1000 * geo.size.width,
                                                y: CGFloat(z.pinY ?? 0) / 1000 * geo.size.height,
                                            )
                                    }
                                }
                            )
                            .background(Color(.secondarySystemBackground))
                    default:
                        Color(.secondarySystemBackground)
                    }
                }
            } else {
                Color(.secondarySystemBackground)
            }
        }
        .frame(width: 110, height: 70)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .task { await load() }
    }

    private var planURL: URL? {
        guard let path = floor?.floorPlanUrl else { return nil }
        return assetURL(path)
    }

    private func load() async {
        guard let id = floorId else { return }
        async let floorTask = APIClient.shared.floor(id)
        async let zonesTask = APIClient.shared.zones(floorId: id)
        self.floor = try? await floorTask
        self.zones = (try? await zonesTask) ?? []
    }
}
