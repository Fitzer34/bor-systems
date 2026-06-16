# HazardLink — Maintenance & Tendering Platform

**Product spec — v0.1 (draft for sign-off). No code until this is agreed.**

A blueprint pulled together from the planning conversations. Mark it up freely —
nothing here is built yet.

---

## 1. What it is

A platform that runs building maintenance end-to-end: on-site staff log an issue,
the system writes the scope, tenders it to the *right* contractors, gates them on
safety/compliance, schedules the work, and scores how they did — so the next job
is smarter. It grows out of the existing HazardLink IoT safety product (the wall
sensors become one more source of jobs).

**North star: "log it and walk away."** It must be usable by anyone, first try —
*walk-a-four-year-old-through-it* simple. Most work is done **for** the user; the
user's day is a short list of one-tap decisions. (The whole market fails on exactly
this — see §18.)

**Brand:** stays **HazardLink** across the board; the wet-floor safety product
becomes one module under it.

**Data is sacred (system-wide):** GDPR-by-design and **clear data ownership** across
*both* the HazardLink safety side and maintenance — every party owns, and can
export, their own data; nothing is shared without cause. A first-class principle,
not an afterthought.

## 2. Business model (decided)

- **Subscription**, not a cut of each job.
- **Middleman / organiser only — no liability.** The contractor's own insurance
  carries the risk for the work.
- **No escrow, no holding funds.** Payments happen between the parties. The system
  only **surfaces + records** a contractor's upfront material-deposit request
  (amount + %) for approval. (An in-app payment link is a possible later add.)
- **Flexible "orchestrator" role** — the entity running the tender can be a
  *customer* (a maintenance company) **or** us (the platform itself). Same engine,
  different operator. White-label capable.
- **Go-to-market sequence:** sell first as a **tool for maintenance companies**
  (they bring their own contractors + money flows → fastest revenue, no liquidity
  problem), then **flip to "platform as a generalised maintenance company"** (a
  two-sided marketplace) once a contractor network exists.

## 3. The parties (roles)

| Role | Does |
|---|---|
| **Orchestrator** | Runs tenders, approves scopes/dates, owns the contractor list. A maintenance company today; could be the platform later. |
| **Building owner / landlord** | Owns the building; pays for landlord-side work. |
| **Managing agent** | (Optional) acts for the owner. |
| **Tenant** | Leases a space; may report issues and be recharged for work in their area. |
| **Contractor — office** | Submits quotes, uploads RAMS + certs + insurance, sets start dates. |
| **Contractor — operative** | The lads on site: sign RAMS, check in/out, do the work, mark complete. |

Everyone sees only their slice (extends the existing org + role model).

## 4. Core data model (shape, not schema)

- **Sites:** Building → Floor → Zone (already exists) + **Tenant register** — the
  maintenance company adds their own tenants, kept light (who they are + their
  area). Responsibility / bill-to is chosen **per job** (see §8), not modelled as
  full lease terms.
- **Assets:** every maintainable item (HVAC, boiler, lift, fire panel, doors…) with
  location, make/model/serial, install date, **expected life, warranty expiry**,
  docs (manuals/certs), QR/NFC tag, and a **trade** (see §5).
- **Trades taxonomy** (see §5).
- **Contractors:** company profile + **trades they cover** + accreditations +
  insurance (with expiry) + region + **performance score + tier** (see §9).
- **Jobs (work orders):** the spine — reactive or planned (PPM), linked to an
  asset/zone, a trade, a bill-to party, a lifecycle (see §6).
- **Quotes, RAMS/permits, schedule entries, ratings, budgets** all hang off jobs
  and/or assets.

## 5. Trade-based routing (jobs go only to who does that trade)

A job is classified by **trade/discipline**, and the tender invite list is built
**only** from contractors who cover that trade — plus region, availability,
compliance, and tier. An electrician never sees a lift job.

- **Trade taxonomy** — full researched list in
  [TRADES_TAXONOMY.md](TRADES_TAXONOMY.md) (10 groups, ~70 trades, statutory ones
  flagged), with an **"Other — type your own"** catch-all on every list so the
  system never blocks on an unusual need.
