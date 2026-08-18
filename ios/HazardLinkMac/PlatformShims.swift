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
extension NSColor {
    static var systemBackground: NSColor { .windowBackgroundColor }
    static var secondarySystemBackground: NSColor { .controlBackgroundColor }
    static var tertiarySystemBackground: NSColor { .underPageBackgroundColor }
    static var systemGroupedBackground: NSColor { .windowBackgroundColor }
    static var secondarySystemGroupedBackground: NSColor { .controlBackgroundColor }
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
