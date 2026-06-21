import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "supervisor", "cleaner"]);

export const hangerStatus = pgEnum("hanger_status", [
  "active",
  "out_of_service",
  "decommissioned",
]);

export const alertStatus = pgEnum("alert_status", ["open", "acknowledged", "closed"]);

/// Differentiates a genuine spill (sign was lifted unexpectedly) from a
/// cleaner pre-pressing the button to flag a planned cleaning session.
/// Both render as blue pins on the floor plan, but only spills appear in
/// the Active alerts list so supervisors aren't pinged for routine cleans.
export const alertKind = pgEnum("alert_kind", ["spill", "planned_cleaning"]);

export const closureReason = pgEnum("closure_reason", [
  "sign_returned",
  "sign_damaged",
  "sign_missing",
  "manual",
]);

export const eventType = pgEnum("event_type", [
  "lifted",
  "returned",
  "heartbeat",
  "low_battery",
  // Fired when a cleaner presses the physical "I'm cleaning" button on the
  // hanger during an open alert — flips the alert to "acknowledged".
  "cleaning_started",
]);

export const notificationChannel = pgEnum("notification_channel", [
  "push",
  "sms",
  "email",
]);

export const notificationKind = pgEnum("notification_kind", [
  "alert",
  "rebroadcast",
  "escalation",
  "low_battery",
  "sign_replacement_needed",
]);

/// Subscription tier. Gates the monthly AI Assistant allowance (a soft cap —
/// the UI nudges, it never hard-blocks). The everyday AI helpers stay free on
/// every plan. Existing orgs default to 'starter'.
export const orgPlan = pgEnum("org_plan", ["starter", "growth", "enterprise"]);

export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: orgPlan("plan").notNull().default("starter"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/// Append-only log of metered AI calls (currently just the Assistant). Powers
/// the per-plan monthly allowance and future cost/usage analytics. kind is
/// "assistant" today; the free helpers stay unlogged. user_id is best-effort.
export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgTimeIdx: index("ai_usage_org_time_idx").on(t.organisationId, t.createdAt) }),
);

export const buildings = pgTable("buildings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .references(() => organisations.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  // Street address / location notes so a contractor knows where to go. The
  // on-site point of contact is the person they meet/ring on arrival. All
  // optional, set per building and reused by every PPM/job there, and included
  // in the emails sent to contractors.
  address: text("address"),
  siteContactName: text("site_contact_name"),
  siteContactPhone: text("site_contact_phone"),
  siteContactEmail: text("site_contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const floors = pgTable(
  "floors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    buildingId: uuid("building_id")
      .references(() => buildings.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    orderIndex: integer("order_index").notNull(),
    floorPlanUrl: text("floor_plan_url"),
  },
  (t) => ({ buildingIdx: index("floors_building_idx").on(t.buildingId) }),
);

export const zones = pgTable(
  "zones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    floorId: uuid("floor_id")
      .references(() => floors.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    pinX: integer("pin_x"),
    pinY: integer("pin_y"),
  },
  (t) => ({ floorIdx: index("zones_floor_idx").on(t.floorId) }),
);

/// One row per HazardLink gateway device deployed on a customer site. A
/// gateway is the box that listens for LoRa packets from hangers and
/// forwards them up to /webhook/tts over WiFi. Gateways self-register on
/// boot via /gateways/heartbeat — the customer never types a DevEUI for
/// them, the device introduces itself the first time it joins WiFi.
export const gateways = pgTable(
  "gateways",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    devEui: text("dev_eui").notNull(),
    // Label that admins can set ("Mercy Hospital basement gateway"). Auto-
    // populated with a sensible default on first registration; editable
    // afterwards via PATCH /gateways/:id.
    name: text("name"),
    // Building the gateway is physically installed in. Optional — useful
    // for sites with multiple buildings sharing one cloud org.
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    // Free-form text the admin can use to describe where in the building
    // the gateway lives ("behind reception desk", "on shelf above fridge",
    // "Floor 2 server cupboard"). Surfaces in the dashboard so the cleaner
    // can find the device if it ever needs unplugging / power-cycling.
    locationNote: text("location_note"),
    // Last-known network state, refreshed every heartbeat.
    ipAddress: text("ip_address"),
    ssid: text("ssid"),
    rssi: smallint("rssi"),
    firmwareVersion: text("firmware_version"),
    // Counts kept by the gateway so the dashboard can show "this gateway
    // forwarded 1,247 packets in its lifetime" without needing to query
    // the events table.
    packetsForwarded: integer("packets_forwarded").notNull().default(0),
    uptimeSec: integer("uptime_sec"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    devEuiUnique: uniqueIndex("gateways_dev_eui_unique").on(t.devEui),
    orgIdx: index("gateways_org_idx").on(t.organisationId),
  }),
);

