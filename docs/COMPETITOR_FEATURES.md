# Competitor Feature Research — HazardLink Build Backlog

Research into the leading software in CMMS/maintenance, commercial cleaning/janitorial, security guard management, and general FM/IWMS, extracted into a concrete build backlog for HazardLink (unified Cleaning + Maintenance + Security platform, web + mobile, IoT spill sensors, grounded AI assistant).

Method: vendor feature/pricing pages and reputable comparison articles (June 2026), supplemented by domain knowledge where a feature is widely documented. Items marked **(inferred)** are reasonable conclusions from how the category works rather than a single quoted source. No invented statistics are presented as fact; where a vendor publishes a stat it is attributed to that vendor's marketing and flagged as a vendor claim, not an independent measurement.

Cross-references at the end map each idea to HazardLink's current `docs/HAZARDLINK_FEATURES.md` so you can see what is already-likely-present vs genuinely new.

---

## 1. CMMS / Maintenance

Products reviewed: UpKeep, Limble CMMS, MaintainX, Fiix (Rockwell), eMaint (Fluke), Hippo CMMS, FMX, IBM Maximo, Brightly/Asset Essentials.

### Must-have features
- **Work order lifecycle** — create / assign / in-progress / on-hold / done, with full activity timeline, comments, photos, attachments, and signatures (UpKeep, MaintainX, Limble).
- **Work requests vs work orders** — let a requester raise a *request* that a planner triages into a scheduled order, rather than auto-creating a full order (MaintainX "trigger a work request instead of a work order"; FMX requester portal).
- **Priority levels** (emergency / urgent / routine) and **SLA / due-date tracking** with overdue flags.
- **Preventive maintenance (PM/PPM)** — time-based and meter/usage-based schedules, recurrence, due tracking, auto-reminders (all vendors).
- **Asset register / hierarchy** — parent-child assets, criticality, location, warranty, documents, QR/barcode label per asset, full service history (UpKeep, Limble, Maximo, Brightly).
- **Meters & readings** — record runtime/usage; trigger PMs and automations off thresholds (MaintainX, Fiix, eMaint).
- **Parts & spare-parts inventory** — multi-location stock, per-part min/max, cost, vendor, lead time, usage logged against work orders (UpKeep, Limble).
- **Purchase orders** — create POs, route for approval, receive against PO, replenish stock on fulfilment (UpKeep PO software).
- **Mobile app with offline mode** — create/complete WOs, scan assets, capture photos/signatures, sync later (UpKeep, MaintainX).
- **Procedures / digital checklists / forms** — reusable inspection and task templates attached to WOs, with required fields, pass/fail, photo capture, readings (MaintainX procedures, eMaint forms).
- **Requester / tenant portal** — submit issues by web, email, app, or QR; track status (FMX, eMaint, Facilio).
- **Vendor / contractor management** — assign external contractors, track their work, store insurance/compliance docs.
- **KPIs & reporting** — PM compliance %, MTTR, MTBF, open backlog, cost by asset, downtime; configurable dashboards (Limble, Maximo Health, Brightly).
- **Audit trail / compliance evidence** — immutable history for inspections, corrective actions, sign-offs (UpKeep).

