/**
 * Password policy used on signup, admin-creates-user, and self-service
 * change-password. The goal is to block the obvious junk without driving
 * users to predictable patterns.
 *
 * Rules:
 *   - 10..200 characters
 *   - At least 3 of: lowercase, uppercase, digit, symbol
 *   - Not in a short list of catastrophically common passwords
 *
 * If we later want strict NIST 800-63B-style checks (against the full
 * haveibeenpwned breach corpus), this is the single place to extend.
 */

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty", "qwerty123", "qwertyuiop", "letmein", "welcome", "welcome1",
  "iloveyou", "admin", "admin123", "test1234", "abc12345", "monkey123",
  "football", "starwars", "dragon123",
  // BOR-specific guesses that anyone scanning customer lists would try first.
  "borsystems", "bor12345", "wetfloor", "cleaner1", "supervisor1",
]);

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

export function validatePassword(pw: string): PasswordCheck {
  if (pw.length < 10) return { ok: false, reason: "password_too_short" };
  if (pw.length > 200) return { ok: false, reason: "password_too_long" };
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return { ok: false, reason: "password_too_common" };
  }
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  if (classes < 3) return { ok: false, reason: "password_too_simple" };
  return { ok: true };
}