- **Trade-specific accreditation** — the compliance gate is per trade (gas → RGI /
  Gas Safe; electrical → registered + EICR; lifts → LOLER competent; fire → alarm/
  extinguisher certs). A contractor missing the trade's cert can't be tendered for
  it.
- **Contractors can hold multiple trades.**
- **Assets carry a trade**, so a job raised against an asset is pre-classified.
- **AI auto-classifies the trade** from the logged issue (human can correct).
- **Multi-trade jobs** (e.g. a refit needing electrical + mechanical) split into
  **packages**, each tendered to its own trade — or routed to a multi-trade
  contractor.

## 6. The job lifecycle (end to end)

```
LOG → AI SCOPE → APPROVE → TENDER (trade-routed) → AI RANK → AWARD
  → RAMS + DATE (propose/counter) → COMPLIANCE GATE → SCHEDULE
  → DO → COMPLETION SIGN-OFF → INVOICE → RATE
```

1. **Log** — staff/tenant log an issue (QR on the asset, photo, two taps), or a
   sensor/PPM raises it automatically.
2. **AI scope** — AI drafts the job scope + classifies the trade + lists the RAMS/
   certs that trade requires.
3. **Approve** — orchestrator taps "happy to proceed?" → it runs itself from here.
4. **Tender** — auto-sent to the matching contractor shortlist (trade + region +
   available + compliant + not blocked), **always including your preferred
   contractor for that trade** (§9a).
5. **AI rank** — AI normalises wildly different quotes into one apples-to-apples
   table, **benchmarks price vs market**, and always surfaces the two numbers that
   matter: **your preferred contractor's price vs the cheapest**, with the gap
   ("preferred is £120 / 8% more"). **AI recommends; a human decides;** the choice
   and its reason are recorded (feeds the budget/audit trail).
6. **Award** → ask the winner for **RAMS + earliest start date**.
7. **Date handshake** — the date goes back to the orchestrator: *approve / counter*
   → repeat until agreed. (Reuse this propose/counter pattern for quotes &
   variations.)
8. **Compliance gate** — RAMS signed by the operatives + insurance/certs valid +
   permits in place. **No sign-off = job shows "DO NOT START"; can't be marked
   started.**
9. **Schedule** — agreed job drops into the **central scheduler** (conflict-aware:
   no double-booking a contractor).
10. **Do** — operatives check in (QR/geofence), photos before/during/after.
11. **Completion sign-off** — site contact confirms it's done to standard → this
    **releases the invoice**.
12. **Invoice** — matched against the awarded quote; over-quote is flagged.
13. **Rate** — performance scored (see §9) → feeds the next tender.

**Auto-chase engine (the magic):** the system nudges whoever's holding things up —
contractor hasn't quoted, manager hasn't approved, RAMS unsigned, cert expiring,
PPM due. Nothing stalls because a human forgot.

**"Needs your attention" inbox:** the orchestrator's whole day is a short list of
one-tap calls — *Approve scope? Approve date? PPM due — tender it?*

## 7. Compliance / RAMS / permit-to-work (premium tier)

1. **Company prequalification** (one-time, expiry-tracked): insurance, trade
   accreditation, H&S policy. Expired = can't be awarded.
2. **Per-job pack** — contractor office uploads the RAMS for *that* job + permits
   (hot works, height, isolation/LOTO).
3. **Operative sign-off** — the lads digitally sign the RAMS; their own competencies
   tracked (Safe Pass, trade card, induction).
4. **The gate** — anything missing/expired/unsigned → "DO NOT START" + site contact
   notified.
5. **Site check-in/out** — who was on site, when.
6. **Audit-ready pack** — one-click export of every cert/RAMS/sign-off for an
   insurer or HSA inspection.

## 8. Billing flexibility

- **Per-job bill-to:** Landlord · specific Tenant · Maintenance-co-absorbs — set by
  *where* it happened + lease responsibility.
- **Recharge with markup** — when the maintenance co rebills a tenant/owner, track
  cost vs recharge so margin per job is visible.
- **Service-charge apportionment** for shared/common-area costs across tenants.
- **Upfront deposit** — record + approval only (not money-movement).

## 9. Contractor performance loop

**Mostly auto-scored (facts, low effort, defensible):** on-time vs approved date ·
responsiveness · final invoice vs quote (overruns) · compliance docs on time ·
callbacks/rework · variation frequency.

