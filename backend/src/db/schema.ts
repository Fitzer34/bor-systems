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

export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("incidents_org_idx").on(t.organisationId),
    buildingIdx: index("incidents_building_idx").on(t.buildingId),
  }),
);

/// Guard-tour checkpoints (Security). A checkpoint is a QR-tagged point at a
/// site that guards scan on patrol. `instructions` is the per-checkpoint action
/// shown to the guard on scan (the TrackTik-style "do this here" pattern).
/// `token` powers a no-login scan URL, reusing the magic-link pattern.
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
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("checkpoints_org_idx").on(t.organisationId),
    buildingIdx: index("checkpoints_building_idx").on(t.buildingId),
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
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => ({
    jobIdx: index("job_quotes_job_idx").on(t.jobId),
    contractorIdx: index("job_quotes_contractor_idx").on(t.contractorId),
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
