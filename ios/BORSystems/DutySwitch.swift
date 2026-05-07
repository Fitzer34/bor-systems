import SwiftUI

/// "Duty" label on top + a chunky pill that reads ON / OFF and changes colour.
struct DutySwitch: View {
    let isOn: Bool
    let onToggle: (Bool) -> Void

    var body: some View {
        VStack(spacing: 2) {
            Text("Duty")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Button {
                onToggle(!isOn)
            } label: {
                HStack(spacing: 6) {
                    Circle()
                        .fill(isOn ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text(isOn ? "ON" : "OFF")
                        .font(.caption.weight(.bold))
                        .monospacedDigit()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(isOn ? Color.green.opacity(0.18) : Color.gray.opacity(0.18))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(isOn ? Color.green : Color.gray.opacity(0.6), lineWidth: 1)
                )
                .foregroundStyle(isOn ? Color.green : Color.gray)
                .animation(.easeInOut(duration: 0.15), value: isOn)
            }
            .buttonStyle(.plain)
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