**Human adds ~10s after the job:** quality thumbs-up + "any issues?" quick tags
(no-show, mess, damage, near-miss) + optional note.

**What the AI does:** weights the score in tender ranking (**Recommended** /
**Caution** with reasons); auto-tiers **Preferred → Approved → On-notice →
Blocked**; surfaces patterns ("4 of last 6 jobs over schedule").

**Reports:** per-contractor scorecards monthly/quarterly/annual + league table.

**Fairness (keeps us safe as a no-liability middleman):** contractors see their own
scorecard and get a **right-of-reply** on flagged issues.

**Long game:** accumulated track records become a portable reputation asset — the
thing that makes the marketplace flip work later.

## 9a. Preferred contractors

A maintenance company curates a **Preferred list** — their habitual, trusted go-tos
— **per trade** (a preferred electrician *and* a preferred lift firm). It's separate
from the auto-performance tier above: *you* pin who you trust; the system only
**suggests** ("X has been 5★ on the last 6 jobs — make preferred?") and **flags
slippage** ("your preferred Y has had 2 recent overruns").

How they're treated (configurable):
- **Default — always tender, show two prices.** The job still goes to competitive
  tender, but the award screen always presents **the preferred contractor's price
  next to the cheapest**, with the gap shown — the client chooses with both numbers
  in front of them, and going preferred-over-cheapest auto-records its reason
  (feeds the budget/audit trail).
- **First refusal** (optional) — offer the preferred contractor first; open wider
  only if they pass or can't hit the date.
- **Direct award** (optional) — routine/low-value jobs or PPMs skip the tender.
- **Rate cards** (later) — agreed prices with a preferred contractor so routine work
  auto-prices with **no quote at all**. The ultimate "log it and walk away."

## 10. Lifecycle & capital planning (finance hook)

- **Total cost of ownership per asset** → **repair-vs-replace** flag when cumulative
  repairs approach replacement cost.
- **Condition + remaining useful life → rolling 5-year CapEx forecast**: "Under
  budget this year, but 3 AC units hit end-of-life in 2027 (~£18k)…"
- **Warranty tracking** (never pay for covered work).
- **Budgets:** OpEx vs CapEx, actual vs forecast.

## 11. AI's role (summary)

Draft scope · classify trade · normalise quotes · benchmark price · rank +
recommend (never auto-award) · detect performance patterns · triage logged issues.
Always **recommend-not-decide**, always with a recorded rationale.

## 12. IoT synergy (the moat)

The existing sensors feed maintenance: a recurring wet-floor alert in one spot →
likely a leak → **auto-raise a job**. Sensor data + asset history →
**predictive maintenance**. No software-only competitor can copy this — they have
nothing on the wall.

## 13. UX principles (non-negotiable)

- One **timeline per job**; one **message thread per job**; one **"needs your
  attention"** inbox.
- One decision per screen, big buttons, mobile-first for site.
- **Job templates** pre-fill scope + required RAMS/certs (logging = two taps).
- Offline-tolerant on site (queue actions).
- **Deliberately deferred** to protect simplicity: parts/inventory, energy/ESG,
  deep accounting integration.

## 14. Phasing

- **Phase 1 — the loop that sells:** asset register + trades + contractor list →
  log → AI scope → trade-routed tender → AI rank → award with justification →
  date handshake → central scheduler → completion sign-off. PPM auto-chase.
- **Phase 2 — premium compliance:** RAMS / permit-to-work gate, prequalification,
  audit pack + the **contractor performance loop**.
- **Phase 3 — finance + flip:** lifecycle/TCO/CapEx forecast, billing/recharge,
  predictive maintenance, then **platform/marketplace mode**.

## 15. Pricing (to firm up)

Subscription tiers — e.g. Core (tender loop + scheduler) / Compliance (RAMS, certs,
audit) / Insights (lifecycle, CapEx, performance analytics). Per site or per seat.

## 16. Decisions

**Settled:**
1. **Trades** — researched taxonomy in [TRADES_TAXONOMY.md](TRADES_TAXONOMY.md) +
   an **"Other — type your own"** option everywhere. (Refine the list to taste.)
2. **Tenant register** — maintenance company populates their tenants; kept light;
   responsibility/bill-to chosen per job.
