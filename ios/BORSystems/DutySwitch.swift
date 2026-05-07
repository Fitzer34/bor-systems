import SwiftUI

/// "Duty" label above a chunky slide-style switch with ON / OFF text on the thumb.
/// Tap or drag to toggle.
struct DutySwitch: View {
    let isOn: Bool
    let onToggle: (Bool) -> Void

    private let trackWidth: CGFloat = 96
    private let trackHeight: CGFloat = 38
    private let thumbInset: CGFloat = 3

    private var thumbDiameter: CGFloat { trackHeight - thumbInset * 2 }

    @State private var dragOffset: CGFloat = 0  // active drag delta from current resting position
    @State private var isDragging = false

    var body: some View {
        VStack(spacing: 4) {
            Text("Duty")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(isOn ? Color.green : Color(.systemGray3))
                    .overlay(
                        Capsule().strokeBorder(.white.opacity(0.5), lineWidth: 1),
                    )
                    .animation(.easeInOut(duration: 0.18), value: isOn)

                trackLabels
                    .padding(.horizontal, 12)
                    .frame(width: trackWidth, height: trackHeight)

                thumb
                    .offset(x: thumbX)
                    .gesture(dragGesture)
                    .animation(isDragging ? nil : .interactiveSpring(response: 0.25, dampingFraction: 0.85), value: isOn)
                    .animation(isDragging ? nil : .easeOut(duration: 0.15), value: dragOffset)
            }
            .frame(width: trackWidth, height: trackHeight)
            .contentShape(Capsule())
            .onTapGesture { onToggle(!isOn) }
            .accessibilityElement()
            .accessibilityLabel("Duty")
            .accessibilityValue(isOn ? "On" : "Off")
            .accessibilityAddTraits(.isButton)
        }
    }

    // Visible "ON" / "OFF" text on the empty side of the track for visual clarity
    @ViewBuilder
    private var trackLabels: some View {
        HStack {
            if isOn {
                Text("ON").font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                Spacer()
            } else {
                Spacer()
                Text("OFF").font(.caption.weight(.bold))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
    }

    private var thumb: some View {
        ZStack {
            Capsule()
                .fill(.white)
                .shadow(color: .black.opacity(0.15), radius: 1.5, x: 0, y: 1)
            Text(thumbLabel)
                .font(.caption2.weight(.heavy))
                .foregroundStyle(isOn ? Color.green : Color(.systemGray))
        }
        .frame(width: thumbDiameter + 8, height: thumbDiameter)
        .padding(thumbInset)
    }

    private var thumbLabel: String {
        // Reflect the *projected* state during drag so the label tracks with the user's finger
        let projected = projectedIsOn
        return projected ? "ON" : "OFF"
    }

    /// Total horizontal travel of the thumb between OFF and ON positions
    private var travel: CGFloat {
        trackWidth - (thumbDiameter + 8) - thumbInset * 2
    }

    /// Resting X offset (without drag) for the thumb
    private var restingX: CGFloat {
        isOn ? travel : 0
    }

    /// Current X offset of the thumb (resting + drag, clamped to track)
    private var thumbX: CGFloat {
        max(0, min(travel, restingX + dragOffset))
    }

    /// What the toggled state would be if the drag ended right now
    private var projectedIsOn: Bool {
        thumbX > travel / 2
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                isDragging = true
                dragOffset = value.translation.width
            }
            .onEnded { _ in
                let willBeOn = projectedIsOn
                isDragging = false
                dragOffset = 0
                if willBeOn != isOn {
                    onToggle(willBeOn)
                }
            }
    }
}

#Preview {
    VStack(spacing: 30) {
        DutySwitch(isOn: true) { _ in }
        DutySwitch(isOn: false) { _ in }
    }
    .padding()
}
