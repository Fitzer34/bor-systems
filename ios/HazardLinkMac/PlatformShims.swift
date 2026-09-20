import SwiftUI

/// The shared SwiftUI views were written for iOS and use a handful of
/// modifiers that don't exist on macOS. These no-op equivalents let the same
/// source files compile into the Mac target untouched.
#if os(macOS)

enum ShimTitleDisplayMode { case inline, large, automatic }
enum ShimKeyboardType { case `default`, numberPad, decimalPad, emailAddress, phonePad, URL, numbersAndPunctuation }
enum ShimAutocapitalization { case never, words, sentences, characters }

extension View {
    func navigationBarTitleDisplayMode(_ mode: ShimTitleDisplayMode) -> some View { self }
    func keyboardType(_ type: ShimKeyboardType) -> some View { self }
    func textInputAutocapitalization(_ mode: ShimAutocapitalization?) -> some View { self }
    func autocapitalization(_ mode: ShimAutocapitalization) -> some View { self }
}

#endif

#if os(macOS)
import AppKit

/// UIKit semantic colours the shared views reference via `Color(.name)`.
/// On macOS `Color(.x)` resolves against NSColor, so we provide the missing
/// UIKit names as NSColor statics mapped to their AppKit equivalents.
///
/// The backgrounds map to the website's surfaces (see HLTheme.swift) and keep the two levels the
/// iPhone views depend on: a grey page with white cards on it. Mapping both levels to the window
/// colour, as this used to, made every hosted screen one flat sheet with no cards.
extension NSColor {
    private static func hl(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: 1)
    }

    static var systemBackground: NSColor { hl(0xFFFFFF) }
    static var secondarySystemBackground: NSColor { hl(0xF1F5F9) }
    static var tertiarySystemBackground: NSColor { hl(0xE2E8F1) }
    static var systemGroupedBackground: NSColor { hl(0xEEF1F5) }
    static var secondarySystemGroupedBackground: NSColor { hl(0xFFFFFF) }
    static var tertiarySystemFill: NSColor { .quaternaryLabelColor }
    static var separator: NSColor { .separatorColor }
    static var systemGray3: NSColor { .systemGray.withAlphaComponent(0.6) }
    static var systemGray4: NSColor { .systemGray.withAlphaComponent(0.45) }
    static var systemGray5: NSColor { .systemGray.withAlphaComponent(0.3) }
    static var systemGray6: NSColor { .systemGray.withAlphaComponent(0.18) }
    static var label: NSColor { .labelColor }
    static var secondaryLabel: NSColor { .secondaryLabelColor }
}
#endif
