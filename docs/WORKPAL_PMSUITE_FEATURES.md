# WorkPal & "PM Suite" — Feature Research & HazardLink Build Backlog

Research date: 2026-06-20. Purpose: extract every feature from two facilities/field-service products as a build backlog for **HazardLink** (Irish unified Cleaning + Maintenance + Security platform; web dashboard + iOS/Android apps; IoT wet-floor-sign spill sensors; automation; grounded Claude AI assistant).

**Source-type legend (citations):**
- `[Vendor]` — the product's own website (highest detail, marketing-spun)
- `[Review]` — third-party review/listing site (Software Advice, Capterra, GetApp, SoftwareWorld)
- `[Inferred]` — not stated outright; reasonable inference flagged as such

**HazardLink tagging legend:** `[Cleaning]` `[Maintenance]` `[Security]` `[Platform]` `[AI]`, plus **NEW** (not in HazardLink today) vs **PRESENT** (already built or clearly in scope per `docs/HAZARDLINK_FEATURES.md`) vs **PARTIAL** (some of it exists).

> Note on accuracy: feature names in quotes are verbatim from the cited source. Where a capability is implied but not named, it is marked `[Inferred]`. No usage stats, customer counts, or ratings are reproduced here (none were load-bearing and the brief forbids fabricated stats).

---

# Product 1 — WorkPal

