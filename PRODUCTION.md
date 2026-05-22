# Zero Slip Systems — Production Hardening Runbook

What was added in the Tier 1 pass, and what you (the operator) still need to do
in dashboards I can't reach from code.

## 1. Reliability stack

### a) Upgrade Render services to Starter
On https://dashboard.render.com:

1. Pick `bor-systems-backend` → **Settings** → **Instance Type** → **Starter ($7/mo)**.
2. Pick `bor-systems-web` (static site is free — no action needed).
3. Pick the Postgres add-on if you want zero-downtime — keep Free for now if cost matters; upgrade to Starter ($7/mo) when you have your first paying customer.

Net new spend: **$7/mo** while DB stays free, **$14/mo** once DB upgrades.

Why: Free plan spins the backend down after 15 min idle. First request after that takes ~30s. Starter keeps it warm 24/7.

### b) Sentry (error monitoring)
1. Sign up at https://sentry.io with `hello@bor-systems.com` (free Developer plan: 5k errors/month).
2. Create two projects: `bor-systems-backend` (Node) and `bor-systems-web` (React).
3. Copy the two DSN URLs.
4. In Render → backend service → **Environment**, add:
   - `SENTRY_DSN` = backend DSN
   - `SENTRY_ENV` = `production`
5. In Render → web service → **Environment**, add:
   - `VITE_SENTRY_DSN` = web DSN
   - `VITE_SENTRY_ENV` = `production`
6. Trigger a redeploy on both.

Code is already wired — once the DSNs are set, errors flow.

### c) UptimeRobot (synthetic monitoring)
1. Sign up at https://uptimerobot.com (50 free monitors).
2. Add an HTTPS monitor for `https://bor-systems-backend.onrender.com/health` — 5-minute interval.
3. Add an HTTPS monitor for `https://bor-systems-web.onrender.com` — 5-minute interval.
4. Configure alerts to your phone via SMS (free plan: email only; the $7/mo plan gives SMS).

## 2. Security pass (already done in code)

- **Security headers** via `@fastify/helmet` — sensible defaults for everything.
- **Rate limiting** via `@fastify/rate-limit`:
  - Global: 300 requests/min/IP (skipped for `/events` SSE).
  - `/auth/login`, `/auth/register-organisation`, `/auth/login/2fa`: 10 attempts/min/IP. Brutal for credential stuffers, invisible to real users.
- **Password policy**: 10+ characters, 3 of 4 character classes, blocked common-password list. Applied at signup, admin-creates-user, and self-service password change.
- **2FA (TOTP)**: opt-in for any user; the Profile page nudges admins to enable it. Recovery codes generated on enrolment. Sign-in becomes a two-step challenge once enabled.
- **Sentry**: captures uncaught backend errors and unhandled promise rejections, with `userId` + `orgId` context. Sample rate 5% to stay inside the free tier.

### Credentials still to rotate
You pasted these into chat during development — rotate before going live:

- **APNs auth key** (`AuthKey_*.p8`): revoke at https://developer.apple.com/account/resources/authkeys and generate a new one. Update `APNS_KEY_ID` + `APNS_KEY_P8` env vars on Render.
- **Cloudflare R2 access keys**: revoke at https://dash.cloudflare.com → R2 → Manage R2 API Tokens. Update `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` on Render.
- **Render API key**: revoke at https://dashboard.render.com/u/settings#api-keys and create a new one only if you still need scripted Render access.

## 3. Legal pages (already done in code)

The web app now serves `/privacy` and `/terms`. Both are linked from the Login footer.

**Important:** these are plain-English drafts I wrote to a UK GDPR + DPA-2018 starting point. Before signing the first paying customer:

1. Get them reviewed by a UK commercial solicitor — Linklaters' "lawyers on demand" or a smaller firm like SeedLegals are good for a few-hundred-pound spot review.
2. Replace any "Ltd." references with your actual registered company name and number once you have one.
3. Make sure `privacy@bor-systems.com`, `security@bor-systems.com`, and `hello@bor-systems.com` exist (Cloudflare Email Routing → free; forwards to your inbox).

## 4. App Store readiness

### Demo data
Run on Render once after deploying:

```sh
# In Render → backend service → Shell:
npm run db:seed:demo
```

This creates a `reviewer@bor-systems.demo` admin account in a self-contained demo org with 3 floors, 6 zones, 6 hangers, and one historic alert. Reviewer can sign in, see the dashboard with data, navigate every screen.

### App Store Connect entries
- **Sign-In Information**:
  - Username: `reviewer@bor-systems.demo`
  - Password: `BorReview2026!Demo`
  - Notes: "This is a production-equivalent demo organisation. No real hardware is required to evaluate the app."
- **Privacy Policy URL**: `https://bor-systems.com/privacy`
- **Support URL**: `https://bor-systems.com` (point at the marketing page once it exists; for now `bor-systems-web.onrender.com` works).
- **Marketing URL**: same.
- **App Privacy nutrition labels**: Data Linked to User → Contact Info (email, name, phone), Identifiers (account ID). Data Not Linked to User → Diagnostics (crash reports). Optional.

### App Store screenshots
Use the iOS Simulator → File → Save Screen (⌘S) in these device sizes — Apple requires at least 6.5" and 6.7" sets:
- iPhone 15 Pro Max (6.7")
- iPhone 13 mini or iPhone 8 Plus (5.5" — required for older device buckets)

After signing in as `reviewer@bor-systems.demo`:
1. Home (active alerts list)
2. Alert detail with acknowledge button
3. Map (floor plan with hanger pins)
4. Dispatch send view
5. Profile with duty switch on

## 5. What's NOT in Tier 1 (Tier 2 follow-ups)

Plan to start these once Tier 1 is shipped:

- **Stripe billing** — per-hanger monthly subscription, signup → trial → paid.
- **Onboarding email** — Resend or Postmark for transactional email.
- **Structured logging** — pino → Logtail/Better Stack for searchable backend logs.
- **Staging environment** — separate Render service + DB so you can test migrations safely.
- **Help docs** — host on `help.bor-systems.com` via Notion public pages or Mintlify.

## Quick verification checklist

After deploying Tier 1:

- [ ] `curl https://bor-systems-backend.onrender.com/health` → returns within 1 second (means Starter is keeping it warm)
- [ ] Try 11 quick login attempts in a row → 11th returns `{ error: "rate_limited" }`
- [ ] Headers on any response include `strict-transport-security` and `x-content-type-options: nosniff`
- [ ] Trying to register with password `Password1` → returns `password_too_simple`
- [ ] Trying to register with password `correcthorsebatterystaple` → succeeds
- [ ] Sign in, go to Profile, enable 2FA, log out, log back in — challenge step appears
- [ ] Visit `/privacy` and `/terms` while logged out → both render
- [ ] Trigger a real error (hit a route while DB is down) → it appears in Sentry within seconds
- [ ] UptimeRobot dashboard shows both monitors green