/// Planned Preventive Maintenance (PPM) tasks. Recurring maintenance jobs a
/// facilities manager schedules with outside contractors — fire-extinguisher
/// service, PAT testing, HVAC filter changes, etc. The reminder job
/// (services/ppm-reminder.ts) emails admins + supervisors as each task's due
/// date approaches; the dashboard shows due/overdue badges + a login banner.
export const ppms = pgTable(
  "ppms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    // Which building this task is at. Drives the site address + on-site contact
    // emailed to the contractor. Optional (a task may be portfolio-wide).
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    // What needs doing ("Annual fire-extinguisher service").
    title: text("title").notNull(),
    // Optional scope / detail notes.
    notes: text("notes"),
    // The contractor who performs the work + how to reach them.
    contractorName: text("contractor_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    // Times per year it must be done (1 = annual, 4 = quarterly, 12 = monthly).
    // Used to roll the next due date forward on completion.
    frequencyPerYear: integer("frequency_per_year").notNull().default(1),
    // When the task is next due (calendar date, no time-of-day).
    nextDueDate: date("next_due_date", { mode: "string" }).notNull(),
    // Days before nextDueDate the first reminder fires. Editable per task.
    reminderLeadDays: integer("reminder_lead_days").notNull().default(14),
    // Set when last marked complete; next due date rolls forward from here.
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    // The agreed visit date once a contractor accepts a scheduling request
    // (see ppmScheduleRequests / services/ppm-schedule.ts). Null until agreed.
    scheduledDate: date("scheduled_date", { mode: "string" }),
    // Dedup guard — the reminder job sends at most one email per calendar day
    // per task. Stores the date it last reminded on.
    lastRemindedOn: date("last_reminded_on", { mode: "string" }),
    // Paused tasks stay listed but stop generating reminders.
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("ppms_org_idx").on(t.organisationId),
    dueIdx: index("ppms_due_idx").on(t.nextDueDate),
  }),
);

/// Outreach to a PPM's contractor to agree a visit date. When a task comes due
/// the system emails the contractor a magic link (no login) where they pick a
/// date; staff then confirm it, which stamps ppms.scheduledDate. One row per
/// outreach attempt — the most recent is the live one. See
/// services/ppm-schedule.ts for the lifecycle.
export const ppmScheduleStatus = pgEnum("ppm_schedule_status", [
  "sent",       // emailed the contractor, awaiting their proposed date
  "proposed",   // contractor picked a date, awaiting staff confirmation
  "confirmed",  // date agreed — ppms.scheduledDate is set
  "declined",   // contractor can't do it
  "cancelled",  // staff withdrew the request
]);

export const ppmScheduleRequests = pgTable(
  "ppm_schedule_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    ppmId: uuid("ppm_id")
      .references(() => ppms.id, { onDelete: "cascade" })
      .notNull(),
    // Unguessable secret embedded in the magic-link URL the contractor clicks.
    token: text("token").notNull().unique(),
    status: ppmScheduleStatus("status").notNull().default("sent"),
    // Snapshot of where the invite was sent (the ppm's contact email can change).
    sentToEmail: text("sent_to_email"),
    // Did SMTP accept the message? False when SMTP isn't configured yet — the
    // request still exists so staff can copy the link and send it manually.
    emailDelivered: boolean("email_delivered").notNull().default(false),
    // The date the contractor proposed, then the date staff confirmed.
    proposedDate: date("proposed_date", { mode: "string" }),
    confirmedDate: date("confirmed_date", { mode: "string" }),
    // Free-text from the contractor (e.g. "mornings only" / why they declined).
    contractorNote: text("contractor_note"),
    // Who kicked it off — null when the reminder job did it automatically.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ppmIdx: index("ppm_sched_ppm_idx").on(t.ppmId),
    orgIdx: index("ppm_sched_org_idx").on(t.organisationId),
  }),
);

