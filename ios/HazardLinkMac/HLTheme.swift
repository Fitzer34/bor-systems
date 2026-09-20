import SwiftUI
import AppKit

// The Mac app's theme layer. The values are the ones the live website renders
// (web/src/prototype/prototype.css), so the desk app and the site read as one product:
// a light page, white cards with a hairline border, a navy sidebar, trust blue for action,
// teal / amber / indigo for the three disciplines.

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }

    // Surfaces
    static let hlPage = Color(hex: 0xEEF1F5)
    static let hlCard = Color(hex: 0xFFFFFF)
    static let hlSurface2 = Color(hex: 0xF8FAFC)
    static let hlLine = Color(hex: 0xE2E8F1)

    // Ink
    static let hlInk = Color(hex: 0x0D1526)
    static let hlInk2 = Color(hex: 0x475569)
    static let hlInk3 = Color(hex: 0x64748B)

    // Action
    static let hlPrimary = Color(hex: 0x2563EB)
    static let hlPrimaryHover = Color(hex: 0x1D4ED8)
    static let hlPrimarySoft = Color(hex: 0xDBEAFE)

    // Sidebar (navy)
    static let hlSidebar = Color(hex: 0x0B1220)
    static let hlSidebarRaised = Color(hex: 0x111A2E)
    static let hlSidebarActive = Color(hex: 0x18233D)
    static let hlSidebarText = Color(hex: 0x97A3BD)

    // Disciplines
    static let hlClean = Color(hex: 0x0D9488)
    static let hlCleanSoft = Color(hex: 0xE3F5F2)
    static let hlMaint = Color(hex: 0xB45309)
    static let hlMaintSoft = Color(hex: 0xFBF0DD)
    static let hlSecure = Color(hex: 0x4F46E5)
    static let hlSecureSoft = Color(hex: 0xECEBFD)
}

/// Meaning carried by colour. Every tone has a solid colour, a soft background and a dark ink of
/// the same hue, so text on a tinted chip always passes contrast.
enum HLTone {
    case neutral, info, success, warning, danger, clean, maint, secure

    var solid: Color {
        switch self {
        case .neutral: return .hlInk3
        case .info: return .hlPrimary
        case .success: return Color(hex: 0x16A34A)
        case .warning: return Color(hex: 0xD97706)
        case .danger: return Color(hex: 0xDC2626)
        case .clean: return .hlClean
        case .maint: return .hlMaint
        case .secure: return .hlSecure
        }
    }

    var soft: Color {
        switch self {
        case .neutral: return Color(hex: 0xF1F5F9)
        case .info: return .hlPrimarySoft
        case .success: return Color(hex: 0xDCFCE7)
        case .warning: return Color(hex: 0xFEF3C7)
        case .danger: return Color(hex: 0xFEE2E2)
        case .clean: return .hlCleanSoft
        case .maint: return .hlMaintSoft
        case .secure: return .hlSecureSoft
        }
    }

    var ink: Color {
        switch self {
        case .neutral: return Color(hex: 0x334155)
        case .info: return Color(hex: 0x1E40AF)
        case .success: return Color(hex: 0x166534)
        case .warning: return Color(hex: 0x92400E)
        case .danger: return Color(hex: 0x991B1B)
        case .clean: return Color(hex: 0x0F766E)
        case .maint: return Color(hex: 0x92400E)
        case .secure: return Color(hex: 0x3730A3)
        }
    }
}

enum HLRadius {
    static let control: CGFloat = 9
    static let card: CGFloat = 14
    static let chip: CGFloat = 20
}

// MARK: - Card

private struct HLCardModifier: ViewModifier {
    var padding: CGFloat
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color.hlCard, in: RoundedRectangle(cornerRadius: HLRadius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: HLRadius.card, style: .continuous).stroke(Color.hlLine, lineWidth: 1))
            .shadow(color: Color.hlInk.opacity(0.05), radius: 2, x: 0, y: 1)
    }
}

extension View {
    /// White card, hairline border, soft shadow: the website's `.card`.
    func hlCard(padding: CGFloat = 18) -> some View { modifier(HLCardModifier(padding: padding)) }

    /// The light page every screen sits on.
    func hlPage() -> some View { background(Color.hlPage) }
}

// MARK: - KPI tile

/// The website's KPI tile: a tinted icon chip and label, a large tabular value, a foot line.
/// `value == nil` means the number could not be loaded: the tile says so and never shows a zero
/// it does not know to be true.
struct HLKpiTile: View {
    let label: String
    let icon: String
    let value: String?
    var foot: String = ""
    var tone: HLTone = .info
    var loading: Bool = false
    var action: (() -> Void)? = nil

    @State private var hovering = false

    var body: some View {
        let tile = VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(tone.ink)
                    .frame(width: 30, height: 30)
                    .background(tone.soft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.hlInk2)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            Group {
                if let value {
                    Text(value).foregroundStyle(Color.hlInk)
                } else if loading {
                    Text("...").foregroundStyle(Color.hlInk3)
                } else {
                    Text("Not loaded").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.hlInk3)
                }
            }
            .font(.system(size: 30, weight: .heavy).monospacedDigit())
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            if !foot.isEmpty {
                Text(foot)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Color.hlInk3)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .hlCard(padding: 16)
        .overlay(RoundedRectangle(cornerRadius: HLRadius.card, style: .continuous)
            .stroke(hovering && action != nil ? Color.hlPrimary.opacity(0.55) : .clear, lineWidth: 1.5))

        if let action {
            Button(action: action) { tile }
                .buttonStyle(.plain)
                .onHover { hovering = $0 }
                .help("Open \(label.lowercased())")
        } else {
            tile
        }
    }
}

