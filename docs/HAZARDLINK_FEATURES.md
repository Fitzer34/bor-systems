# HazardLink — Complete Feature List

Use this as the source of truth when designing or building any HazardLink site or app. HazardLink is an Irish B2B SaaS platform (company: BOR Systems) that runs three on-site facilities disciplines — **Cleaning, Maintenance and Security** — on one system, over shared sites, assets and people. Managers use a web dashboard; field staff use native iOS/Android apps; contractors respond via white-label email links with no login.

---

## Platform (works across all three disciplines)
- One company, one login, multiple sites, three disciplines under one roof.
- Discipline switcher — pick Cleaning / Maintenance / Security; the sidebar adapts.
- Shared data: the same buildings/sites, assets and contacts power every discipline (nothing entered twice).
- Roles: admin, supervisor, field staff — role-based access throughout.
- Unlimited users on every plan.
- Web dashboard for the office + native iOS and Android apps for everyone on site.
- Command palette (⌘K) for fast navigation on the web.
- Staff onboarding by email invite link (admin adds a person → they get an email → set a password → land logged in).
- Notifications: push (iOS/Android), email and SMS, with automatic escalation.
- 30-day sessions with silent sliding refresh; data hosted in the EU.
- Reports, analytics, audit log and a system status page.

## The cross-discipline "moat" (the differentiator)
- Anyone on site (cleaner, technician or guard) can report a fault from their phone and it becomes a costed maintenance work order automatically.
- Shared sites, assets and contacts mean no double entry across disciplines.
- Managers see all three disciplines on one dashboard.

## Cleaning
- IoT wet-floor-sign sensors ("hangers") detect when a sign is put out or lifted and report it instantly with a timestamp and location.
- Real-time spill alerts to cleaners and supervisors.
- Automatic escalation if a spill isn't resolved / a sign isn't returned in time.
- Anti-theft and tamper detection (sign moved or removed when it shouldn't be).
- Low-battery monitoring for every sensor.
- Live floor-plan view — every sign as a pin on your actual building floor plan; upload floor plans; define zones.
- Cleaner dispatch and shift scheduling.
- Mobile quality inspections — scored checklist with photo proof and an overall score; a failed item can become a maintenance job.
- QR rounds — scan, confirm, photograph.
- Devices view — hangers and gateways organised by building, with detail/edit, registration by ID, and phone-based (BLE) discovery and setup.

## Maintenance (CMMS)
- Asset register with full service history, criticality, meters/readings and warranties.
- Work orders: logged → assigned → in progress → done, with a full activity timeline; priorities (emergency / urgent / routine).
- Planned preventive maintenance (PPMs): schedules, due tracking and automatic reminders.
- Parts and inventory.
- Contractor tendering and quoting by white-label email — contractors get a link, quote in the browser, no login or app.
- AI quote ranking on overall value (not just lowest price) and AI scope-of-works drafting.
- Maintenance dashboard and KPIs: PM compliance, mean-time-to-repair, open backlog.
- AI continuous-improvement suggestions from your live data.
- Staff certifications / competency tracking.
- Tenant/occupant fault reporting (QR → work order).

## Security
- Incident reporting with severity (low / medium / high / critical), status, and photos; AI incident triage suggests a severity and immediate actions.
- Guard tours and patrols; checkpoints via NFC / QR / GPS; checkpoint scans with photo proof.
- Lone-worker safety: check-ins, panic alarm and man-down, with watcher escalation.
- Daily activity reports.

## SDS — Safety Data Sheets
- Per-organisation chemical library, filed by discipline (cleaning / maintenance / security / general).
- Scan a product barcode → it checks your library first, then (optionally) a paid SDS database, then a free product-identity lookup to pre-fill the name/brand.
- For a new product, upload the SDS (PDF or photo) and AI reads it — strictly from the document, never invented; anything it can't find is left blank and flagged.
- Captures: product, manufacturer, signal word, GHS pictograms, hazard (H) and precautionary (P) statements, listed components (name / CAS / %), first aid, storage & handling, PPE, issue/revision/review dates.
- A "verified / needs review" state — AI-read sheets are confirmed by a person before they're trusted.

## AI (Claude), used throughout
- Ask-your-data assistant — plain-English answers from your real records.
- Voice → work order — speak a fault, get a structured job to confirm.
- Contractor scope drafting and quote ranking.
- Incident triage; asset-history summaries; improvement suggestions; SDS extraction.
- Core principle: it never invents facts. Included on every plan.

## Hardware (built in-house)
- Hanger sensor (Heltec WiFi LoRa 32 / ESP32): Hall-effect sign detection, long battery life via deep sleep, on-demand OLED (battery + signal), HMAC-secured LoRa radio.
- Gateway (mains-powered): receives LoRa from many hangers and forwards securely to the cloud over WiFi; self-registers on boot.

## Pricing
- Per site, unlimited users, all three disciplines on every plan.
- Starter €99/month (up to 3 sites) · Growth €299/month (up to 15 sites, recommended) · Enterprise custom.
- Optional spill-detection sensors at cost.

---

## Brand & design direction (so it doesn't look AI-made)
- Colours: trust-blue `#2563EB`; deep ink `#0b1220`; slate neutrals; off-white `#F8FAFC`. Accents: Cleaning `#0891B2`, Maintenance `#D97706`, Security `#4F46E5`.
- Fonts: Space Grotesk (headings) + Inter (body) for marketing; all-Inter for the app.
- Marketing hero: premium dark and lit (subtle glow + faint grid), a realistic product panel floating with depth. App: light theme + dark sidebar, minimalist enterprise SaaS.
- Line SVG icons, never emoji. Visible focus rings. Subtle, tasteful motion.
- Hard rules: human-written copy (no heavy em-dashes, no "not X but Y", no clipped one-word headlines); no fabricated stats, ratings, customer counts, logos, testimonials or "free trial" claims.

## Honesty / build status (don't over-claim on a public site)
- Live today: web app + marketing site, the full CMMS, Cleaning, Security, the cross-discipline fault→job flow, inspections, onboarding, and the SDS library on web.
- In progress (don't present as finished): SDS on mobile, full mobile feature parity, SMS/push notification rollout, precise UWB sign-finding.
- It's fine to market the platform and its capabilities; just don't invent numbers, customers or results.
