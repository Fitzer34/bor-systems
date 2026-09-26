# SAP → HazardLink feature catalogue

Comprehensive, tiered catalogue of features drawn from the SAP suite (S/4HANA
EAM/PM, Field Service Management, Asset Performance Management, Service & Asset
Manager, Ariba, EHS, Joule) and mapped onto this app's data model.

**Method:** deep multi-source research, 5 search angles, 24 sources, 77 claims
extracted, 25 adversarially verified (3-vote), 24 confirmed. SAP facts below
marked ✓ were verified against SAP primary sources (sap.com, help.sap.com, SAP
Learning/Community); items marked ◇ are from general knowledge and were **not**
fact-checked in this pass (a follow-up research run is recommended — see end).

Tier key: **SME** = core for small/mid customers · **ENT** = enterprise tier ·
**BOTH** = ships to all, deepens for enterprise.
Effort: **S** = days · **M** = 1–2 weeks · **L** = 3+ weeks / cross-platform.

---

## 1. Work orders & maintenance lifecycle (SAP EAM / Plant Maintenance)

### 1.1 Phase model with control gates — BOTH · M
- **SAP ✓:** maintenance order runs a multi-phase lifecycle (up to nine phases, Initiation→Completion) where *phase-control codes* block illegal transitions (can't start work before release, can't close with open ops).
- **You:** `maintenanceJobs.status` is already an enum (`logged→tendering→awarded→scheduled→in_progress→completed→cancelled`). Add a transition guard table + server-side validation so each move checks preconditions (e.g. can't `complete` without a completion photo; can't `awarded` without an accepted quote).
- **Schema:** new `job_phase_rules` (from_status, to_status, requires[]) or encode in code; reuse `jobEvents` for the audit trail you already write.
- **Edge:** an AI "next best action / why am I blocked" hint via your existing Claude integration, instead of SAP's config tables.

### 1.2 Risk-based priority matrix auto-deriving due dates — BOTH · M
- **SAP ✓:** *Risk-based Event Prioritization Matrix* = consequence × likelihood → auto-derives required-start, required-end and final-due dates.
- **You:** today `priority` is a free enum (routine/urgent/emergency). Add a configurable matrix (severity × likelihood → priority + SLA hours) that computes `scheduledStartAt`/`due` and drives your existing escalation timers.
- **Schema:** `risk_matrix` (org-scoped cells) + `dueAt` column on `maintenanceJobs`; wire into the alert/escalation timer you already run.
- **Edge:** Claude infers severity/likelihood from the fault description + asset criticality + live hazard-sensor context — SAP makes the planner pick cells manually.

### 1.3 Maintenance backlog & capacity leveling — ENT · L
- **SAP ✓:** *Manage Maintenance Backlog* app levels workload across weeks and tracks procurement milestones (Requisition → PO Sent → Confirmed → Shipped → Received).
- **You:** a backlog/Gantt view bucketing open jobs by week vs contractor capacity; a parts-procurement sub-status on jobs needing ordered parts.
- **Schema:** `contractors.weeklyCapacity`; `job_procurement` (job_id, milestone, at) or a milestone enum on a job-parts link.
- **Edge:** drag-to-reschedule board + AI auto-level suggestion.

### 1.4 Functional-location / equipment hierarchy — BOTH · M ◇
- **SAP ◇:** assets sit in a *functional location* tree (site→building→system→equipment); orders roll up the hierarchy.
- **You:** you already have `buildings→floors→zones`; add an asset parent/child so a chiller→compressor→motor nests, and roll job history up the tree.
- **Schema:** `assets.parentAssetId` (self-FK) + `assets.functionalLocationId` (→ zone/building you already model).
- **Edge:** auto-built hierarchy from QR scans + photos; mobile tree nav.

### 1.5 Measurement points & counters → condition-based PPMs — BOTH · M ◇
- **SAP ◇:** equipment carries *measurement points/counters* (runtime hours, pressure); readings trigger counter-based maintenance plans.
- **You:** your PPMs are calendar-based (`frequencyPerYear`, `nextDueDate`). Add meter-based triggers ("service every 500 hrs") fed by manual readings **or your hanger sensors**.
- **Schema:** `meter_points` (asset_id, unit, …), `meter_readings` (point_id, value, at); extend `ppms` with `triggerType` calendar|meter and threshold.
- **Edge:** your BLE sensors auto-post readings — SAP needs a separate IoT integration to do this.