/// Security incidents logged on site (Security section) — intruder, theft,
/// damage, suspicious activity, safety hazard, etc. Tied to a building so it
/// shares the site model with cleaning + maintenance, and can later spawn a
/// maintenance work order (the cross-discipline pattern).
export const incidentSeverity = pgEnum("incident_severity", ["low", "medium", "high", "critical"]);
export const incidentStatus = pgEnum("incident_status", ["open", "investigating", "resolved"]);

export const securityIncidents = pgTable(
  "security_incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind"), // Intruder / Theft / Damage / Suspicious activity / Safety hazard / Other
    severity: incidentSeverity("severity").notNull().default("medium"),
    status: incidentStatus("status").notNull().default("open"),
    title: text("title").notNull(),
    description: text("description"),
    photoUrl: text("photo_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    // The maintenance job this incident was turned into, if any (cross-discipline
    // bridge — e.g. a broken-door incident becomes a tracked repair job).
    raisedJobId: uuid("raised_job_id").references(() => maintenanceJobs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("incidents_org_idx").on(t.organisationId),
    buildingIdx: index("incidents_building_idx").on(t.buildingId),
  }),
);

/// Which side a checkpoint belongs to. Cleaning rounds (a cleaner surveys an
/// area and photographs it clean) and Security patrols (a guard scans a tour
/// point) share the same table + scan loop but are kept separate per section.
export const checkpointDiscipline = pgEnum("checkpoint_discipline", ["cleaning", "security"]);

/// Guard-tour checkpoints (Security) and cleaning rounds (Cleaning). A
/// checkpoint is a QR-tagged point at a site that staff scan on their round.
/// `instructions` is the per-checkpoint action shown on scan (the TrackTik-style
/// "do this here" pattern). `token` powers a no-login scan URL, reusing the
/// magic-link pattern. `discipline` keeps cleaning + security lists separate.
export const checkpoints = pgTable(
  "checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    locationNote: text("location_note"),
    instructions: text("instructions"),
    token: text("token").notNull().unique(),
    discipline: checkpointDiscipline("discipline").notNull().default("security"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("checkpoints_org_idx").on(t.organisationId),
    buildingIdx: index("checkpoints_building_idx").on(t.buildingId),
    disciplineIdx: index("checkpoints_discipline_idx").on(t.organisationId, t.discipline),
  }),
);

/// One row per checkpoint scan — the patrol log. Public (no-login) scan via the
/// checkpoint's QR, so the guard types their name; `flagged` lets them raise an
/// issue at the point (a hook for auto-creating an incident/work order later).
export const checkpointScans = pgTable(
  "checkpoint_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    checkpointId: uuid("checkpoint_id").references(() => checkpoints.id, { onDelete: "cascade" }).notNull(),
    guardName: text("guard_name"),
    note: text("note"),
    photoUrl: text("photo_url"),
    flagged: boolean("flagged").notNull().default(false),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cpIdx: index("checkpoint_scans_cp_idx").on(t.checkpointId),
    orgIdx: index("checkpoint_scans_org_idx").on(t.organisationId),
  }),
);

/// Lone-worker safety sessions (an OVERALL capability — cleaners, techs AND
/// guards). A worker starts a session with a check-in interval; if they miss a
/// check-in the watcher (services/lone-worker-watcher.ts) raises an alarm, and
/// a panic button raises one immediately. Status moves active → ended | alarm.
/// NOTE: deliberately NO fall/man-down detection (needs a wearable + monitoring
/// service = liability we avoid). See [[fm-platform-feature-roadmap]] caveats.
export const loneWorkerStatus = pgEnum("lone_worker_status", ["active", "ended", "alarm"]);

export const loneWorkerSessions = pgTable(
  "lone_worker_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    status: loneWorkerStatus("status").notNull().default("active"),
    intervalMinutes: integer("interval_minutes").notNull().default(30),
    note: text("note"), // what they're doing / where
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastCheckInAt: timestamp("last_check_in_at", { withTimezone: true }),
    nextCheckInDueAt: timestamp("next_check_in_due_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    alarmReason: text("alarm_reason"), // missed_check_in | panic
    alarmAt: timestamp("alarm_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("lws_org_idx").on(t.organisationId),
    userIdx: index("lws_user_idx").on(t.userId),
    statusIdx: index("lws_status_idx").on(t.status),
  }),
);

