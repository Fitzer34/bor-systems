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
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "supervisor", "cleaner"]);

export const hangerStatus = pgEnum("hanger_status", [
  "active",
  "out_of_service",
  "decommissioned",
]);

export const alertStatus = pgEnum("alert_status", ["open", "acknowledged", "closed"]);

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

export const buildings = pgTable("buildings", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const floors = pgTable(
  "floors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
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
  },
  (t) => ({ emailUnique: uniqueIndex("users_email_unique").on(t.email) }),
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hangerId: uuid("hanger_id")
      .references(() => hangers.id, { onDelete: "restrict" })
      .notNull(),
    status: alertStatus("status").notNull().default("open"),
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
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
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