---

## 2. Asset intelligence & predictive (SAP APM / Predictive Asset Insights)

### 2.1 Predictive maintenance on hanger data — ENT · L
- **SAP ✓:** APM layers IoT + ML on EAM: anomaly detection, remaining-useful-life (RUL), failure prediction, *prescriptive* recommendations (distinct from *predictive*).
- **You:** you already own the IoT pipeline (BLE hangers → alerts). Add an anomaly/trend layer that flags drift and **auto-creates a preventive work order** before failure.
- **Schema:** `sensor_readings` history (if not retained), `asset_health` (asset_id, score, model, at); link predicted jobs via `maintenanceJobs.source = 'predictive'` (your `source` enum already exists).
- **Edge:** detection-native — the sensors are yours; ship lightweight ML/LLM "predict-and-draft" without SAP's integration tax. Start with simple thresholds/EWMA, not a digital twin.

### 2.2 Asset health score & criticality — BOTH · S/M
- **SAP ✓:** APM positions an asset-health + asset-strategy layer over the register.
- **You:** you already store `conditionScore` (1–5), `replacementCostCents`, `warrantyExpiry`. Compute a rolled-up health/criticality index (condition + age vs `expectedLifeYears` + open jobs + warranty) shown on the asset and dashboard.
- **Schema:** none required (derived); optional `assets.criticality`.
- **Edge:** one-glance "replace vs repair" call with AI rationale + cost.

---

## 3. Inspections, compliance & EHS (SAP EHS / Workplace Safety)

### 3.1 Reusable inspection checklist templates → auto follow-up — BOTH · M
- **SAP ✓:** EAM inspection-checklist process (LOG_EAM_CHECKLIST): reusable templates tied to objects/recurring tasks; failed items auto-spawn follow-up.
- **You:** you have `inspections` with ratings (meets/acceptable/needs_improvement/na). Add **templates** (versioned checklist definitions) and a rule: any `needs_improvement` item auto-creates a `maintenanceJobs` row linked back.
- **Schema:** `inspection_templates`, `inspection_template_items`; `inspections.templateId`; `maintenanceJobs.sourceInspectionId`.
- **Edge:** AI drafts the remediation scope (you already have `draftScopeOfWorks`) the moment an item fails.

### 3.2 Incident / near-miss / observation + CAPA — BOTH · M  ★ best strategic fit
- **SAP ✓:** EHS incident management: incidents, near-misses, safety observations, investigation workflow, and **CAPA** (corrective/preventive actions).
- **You:** your hazard ALERTS are already detection-native incidents. Add an incident record (from an alert or manual), investigation fields, root cause, and CAPA tasks that reuse the work-order engine.
- **Schema:** `incidents` (org, alert_id?, type, severity, status, investigation…), `capa_actions` (incident_id, owner, due, status) — or model CAPA as `maintenanceJobs` with a new `source='capa'`.
- **Edge:** the IoT alert auto-opens the incident with photo/time/location pre-filled — SAP starts from a blank form. This is the single biggest "SAP-grade" credibility add for safety buyers.

### 3.3 Risk assessment methods (matrix, JHA, exposure) — ENT · M
- **SAP ✓:** multiple risk-analysis methods (risk matrix, job-hazard analysis, exposure, document-based) with mobile/offline entry.
- **You:** a risk-assessment module (start with risk matrix + JHA) that feeds priority into §1.2 and attaches to jobs/assets/buildings.
- **Schema:** `risk_assessments` (subject ref, method, score, controls[]).
- **Edge:** AI suggests hazards/controls from the task + site history.

### 3.4 Permit-to-work — ENT · M ◇
- **SAP ◇:** controlled permits (hot work, confined space) gate high-risk jobs.
- **You:** a permit object that must be issued/approved before a gated job can move to `in_progress` (ties into §1.1 gates).
- **Schema:** `permits` (job_id, type, issuedBy, approvedBy, validFrom/To, status).
- **Edge:** mobile e-signature + photo, AI pre-check of required controls.

