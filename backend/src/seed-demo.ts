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
const DEMO_ORG_NAME = "Demo — BOR Systems Reviewer Org";

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

  // ----- One closed alert for history -----
  const hangerRows = await db
    .select()
    .from(schema.hangers)
    .where(eq(schema.hangers.organisationId, DEMO_ORG_ID))
    .limit(1);
  if (hangerRows.length > 0) {
    const existingAlerts = await db
      .select()
      .from(schema.alerts)
      .where(eq(schema.alerts.organisationId, DEMO_ORG_ID));
    if (existingAlerts.length === 0) {
      const opened = new Date(Date.now() - 1000 * 60 * 60 * 6);
      await db.insert(schema.alerts).values({
        organisationId: DEMO_ORG_ID,
        hangerId: hangerRows[0]!.id,
        status: "closed",
        openedAt: opened,
        acknowledgedAt: new Date(opened.getTime() + 60_000),
        closedAt: new Date(opened.getTime() + 12 * 60_000),
        closureReason: "sign_returned",
        closureNote: "Sample alert — closed automatically.",
      });
      console.log("created sample closed alert");
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
