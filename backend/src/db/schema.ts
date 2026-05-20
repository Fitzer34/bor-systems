import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
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