### 3.5 Regulatory/audit compliance register — BOTH · S/M
- **SAP ✓:** EHS tracks regulatory compliance and audit trails.
- **You:** you already produce insurance-grade compliance PDFs + audit logs. Add a compliance register (obligations, due dates, evidence links) and recurring compliance tasks.
- **Schema:** `compliance_items` (org, regulation, dueAt, evidenceUrl, status).
- **Edge:** auto-attach the photo-proof + audit hash you already generate.

---

## 4. Field service: scheduling, dispatch & billing (SAP FSM)

### 4.1 AI dispatch / auto-scheduling with a conflict board — TIERED · M→L
- **SAP ✓:** dispatch board with multiple planning modes (manual skill-checked → assisted → autoscheduler → AI optimization); assigns by skills/location/availability within a time bucket and visualizes constraint violations + operation dependencies.
- **You:** evolve contractor scheduling from manual to **AI-assisted matching**, extending your existing `rankQuotes` Claude logic into dispatch; a board showing conflicts (double-booking, skill/geo mismatch).
- **Schema:** `contractors` needs `skills[]`/trades (you have `contractorTrades`), `serviceRegions`, `availability`; jobs need `geo`/duration.
- **Edge:** one LLM engine reasons over *soft* constraints (relationship, past quality, travel) beyond SAP's numeric optimizer. SME tier = assisted suggestions; ENT = full optimization.

### 4.2 Time-&-materials capture + service billing close-out — TIERED · L
- **SAP ✓:** mobile journal captures effort/parts/expenses/mileage → supervisor approval → **billing release**; three-layer hand-off (back-office → scheduling → mobile → approval/billing).
- **You:** a job close-out that logs labour time, parts used (decrement `parts.stockQty`), expenses, mileage; supervisor approves; generates an invoice/cost summary. You already model `billTo`.
- **Schema:** `job_labour`, `job_materials` (job_id, part_id, qty), `job_expenses`; `invoices` (job_id, lines, total, status).
- **Edge:** AI auto-drafts the invoice/cost narrative from the timeline; Stripe/QuickBooks export instead of SAP FI.

### 4.3 Service contracts / SLAs / entitlements — ENT · M ◇
- **SAP ◇:** service contracts define entitlements + SLA response/resolution targets that drive priority and billing.
- **You:** contracts per building/tenant with covered services + SLA clocks that feed escalation; "is this billable or covered?" at job creation.
- **Schema:** `service_contracts` (org, building/tenant, sla_response_mins, coverage[]), link from jobs.
- **Edge:** SLA breach predicted by AI from current backlog, surfaced before it happens.

---

## 5. Procurement & sourcing (SAP Ariba)

### 5.1 RFI prequalification + structured RFP — BOTH · M
- **SAP ✓:** guided sourcing events: RFI (info, no pricing), RFP (priced bids), with structured questionnaires.
- **You:** upgrade your magic-link tender with an optional RFI prequal stage (insurance, certs, references) before pricing, and a structured RFP (line items, not just a lump sum).
- **Schema:** `tender_stages`, `quote_line_items` (quote_id, desc, qty, unitCents); you already have `jobQuotes` + magic-link tokens.
- **Edge:** AI screens RFI responses + flags missing compliance docs.

### 5.2 Reverse auction (live competitive bidding) — ENT · M
- **SAP ✓:** forward/reverse auctions incl. *English reverse auction* — suppliers submit progressively lower bids in real time.
- **You:** an optional live reverse-auction mode on a tender: invited contractors see rank (not names) and can lower bids before a deadline.
- **Schema:** `auctions` (job_id, endsAt, rules), `bids` (auction_id, contractor_id, amount, at); realtime via your existing notification/push channels.
- **Edge:** lightweight magic-link auction that leapfrogs Ariba's heavyweight UX for SME field-service spend.

### 5.3 Award optimization & best-bid scenarios — ENT · M
- **SAP ✓:** constraint-based optimization computes an optimal award against a goal (minimise cost) under constraints (min/max suppliers, split awards, caps); preconfigured "Best Bid".
- **You:** your AI quote ranking already does the qualitative version. Add explicit award scenarios ("cheapest", "preferred + within 10%", "split") with rationale.
- **Schema:** none new beyond `jobQuotes`; compute layer + `awardReason` (you already store this).
- **Edge:** Claude explains the trade-off in plain English; SAP shows a solver score.