/// Spare-parts catalogue + stock levels (CMMS inventory). Low stock when
/// stock_qty <= reorder_level. Parts-used-per-work-order links in a later pass.
export const parts = pgTable(
  "parts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    sku: text("sku"),
    unit: text("unit").notNull().default("each"),
    stockQty: integer("stock_qty").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(0),
    unitCostCents: integer("unit_cost_cents"),
    supplier: text("supplier"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index("parts_org_idx").on(t.organisationId) }),
);

/// Cleaning quality inspections. A walk-through scores each checklist item;
/// the overall score rolls up; a deficient item can spawn a maintenance/cleaning
/// work order (CleanTelligent pattern, cross-discipline). photo_url is for
/// tamper-evident proof once object storage is configured.
export const inspectionRating = pgEnum("inspection_rating", ["meets", "acceptable", "needs_improvement", "na"]);

export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    area: text("area"),
    inspectorUserId: uuid("inspector_user_id").references(() => users.id, { onDelete: "set null" }),
    inspectorName: text("inspector_name"),
    score: integer("score"), // 0-100, rolled up from item ratings
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("inspections_org_idx").on(t.organisationId),
    buildingIdx: index("inspections_building_idx").on(t.buildingId),
  }),
);

export const inspectionItems = pgTable(
  "inspection_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    inspectionId: uuid("inspection_id").references(() => inspections.id, { onDelete: "cascade" }).notNull(),
    label: text("label").notNull(),
    rating: inspectionRating("rating").notNull().default("meets"),
    note: text("note"),
    photoUrl: text("photo_url"),
    raisedJobId: uuid("raised_job_id").references(() => maintenanceJobs.id, { onDelete: "set null" }),
  },
  (t) => ({ inspectionIdx: index("inspection_items_inspection_idx").on(t.inspectionId) }),
);

/// Safety Data Sheets: an org's library of chemical/product safety sheets, filed
/// by discipline and found by scanning a product barcode. Hazards + listed
/// components are extracted from the uploaded sheet itself (source =
/// 'ai_extraction') and confirmed by a person (verified) — never invented.
export const sdsDiscipline = pgEnum("sds_discipline", ["cleaning", "maintenance", "security", "general"]);
export const sdsSource = pgEnum("sds_source", ["ai_extraction", "manual", "provider"]);

export const sdsSheets = pgTable(
  "sds_sheets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    discipline: sdsDiscipline("discipline").notNull().default("general"),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    barcode: text("barcode"),
    productName: text("product_name").notNull(),
    manufacturer: text("manufacturer"),
    productCode: text("product_code"),
    signalWord: text("signal_word"), // "Danger" | "Warning" | null
    pictograms: jsonb("pictograms").$type<string[]>().notNull().default([]), // GHS codes/labels
    hazardStatements: jsonb("hazard_statements").$type<{ code: string; text: string }[]>().notNull().default([]),
    precautionaryStatements: jsonb("precautionary_statements").$type<{ code: string; text: string }[]>().notNull().default([]),
    ingredients: jsonb("ingredients").$type<{ name: string; cas: string; percent: string }[]>().notNull().default([]),
    firstAid: text("first_aid"),
    storageHandling: text("storage_handling"),
    ppe: text("ppe"),
    sdsPdfUrl: text("sds_pdf_url"), // the source document this record was read from
    issueDate: date("issue_date"),
    revisionDate: date("revision_date"),
    reviewDate: date("review_date"),
    source: sdsSource("source").notNull().default("manual"),
    extractionWarnings: jsonb("extraction_warnings").$type<string[]>().notNull().default([]), // fields the AI could not find
    verified: boolean("verified").notNull().default(false),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("sds_sheets_org_idx").on(t.organisationId),
    orgBarcodeIdx: index("sds_sheets_org_barcode_idx").on(t.organisationId, t.barcode),
    orgDiscIdx: index("sds_sheets_org_disc_idx").on(t.organisationId, t.discipline),
  }),
);

