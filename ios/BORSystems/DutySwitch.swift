import SwiftUI

/// "Duty" label above a chunky slide-style switch with ON / OFF text on the thumb.
/// Tap or drag to toggle.
struct DutySwitch: View {
    let isOn: Bool
    let onToggle: (Bool) -> Void

    private let trackWidth: CGFloat = 96
    private let trackHeight: CGFloat = 38
    private let thumbInset: CGFloat = 3

    private var thumbWidth: CGFloat { (trackWidth - thumbInset * 2) * 0.55 }

    @State private var dragOffset: CGFloat = 0
    @State private var isDragging = false

    var body: some View {
        VStack(spacing: 4) {
            Text("Duty")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ZStack(alignment: .leading) {
                // Track
                Capsule()
                    .fill(isOn ? Color.green : Color(.systemGray3))
                    .overlay(
                        Capsule().strokeBorder(.white.opacity(0.5), lineWidth: 1),
                    )
                    .animation(.easeInOut(duration: 0.18), value: isOn)

                // Thumb (single, only label — shows current state)
                ZStack {
                    Capsule()
                        .fill(.white)
                        .shadow(color: .black.opacity(0.18), radius: 1.5, x: 0, y: 1)
                    Text(projectedIsOn ? "ON" : "OFF")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(projectedIsOn ? Color.green : Color(.darkGray))
                        .monospacedDigit()
                }
                .frame(width: thumbWidth, height: trackHeight - thumbInset * 2)
                .padding(.leading, thumbInset)
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

    private var travel: CGFloat {
        trackWidth - thumbWidth - thumbInset * 2
    }

    private var restingX: CGFloat {
        isOn ? travel : 0
    }

    private var thumbX: CGFloat {
        max(0, min(travel, restingX + dragOffset))
    }

    private var projectedIsOn: Bool {
        thumbX > travel / 2
    }

    private var dragGesture: some Gesture {
        // minimumDistance > 0 so tap-on-thumb falls through to the outer
        // capsule's onTapGesture instead of being eaten by the drag.
        DragGesture(minimumDistance: 4)
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