### 5.4 Supplier/contractor master: qualifications, ratings, expiry — BOTH · S/M ◇
- **SAP ◇:** supplier management tracks qualifications, certifications, performance ratings, expirations.
- **You:** extend `contractors` with insurance/cert docs + expiry reminders, performance scores from completed jobs, and a preferred/blocked status (you have `isPreferred`, `tier`).
- **Schema:** `contractor_documents` (type, url, expiresAt), `contractor_scores` (derived from job outcomes).
- **Edge:** auto-rating from on-time %, re-work rate, quote accuracy; expiry nags before they lapse.

---

## 6. Inventory / MRO spare parts (SAP EWM/MM) ◇ (not fact-checked this pass)

### 6.1 Multi-location stock, bins & transfers — BOTH · M ◇
- **You:** `parts` is single-pool today. Add stock locations/bins and per-location quantities; transfers between sites.
- **Schema:** `part_locations`, `part_stock` (part_id, location_id, qty); migrate `stockQty`.

### 6.2 Cycle counts & stock adjustments — BOTH · S/M ◇
- **You:** scheduled count tasks, variance capture, adjustment audit.
- **Schema:** `stock_counts`, `stock_adjustments`.

### 6.3 Auto-reorder / PO generation — BOTH · M ◇
- **You:** you already track `reorderLevel`; auto-raise a reorder/PO to `supplier` when stock dips, tie into §4.2 material consumption.
- **Schema:** `purchase_orders`, `po_lines`.
- **Edge:** parts auto-decrement on job close, auto-reorder, supplier email — closed loop without SAP MM.

---

## 7. Mobile & offline (SAP Service & Asset Manager)

### 7.1 Offline-first field execution — BOTH · L
- **SAP ✓:** SSAM is an offline-first mobile app; technicians create/execute orders, reserve parts/tools, log time, look up equipment, record inspection + measurement readings, all offline with auto-sync.
- **You:** your iOS/Android apps are online-only. Add a local store (SQLite/Room/CoreData) + sync queue so jobs, inspections, photos and readings work with no signal and reconcile on reconnect.
- **Schema:** client-side; server needs idempotent sync endpoints + updatedAt/version columns for conflict resolution.
- **Edge:** leaner local-DB sync vs SAP's MDK/MAIF stack; you control both apps already.

### 7.2 Persona-driven mobile home — BOTH · S/M
- **SAP ✓:** SSAM ships four personas (Maintenance, Inventory, Field Service, **Safety** — added 2305).
- **You:** role-aware mobile home screens; your safety/hazard core maps directly to SAP's Safety persona.
- **Schema:** reuse existing roles.
- **Edge:** the Safety persona is your home turf — lead with it.

### 7.3 QR/barcode + NFC asset scan — BOTH · S
- **You:** you already generate asset QR `reportToken` for no-login fault reporting. Add in-app scan-to-open-asset / scan-to-log-reading / scan-to-count.
- **Schema:** none.
- **Edge:** scan → AI-prefilled fault report with photo.

---

## 8. Analytics, platform & AI (SAP Analytics Cloud, BTP, Joule)

### 8.1 Embedded KPI dashboards & report builder — BOTH · M ◇
- **SAP ◇:** Fiori/Analytics Cloud embedded KPIs (MTTR, MTBF, schedule compliance, backlog, cost).
- **You:** a metrics layer (MTTR/MTBF, PPM compliance %, first-time-fix, downtime, spend by asset/contractor) beyond the current dashboard cards; saved/exportable reports (CSV exists).
- **Schema:** derived/materialized views over jobs/alerts/inspections.
- **Edge:** "ask your data" — natural-language analytics via Claude.

### 8.2 Public API + webhooks / event mesh — ENT · M ◇
- **SAP ◇:** BTP exposes APIs, events, integration.
- **You:** a documented REST API + outbound webhooks (job.created, alert.raised) so customers integrate ERPs/BMS.
- **Schema:** `api_keys`, `webhook_subscriptions`.
- **Edge:** developer-friendly, OpenAPI-first vs BTP complexity.

