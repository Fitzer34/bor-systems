import Foundation
import Security

/// Thin Keychain wrapper for the auth token.
///
/// On the Mac an item written by one build of the app (a different signing identity) cannot be
/// replaced or deleted by a later build: the delete fails quietly and the add reports a duplicate,
/// so the app kept sending a stale, expired token after a fresh sign-in and every request came
/// back 401. `set` therefore checks each status, reads the value back, and when the item under
/// `key` cannot be replaced it writes under an alternate account that this build owns. `get`
/// prefers that alternate, and `remove` clears both.
enum Keychain {
    private static let service = "com.hazardlink.app"
    private static let altSuffix = ".v2"

    private static func query(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    /// Writes `value` under `account` and confirms it by reading it back.
    private static func write(_ value: String, account: String) -> Bool {
        let data = Data(value.utf8)
        let q = query(account)
        var status = SecItemUpdate(q as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = q
            add[kSecValueData as String] = data
            status = SecItemAdd(add as CFDictionary, nil)
        }
        if status != errSecSuccess {
            SecItemDelete(q as CFDictionary)
            var add = q
            add[kSecValueData as String] = data
            status = SecItemAdd(add as CFDictionary, nil)
        }
        return status == errSecSuccess && read(account) == value
    }

    private static func read(_ account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: AnyObject?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Returns false when the value could not be stored anywhere in the Keychain. The caller keeps
    /// the token in memory, so the session still works until the app quits.
    @discardableResult
    static func set(_ value: String, for key: String) -> Bool {
        if write(value, account: key) {
            SecItemDelete(query(key + altSuffix) as CFDictionary)
            return true
        }
        return write(value, account: key + altSuffix)
    }

    static func get(_ key: String) -> String? {
        read(key + altSuffix) ?? read(key)
    }

    static func remove(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
        SecItemDelete(query(key + altSuffix) as CFDictionary)
    }
}