export const hangers = pgTable(
  "hangers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    devEui: text("dev_eui").notNull(),
    appEui: text("app_eui"),
    appKey: text("app_key"),
    // Customer-facing label that admins set in the dashboard. Falls back to
    // DevEUI when null. Lets the dispatcher see "Ward 4B main bathroom"
    // instead of "BOR1234567890AB" in the alerts feed.
    name: text("name"),
    // Free-form note about where in the zone the hanger actually hangs —
    // "on the wall by the sinks", "behind the first stall on the right".
    // Used by cleaners + supervisors when responding to alerts.
    locationNote: text("location_note"),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    status: hangerStatus("status").notNull().default("active"),
    audibleAlarmEnabled: boolean("audible_alarm_enabled").notNull().default(false),
    batteryPct: smallint("battery_pct"),
    firmwareVersion: text("firmware_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    // When this hanger's sign was last lifted — surfaced on the floor-plan /
    // device list so staff can see recency without scanning the events table.
    lastLiftedAt: timestamp("last_lifted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    devEuiUnique: uniqueIndex("hangers_dev_eui_unique").on(t.devEui),
    zoneIdx: index("hangers_zone_idx").on(t.zoneId),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    hangerId: uuid("hanger_id")
      .references(() => hangers.id, { onDelete: "cascade" })
      .notNull(),
    type: eventType("type").notNull(),
    batteryPct: smallint("battery_pct"),
    rawPayload: text("raw_payload"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    hangerIdx: index("events_hanger_idx").on(t.hangerId, t.receivedAt),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull(),
    onDuty: boolean("on_duty").notNull().default(false),
    pushToken: text("push_token"),
    phoneE164: text("phone_e164"),
    locale: text("locale").notNull().default("en-GB"),
    // Profile picture URL (uploaded via /uploads). Null until set.
    avatarUrl: text("avatar_url"),
    // Last time this user made an authenticated request — stamped (throttled) in
    // the authenticate preHandler so the team list can show recent activity.
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by"),
    // ---- 2FA (TOTP) ----
    // Holds the base32 secret once enrolment is committed. Until then,
    // setup happens in totpPendingSecret so a half-finished enrolment can't
    // lock anyone out. recoveryCodes is a JSON array of argon2-hashed
    // single-use codes.
    totpSecret: text("totp_secret"),
    totpPendingSecret: text("totp_pending_secret"),
    totpEnrolledAt: timestamp("totp_enrolled_at", { withTimezone: true }),
    recoveryCodes: jsonb("recovery_codes"),
    // ---- Staff invite onboarding ----
    // When an admin adds a user without a password, we email them a one-time
    // link to set their own + log straight in. We store only the SHA-256 of the
    // token. A pending invite = invitedAt set, inviteAcceptedAt null. See
    // services/invites.ts.
    inviteTokenHash: text("invite_token_hash"),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    inviteAcceptedAt: timestamp("invite_accepted_at", { withTimezone: true }),
  },
  (t) => ({ emailOrgUnique: uniqueIndex("users_org_email_unique").on(t.organisationId, t.email) }),
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    hangerId: uuid("hanger_id")
      .references(() => hangers.id, { onDelete: "restrict" })
      .notNull(),
    status: alertStatus("status").notNull().default("open"),
    kind: alertKind("kind").notNull().default("spill"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rebroadcastCount: integer("rebroadcast_count").notNull().default(0),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
    closureReason: closureReason("closure_reason"),
    closureNote: text("closure_note"),
    // Cleaner-uploaded proof-of-resolution photo. URL of an uploaded image
    // stored via the existing /uploads/ static handler. Appears in compliance
    // PDF reports and the admin's alert detail view — used to verify the
    // area was actually cleaned, not just the sign moved.
    closePhotoUrl: text("close_photo_url"),
    cleaningReminderSentAt: timestamp("cleaning_reminder_sent_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("alerts_status_idx").on(t.status),
    hangerIdx: index("alerts_hanger_idx").on(t.hangerId, t.openedAt),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: notificationChannel("channel").notNull(),
    kind: notificationKind("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    delivered: boolean("delivered"),
    error: text("error"),
  },
  (t) => ({ alertIdx: index("notifications_alert_idx").on(t.alertId) }),
);

/// Notifications centre — the per-user in-app feed behind the bell icon. Distinct
/// from `notifications` above (which is a delivery LOG of push/sms/email sends
/// tied to an alert). A generated notification always lands here; it also fans
/// out to email / sms per the user's notificationPreferences.
export const userNotifications = pgTable(
  "user_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").notNull(), // event type, e.g. "spill.open", "wo.overdue"
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type"), // "alert" | "job" | "ppm" | "part" | ...
    entityId: uuid("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userReadIdx: index("user_notifications_user_read_idx").on(t.userId, t.readAt),
    orgCreatedIdx: index("user_notifications_org_created_idx").on(t.organisationId, t.createdAt),
  }),
);

/// Per-user, per-event-type delivery preferences for the notifications centre.
/// in_app is on by default; email / sms are opt-in. Missing row → DEFAULT_PREFS
/// (see services/notification-centre.ts).
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
    sms: boolean("sms").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.eventType] }),
  }),
);