// MARK: - Status pill

/// The website's pill: soft tint, dark ink of the same hue, optional dot.
struct HLPill: View {
    let text: String
    var tone: HLTone = .neutral
    var dot: Bool = false

    var body: some View {
        HStack(spacing: 5) {
            if dot { Circle().fill(tone.solid).frame(width: 6, height: 6) }
            Text(text).font(.system(size: 11.5, weight: .bold)).lineLimit(1)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 3)
        .foregroundStyle(tone.ink)
        .background(tone.soft, in: Capsule())
        .fixedSize()
    }
}

// MARK: - Page header, section title, empty and error states

/// Page title, one-line description, actions on the right.
struct HLPageHeader<Actions: View>: View {
    let title: String
    var detail: String = ""
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 25, weight: .heavy)).foregroundStyle(Color.hlInk)
                if !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 14))
                        .foregroundStyle(Color.hlInk2)
                        .frame(maxWidth: 560, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 12)
            HStack(spacing: 8) { actions() }
        }
        .padding(.bottom, 6)
    }
}

extension HLPageHeader where Actions == EmptyView {
    init(title: String, detail: String = "") {
        self.init(title: title, detail: detail, actions: { EmptyView() })
    }
}

struct HLSectionTitle: View {
    let text: String
    var tone: HLTone = .neutral
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11.5, weight: .bold))
            .tracking(0.6)
            .foregroundStyle(tone == .neutral ? Color.hlInk3 : tone.ink)
    }
}

/// An honest empty state: an icon tile, what is missing, what to do about it.
struct HLEmptyState: View {
    let icon: String
    let title: String
    var message: String = ""
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 24, weight: .medium))
                .foregroundStyle(Color.hlInk3)
                .frame(width: 60, height: 60)
                .background(Color.hlSurface2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.hlLine, lineWidth: 1))
            Text(title).font(.system(size: 17, weight: .bold)).foregroundStyle(Color.hlInk)
            if !message.isEmpty {
                Text(message)
                    .font(.system(size: 13.5))
                    .foregroundStyle(Color.hlInk2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.borderedProminent).padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
    }
}

/// A failed load, said plainly, with a way to try again. Used in place of zeros.
struct HLLoadError: View {
    let message: String
    var retry: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(HLTone.warning.solid)
            Text(message).font(.system(size: 13)).foregroundStyle(HLTone.warning.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if let retry { Button("Try again", action: retry).controlSize(.small) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(HLTone.warning.soft, in: RoundedRectangle(cornerRadius: HLRadius.control, style: .continuous))
    }
}

// MARK: - Screen scaffolding

/// The frame every Mac screen sits in: light page, scrolls, comfortable margins, a width cap so
/// lines stay readable on a wide display.
struct HLScreen<Content: View>: View {
    var maxWidth: CGFloat = 1240
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) { content() }
                .padding(28)
                .frame(maxWidth: maxWidth, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .hlPage()
    }
}

/// A white card holding rows split by hairlines: the website's table-in-a-card.
struct HLRows<Data: RandomAccessCollection, Row: View>: View where Data.Element: Identifiable {
    let data: Data
    @ViewBuilder var row: (Data.Element) -> Row

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(data.enumerated()), id: \.element.id) { i, item in
                if i > 0 { Divider().overlay(Color.hlLine) }
                row(item).padding(.vertical, 10).padding(.horizontal, 16)
            }
        }
        .hlCard(padding: 0)
    }
}

/// A small column heading row for `HLRows` tables.
struct HLColumnHeader: View {
    let titles: [(String, CGFloat?)]   // title, fixed width (nil = flexible)

    var body: some View {
        HStack(spacing: 12) {
            ForEach(Array(titles.enumerated()), id: \.offset) { _, t in
                Text(t.0.uppercased())
                    .font(.system(size: 10.5, weight: .bold)).tracking(0.5)
                    .foregroundStyle(Color.hlInk3)
                    .frame(width: t.1, alignment: .leading)
                    .frame(maxWidth: t.1 == nil ? .infinity : nil, alignment: .leading)
            }
        }
        .padding(.horizontal, 16)
    }
}

/// Frames a screen that was written for the iPhone: page header on top, the screen itself in a
/// white card with a sensible width, forms drawn the grouped Mac way. It is the fallback for any
/// section that has no Mac-built screen yet.
struct HLHostedPage<Content: View>: View {
    let title: String
    var detail: String = ""
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HLPageHeader(title: title, detail: detail)
            content()
                .formStyle(.grouped)
                .scrollContentBackground(.hidden)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(Color.hlCard, in: RoundedRectangle(cornerRadius: HLRadius.card, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: HLRadius.card, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: HLRadius.card, style: .continuous).stroke(Color.hlLine, lineWidth: 1))
        }
        .padding(28)
        .frame(maxWidth: 1100, maxHeight: .infinity, alignment: .topLeading)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .hlPage()
    }
}

/// Toast shown at the bottom of a screen after an action, then cleared by the caller.
struct HLToast: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 12.5, weight: .semibold)).foregroundStyle(.white)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color.hlInk.opacity(0.92), in: Capsule())
            .padding(.bottom, 18)
    }
}

// MARK: - App appearance

enum HLAppearance {
    /// The owner wants a light app whatever the Mac is set to. Pinning the whole app to Aqua
    /// also keeps the hosted iPhone views, menus, sheets and popovers light.
    static func pinLight() {
        NSApplication.shared.appearance = NSAppearance(named: .aqua)
    }
}
