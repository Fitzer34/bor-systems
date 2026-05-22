# HazardLink Privacy Policy

**Last updated:** 21 May 2026

**STARTER TEMPLATE — review with a solicitor before publishing.** This
document is GDPR-aligned but not legal advice. Get an Irish solicitor to
review (€300–500 typically) before deploying to `hazardlink.ie/privacy`.

---

## 1. Who we are

HazardLink ("we", "us", "our") is a real-time floor-safety monitoring
service operated by HazardLink Ltd, registered in Ireland.

- **Contact**: support@hazardlink.ie
- **Data Protection Contact**: dpo@hazardlink.ie
- **Postal address**: [add your registered office address here]

If you're a resident of the EU/UK, you have rights under the GDPR (EU) /
UK GDPR / Data Protection Act 2018. This policy explains how we collect,
use, and protect your personal data.

## 2. What data we collect

We collect only what we need to run the service:

### From you (when you sign up or use the app)
- **Account details**: name, email address, phone number (optional)
- **Authentication**: hashed password (never stored in plain text)
- **Role**: admin, supervisor, or cleaner
- **Device push tokens**: iOS APNs / Android FCM identifiers, so we can
  send you spill alerts and dispatch notifications
- **Locale**: your selected language

### From your devices automatically
- **Device-generated events**: sign-lifted, sign-returned, heartbeats,
  battery levels, signal strength — these come from the hardware
  hangers installed at your customer sites
- **App diagnostic data**: when the app crashes or errors, we capture
  the stack trace via Sentry (no personal data attached)
- **HTTP access logs**: IP address, timestamps, requested endpoints,
  user agent — retained 30 days for security debugging

### From your customers' visitors (public QR feedback only)
- **Feedback responses**: when a building tenant scans a QR code and
  reports "dry" or "still wet", we store the response + timestamp
- **Approximate IP**: only for rate-limiting; not linked to an identity

## 3. Why we use it

| Purpose | Legal basis (GDPR) |
|---|---|
| Operating the service (login, alerts, dispatches) | Performance of contract |
| Sending push notifications about spills | Performance of contract |
| Storing compliance audit logs | Legitimate interest (insurance, contractual SLA) |
| Sending battery / low-charge warnings | Legitimate interest |
| Security: rate limiting, anti-abuse | Legitimate interest |
| Crash diagnostics (Sentry) | Legitimate interest |
| Marketing emails (only if you opt in) | Consent |

We do **not** sell or rent your personal data to third parties.

## 4. Who sees it

Your data is shared with:

- **Apple Push Notification Service (APNs)** — to deliver iOS notifications
- **Google Firebase Cloud Messaging (FCM)** — to deliver Android notifications
- **Render Inc.** (US/EU) — our hosting provider
- **Sentry** (Germany/US) — error monitoring
- **Cloudflare R2** (when configured) — image storage for floor plans
  and proof-of-resolution photos
- **Twilio** (US, optional) — if you've enabled SMS notifications

We have GDPR-compliant data processing agreements with each.

We do **not** share data with advertisers. We do **not** share data
across customers (your organisation's data stays within your tenant).

## 5. International data transfers

Some sub-processors store data outside the EEA (Render, Sentry, Cloudflare,
Apple, Google). Where we transfer data outside the EEA, we rely on:
- EU Standard Contractual Clauses, or
- UK International Data Transfer Agreement (for UK→non-UK), or
- Adequacy decisions where they apply.

## 6. How long we keep it

| Data type | Retention |
|---|---|
| Account details | While your account is active + 30 days after deletion |
| Spill alerts, dispatches, events | 7 years (insurance / compliance reporting requirement) |
| Audit logs | 7 years |
| App crash reports | 90 days |
| HTTP access logs | 30 days |
| Public QR feedback | 90 days |
| Push tokens | Active devices only; dead tokens auto-purged |

You can request earlier deletion (see section 8).

## 7. Cookies and tracking

The HazardLink web app (`hazardlink.ie`) uses:
- **Strictly necessary cookies**: auth session token, mobile-menu state
- **No advertising cookies**
- **No third-party analytics that track individuals**

We don't use Google Analytics, Meta Pixel, or any cross-site tracker.

## 8. Your rights

Under GDPR / UK GDPR, you have the right to:
- **Access** the personal data we hold about you
- **Rectify** inaccurate data
- **Erase** your data ("right to be forgotten") — subject to legal
  retention requirements (e.g. we can't delete audit logs covered by
  insurance contracts)
- **Restrict** processing
- **Port** your data to another service
- **Object** to processing based on legitimate interest

To exercise any right, email **dpo@hazardlink.ie**. We respond within
30 days. If we can't fulfil your request, we'll explain why.

You also have the right to lodge a complaint with:
- **Ireland**: Data Protection Commission — dataprotection.ie
- **UK**: Information Commissioner's Office — ico.org.uk

## 9. Security

Your data is:
- **Encrypted in transit** via TLS 1.2+
- **Encrypted at rest** in the database (Render Postgres at-rest encryption)
- **Auth tokens stored in iOS Keychain / Android EncryptedSharedPreferences**
  (hardware-backed where available)
- **Passwords stored as Argon2id hashes** (never plain text)
- **Webhooks HMAC-signed** to prevent tampering
- **Multi-tenant isolation** enforced at the database query level

If a personal data breach occurs, we notify affected users within 72
hours and report to the Data Protection Commission as required by GDPR.

## 10. Children

HazardLink is a B2B safety product for commercial cleaning teams. We do
not knowingly collect data from anyone under 16. If you believe a child
has provided us data, email dpo@hazardlink.ie and we'll delete it.

## 11. Changes to this policy

We may update this policy occasionally. The "Last updated" date at the
top reflects the latest revision. For material changes (anything that
affects your rights), we'll email all registered users at least 30 days
before the change takes effect.

## 12. Contact

For any privacy question: **dpo@hazardlink.ie**

For general support: **support@hazardlink.ie**