/// Dedup guard for generated notifications: at most one per (org, type, entity,
/// calendar-day). A row is claimed via insert+onConflictDoNothing — the first
/// caller wins; repeat ticks for the same overdue thing the same day are
/// suppressed. dedupKey encodes "type|entityId|YYYY-MM-DD".
export const notificationDedup = pgTable(
  "notification_dedup",
  {
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    dedupKey: text("dedup_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organisationId, t.dedupKey] }),
  }),
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .references(() => organisations.id, { onDelete: "cascade" })
    .notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

export const settings = pgTable(
  "settings",
  {
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organisationId, t.key] }),
  }),
);

/// Per-role permission overrides. The app ships with per-role defaults
/// (services/permissions.ts → DEFAULT_PERMISSIONS); a stored row here is a
/// partial JSON map of permission-key → boolean merged on top of those defaults
/// at read time. Admin is always treated as fully allowed regardless of any row.
/// One row per (organisation, role).
export const rolePermissions = pgTable(
  "role_permissions",
  {
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    role: userRole("role").notNull(),
    permissions: jsonb("permissions").$type<Record<string, boolean>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organisationId, t.role] }),
  }),
);

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("shifts_user_idx").on(t.userId, t.startsAt),
    activeIdx: index("shifts_active_idx").on(t.startsAt, t.endsAt),
  }),
);

export const dispatchStatus = pgEnum("dispatch_status", ["sent", "acknowledged", "completed"]);

export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    recipientUserId: uuid("recipient_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    status: dispatchStatus("status").notNull().default("sent"),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    recipientIdx: index("dispatches_recipient_idx").on(t.recipientUserId, t.status, t.sentAt),
  }),
);

// Sign-side UWB precision-finding tags. One tag is embedded in each wet
// floor sign's handle (alongside the magnet that triggers the hanger's
// Hall sensor). When an alert fires the mobile app uses the tag's BLE
// UUID + UWB address to open an AirTag-style direction-finding session.
// Phones without UWB fall back to the zone-pin floor plan view.
export const signTags = pgTable(
  "sign_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id")
      .references(() => organisations.id, { onDelete: "cascade" })
      .notNull(),
    bleUuid: text("ble_uuid").notNull(),
    uwbAddress: text("uwb_address").notNull(),
    pairedHangerId: uuid("paired_hanger_id").references(() => hangers.id, { onDelete: "set null" }),
    batteryPct: smallint("battery_pct"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bleUuidUnique: uniqueIndex("sign_tags_ble_uuid_unique").on(t.bleUuid),
    uwbAddrUnique: uniqueIndex("sign_tags_uwb_addr_unique").on(t.uwbAddress),
    pairedHangerIdx: index("sign_tags_paired_hanger_idx").on(t.pairedHangerId),
    orgIdx: index("sign_tags_org_idx").on(t.organisationId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance & tendering platform (Phase 1)
//
// Extends the existing site model (organisations → buildings → floors → zones)
// and PPMs. Contractors are NOT app users — they're emailed (white-labelled as
// the maintenance company) and respond via magic links. See
// docs/MAINTENANCE_PLATFORM_SPEC.md.
// ─────────────────────────────────────────────────────────────────────────────

export const jobSource = pgEnum("job_source", ["manual", "sensor", "ppm", "tenant_request"]);
export const jobPriority = pgEnum("job_priority", ["emergency", "urgent", "routine"]);
export const jobStatus = pgEnum("job_status", [
  "logged",      // just raised
  "scoped",      // AI drafted the scope; awaiting orchestrator approval
  "tendering",   // out to contractors, collecting quotes
  "awarded",     // a quote chosen; agreeing a start date
  "scheduled",   // date agreed, on the calendar
  "in_progress", // work underway
  "completed",   // signed off
  "cancelled",
]);
export const billToParty = pgEnum("bill_to_party", ["landlord", "tenant", "maintenance_co"]);
export const quoteStatus = pgEnum("quote_status", [
  "pending",
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
]);
export const contractorTier = pgEnum("contractor_tier", [
  "preferred",
  "approved",
  "on_notice",
  "blocked",
]);

// Trade taxonomy. Built-ins seed with organisation_id NULL; an org's own
// ("Other — type your own") set their organisation_id.
export const trades = pgTable(
  "trades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    groupName: text("group_name").notNull(),
    statutory: boolean("statutory").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index("trades_org_idx").on(t.organisationId) }),
);

