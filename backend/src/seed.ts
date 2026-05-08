import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./db/client.js";

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@bor-systems.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMeNow123!";

  // Use the canonical "Main Organisation" created by migration 0004.
  const MAIN_ORG_ID = "00000000-0000-0000-0000-000000000001";
  const [org] = await db.select().from(schema.organisations).where(eq(schema.organisations.id, MAIN_ORG_ID)).limit(1);
  if (!org) {
    console.log("creating Main Organisation");
    await db.insert(schema.organisations).values({ id: MAIN_ORG_ID, name: "Main Organisation" });
  }

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organisationId, MAIN_ORG_ID), eq(schema.users.email, adminEmail)))
    .limit(1);
  if (existing) {
    console.log(`admin user ${adminEmail} already exists in Main Organisation`);
  } else {
    const passwordHash = await argon2.hash(adminPassword);
    await db.insert(schema.users).values({
      organisationId: MAIN_ORG_ID,
      email: adminEmail,
      name: "Initial Admin",
      passwordHash,
      role: "admin",
      onDuty: false,
    });
    console.log(`created admin: ${adminEmail} / ${adminPassword}  (change immediately)`);
  }

  // Skip building/floor seeding if we've already got some
  const [b] = await db.select().from(schema.buildings).where(eq(schema.buildings.organisationId, MAIN_ORG_ID)).limit(1);
  if (b) {
    console.log("buildings already seeded; skipping demo data");
    process.exit(0);
  }

  const [building] = await db.insert(schema.buildings).values({ organisationId: MAIN_ORG_ID, name: "Main Building" }).returning();
  console.log(`created building ${building!.name}`);

  const floors = [];
  for (let i = 1; i <= 3; i++) {
    const [f] = await db.insert(schema.floors).values({
      organisationId: MAIN_ORG_ID,
      buildingId: building!.id,
      name: `Floor ${i}`,
      orderIndex: i,
    }).returning();
    floors.push(f!);
  }
  for (const f of floors) {
    await db.insert(schema.zones).values([
      { organisationId: MAIN_ORG_ID, floorId: f.id, name: `${f.name} — North` },
      { organisationId: MAIN_ORG_ID, floorId: f.id, name: `${f.name} — South` },
    ]);
  }
  console.log(`created ${floors.length} floors with 2 zones each`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
