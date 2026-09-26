# HazardLink — Project Brief

**What it is.** One platform that runs three on-site facilities disciplines — Cleaning, Maintenance and Security — against the same buildings, assets and people. A web dashboard for managers, native mobile apps for everyone on the ground. Irish company (BOR Systems), hazardlink.ie, built for facilities/FM teams.

**The core idea (the moat).** Because cleaners, technicians and guards all work in one app on shared data, a problem anyone spots becomes action immediately — a guard on patrol reports a fault and it turns into a costed maintenance work order, with no second system and no re-keying.

**Who uses it.**
- Managers / admins / supervisors → web dashboard, multi-site control.
- Field staff (cleaners, technicians, guards) → mobile apps.
- Contractors → white-label tender/quote links by email, no login.

**The disciplines.**
- Cleaning — IoT wet-floor spill alerts (LoRa sensors), cleaner dispatch + shift scheduling, mobile inspections with photo proof and scoring, QR rounds.
- Maintenance (CMMS) — asset register + service history, work orders, planned preventive maintenance, parts/inventory, contractor tendering/quoting by white-label email, KPIs (PM compliance, MTTR, backlog).
- Security — incident reporting (severity + photos), guard tours / NFC-QR checkpoints + patrols, lone-worker check-ins + panic alarm, daily activity reports.
- SDS — scan a product barcode → chemical safety-sheet library per discipline; AI reads the uploaded sheet (only from the document, never invented); a person verifies.

**AI (Claude).** Ask-your-data assistant, voice→work order, contractor scope drafting, quote ranking, incident triage, asset summaries, SDS extraction. Hard principle: it never invents — it reads real records or the actual document.

**Hardware.** ESP32 (Heltec) LoRa gateways + battery wet-floor-sign sensors (Hall-effect lift detection, OLED, deep-sleep battery life, BLE setup, HMAC-secured), self-registering, with R2-hosted floor plans.

**Tech stack.**
- Backend: Fastify + Drizzle ORM + Postgres on Render; Anthropic SDK; Cloudflare R2 storage; Brevo email; Twilio SMS; APNs/FCM push.
- Web app: React + Vite + TypeScript + Tailwind + TanStack Query → Cloudflare Worker at app.hazardlink.ie.
- Marketing: single static HTML/CSS file → Cloudflare Worker at hazardlink.ie.
- Mobile: native iOS (Swift) and Android (Kotlin).

**Design system / look.**
- Palette: trust-blue `#2563EB`, slate neutrals, `#F8FAFC` surfaces; accents — Cleaning `#0891B2`, Maintenance `#D97706`, Security `#4F46E5`.
- Web app: light theme, dark sidebar, all-Inter; minimalist/Swiss enterprise SaaS; SVG icons (never emoji); visible focus rings.
- Marketing: Space Grotesk (display) + Inter (body); premium dark, lit hero (depth, glow, floating product UI), light body, dark "moat" band.
- Hard rules: must not look AI-generated/templated — human copy (avoid heavy em-dashes, "not X but Y", anaphora, clipped-fragment headlines), no fabricated stats or fake social proof; a little Irish voice is welcome.

**Pricing.** Per site, unlimited users, all three disciplines on every plan. Starter €99/mo (≤3 sites), Growth €299/mo (≤15 sites, recommended), Enterprise custom. Optional spill sensors at cost.

**Domains.** Marketing: hazardlink.ie. App: app.hazardlink.ie. Demo/contact: hello@hazardlink.ie.
