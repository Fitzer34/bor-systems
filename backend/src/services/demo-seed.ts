/**
 * Self-healing demo-org seeder.
 *
 * Exposes seedDemoOrg(), which idempotently ensures the "App Store reviewer"
 * demo organisation exists and every dashboard page has representative data
 * (users, building/floors/zones, hangers, a gateway, open/ack/closed alerts,
 * events, dispatches, shifts, notifications, audit log).
 *
 * Called from TWO places:
 *   1. The server on boot (see index.ts) — so a fresh DB on ANY environment
 *      auto-populates the demo without a manual deploy command or env var.
 *      This is the "future-proof" path: it just works.
 *   2. The `npm run db:seed:demo` CLI (src/seed-demo.ts) — for running it
 *      on demand / printing the credentials.
 *
 * Everything is idempotent and keyed off a fixed organisation UUID, so it's
 * safe to run on every boot: each block only inserts rows that are missing.
 * Set DEMO_SEED_DISABLED=1 to skip entirely (e.g. a customer-only deployment
 * that should never carry demo data).
 */

import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000099";
export const DEMO_ORG_NAME = "Demo — HazardLink Reviewer Org";

export interface DemoCredentials {
  orgName: string;
  adminEmail: string;
  adminPassword: string;
  supervisorEmail: string;
  cleanerEmail: string;
}

/**
 * Ensure the demo org + all its sample data exist. Idempotent. Returns the
 * credentials so a caller (CLI) can print them. Throws on a real DB error so
 * the caller decides whether to crash (CLI) or swallow (boot).
 */