**Identity: confirmed.** WorkPal is a cloud-based, end-to-end **field service / job management** platform. Company is **Kovenant/WorkPal**, based in **Belfast, Northern Ireland**. The live marketing site is **yourworkpal.com** (the brief's `getworkpal.com` appears to be an older/alternate domain; all vendor citations below are from `yourworkpal.com`). Positioned for trades and field-service SMEs: cleaning, drainage, electrical, environmental services, facilities management, fire & security, landscaping, pest control, plumbing/HVAC, property maintenance, roofing, gritting/salting. This is a very close adjacent competitor to HazardLink's field-ops layer and is also UK/Ireland-based.

## 1A. Confirmed features

### Job management & scheduling
- **"Live Job Scheduling"** with a **"drag-and-drop scheduler"** — assign/reassign jobs on a calendar. `[Vendor]`
- **Job creation** and customised **job sheets**, assigned instantly to field workers. `[Vendor]` `[Review]`
- **"Job Tracking"** / live job status (pending, underway, completed). `[Vendor]` `[Review]`
- **"Dispatch Management"** — dispatch and reassign jobs to field operatives. `[Review]`
- **"Work Order Management"**. `[Review]`
- **"Routing"** — route field staff. `[Review]`
- **Recurring jobs** — set up recurring/automated service jobs with customizable frequency (planned/maintenance contracts). `[Vendor]`
- **"Calendar Management"**. `[Review]`
- Job progress notifications automatically sent to management. `[Vendor]`

### Mobile workforce app
- **"Mobile App"** delivering all job info, tasks, parts, site history and forms to engineers' devices. `[Vendor]` `[Review]`
- **Works online and offline** — app guides the worker through tasks even with no signal. `[Vendor]`
- **On-site data capture**. `[Vendor]`
- **Photo upload / capture** on-site. `[Vendor]`
- **"Electronic Signature"** / **"Mobile Signature Capture"** (customer sign-off). `[Vendor]` `[Review]`
- **Digital sign-off** at job completion. `[Vendor]`
- **GPS** + **"Location Tracking"** — track field staff (and per the vendor, vehicles) in real time; jobs are logged with GPS info. `[Review]` `[Vendor]`
- **"Activity Tracking"**. `[Review]`

### Digital forms & job sheets
- **"Digital Forms"** with a **"Form Builder for job management"** — build custom forms/checklists. `[Vendor]`
- **"Customizable Forms"** and **"Customizable Fields"**. `[Review]`
- Completed jobs sync detailed reports to the office: job notes, forms, photos, customer signatures, all time-stamped + GPS-stamped. `[Vendor]`

### Quoting, estimates & invoicing
- **"Quotes"** / **"Quotes/Estimates"** — generate and send quotes/proposals. `[Vendor]` `[Review]`
- **"Invoices"** / **"Billing & Invoicing"** / **"Invoice Management"** — generate, send and export invoices on job completion. `[Vendor]` `[Review]`
- End-to-end flow: quote → assign job → manage field operatives in real time → invoice. `[Vendor]` `[Review]`

### Accounting / system integrations
- **Xero** integration. `[Review]`
- **Sage** (listed as **"Sage CRM"**) integration. `[Review]`
- **QuickBooks** (listed as **"QuickBooks Online Advanced"**) integration. `[Review]`
- **Financial integration for invoicing accuracy** (vendor's generic phrasing). `[Vendor]`

### Asset management
- **"Asset Management"** — track valuable assets. `[Vendor]`
- **Asset complete history** via **QR / barcode scanning**. `[Vendor]`
- **Custom asset fields** (up to ~50 custom fields). `[Vendor]`

### Stock / parts / inventory
- **"Tasks and Parts"** / **"Tasks & Parts"** — parts attached to jobs. `[Vendor]`
- **"Equipment"** management with **real-time inventory tracking**. `[Vendor]`
- **"Inventory Management"** / **"Inventory Tracking"**. `[Review]`

### Time & workforce
- **"Online Time Clock"** — track worker shifts and job time; replaces paper timesheets. `[Review]` `[Vendor]`
- **"Workforce Management"**. `[Review]`
- Accurate tracking of worker shifts and per-job time. `[Vendor]`

### Customer / client management & portal
- **"Client Portal"** — secure, transparent customer access to job progress. `[Vendor]`
- **"Contact Database"** / **"Customer Database"**. `[Review]`
- **"Customer History"** / **"Service History"**. `[Review]`
- Manage large volumes of clients across many sites; track historic installations, upcoming jobs, service requirements. `[Review]`

### Reporting & analytics
- **"Reporting"** for data-driven insights. `[Vendor]`
- **"Customizable Reports"**, **"Reporting & Statistics"**, **"Real-Time Reporting"**, **"Historical Reporting"**. `[Review]`

### Automation & notifications
- **"Workflow Automation"**. `[Review]`
- **"Alerts/Notifications"**. `[Review]`
- Automatic job-progress notifications to management; live updates from field engineers. `[Vendor]`

### Document management
- **"Document Storage"**. `[Review]`

## 1B. Notable / unusual features (WorkPal)

- **Online + offline mobile job execution** that *guides the worker through each task step-by-step* — not just a sync-when-back-online cache, but a workflow wizard on the device. `[Vendor]`
- **Form Builder tied directly to job sheets** — the same custom form engine produces the on-site checklist and the office-side completion report (notes + forms + photos + signature, all GPS/time-stamped in one record). `[Vendor]`
- **Up to ~50 custom asset fields** + QR/barcode asset history — fairly deep asset config for a field-service (rather than pure CMMS) tool. `[Vendor]`
- **Sage CRM** (not just Sage accounting) as a named integration — suggests CRM-side sync, not only invoice push. `[Review]`
- **Industry-templated onboarding** — markets pre-built configurations per trade (gritting/salting, pest control, fire & security, drainage, etc.) rather than a single generic setup. `[Vendor]`
- **Right-first-time** framing — features explicitly sold as reducing repeat visits (data capture + parts + site history on the device). `[Vendor]`

## 1C. Map to HazardLink (WorkPal)

| WorkPal feature | HazardLink tag(s) | Status | Notes |
|---|---|---|---|
| Drag-and-drop scheduler / calendar dispatch board | `[Platform]` `[Cleaning]` `[Maintenance]` `[Security]` | **NEW** | HazardLink has dispatch/shift scheduling and work-order assignment, but no described *visual drag-and-drop scheduling board* across all jobs/staff/vehicles. High-value gap. |
| Recurring jobs with custom frequency | `[Maintenance]` `[Cleaning]` | **PARTIAL** | PPM schedules exist for Maintenance; extend recurring-job engine to **Cleaning periodics** (e.g. deep cleans, window rounds) and security patrol schedules. |
| Mobile app: offline step-by-step task wizard | `[Platform]` | **PARTIAL** | Mobile apps exist; add **guided offline job/checklist execution** so field staff complete jobs with no signal. |
| Digital Forms / Form Builder (job sheets) | `[Platform]` `[Cleaning]` `[Maintenance]` | **PARTIAL** | HazardLink has scored cleaning inspections + SDS forms; a **general custom Form Builder** for arbitrary job sheets/checklists across disciplines is **NEW**. |
| Quotes / estimates (to customers) | `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink does *contractor* quoting (inbound tenders). **Outbound customer-facing quotes/estimates** (HazardLink → its client) appear absent — **NEW**. |
| Invoicing + Xero / Sage / QuickBooks integration | `[Platform]` | **NEW** | No billing/invoicing or accounting integrations described in HazardLink. Big commercial gap; **Xero + Sage** matter most for Irish/UK market. |
| Online time clock / timesheets / per-job time | `[Platform]` `[Cleaning]` `[Security]` | **NEW** | HazardLink has shift scheduling but no described **time clock / timesheet / labour-time capture**. Strong fit (cleaning hours, guard shifts, technician labour). |
| GPS / vehicle / live location tracking | `[Platform]` `[Security]` | **PARTIAL** | Security has GPS checkpoints + lone-worker; a **live field-staff/vehicle map** for all disciplines is **NEW**. |
| Client portal (customer self-serve job visibility) | `[Platform]` | **NEW** | HazardLink exposes contractor email links + tenant QR reporting, but no described **logged-in client/customer portal** to view job status, history, quotes, invoices. |
| Asset register + QR/barcode history + custom fields | `[Maintenance]` | **PRESENT** | HazardLink already has an asset register with history/criticality/meters/warranties. Consider adding **up to N custom asset fields** + QR asset lookup if not present. |
| Parts / inventory tracking | `[Maintenance]` | **PRESENT** | HazardLink has parts & inventory. |
| Work-order lifecycle + dispatch | `[Maintenance]` | **PRESENT** | HazardLink work orders: logged → assigned → in progress → done. |
| Photo capture + e-signature sign-off | `[Cleaning]` `[Maintenance]` `[Security]` | **PARTIAL** | Photo proof exists across inspections/incidents; **customer/e-signature capture on job completion** is **NEW**. |
| Workflow automation + alerts/notifications | `[Platform]` | **PRESENT** | HazardLink has push/email/SMS + escalation. |
| Reporting / KPIs / dashboards | `[Platform]` | **PRESENT** | HazardLink has reports, analytics, maintenance KPIs. |
| Customer/contact database + service history | `[Platform]` | **PARTIAL** | HazardLink has sites/assets/contacts; a fuller **CRM-style customer record** (per-customer job/quote/invoice history) is partly **NEW**. |
| Industry-templated onboarding per trade | `[Platform]` | **NEW** (nice-to-have) | Pre-built setups per discipline/sub-trade could speed onboarding. |

---

# Product 2 — "PM Suite" (identity is AMBIGUOUS — see below)

## 2.0. Identity investigation & confidence

"PM Suite" / "PMSuite" is **not a single dominant product** in the facilities/property-maintenance space. Search across "PM Suite facilities maintenance software", "PMSuite CAFM", "PM Suite planned maintenance", and brand variants surfaced **three distinct things**, only one of which truly fits the FM/PPM brief:

1. **`pmsuite.co` — "PMSuite: All-in-One Business Platform"** — a general SMB business suite (HR, CRM, Projects, Finance, Workspace; ~200+ features, from ~$39/mo). **This is the literal "PMSuite" brand, but it is NOT facilities/property-maintenance software.** Confidence it is the brief's intended product: **LOW.** Covered briefly in §2C for completeness.
2. **`thepmsuite.com` / "The PM Suite"** — a **project-management consulting firm**, not software. Not relevant. Excluded.
3. **Concerto (by Bellrock)** — a UK **CAFM / property & estate-maintenance "suite"** that *is* explicitly described as a property-maintenance software *suite* and is the **strongest functional match** for "a planned/preventive maintenance (PPM) / CAFM / property-maintenance suite." It is **not literally branded "PM Suite,"** but it is the closest real product to what the brief describes. Confidence it's the best functional match for the brief's *description*: **HIGH.** Confidence it's the exact product the brief calls "PM Suite": **MEDIUM-LOW** (name mismatch).

**Decision (per brief's "if genuinely ambiguous, cover the top 1-2 candidates and clearly note which feature set belongs to which"):** The primary deep-dive below is **Concerto**, because it matches the *described* product (PPM/CAFM/property maintenance) and yields the most useful backlog. `pmsuite.co` is summarised separately and clearly labelled. **If the intended "PM Suite" is a specific niche product not found here, flag for re-identification with a vendor URL.**

---

## 2A. PRIMARY MATCH — Concerto (Bellrock) — CAFM / property-maintenance suite

**Identity:** Concerto is a UK CAFM platform by **Bellrock Property & Facilities Management** (founded 1986). Marketed as a **fully integrated suite** combining assets, maintenance, compliance and contractors so FM/estates teams don't need multiple systems. Strong in public sector / estates (e.g. NHS-style Premises Assurance, London Fire Brigade deployment). All citations `[Vendor]` are from `concerto.co.uk` unless noted.

### Confirmed modules (the "suite")
- Estates management `[Vendor]`
- CAFM `[Vendor]`
- Asset management `[Vendor]`
- Project management `[Vendor]`
- Intelligent workspace (space planning) `[Vendor]`
- Health and safety `[Vendor]`
- Permit to work `[Vendor]`
- Premises Assurance Model (PAM) `[Vendor]`
- Mobile surveys and capture `[Vendor]`
- Key Manager `[Vendor]`
- Reporting and analytics `[Vendor]`
- Room and desk bookings `[Vendor]`

### Planned Preventive Maintenance (PPM)
- **"Full lifecycle of planned preventative maintenance."** `[Vendor]`
- **Automatic work-order generation** from PPM schedules. `[Vendor]`
- **SFG20-aligned maintenance schedules** (BESA SFG20 standard cross-referenced to assets for minimum + best-practice service frequencies). `[Vendor]` `[Review]`
- **Asset-linked task generation** — tasks generated from the asset register. `[Vendor]`
- **Bulk task scheduling & editing**. `[Vendor]`
- **Custom frequencies & seasonal adjustments**. `[Vendor]`
- PPM linked to survey data and compliance documentation. `[Vendor]`

### Reactive maintenance / helpdesk
- **Helpdesk** for service requests, **multi-channel request logging** (central helpdesk or mobile device). `[Vendor]`
- **Out-of-hours and emergency support** logging. `[Vendor]`
- **Works ordering functionality** — assign to internal operatives or external contractors. `[Vendor]`
- **Contractor email orders** (issue a works order to a contractor by email). `[Vendor]`
- **Quotation process with in-system approval**. `[Vendor]`
- **Cost recording & material tracking** at job level. `[Vendor]`

### Asset management & register
- **Asset register** — single accurate view of all assets across the portfolio. `[Vendor]`
- **Asset tagging** — each asset gets a **unique barcode or QR code**, scanned into the database. `[Vendor]`
- **Asset classification** — condition, location, value, lifecycle data. `[Vendor]`
- **Mechanical equipment register** — scalable, no asset-count limit. `[Vendor]`
- **Critical parts management** — **batch & serial-number tracking**, **real-time stock control**. `[Vendor]`
- **Automated reorder alerts** — threshold-based restocking. `[Vendor]`
- **Warranty alerts**. `[Vendor]`
- **Mobile delivery with evidence capture** (stock receipt). `[Vendor]`

### Compliance & statutory maintenance
- **Statutory maintenance requirement tracking**. `[Vendor]`
- **Certificate storage + expiration monitoring**. `[Vendor]`
- **Full audit trail**. `[Vendor]`
- **Automated PPM rules + real-time compliance reporting**. `[Vendor]`
- **Compliance dashboards & SLA tracking**. `[Vendor]`
- **Evidence management** — link documents directly to assets, sites & tasks; document retention scheduling. `[Vendor]`
- **Health & safety** module + **Permit to Work** module. `[Vendor]`
- **Premises Assurance Model (PAM)** — structured compliance assurance framework. `[Vendor]`

### Contractor & supplier management
- **Contractor onboarding and tracking**. `[Vendor]`
- **Contractor portal** with job visibility. `[Vendor]`
- **SafeContractor integration** (accreditation). `[Vendor]`
- **Accreditation monitoring**. `[Vendor]`
- **SLA monitoring + performance dashboards**. `[Vendor]`
- **Rate card management**. `[Vendor]`

### Financial management
- **Budget allocation & monitoring**. `[Vendor]`
- **"Application for payment"** workflow. `[Vendor]`
- **Orders and invoicing**. `[Vendor]`
- **Purchase-order workflow**. `[Vendor]`
- **CIS contractor management** (UK Construction Industry Scheme tax handling). `[Vendor]`
- **Job-level cost tracking**. `[Vendor]`

### Surveys & condition data
- **Condition surveys** — capture detailed data to analyse maintenance needs. `[Vendor]`
- **Custom / bespoke survey templates** for ad-hoc inspections. `[Vendor]`
- **Mobile data capture** — update asset records in real time via mobile surveys; real-time sync to the platform. `[Vendor]`

### Space & property management
- **CAD-based floor plans** + **GIS**. `[Vendor]` `[Review]`
- **Room and desk booking** (hot-desking / space booking). `[Vendor]`
- **Space usage optimization and monitoring**. `[Vendor]`

### Document management
- Centralized repository for **O&M manuals + certificates**. `[Vendor]`
- **Version control + audit trails**. `[Vendor]`
- **Secure role-based access**. `[Vendor]`
- Documents **linked to properties and assets**. `[Vendor]`
- **SharePoint + Office 365 integration**. `[Vendor]`

### Mobile & field operations
- **Mobile app with offline capability**. `[Vendor]`
- **Barcode scanning** for asset verification. `[Vendor]`
- **Photo + signature capture**. `[Vendor]`
- **Real-time job updates**. `[Vendor]`

### Reporting & analytics
- **Customizable dashboards with role-based views**. `[Vendor]`
- **Real-time visibility across all FM activity**. `[Vendor]`
- **Financial performance tracking**, **compliance reporting**, **KPI monitoring**. `[Vendor]`

### Integrations
- Finance systems: **Oracle, SAP**. `[Vendor]`
- **Access control systems**. `[Vendor]`
- **Building Management Systems (BMS)**. `[Vendor]`
- **IoT devices**. `[Vendor]`
- **Single Sign-On (SSO)**. `[Vendor]`
- **SafeContractor** (contractor accreditation). `[Vendor]`

## 2B. Notable / unusual features (Concerto)

- **SFG20-aligned PPM** — schedules built by cross-referencing assets to the **BESA SFG20** maintenance standard for compliant minimum/best-practice frequencies. This is the FM-industry "gold standard" for statutory maintenance and a credibility marker. `[Vendor]` `[Review]`
- **Premises Assurance Model (PAM)** — a formal compliance-assurance framework (public-sector / NHS estates flavour) layered over CAFM. Unusual; signals deep statutory-compliance positioning. `[Vendor]`
- **"Application for payment" + CIS contractor management** — proper construction-contract financial workflows (interim payment applications, UK CIS tax) baked into FM. Goes well beyond a typical CMMS. `[Vendor]`
- **Permit to Work module** — formal permit issuance (hot works, confined space, etc.) integrated with jobs. `[Vendor]`
- **Key Manager** — physical key issue/return tracking. Niche but relevant to multi-site security. `[Vendor]`
- **CAD floor plans + GIS + space optimization + desk/room booking** — full workplace/space-management layer, not just maintenance. `[Vendor]`
- **SafeContractor integration + accreditation monitoring** — auto-checks contractor accreditation status. `[Vendor]`
- **Batch & serial-number stock tracking with threshold reorder alerts + mobile goods-receipt evidence** — warehouse-grade parts control inside CAFM. `[Vendor]`
- **Document retention scheduling** + O&M manual repository linked to assets — lifecycle document governance. `[Vendor]`

## 2C. SECONDARY / LITERAL-NAME MATCH — `pmsuite.co` (general business suite, LOW relevance)

Included only because it is the literal "PMSuite" brand. **It is a general SMB operations platform, not FM/maintenance software** — confidence it's the brief's target is **LOW**. Confirmed `[Vendor]`/`[Review]` features:

- **5 modules:** CRM, HR, Projects, Finance, Team Workspace ("200+ features", ~$39/mo, 14-day trial).
- **CRM:** sales pipeline lead→close, deal tracking, proposals.
- **HR:** hiring→payroll, attendance, leaves, performance reviews, employee records.
- **Projects:** Kanban boards, Gantt charts, tasks, milestones, team workload.
- **Finance:** estimates, invoicing, expenses.
- **Support tickets**, client management, team collaboration, reporting.

**Relevance to HazardLink:** mostly back-office (HR/payroll/CRM/PM) rather than field FM. The only items worth noting are generic and already covered better by WorkPal/Concerto above: **estimates/invoicing**, **support tickets (helpdesk)**, **staff attendance/leave**, **Kanban/Gantt project views**. Of these, **staff attendance + leave management** aligns with HazardLink's separately-noted staff leave/scheduling direction; **Kanban/Gantt** could suit larger maintenance projects/refurbishments. Everything else here is out of HazardLink's scope.

## 2D. Map to HazardLink (Concerto-primary; pmsuite.co items noted inline)

| Feature | HazardLink tag(s) | Status | Notes |
|---|---|---|---|
| SFG20-aligned PPM schedules | `[Maintenance]` | **NEW** | HazardLink has PPM schedules but no **SFG20 standard library** mapping asset types → compliant task frequencies. High-value credibility/compliance feature for UK/IE FM buyers. |
| Statutory/compliance maintenance tracking + dashboards | `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink tracks PM compliance %; a dedicated **statutory-compliance register** (gas, fire, electrical, LOLER, etc.) with certificate-expiry alerts is largely **NEW**. |
| Certificate storage + expiry monitoring (assets & contractors) | `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink has staff certifications; extend to **asset/site statutory certificates** + contractor accreditation expiry. |
| Contractor portal + accreditation (SafeContractor-style) | `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink uses no-login contractor email links + AI quote ranking; a **persistent contractor portal** with **accreditation/insurance status gating** is **NEW** (matches HazardLink's separate "contractor cert compliance" direction). |
| SLA monitoring + performance dashboards | `[Maintenance]` `[Security]` `[Platform]` | **NEW** | No SLA tracking described in HazardLink. Add **response/resolution SLAs per priority/contract** with breach alerts. |
| Rate card management | `[Maintenance]` `[Platform]` | **NEW** | Pre-agreed contractor/labour rate cards to auto-cost jobs/quotes. |
| Application-for-payment / CIS / PO workflow | `[Platform]` | **NEW** (lower priority for IE) | Construction-grade financial workflows; CIS is UK-specific, but **purchase orders + interim payment** could matter for larger maintenance contracts. |
| Permit to Work | `[Maintenance]` `[Security]` | **NEW** | Hot-works/confined-space/electrical permits tied to jobs — strong **safety + cross-discipline** fit (security guards often control permit access). |
| Health & Safety module | `[Platform]` `[Maintenance]` | **PARTIAL** | HazardLink has SDS + incidents; a broader **H&S module** (risk assessments, method statements/RAMS, near-miss) is partly **NEW**. |
| Asset register + QR/barcode tagging | `[Maintenance]` | **PRESENT** | HazardLink already has this. |
| Critical-parts: batch/serial tracking + auto-reorder thresholds | `[Maintenance]` | **PARTIAL** | HazardLink has parts/inventory; **batch/serial tracking + automated reorder alerts** is **NEW**. |
| Condition surveys + custom survey templates (mobile) | `[Maintenance]` `[Cleaning]` | **PARTIAL** | HazardLink has cleaning inspections + SDS capture; a general **mobile condition-survey builder** for assets/buildings is **NEW**. |
| CAD/GIS floor plans + space management | `[Cleaning]` `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink already has **live floor-plan pins** for spill sensors. Extend to **uploadable CAD plans, zones, and asset/job pinning** across disciplines (strong synergy with existing floor-plan view). |
| Room / desk booking | `[Platform]` | **NEW** (adjacent) | Workplace-management add-on; lower priority unless targeting corporate workplace FM. |
| Key Manager (physical key issue/return) | `[Security]` | **NEW** | Niche but a natural **Security** module add. |
| Document management (O&M manuals, version control, asset-linked) | `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink stores SDS + docs; a governed **document repository** (versioning, retention, asset/site linking, O&M manuals) is largely **NEW**. |
| Reactive helpdesk (multi-channel logging) | `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink's fault→work-order + tenant QR covers much of this; a formal **helpdesk/ticket queue** with channels + out-of-hours routing is **NEW**. |
| Budgets / job-level cost tracking | `[Maintenance]` `[Platform]` | **PARTIAL** | HazardLink costs work orders + ranks quotes on value; **budget allocation + spend-vs-budget tracking** is **NEW**. |
| Integrations: SSO, Office365/SharePoint, BMS, access control, IoT | `[Platform]` | **PARTIAL** | HazardLink has its own IoT; **SSO + Office365/SharePoint + BMS/access-control connectors** are **NEW** (enterprise sales enablers). |
| Staff attendance + leave management (*from pmsuite.co*) | `[Platform]` | **PARTIAL** | Matches HazardLink's separate staff-leave/scheduling direction; reinforce as a real backlog item. |
| Kanban / Gantt project views (*from pmsuite.co + Concerto PM module*) | `[Maintenance]` `[Platform]` | **NEW** | For multi-task maintenance **projects/refurbs** (vs single work orders). Lower priority. |

---

# Cross-product synthesis — highest-value gaps for HazardLink

Ranked, de-duplicated across both products, emphasising things **not already in HazardLink** and **not standard in every CMMS/cleaning/security tool**:

1. **Visual drag-and-drop scheduling/dispatch board** (WorkPal) — unifies cleaner shifts, technician jobs, guard rosters and vehicles on one calendar. `[Platform]` **NEW**.
2. **Billing + accounting integrations: customer invoicing, outbound quotes, Xero/Sage/QuickBooks** (WorkPal) — the biggest commercial hole; essential for IE/UK SMBs. `[Platform]` **NEW**.
3. **Time clock / timesheets / per-job labour time** (WorkPal) — fits cleaning hours, guard shifts and technician labour costing; feeds invoicing. `[Platform]` **NEW**.
4. **SFG20-aligned PPM + statutory-compliance register with certificate-expiry alerts** (Concerto) — a credibility-defining FM feature most generic CMMS tools lack; differentiates on compliance. `[Maintenance]` **NEW**.
5. **SLA engine (response/resolution targets per priority/contract) + breach alerts + SLA dashboards** (Concerto) — table-stakes for contracted FM, absent in HazardLink. `[Maintenance]`/`[Security]` **NEW**.
6. **Persistent contractor portal with accreditation/insurance gating + rate cards** (Concerto, SafeContractor-style) — upgrades HazardLink's email-link model and matches its own contractor-cert direction. `[Platform]`/`[Maintenance]` **PARTIAL→NEW**.
7. **General custom Form Builder for job sheets/checklists** across all three disciplines (WorkPal) — one engine beyond the existing cleaning-inspection forms. `[Platform]` **NEW**.
8. **Permit to Work** (Concerto) — uncommon in cleaning/CMMS tools, strong cross-discipline safety play (security controls access, maintenance does the work). `[Maintenance]`/`[Security]` **NEW**.
9. **Client/customer portal + CRM-style customer records** (WorkPal) — logged-in client visibility of jobs, quotes, invoices, history. `[Platform]` **NEW**.
10. **Governed document management** (O&M manuals, version control, retention, asset/site-linked) + **batch/serial parts tracking with auto-reorder** (Concerto) — enterprise polish that lifts HazardLink above lightweight tools. `[Maintenance]`/`[Platform]` **NEW/PARTIAL**.

**AI angles (grounded, non-fabricating) layered on the above for differentiation:** AI auto-drafting of SFG20 PPM schedules from an asset list; AI SLA-breach risk prediction from live job data; AI reading contractor insurance/accreditation PDFs to populate expiry dates (same grounded-extraction pattern as the existing SDS reader); AI suggesting the right custom form/checklist per job type; AI summarising O&M manuals on demand. Tag `[AI]`, all **NEW**, all consistent with HazardLink's "never invents facts" principle.

---

## Source list

WorkPal:
- yourworkpal.com/features-of-job-management-software/ `[Vendor]`
- yourworkpal.com/field-service-management-software/ `[Vendor]`
- yourworkpal.com (home) `[Vendor]`
- softwareadvice.com/construction/workpal-profile/ `[Review]` (named integrations: Xero, Sage CRM, QuickBooks Online Advanced; GPS/location, online time clock, dispatch, routing, inventory, work-order mgmt, workflow automation)
- Capterra / GetApp / SoftwareWorld listings `[Review]` (corroborating; some pages returned HTTP 403 and were not fully fetched)

"PM Suite" candidates:
- concerto.co.uk/modules/cafm `[Vendor]` (PRIMARY functional match)
- concerto.co.uk/modules/asset-management `[Vendor]`
- concerto.co.uk/cafm-software/ and bellrock.co.uk/products/concerto `[Vendor]` `[Review]`
- pmsuite.co + pmsuite.co/features `[Vendor]` `[Review]` (literal "PMSuite" brand — general business suite, LOW relevance; homepage returned HTTP 403, features taken from search snippets + listing)
- thepmsuite.com `[Vendor]` (project-management consultancy — excluded, not software)

**Identity caveats restated:** "PM Suite" is not a single dominant FM product. Concerto is the best match for the *described* product (CAFM/PPM/property maintenance) at HIGH functional confidence but MEDIUM-LOW name confidence; `pmsuite.co` is the literal name match at LOW relevance. If a specific niche "PM Suite" was intended, please supply a vendor URL for targeted re-research.