### 8.3 Natural-language admin/config & in-app copilot — TIERED · M
- **SAP ✓:** Joule for Developers does code/logic generation, explanations, NL-to-app-logic; Joule assistant answers in-context.
- **You:** you already embed Claude. Add an in-app copilot: "show overdue fire-safety PPMs at Block C", "draft a tender for this", "why is this job blocked?", plus NL setup of risk matrices/templates.
- **Schema:** none; orchestration over existing data + tools.
- **Edge:** you already ship Claude — this is incremental, and a genuine SME differentiator vs SAP's enterprise-gated Joule.

### 8.4 Localization, GxP/validation, SOX/GDPR, accessibility — ENT · varies ◇
- **SAP ◇:** deep localization, audit/validation, compliance, accessibility.
- **You:** i18n, WCAG accessibility pass, data-residency/GDPR tooling (export/erase), immutable audit (you have audit logs + R2 photo hashes).
- **Edge:** EU-region hosting (you already deploy Frankfurt) + GDPR-native is a selling point.

---

## Prioritized shortlist (highest value-to-effort first)

1. **Incident + CAPA on existing alerts** (§3.2) — M — best strategic fit; turns your IoT alerts into SAP-grade safety records.
2. **Inspection templates → auto follow-up jobs** (§3.1) — M — closes the inspect→fix loop using parts you already have.
3. **Risk matrix auto-deriving priority/due dates** (§1.2) — M — feeds escalation timers; small schema delta.
4. **AI dispatch / assisted scheduling** (§4.1) — M — extends `rankQuotes`; high "wow", reuses Claude.
5. **Phase-control gates on the job lifecycle** (§1.1) — M — credibility + data quality on an enum you already have.
6. **RFI/RFP + supplier qualifications & expiry** (§5.1/5.4) — M — strengthens your tender moat.
7. **Reverse auction + award scenarios** (§5.2/5.3) — M — differentiating spend feature for SME.
8. **KPI analytics layer (MTTR/MTBF/compliance)** (§8.1) — M — buyers ask for this on day one.
9. **Meter/condition-based PPMs from sensors** (§1.5) — M — uses your unique sensor pipeline.
10. **Predictive maintenance layer** (§2.1) — L — flagship differentiator; start simple (thresholds/EWMA).
11. **Offline mobile sync** (§7.1) — L — table-stakes for real field crews.
12. **T&M capture + service billing** (§4.2) — L — unlocks the field-service revenue story.

## Notable gaps vs SAP today (confirmed)
No formal incident/near-miss/CAPA · no offline mobile execution · no measurement points/counters · no capacity/backlog leveling · no dispatch optimization · no predictive ML · no service billing/finance · no auctions or award optimization · no functional-location/equipment hierarchy.

## Strategic read
Two assets make this app able to *leapfrog* SAP rather than merely copy it: **(a) you own the IoT hazard-sensor pipeline** (SAP has to integrate to third-party IoT), enabling detection-native incidents, condition-based PPMs and predictive maintenance cheaply; **(b) Claude is already embedded**, so dispatch, award reasoning, scope drafting, risk inference and an NL copilot are incremental, not net-new platforms. Lead with the **safety/EHS core** (your home turf), then field-service depth.

## Caveats & follow-ups
- Items marked ◇ (inventory/EWM, MM three-way match, Analytics Cloud/Fiori, BTP, Business One/ByDesign SME comparison, CRM, localization/GxP/SOX/GDPR/accessibility) were **not** fact-checked in this pass — recommend a second research run focused there.
- A SAP-killed claim: SAP does **not** categorise maintenance as reactive/proactive/overhead (refuted 1-2).
- Tier/effort labels are engineering judgments against the current schema, not SAP facts.
- Open question: benchmark the roadmap against modern CMMS rivals (Fiix, UpKeep, MaintainX, Limble), not only SAP — they're the real competitive set for SME.

_Primary sources: SAP S/4HANA 2021 EAM highlights (community.sap.com), SAP APM & Asset Manager (sap.com), Ariba Sourcing (sap.com), SAP EHS Safety (sap.com), Joule for Developers (sap.com), SAPSA IAM 2022 deck. Full source list + verification votes in the workflow transcript._