export async function seedDemoOrg(): Promise<DemoCredentials> {
  const adminEmail = (process.env.DEMO_ADMIN_EMAIL ?? "reviewer@bor-systems.demo").toLowerCase();
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "BorReview2026!Demo";
  const supervisorEmail = "supervisor@bor-systems.demo";
  const cleanerEmail = "cleaner@bor-systems.demo";

  // ----- Organisation -----
  let [org] = await db
    .select()
    .from(schema.organisations)
    .where(eq(schema.organisations.id, DEMO_ORG_ID))
    .limit(1);
  if (!org) {
    [org] = await db
      .insert(schema.organisations)
      .values({ id: DEMO_ORG_ID, name: DEMO_ORG_NAME })
      .returning();
  }

  // ----- Admin reviewer -----
  const [existingAdmin] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organisationId, DEMO_ORG_ID), eq(schema.users.email, adminEmail)))
    .limit(1);
  if (!existingAdmin) {
    await db.insert(schema.users).values({
      organisationId: DEMO_ORG_ID,
      email: adminEmail,
      name: "App Reviewer",
      passwordHash: await argon2.hash(adminPassword),
      role: "admin",
      onDuty: true,
    });
  }

  // ----- Supervisor + cleaner for richer screens -----
  for (const u of [
    { email: supervisorEmail, name: "Sam Supervisor", role: "supervisor" as const, onDuty: false },
    { email: cleanerEmail, name: "Casey Cleaner", role: "cleaner" as const, onDuty: true },
  ]) {
    const [present] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.organisationId, DEMO_ORG_ID), eq(schema.users.email, u.email)))
      .limit(1);
    if (present) continue;
    await db.insert(schema.users).values({
      organisationId: DEMO_ORG_ID,
      email: u.email,
      name: u.name,
      role: u.role,
      passwordHash: await argon2.hash(adminPassword), // same demo password
      onDuty: u.onDuty,
    });
  }

  // ----- Building / floors / zones -----
  let [building] = await db
    .select()
    .from(schema.buildings)
    .where(eq(schema.buildings.organisationId, DEMO_ORG_ID))
    .limit(1);
  if (!building) {
    [building] = await db
      .insert(schema.buildings)
      .values({ organisationId: DEMO_ORG_ID, name: "Demo Plaza" })
      .returning();
    const floors = [];
    for (let i = 1; i <= 3; i++) {
      const [f] = await db.insert(schema.floors).values({
        organisationId: DEMO_ORG_ID,
        buildingId: building!.id,
        name: `Floor ${i}`,
        orderIndex: i,
      }).returning();
      floors.push(f!);
    }
    for (const f of floors) {
      await db.insert(schema.zones).values([
        { organisationId: DEMO_ORG_ID, floorId: f.id, name: `${f.name} — Lobby`, pinX: 30, pinY: 30 },
        { organisationId: DEMO_ORG_ID, floorId: f.id, name: `${f.name} — Atrium`, pinX: 70, pinY: 50 },
      ]);
    }
  }

  // ----- Hangers -----
  const zoneRows = await db
    .select()
    .from(schema.zones)
    .where(eq(schema.zones.organisationId, DEMO_ORG_ID));
  if (zoneRows.length > 0) {
    const existingHangers = await db
      .select()
      .from(schema.hangers)
      .where(eq(schema.hangers.organisationId, DEMO_ORG_ID));
    if (existingHangers.length === 0) {
      for (let i = 0; i < zoneRows.length; i++) {
        const eui = `DEMO${i.toString(16).padStart(12, "0").toUpperCase()}`;
        await db.insert(schema.hangers).values({
          organisationId: DEMO_ORG_ID,
          devEui: eui,
          zoneId: zoneRows[i]!.id,
          status: "active",
          batteryPct: 85 - i * 5,
          firmwareVersion: "1.0.0-demo",
          lastSeenAt: new Date(),
        });
      }
    }
  }

  // ----- Gateway -----
  {
    const [gw] = await db
      .select()
      .from(schema.gateways)
      .where(eq(schema.gateways.organisationId, DEMO_ORG_ID))
      .limit(1);
    if (!gw) {
      await db.insert(schema.gateways).values({
        organisationId: DEMO_ORG_ID,
        devEui: "DEMOGW000000001",
        name: "Demo Plaza Gateway",
        buildingId: building!.id,
        locationNote: "Reception cupboard, ground floor",
        ipAddress: "192.168.1.42",
        ssid: "DemoPlaza-WiFi",
        rssi: -58,
        firmwareVersion: "1.0.0-demo",
        packetsForwarded: 1247,
        uptimeSec: 86_400 * 3,
        lastSeenAt: new Date(),
      });
    }
  }

  // ----- Row handles for the rest of the seed -----
  const allHangers = await db
    .select()
    .from(schema.hangers)
    .where(eq(schema.hangers.organisationId, DEMO_ORG_ID));
  const demoUsers = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.organisationId, DEMO_ORG_ID));
  const adminUser = demoUsers.find((u) => u.email === adminEmail);
  const supervisorUser = demoUsers.find((u) => u.email === supervisorEmail);
  const cleanerUser = demoUsers.find((u) => u.email === cleanerEmail);
  const firstHanger = allHangers[0];
  const firstZoneId = firstHanger?.zoneId ?? null;

  // ----- Alerts: open + acknowledged + closed (checked per-status) -----
  if (allHangers.length > 0) {
    const existingAlerts = await db
      .select()
      .from(schema.alerts)
      .where(eq(schema.alerts.organisationId, DEMO_ORG_ID));
    const hasStatus = (s: "open" | "acknowledged" | "closed") =>
      existingAlerts.some((a) => a.status === s);

    if (!hasStatus("open")) {
      await db.insert(schema.alerts).values({
        organisationId: DEMO_ORG_ID,
        hangerId: allHangers[0]!.id,
        status: "open",
        kind: "spill",
        openedAt: new Date(Date.now() - 1000 * 60 * 8),
      });
    }
    if (!hasStatus("acknowledged") && allHangers[1]) {
      const ackOpened = new Date(Date.now() - 1000 * 60 * 20);
      await db.insert(schema.alerts).values({
        organisationId: DEMO_ORG_ID,
        hangerId: allHangers[1]!.id,
        status: "acknowledged",
        kind: "spill",
        openedAt: ackOpened,
        acknowledgedAt: new Date(ackOpened.getTime() + 90_000),
        acknowledgedBy: cleanerUser?.id ?? null,
      });
    }
    if (!hasStatus("closed")) {
      const opened = new Date(Date.now() - 1000 * 60 * 60 * 6);
      await db.insert(schema.alerts).values({
        organisationId: DEMO_ORG_ID,
        hangerId: allHangers[0]!.id,
        status: "closed",
        openedAt: opened,
        acknowledgedAt: new Date(opened.getTime() + 60_000),
        closedAt: new Date(opened.getTime() + 12 * 60_000),
        closureReason: "sign_returned",
        closureNote: "Sample alert — closed automatically.",
      });
    }
  }

  // ----- Events: lifted/returned/heartbeat history -----
  if (firstHanger) {
    const existingEvents = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.organisationId, DEMO_ORG_ID))
      .limit(1);
    if (existingEvents.length === 0) {
      const now = Date.now();
      const evRows = [
        { type: "lifted" as const,    receivedAt: new Date(now - 1000 * 60 * 8) },
        { type: "heartbeat" as const, receivedAt: new Date(now - 1000 * 60 * 60) },
        { type: "returned" as const,  receivedAt: new Date(now - 1000 * 60 * 60 * 5.8) },
        { type: "lifted" as const,    receivedAt: new Date(now - 1000 * 60 * 60 * 6) },
        { type: "heartbeat" as const, receivedAt: new Date(now - 1000 * 60 * 60 * 24) },
      ];
      for (const e of evRows) {
        await db.insert(schema.events).values({
          organisationId: DEMO_ORG_ID,
          hangerId: firstHanger.id,
          type: e.type,
          batteryPct: firstHanger.batteryPct ?? 80,
          receivedAt: e.receivedAt,
        });
      }
    }
  }

  // ----- Dispatches -----
  if (cleanerUser) {
    const existing = await db
      .select()
      .from(schema.dispatches)
      .where(eq(schema.dispatches.organisationId, DEMO_ORG_ID))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(schema.dispatches).values([
        {
          organisationId: DEMO_ORG_ID,
          recipientUserId: cleanerUser.id,
          senderUserId: supervisorUser?.id ?? adminUser?.id ?? null,
          zoneId: firstZoneId,
          message: "Please check the spill at Floor 1 — Lobby and bring a mop.",
          status: "sent",
          sentAt: new Date(Date.now() - 1000 * 60 * 5),
        },
        {
          organisationId: DEMO_ORG_ID,
          recipientUserId: cleanerUser.id,
          senderUserId: supervisorUser?.id ?? adminUser?.id ?? null,
          zoneId: firstZoneId,
          message: "Routine check of the 2nd floor atrium before lunch.",
          status: "completed",
          sentAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
          acknowledgedAt: new Date(Date.now() - 1000 * 60 * 175),
          completedAt: new Date(Date.now() - 1000 * 60 * 160),
        },
      ]);
    }
  }

  // ----- Shifts (recomputed relative to "now" each fresh seed) -----
  if (cleanerUser) {
    const existing = await db
      .select()
      .from(schema.shifts)
      .where(eq(schema.shifts.organisationId, DEMO_ORG_ID))
      .limit(1);
    if (existing.length === 0) {
      const startToday = new Date(); startToday.setHours(8, 0, 0, 0);
      const endToday = new Date();   endToday.setHours(16, 0, 0, 0);
      const startTom = new Date(Date.now() + 86_400_000); startTom.setHours(8, 0, 0, 0);
      const endTom = new Date(Date.now() + 86_400_000);   endTom.setHours(16, 0, 0, 0);
      await db.insert(schema.shifts).values([
        {
          organisationId: DEMO_ORG_ID, userId: cleanerUser.id,
          startsAt: startToday, endsAt: endToday,
          buildingId: building!.id, notes: "Day shift — whole building",
          createdBy: adminUser?.id ?? null,
        },
        {
          organisationId: DEMO_ORG_ID, userId: cleanerUser.id,
          startsAt: startTom, endsAt: endTom,
          buildingId: building!.id, notes: "Day shift — whole building",
          createdBy: adminUser?.id ?? null,
        },
      ]);
    }
  }

  // ----- Notifications log -----
  if (adminUser) {
    const existing = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.organisationId, DEMO_ORG_ID))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(schema.notifications).values([
        {
          organisationId: DEMO_ORG_ID, userId: adminUser.id,
          channel: "push", kind: "alert", delivered: true,
          sentAt: new Date(Date.now() - 1000 * 60 * 8),
        },
        {
          organisationId: DEMO_ORG_ID, userId: supervisorUser?.id ?? adminUser.id,
          channel: "email", kind: "alert", delivered: true,
          sentAt: new Date(Date.now() - 1000 * 60 * 8),
        },
        {
          organisationId: DEMO_ORG_ID, userId: adminUser.id,
          channel: "sms", kind: "escalation", delivered: false,
          error: "No phone number on file",
          sentAt: new Date(Date.now() - 1000 * 60 * 6),
        },
      ]);
    }
  }

  // ----- Audit log -----
  if (adminUser) {
    const existing = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.organisationId, DEMO_ORG_ID))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(schema.auditLog).values([
        {
          organisationId: DEMO_ORG_ID, actorUserId: adminUser.id,
          action: "user.login", targetType: "user", targetId: adminUser.id,
          at: new Date(Date.now() - 1000 * 60 * 30),
        },
        {
          organisationId: DEMO_ORG_ID, actorUserId: adminUser.id,
          action: "hanger.register", targetType: "hanger",
          targetId: firstHanger?.id ?? null,
          metadata: { devEui: firstHanger?.devEui ?? "DEMO" },
          at: new Date(Date.now() - 1000 * 60 * 60 * 24),
        },
        {
          organisationId: DEMO_ORG_ID, actorUserId: supervisorUser?.id ?? adminUser.id,
          action: "dispatch.send", targetType: "dispatch",
          at: new Date(Date.now() - 1000 * 60 * 5),
        },
      ]);
    }
  }

  return { orgName: DEMO_ORG_NAME, adminEmail, adminPassword, supervisorEmail, cleanerEmail };
}

/**
 * Boot-time wrapper: runs the seed unless disabled, and NEVER throws — a demo
 * seed problem must not stop the server from starting. Logs a one-line result.
 */
export async function seedDemoOrgOnBoot(log: {
  info: (msg: string) => void;
  error: (obj: unknown, msg?: string) => void;
}): Promise<void> {
  if (process.env.DEMO_SEED_DISABLED === "1") {
    log.info("demo seed skipped (DEMO_SEED_DISABLED=1)");
    return;
  }
  try {
    const creds = await seedDemoOrg();
    log.info(`demo org ensured (${creds.adminEmail})`);
  } catch (err) {
    log.error(err, "demo seed on boot failed (non-fatal — server continues)");
  }
}