3. **Contractor onboarding** — a **portal**, which also shows each contractor their
   **full work history within a building** (a real draw for them to stay on it).
4. **Pricing** — deferred; not a blocker now. Subscription, tiers TBD.

**Still open:**
- Exact subscription tiers + unit (per building / seat / contractor) — later.
- Final trade list sign-off (add/remove from the taxonomy doc).

## 17. Confirmed additions

- **Comms = email, white-labelled.** Tenders, chases and notifications go out by
  **email sent as the maintenance company** (their name/address), so contractors
  deal with *them*, not a faceless platform; contractors respond via one-tap email
  links — **no login needed**. (Per-customer sending identity with SPF/DKIM.)
- **"Never miss a cert" engine.** Statutory due-date tracker (fire annual, EICR
  5-yr, LOLER 6-mo, legionella, TM44…) that auto-raises + auto-tenders each renewal
  *before* it lapses, reminders escalating. A headline selling point.
- **Spend approval / authority.** Per-role spend limits; awards over a threshold
  need the FM/owner's sign-off.
- **Priority & emergencies.** Emergency / Urgent / Routine with target times;
  **emergencies skip the tender** → straight to the on-call contractor on a
  different clock; SLA breaches escalate.
- **Warranty tracking.** Each job/asset holds its warranty window + the supplier's
  warranty cert — so a failure inside the window is a **free callback** (no
  re-tender, no payment, dings the score) and **nobody chases warranty certs**.
- **Frictionless, flexible onboarding.** Many ways to load assets/contractors/
  tenants: manual, **bulk spreadsheet import**, and AI assist (snap an insurance/
  warranty cert → it reads the expiry). Day-1 setup must be effortless.
- **GDPR + data ownership, system-wide** (see §1).

## 18. Market gap & positioning

The market is **siloed** — each tool does one slice and ignores the rest:
- **CMMS** (UpKeep, MaintainX, Limble, Fiix): great at work orders + assets, but
  assume you already have a contractor — **no competitive tendering, no contractor
  compliance/RAMS gating**, weak on procurement/recharge; IoT is enterprise-only.
- **Contractor field-service** (Joblogic, simPRO, Commusoft): built for the
  *contractor's* business — the wrong side of the table from the building owner.
- **E-procurement / tender** (FM Navigate, SAP Ariba): tendering exists, but as a
  **standalone enterprise module** disconnected from work orders, compliance and
  assets — and pricey ($50–200/user/mo).
- **Contractor compliance** (SafeContractor/CHAS-type): RAMS/insurance vetting is a
  **separate product**, not gated into the actual job flow.

**Nobody joins them up.** An owner/orchestrator today runs ~5 disconnected tools
plus spreadsheets and phone/email for quotes.

**And the incumbents' fatal flaw is adoption:** ~80% of CMMS never reach their
potential and 50–70% are judged failures — overwhelmingly because they're **too
complex**; people simply won't log a job through a clunky, multi-screen form. That
*validates* the simplicity obsession as the real wedge, not a nice-to-have.

**The gap (our wedge):** one **dead-simple** platform for the **maintenance
orchestrator** that runs the whole loop — sensor/issue → AI scope → competitive
AI-evaluated tender to a vetted list → built-in **compliance gate** → schedule →
rate → **lifecycle/CapEx** — that's **email-native (no contractor login)** and
**simple enough to actually get used.**

**Two things no competitor can copy:** (1) the **IoT already on the wall** →
affordable sensor-driven jobs; (2) the **orchestrator/middleman position** with
flexible **landlord/tenant recharge** billing.

**Beachhead:** SMB / mid-market maintenance companies + property managers (UK/IE) —
too small for Planon/Archibus/Ariba, underserved by work-order-only CMMS, and their
business literally revolves around the tendering + compliance + recharge that no
affordable tool integrates.

**Positioning line:** *"The maintenance platform people actually use — log it, and
it handles the quotes, the compliance and the contractors for you."*

*Sources: best-CMMS roundups (UpKeep, Limble, Software Connect); CMMS-failure/
adoption analyses (Tractian, ClickMaint, AnyMaint); FM tender/procurement (FM
Navigate, SAP Ariba). See chat for links.*