/// How badly a failure of an asset hurts — the basis of Risk-Based Maintenance.
/// Drives prioritisation of PPMs and jobs (a 'critical' asset's overdue work
/// outranks a 'low' one's). Existing assets default to 'medium'.
export const assetCriticality = pgEnum("asset_criticality", ["low", "medium", "high", "critical"]);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    category: text("category"),
    make: text("make"),
    model: text("model"),
    serial: text("serial"),
    qrCode: text("qr_code"),
    // Unguessable token behind the asset's "report a fault" QR. Any worker can
    // scan it (no login) and raise a maintenance job against this asset — the
    // cross-discipline pattern. Generated on create; backfilled for existing.
    reportToken: text("report_token"),
    installDate: date("install_date"),
    expectedLifeYears: smallint("expected_life_years"),
    warrantyExpiry: date("warranty_expiry"),
    conditionScore: smallint("condition_score"), // 1 (poor) .. 5 (excellent)
    criticality: assetCriticality("criticality").notNull().default("medium"),
    purchaseCostCents: integer("purchase_cost_cents"),
    replacementCostCents: integer("replacement_cost_cents"),
    notes: text("notes"),
    retired: boolean("retired").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("assets_org_idx").on(t.organisationId),
    buildingIdx: index("assets_building_idx").on(t.buildingId),
  }),
);

/// Predictive maintenance: a usage meter on an asset (runtime hours, cycles,
/// km…). current_value accumulates via readings; when it passes
/// last_service_value + interval_value the meter is "due". Marking it serviced
/// rolls last_service_value up to current_value. Whole units.
export const assetMeters = pgTable(
  "asset_meters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    unit: text("unit"),
    intervalValue: integer("interval_value"),
    lastServiceValue: integer("last_service_value").notNull().default(0),
    currentValue: integer("current_value").notNull().default(0),
    lastReadingAt: timestamp("last_reading_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("asset_meters_org_idx").on(t.organisationId),
    assetIdx: index("asset_meters_asset_idx").on(t.assetId),
  }),
);

/// Append-only log of meter readings (the audit trail behind each meter's
/// current value).
export const meterReadings = pgTable(
  "meter_readings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    meterId: uuid("meter_id").references(() => assetMeters.id, { onDelete: "cascade" }).notNull(),
    value: integer("value").notNull(),
    note: text("note"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ meterIdx: index("meter_readings_meter_idx").on(t.meterId, t.recordedAt) }),
);

/// Workforce competency: a certification / qualification held by a staff member,
/// with optional expiry so lapsing tickets can be surfaced before they expire.
export const staffCertifications = pgTable(
  "staff_certifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    issuer: text("issuer"),
    reference: text("reference"),
    issuedOn: date("issued_on", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("staff_certifications_org_idx").on(t.organisationId),
    userIdx: index("staff_certifications_user_idx").on(t.userId),
  }),
);

/// Dedup log for the daily maintenance reminder digest — one row per org per day
/// guarantees the meters-due / certs-expiring email is sent at most once daily.
export const maintenanceReminderLog = pgTable(
  "maintenance_reminder_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    sentOn: date("sent_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgDay: uniqueIndex("maintenance_reminder_log_org_day").on(t.organisationId, t.sentOn) }),
);