### Odd-but-good differentiators
- **AI nameplate / "Asset Snap"** — photograph an equipment nameplate and AI creates the asset record, reading make/model/serial from the image (Limble Asset Snap; UpKeep AI Inventory Recognition for parts).
- **Voice-to-work-order** — speak a fault and get a structured WO; create WOs, check inventory, look up asset history by talking (UpKeep "Nova"; MaintainX).
- **Anomaly detection on form fields & meter readings** — ML flags an unusual value as it is typed (e.g. a reading that's an order of magnitude off) (MaintainX Anomaly Detection).
- **Duplicate-request detection / record standardisation** — auto-detect and merge duplicate requests, standardise naming, without manual cleanup (Limble).
- **AI Work Order Triage** — auto-prioritise and auto-assign based on urgency, asset condition, and technician availability/skills (UpKeep AI).
- **Asset Risk Predictor → auto-WO** — AI learns failure signatures from sensor data (in as little as ~7 days, per Fiix's claim) and auto-creates a prioritised work order in the CMMS when risk crosses a threshold (Fiix/Rockwell).
- **Condition monitoring built in** — ingest vibration/temperature from IIoT sensors, view historical FFTs, AI recommends a fix, auto-WO on threshold breach (eMaint + Fluke sensors).
- **Interactive image / floor-plan mapping** — drop pins on a floor plan, schematic, or site map; each pin is an asset/WO/request with hover preview and a click-through to the full record and history (eMaint Interactive Image Mapping).
- **AI Procedure Recommendations** — when a WO is created, search the procedure library and surface the most relevant checklist based on title/description/asset (MaintainX).
- **Multi-asset automations** — define one automation rule and apply it across many assets at once (MaintainX).
- **Retrigger timeout / debounce on automations** — actions won't re-fire within a window (default ~5 min) to prevent notification storms (MaintainX). A genuinely useful guardrail to copy.
- **Calendar-style facility scheduling** — colour-coded calendar that schedules maintenance *and* room/equipment bookings and inspections/audits side by side (FMX).
- **Capital planning / asset-lifecycle forecasting** — model replace-vs-repair, forecast budgets from condition and age (Brightly Origin, Maximo).
- **Asset health scoring** — a single 0–100 health index per asset that drives prioritisation (Maximo Health, Brightly).

---

## 2. Commercial cleaning / janitorial

Products reviewed: Swept, Janitorial Manager, CleanTelligent, WorkWave (incl. TEAM by WorkWave), Aspire (ServiceTitan), TEAM Software / TemplaCMS, Lighthouse.io. Plus smart-restroom IoT vendors (TRAX, FacilityApps/Ophardt) for the sensor angle.

### Must-have features
- **GPS time tracking with geofenced clock-in/out** — verify the cleaner is physically on site to clock in; payroll-ready hours (Swept, Janitorial Manager, Aspire crew app).
- **Late / missed clock-in alerts** — notify the manager and auto-remind the cleaner when a shift isn't started on time; alert when a scheduled shift is uncovered (Swept, Janitorial Manager).
- **Shift scheduling & rostering** — recurring shifts per site, drag-and-drop, split tickets across days/crews (Aspire, WorkWave).
- **Mobile inspections / quality audits** — custom inspection plans, unlimited inspection points, per-point scoring, photo + notes, overall score (Swept, CleanTelligent, Janitorial Manager).
- **Failed-inspection → work order/ticket** — a deficient inspection item auto-becomes a corrective work order routed to the team, showing where and what to fix (CleanTelligent, Janitorial Manager).
- **QR checkpoints / proof-of-cleaning** — scan a QR at a location to confirm a cleaner visited and log task completion with timestamp (Janitorial Manager, Lighthouse).
- **Multilingual team messaging** — in-app chat with automatic translation so instructions reach each cleaner in their language (Swept).
- **Client / customer portal** — clients see inspection scores, request services, view completed work (CleanTelligent, Swept).
- **Supply / inventory tracking & ordering** — track janitorial consumables per site, low-stock visibility (Janitorial Manager, Aspire purchasing).
- **Job costing & budget-vs-actual** — labour hours + materials per site/contract vs budget (Aspire, TemplaCMS work bills).
- **Bidding / proposals on site** — build a quote in the field with templates and calculators (Janitorial Manager).
- **Payroll & pay-bill engine** — award/rate interpretation, multi-site costing, period-end timesheet confirmation, holiday/absence cover (TemplaCMS, TEAM by WorkWave).
- **Route management** — efficient travel order for mobile cleaning crews (WorkWave Route Manager).

### Odd-but-good differentiators
- **ISSA 612 workloading calculator** — input room measurements + task list and the system computes correct labour time, staffing, and cost using published cleaning-time production rates (Janitorial Manager workloading + ISSA calculators). Excellent for both *bidding accuracy* and *defensible staffing*.
- **Public "Scan4Clean" QR** — a member of the public scans a QR in, say, a restroom and sees when it was last cleaned, by whom, what was done, and can leave feedback (Janitorial Manager Scan4Clean). Turns proof-of-service into a trust/marketing signal and a feedback channel.
- **QR feedback for patrons** — custom QR codes collect real-time satisfaction feedback from building occupants (CleanTelligent).
- **Perimeter-tunable geofence** — adjust the geofence radius for large properties/car parks so clock-in works on big sites (Swept, ~10–30 ft accuracy per their docs).
- **Indoor proof-of-presence via BLE beacons** — continuous indoor/outdoor personnel mapping from wireless beacons to show where staff were and when, and to optimise routes (Lighthouse.io). Directly relevant to HazardLink's LoRa/BLE hardware story.
- **Rotation-loop / cleaning-loop monitoring** — track completion of repeating cleaning loops in real time, not just one-off tasks (Lighthouse).
- **Smart-restroom IoT dispatch** — occupancy/door-count + consumable-level sensors (soap, paper towel, tissue) raise a *just-in-time* "refill/clean this restroom now" task instead of fixed-schedule rounds; AI can forecast run-out and busy periods (TRAX, FacilityApps/Ophardt, Imperial Dade). Natural extension of the wet-floor-sign sensor line.
- **Confirm-appointment automation** — the system nudges the custodial manager to confirm upcoming cleaning appointments so jobs don't get missed (CleanTelligent).
- **Engagement / comms module for a deskless workforce** — broadcast notices, shift notes, and recognition to cleaners who have no email (TemplaCMS Engage).

---

## 3. Security guard management

Products reviewed: Trackforce Valiant, Silvertrac, Belfry, TrackTik / GuardTek (Trackforce), plus dedicated guard-tour systems (QR-Patrol, Novagems) for checkpoint/lone-worker depth.

### Must-have features
- **Guard tours / patrols with NFC, QR, barcode, RFID, or GPS checkpoints** — time-stamped scans, optional mandatory photo at each checkpoint, custom tour sequences (Silvertrac, TrackTik, Trackforce Valiant, QR-Patrol).
- **Missed-checkpoint / missed-tour alerts** — supervisor notified instantly when a tour is incomplete, late, or skipped (Silvertrac, TrackTik, QR-Patrol).
- **Live GPS tracking & map** — see every guard's position; alert on unauthorised zone entry (TrackTik geofenced zones, Belfry).
- **Incident reporting** — severity, category, narrative, photo/video, location, time; submitted to a central monitor in real time (Silvertrac issue monitor, Trackforce, Belfry).
- **Live issue / command-centre dashboard** — colour-coded by status; shows task received → confirmed → resolved (Silvertrac live issue monitor; Trackforce Command Center).
- **Dispatch** — push tasks directly to a guard's device; track acknowledgement and resolution (Silvertrac dispatch).
- **Post orders** — site-specific standing instructions delivered to the guard's device with real-time acknowledgement (TrackTik, Trackforce online post orders).
- **Daily Activity Reports (DARs)** — auto-compiled log of the shift's tours, incidents, and notes; shareable with clients (Trackforce, TrackTik).
- **Pass-down / shift-handover notes** — notes carried from one shift to the next (Silvertrac).
- **Lone-worker protection / man-down** — panic button with a short countdown to cancel, man-down/impact detection, welfare check-in timers, real-time location on alert (TrackTik LWP, GuardTek, QR-Patrol, Novagems).
- **Visitor management** — daily visitor list, check-in/out, do-not-admit list (Trackforce Valiant visitor module).
- **Guard scheduling** — optimised shift plans, rapid shift-fill, overtime control (Belfry, TrackTik).
- **Certification / licence tracking** — store guard licences/certs, auto-track renewal dates, notify before expiry (Belfry compliance).
- **Time & attendance + payroll/billing** — geofenced clock-in feeds overtime, post-specific wages, taxes, and client invoicing (Belfry payroll, TrackTik back-office).
- **Client portal** — clients view tours, incidents, and reports for their site (TrackTik, Silvertrac).

### Odd-but-good differentiators
- **Touchless / NFC auto-touring** — NFC tags record each tour automatically and remind the officer when the next tour is due (Trackforce m-Post).
- **Panic-button countdown UX** — a ~10-second countdown screen on activation so an accidental press can be cancelled before an alert fires (QR-Patrol). Small, copyable detail that prevents false alarms.
- **Impact/drop detection** — auto-alert if the device is dropped (possible injury), separate from a manual man-down press (GuardTek).
- **Hazard-alert timers** — a guard arms a timer entering a risky area; if not cleared in time, an alert escalates (TrackTik).
- **Overtime-risk forecasting** — surface overtime risk *before* it is incurred and lock pay rates ahead of the shift (Belfry).
- **Smart shift-fill recommendations** — system suggests who to offer an open shift to (eligibility, proximity, hours, cost) (Belfry).
- **Parking management module** — log/track parking violations as a first-class issue type on patrol (Silvertrac).
- **Billing tied to verified attendance** — invoices generated from geofenced attendance + contract data, reducing disputes (TrackTik back-office).
- **Exception-only reporting** — flag only deviations (missed scans, unauthorised entry) so supervisors aren't drowned in "all normal" data (TrackTik).
- **BOLO / be-on-lookout broadcast (inferred)** — push a watch-for description to all on-duty guards; common in the category though not confirmed as a named TrackTik feature in sources. Worth building.

---

## 4. General FM / IWMS

Products reviewed: Planon, Eptura (iOFFICE), Facilio, ServiceChannel.

### Must-have features
- **Multi-site / portfolio view** — one pane across many buildings (Facilio, ServiceChannel, Planon).
- **Service request → ticket with SLA, priority, escalation** — requests in by email/app/web/portal auto-convert to a tracked ticket with SLA enforcement and escalation rules (Facilio).
- **Rules-based workflow automation** — automate repetitive tasks; auto-create and auto-assign work orders with priority based on conditions (Facilio automation rules).
- **Space management & desk/room booking** — floor plans, occupancy, desk hoteling, room reservations (Planon, Eptura).
- **Visitor management integrated with bookings** — pre-register, expected-arrival list, in the same platform as desk/room booking (Eptura).
- **Vendor / service-provider marketplace** — find, dispatch, and rate external providers (ServiceChannel).
- **Invoice validation / spend control** — validate each invoice against approved labour rates, hours, and materials (ServiceChannel).
- **Lease & real-estate management** — lease accounting (IFRS 16 / ASC 842), property data (Planon).
- **Energy & sustainability** — energy monitoring across utilities, carbon/ESG reporting, BREEAM/LEED tracking (Planon, Facilio).

### Odd-but-good differentiators
- **Fault Detection & Diagnostics (FDD)** — a built-in library of FDD rules by asset category detects energy/asset anomalies (e.g. chiller out of range) and **auto-generates a prioritised work order** or even auto-resolves (Facilio FDD).
- **Energy-anomaly → work order** — WOs spawned directly from real-time energy anomalies and alarms (Facilio).
- **Compliance checkpoints inside the work-order workflow** — configurable gates that a job must pass before closeout (ServiceChannel).
- **GPS/IVR provider check-in** — contractor must check in on-site (GPS or phone) to validate attendance (ServiceChannel) — note: user complaints when GPS misfires, so build a manual override.
- **AI agents embedded across the work-order lifecycle** — agents that create, triage, expedite, and analyse work orders, and prevent duplicate dispatches / repeat truck-rolls (ServiceChannel AI).
- **Connected-workplace data fabric** — normalise BMS/IoT/business data into one source of truth so disciplines share data (Planon, Facilio). This is essentially HazardLink's "moat" at enterprise scale.
- **Wayfinding** — occupants/guests navigate the building and find desks/colleagues on a floor-plan map (Eptura).

---

## 5. Automation & hands-off patterns (the "customer barely touches it" layer)

The recurring pattern across every category: a **trigger** (sensor reading, meter threshold, schedule, failed inspection, low stock, missed checkpoint, time elapsed) fires one or more **actions** (create/assign WO, change status, send email/SMS/push, raise a PO, escalate). Concrete patterns worth copying:

- **Sensor/threshold → auto work order.** Meter, vibration, temperature, energy anomaly, or spill-sensor event auto-creates and auto-assigns a prioritised WO (Fiix, eMaint, Facilio, MaintainX). HazardLink already does this for spills; generalise the trigger engine.
- **Failed inspection → auto corrective WO**, routed with location + photo (CleanTelligent, Janitorial Manager).
- **Low stock → auto purchase order.** Per-part min/max per location; at min, alert + auto-generate a PO back up to max; replenish on receipt (UpKeep). AI can tune reorder points from usage, lead time, and criticality (Limble).
- **Overdue / SLA-breach → escalation chain.** Notify assignee, then supervisor, then admin, across push/email/SMS, on a timer (MaintainX overdue notifications, Facilio escalation rules). HazardLink lists "automatic escalation" — make the chain configurable.
- **Missed checkpoint / missed tour → alert** the supervisor automatically (Silvertrac, TrackTik).
- **Missed / late clock-in → auto-remind worker + alert manager**; uncovered-shift alert (Swept, Janitorial Manager).
- **Scheduled compliance chasing.** Auto-track licence/cert/insurance/SDS-review expiry and email the holder (and the manager) ahead of expiry; gate the person from site when lapsed (Belfry licences; HazardLink already plans cert-expiry gating per memory).
- **Confirm-appointment / due-PM nudges.** Auto-remind the responsible person to confirm upcoming jobs or that a PM is due (CleanTelligent, FMX).
- **Multi-asset / one-rule-many-assets automations** so the customer configures once (MaintainX).
- **Debounce / retrigger timeout** on every automation to avoid notification storms (MaintainX, ~5 min default).
- **Just-in-time servicing from IoT** — restroom consumable/occupancy sensors replace fixed rounds with on-demand refill/clean tasks; forecast run-out (TRAX, FacilityApps).
- **Recurring auto-generated reports** — DARs, inspection summaries, client reports compiled and emailed automatically (Trackforce DARs, Lighthouse daily performance reports).
- **Self-service intake everywhere** — email-to-ticket, QR-to-ticket, portal, app, so requests enter without staff keying them (Facilio, FMX). HazardLink has QR→WO; add email-to-ticket.
- **Auto-invoice on completion / billing from verified attendance** (TemplaCMS, TrackTik).

---

## 6. AI / assistant capabilities

What competitors ship under "AI" (named assistants in brackets):

- **Conversational ask-your-data assistant** — natural-language Q&A over assets, work-order history, documents, and prior interactions (MaintainX **CoPilot**; UpKeep **Nova**; ServiceChannel AI). HazardLink already has this; key differentiator is the *grounded / never-invents* guarantee.
- **Generate procedure / work order from a document** — upload an asset manual, AI finds the answer and drafts a customisable procedure or WO (MaintainX CoPilot).
- **Voice → work order** and voice asset/inventory lookup (UpKeep Nova).
- **AI work-order triage** — auto severity, priority, and assignment (UpKeep; ServiceChannel agents). HazardLink has incident triage; extend to maintenance WOs.
- **AI procedure/checklist recommendation** at WO creation (MaintainX).
- **Image recognition** — asset from nameplate photo, part from photo (Limble Asset Snap, UpKeep Inventory Recognition).
- **Anomaly detection** on readings/form fields (MaintainX).
- **Predictive failure / asset-risk scoring** — ML predicts probability of failure and time-to-failure, then auto-creates WOs (Fiix Asset Risk Predictor, IBM Maximo Predict, Brightly).
- **Fault detection & diagnostics** library that explains *why* an asset is faulting and recommends the fix (Facilio FDD, eMaint AI recommendations).
- **Duplicate detection & data standardisation** (Limble).
- **Background "agent" that runs scheduled actions and surfaces what needs attention** without being asked (UpKeep Nova background mode; ServiceChannel agents). A step beyond a chat box.
- **AI scope-of-works drafting & quote ranking on value** (HazardLink already has this; rare among competitors — a genuine edge).
- **Grounded SDS extraction** — read a safety data sheet strictly from the document, flag anything missing (HazardLink-specific; no competitor does this in-platform).
- **AI demand forecasting for stock/supplies** (Limble reorder tuning; smart-restroom forecasting).

---

## 7. Feature backlog for HazardLink

Tagged `[Cleaning]` `[Maintenance]` `[Security]` `[Platform]` `[AI]`. Status: **PRESENT** (already in HAZARDLINK_FEATURES.md or clearly built), **EXTEND** (have a version, deepen it), **NEW** (not yet present).

### Platform & automation engine
- `[Platform]` **NEW** — Generic **trigger→action automation builder** (no-code rules): triggers = sensor event, meter threshold, schedule, failed inspection, low stock, missed checkpoint, overdue, status change; actions = create/assign WO, set status, notify (push/email/SMS), raise PO, start escalation. Today HazardLink hard-codes spill escalation; productise it.
- `[Platform]` **NEW** — **One-rule-many-assets / many-sites** automation scoping.
- `[Platform]` **NEW** — **Retrigger timeout / debounce** on automations to stop notification storms.
- `[Platform]` **EXTEND** — **Configurable escalation chains** (assignee → supervisor → admin, multi-channel, timed). HazardLink lists auto-escalation; make the ladder user-defined.
- `[Platform]` **NEW** — **Email-to-ticket** intake (forward an email → it becomes a request/WO) alongside existing QR→WO and portal.
- `[Platform]` **NEW** — **SLA definitions** per priority/site with breach tracking and auto-escalation.
- `[Platform]` **EXTEND** — **Interactive floor-plan pins for all object types** (asset / WO / request / sensor / checkpoint) with hover preview + click-through. HazardLink has live floor-plan pins for sensors; generalise to WOs/assets (eMaint pattern).
- `[Platform]` **NEW** — **Scheduled / auto-emailed reports** (DARs, inspection summaries, client reports) on a cadence.
- `[Platform]` **NEW** — **Client/tenant portal** (read-only) showing this client's sites: inspection scores, open WOs, incidents, reports.
- `[Platform]` **EXTEND** — **Calendar view** that overlays cleaning shifts, PMs, guard tours, inspections, and bookings in one colour-coded calendar (FMX pattern).

### Maintenance
- `[Maintenance]` **PRESENT** — Asset register w/ history, criticality, meters, warranties; work orders; PPMs; parts/inventory; contractor tendering; KPIs.
- `[Maintenance]` **NEW** — **Meter/usage-based PM triggers** (not just time-based) feeding the automation engine.
- `[Maintenance]` **NEW** — **Per-part min/max + auto purchase order** to a vendor on low stock; receive-against-PO; auto-replenish.
- `[Maintenance]` **NEW** — **Reusable procedures/checklist templates** with required fields, pass/fail, photo, readings, attached to WOs.
- `[Maintenance]` **NEW** — **Work request triage queue** (request → planner approves → scheduled WO), distinct from instant WO.
- `[Maintenance]` **NEW** — **Barcode/QR asset labels** + scan-to-open on mobile.
- `[Maintenance]` **EXTEND** — **Offline mode** for the mobile WO flow (note: HAZARDLINK lists mobile parity as in-progress).
- `[Maintenance]` **NEW** — **Asset health score (0–100)** to drive prioritisation (Maximo/Brightly pattern).
- `[Maintenance]` **NEW (longer-term)** — **Condition monitoring ingest** (vibration/temp from IIoT) with threshold→auto-WO, reusing the spill-sensor pipeline.

### Cleaning
- `[Cleaning]` **PRESENT** — IoT wet-floor-sign sensors, spill alerts, escalation, tamper/low-battery, floor-plan pins, dispatch + scheduling, scored inspections w/ photo, QR rounds, inspection→maintenance job.
- `[Cleaning]` **NEW** — **GPS geofenced clock-in/out** with tunable perimeter; **late/missed clock-in alerts** + **uncovered-shift alert**.
- `[Cleaning]` **NEW** — **ISSA 612 workloading calculator** for bidding and staffing (input measurements → labour time + cost).
- `[Cleaning]` **NEW** — **Public "scan to see last cleaned" QR** (Scan4Clean-style) with optional patron feedback.
- `[Cleaning]` **NEW** — **Multilingual in-app messaging** with auto-translation for the cleaning crew.
- `[Cleaning]` **NEW** — **Janitorial supply/consumable inventory** per site with low-stock alerts (ties into auto-PO).
- `[Cleaning]` **EXTEND** — **Cleaning-loop / rotation monitoring** (track repeating loops, not just one-offs).
- `[Cleaning]` **NEW (hardware roadmap)** — **Smart-restroom sensors** (consumable level + occupancy) → just-in-time refill/clean tasks; natural sibling to the wet-floor-sign sensor.
- `[Cleaning]` **NEW** — **On-site bidding/proposal builder** with templates + calculators.

### Security
- `[Security]` **PRESENT** — Incident reporting (severity/photos) + AI triage; guard tours w/ NFC/QR/GPS + photo proof; lone-worker check-ins, panic, man-down w/ watcher escalation; DARs.
- `[Security]` **EXTEND** — **Missed-checkpoint / missed-tour auto-alert** to supervisor (confirm it fires automatically, not just logs).
- `[Security]` **NEW** — **Post orders** delivered to the guard's device with required acknowledgement.
- `[Security]` **NEW** — **Live command-centre dashboard** with colour-coded status (received → confirmed → resolved) and live guard map.
- `[Security]` **NEW** — **Guard dispatch** (push task to a specific guard, track ack/resolution).
- `[Security]` **NEW** — **Pass-down / shift-handover notes.**
- `[Security]` **NEW** — **Visitor management** (daily list, check-in/out, do-not-admit/watchlist, host notification, evacuation/roll-call list, optional NDA/badge).
- `[Security]` **EXTEND** — **Panic-button countdown UX** (short cancel window) + **impact/drop detection** + **hazard-alert/welfare timers** (HazardLink has panic/man-down; add these refinements).
- `[Security]` **NEW** — **Geofenced zones** with unauthorised-entry alerts.
- `[Security]` **NEW** — **Guard scheduling** with overtime-risk forecasting and smart shift-fill suggestions.
- `[Security]` **NEW** — **BOLO broadcast** to all on-duty guards.
- `[Security]` **NEW** — **Parking-violation issue type** on patrol.

### AI
- `[AI]` **PRESENT** — Grounded ask-your-data assistant; voice→WO; contractor scope drafting + value-based quote ranking; incident triage; asset-history summaries; improvement suggestions; grounded SDS extraction.
- `[AI]` **NEW** — **Generate a procedure/checklist (or WO) from an uploaded manual/document** (CoPilot pattern), reusing the grounded-extraction approach.
- `[AI]` **EXTEND** — **AI WO triage for maintenance** (auto priority + suggested assignee by skill/availability), not just incidents.
- `[AI]` **NEW** — **AI procedure recommendation** at WO creation (surface the best-matching checklist).
- `[AI]` **NEW** — **Image recognition** for asset-from-nameplate and part-from-photo (Asset Snap pattern).
- `[AI]` **NEW** — **Anomaly detection** on meter readings / inspection fields (flag out-of-range values on entry).
- `[AI]` **NEW** — **Duplicate-request detection / record standardisation.**
- `[AI]` **NEW** — **Demand forecasting** to auto-tune part reorder points (usage + lead time + criticality).
- `[AI]` **NEW (longer-term)** — **Predictive failure / asset-risk scoring** → auto-WO, once condition data exists.
- `[AI]` **NEW** — **Background AI agent** that runs scheduled checks and surfaces "what needs attention" proactively, beyond reactive chat.

---

## Sources (representative; vendor pages + comparison articles, June 2026)

CMMS: upkeep.com (product, AI/Nova, purchase-order, inventory); limble.com (spare-parts, AI solutions, Asset Snap); getmaintainx.com & help.getmaintainx.com (CoPilot, automations, anomaly detection, procedures); fiixsoftware.com / rockwellautomation.com (Asset Risk Predictor); emaint.com (condition monitoring, interactive image mapping); gofmx.com / capterra FMX; ibm.com Maximo (APM, Predict, Health); brightlysoftware.com (Asset Essentials, Origin).

Cleaning: sweptworks.com (time tracking, geofence, inspections, messaging); janitorialmanager.com (QR/Scan4Clean, inspections, workloading) + issa.com (612 cleaning times); cleantelligent.com (inspections, ticket generation, QR feedback); youraspire.com / servicetitan.com (Aspire scheduling, crew app, job costing); teamsoftware.com (TemplaCMS work bills, Engage); lighthouse.io (BLE proof-of-presence, loops, audits); workwave.com (routing, CRM); TRAX / FacilityApps / Imperial Dade (smart-restroom IoT).

Security: silvertracsoftware.com (issue monitor, dispatch, tours, parking); tracktik.com / trackforce.com (post orders, lone-worker/LWP, guard tour, back-office); support.trackforce.com (LWP, man-down, NFC touring, visitor); belfrysoftware.com (scheduling, overtime, licence tracking, payroll); qrpatrol.com / novagems.com (checkpoint tech, panic countdown).

FM/IWMS: planonsoftware.com (IWMS domains, lease, sustainability); eptura.com (space/desk booking, visitor, wayfinding); facilio.com (automation rules, FDD, tenant portal, energy); servicechannel.com (work-order automation, marketplace, invoice validation, ServiceChannel AI).

Visitor management depth: envoy.com, avigilon.com, facilityos.com, visitly.io.
