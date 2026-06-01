/**
 * Seeds a self-contained "App Store reviewer" demo organisation.
 *
 * Run on Render with:
 *   npm run db:seed:demo
 * or locally:
 *   tsx src/seed-demo.ts
 *
 * Env vars:
 *   DEMO_ADMIN_EMAIL    default: reviewer@bor-systems.demo
 *   DEMO_ADMIN_PASSWORD default: BorReview2026!Demo
 *
 * The credentials should be pasted into App Store Connect → App Information →
 * App Review Information → Sign-In Required → Username/Password. They give
 * reviewers a fully-stocked org so the UI isn't empty during review.
 *
 * Safe to run repeatedly — uses a fixed organisation UUID and skips work
 * that has already been done.
 */

import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db/client.js";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000099";
const DEMO_ORG_NAME = "Demo — HazardLink Reviewer Org";

async function main(): Promise<void> {
  const adminEmail = (process.env.DEMO_ADMIN_EMAIL ?? "reviewer@bor-systems.demo").toLowerCase();
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "BorReview2026!Demo";

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
    console.log("created demo organisation");
  }

  // ----- Admin reviewer -----
  const [existingAdmin] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organisationId, DEMO_ORG_ID), eq(schema.users.email, adminEmail)))
    .limit(1);
  if (!existingAdmin) {
    const passwordHash = await argon2.hash(adminPassword);
    await db.insert(schema.users).values({
      organisationId: DEMO_ORG_ID,
      email: adminEmail,
      name: "App Reviewer",
      passwordHash,
      role: "admin",
      onDuty: true,
    });
    console.log(`created demo admin: ${adminEmail}`);
  } else {
    console.log(`demo admin already exists: ${adminEmail}`);
  }

  // ----- Supervisor + cleaner for richer screens -----
  const supervisorEmail = "supervisor@bor-systems.demo";
  const cleanerEmail = "cleaner@bor-systems.demo";
  for (const u of [
    { email: supervisorEmail, name: "Sam Supervisor", role: "supervisor" as const },
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
      onDuty: (u as { onDuty?: boolean }).onDuty ?? false,
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
    console.log("created demo building with 3 floors / 6 zones");
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
      console.log(`created ${zoneRows.length} demo hangers`);
    }
  }

  // ----- Gateway (so the Gateways page isn't empty) -----
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
      console.log("created demo gateway");
    }
  }

  // ----- Useful row handles for the rest of the seed -----
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

  // ----- Alerts: one OPEN + one acknowledged + one closed -----
  // Checked per-status so a demo org that was seeded earlier (when only a
  // closed alert was created) gets topped up with the open/acknowledged ones
  // that make the Active-alerts dashboard non-empty.
  if (allHangers.length > 0) {
    const existingAlerts = await db
      .select()
      .from(schema.alerts)
      .where(eq(schema.alerts.organisationId, DEMO_ORG_ID));
    const hasStatus = (s: "open" | "acknowledged" | "closed") =>
      existingAlerts.some((a) => a.status === s);

    if (!hasStatus("open")) {
      // Open spill alert (drives the main dashboard + floor-plan pin).
      await db.insert(schema.alerts).values({
        organisationId: DEMO_ORG_ID,
        hangerId: allHangers[0]!.id,
        status: "open",
        kind: "spill",
        openedAt: new Date(Date.now() - 1000 * 60 * 8),
      });
      console.log("created demo OPEN alert");
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
      console.log("created demo ACKNOWLEDGED alert");
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
      console.log("created demo CLOSED alert");
    }
  }

  // ----- Events: lifted/returned/heartbeat history (Analytics + alert timeline) -----
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
      console.log(`created ${evRows.length} demo events`);
    }
  }

  // ----- Dispatch (so the Dispatch page isn't empty) -----
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
      console.log("created demo dispatches");
    }
  }

  // ----- Shifts (so the Schedule page isn't empty) -----
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
      console.log("created demo shifts");
    }
  }

  // ----- Notifications log (so the Notifications page isn't empty) -----
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
      console.log("created demo notifications");
    }
  }

  // ----- Audit log (so the Audit log page isn't empty) -----
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
      console.log("created demo audit log entries");
    }
  }

  console.log("\n=== Demo credentials ===");
  console.log(`Org:        ${DEMO_ORG_NAME}`);
  console.log(`Admin:      ${adminEmail}`);
  console.log(`Password:   ${adminPassword}`);
  console.log(`Supervisor: ${supervisorEmail}`);
  console.log(`Cleaner:    ${cleanerEmail}`);
  console.log("Paste the admin email/password into App Store Connect → App Review Information.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