export const contractors = pgTable(
  "contractors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(), // company name
    contactName: text("contact_name"),
    email: text("email"), // where tenders are sent
    phone: text("phone"),
    region: text("region"),
    insuranceExpiry: date("insurance_expiry"),
    accreditation: text("accreditation"),
    isPreferred: boolean("is_preferred").notNull().default(false),
    tier: contractorTier("tier").notNull().default("approved"),
    ratingAvg: smallint("rating_avg"), // 0..100 blended score
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index("contractors_org_idx").on(t.organisationId) }),
);

export const contractorTrades = pgTable(
  "contractor_trades",
  {
    contractorId: uuid("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "cascade" }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.contractorId, t.tradeId] }) }),
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    areaNote: text("area_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgIdx: index("tenants_org_idx").on(t.organisationId) }),
);

export const maintenanceJobs = pgTable(
  "maintenance_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    source: jobSource("source").notNull().default("manual"),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    floorId: uuid("floor_id").references(() => floors.id, { onDelete: "set null" }),
    zoneId: uuid("zone_id").references(() => zones.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"), // the logged issue, raw
    scope: text("scope"), // AI-drafted scope of works
    priority: jobPriority("priority").notNull().default("routine"),
    status: jobStatus("status").notNull().default("logged"),
    billTo: billToParty("bill_to"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ppmId: uuid("ppm_id").references(() => ppms.id, { onDelete: "set null" }),
    awardedQuoteId: uuid("awarded_quote_id"), // → job_quotes.id (no FK: avoids a cycle)
    awardReason: text("award_reason"), // why this quote was chosen (justification)
    proposedStartAt: timestamp("proposed_start_at", { withTimezone: true }),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionNote: text("completion_note"),
    completionPhotoUrl: text("completion_photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("maintenance_jobs_org_idx").on(t.organisationId),
    statusIdx: index("maintenance_jobs_status_idx").on(t.status),
    assetIdx: index("maintenance_jobs_asset_idx").on(t.assetId),
  }),
);

export const jobQuotes = pgTable(
  "job_quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").references(() => maintenanceJobs.id, { onDelete: "cascade" }).notNull(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    contractorId: uuid("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
    status: quoteStatus("status").notNull().default("pending"),
    amountCents: integer("amount_cents"),
    upfrontCents: integer("upfront_cents"),
    upfrontPct: smallint("upfront_pct"),
    proposedStartDate: date("proposed_start_date"),
    notes: text("notes"),
    // Unguessable token behind the contractor's no-login "submit your quote"
    // magic link, emailed on tender.
    token: text("token"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => ({
    jobIdx: index("job_quotes_job_idx").on(t.jobId),
    contractorIdx: index("job_quotes_contractor_idx").on(t.contractorId),
    tokenIdx: uniqueIndex("job_quotes_token_idx").on(t.token),
  }),
);

export const jobEvents = pgTable(
  "job_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").references(() => maintenanceJobs.id, { onDelete: "cascade" }).notNull(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // logged|scoped|approved|tendered|quoted|awarded|scheduled|started|completed|note
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ jobIdx: index("job_events_job_idx").on(t.jobId) }),
);

/// Invoices — a per-org billing record raised against a customer, optionally
/// linked to a building and/or a maintenance job. Money is in minor units
/// (amountCents). Status moves draft → sent → paid, with overdue / void as side
/// states. The daily reminder tick (services/maintenance-reminder.ts) flips a
/// 'sent' invoice past its due date (and unpaid) to 'overdue' and emits the
/// invoice.overdue notification to admins/supervisors. `number` is auto-assigned
/// per org as INV-#### (next sequence, starting 2050).
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "cascade" }).notNull(),
    number: text("number").notNull(), // e.g. "INV-2050"
    customerName: text("customer_name"),
    buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => maintenanceJobs.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull().default(0), // minor units
    currency: text("currency").notNull().default("EUR"),
    status: text("status").notNull().default("draft"), // draft|sent|paid|overdue|void
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgStatusIdx: index("invoices_org_status_idx").on(t.organisationId, t.status),
    orgDueIdx: index("invoices_org_due_idx").on(t.organisationId, t.dueAt),
  }),
);
