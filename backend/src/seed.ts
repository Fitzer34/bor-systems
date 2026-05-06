import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, schema } from "./db/client.js";

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@bor-systems.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMeNow123!";

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, adminEmail)).limit(1);
  if (existing) {
    console.log(`admin user ${adminEmail} already exists`);
  } else {
    const passwordHash = await argon2.hash(adminPassword);
    await db.insert(schema.users).values({
      email: adminEmail,
      name: "Initial Admin",
      passwordHash,
      role: "admin",
      onDuty: false,
    });
    console.log(`created admin: ${adminEmail} / ${adminPassword}  (change immediately)`);
  }

  const [building] = await db.insert(schema.buildings).values({ name: "Main Building" }).returning();
  console.log(`created building ${building!.name}`);

  const floors = [];
  for (let i = 1; i <= 3; i++) {
    const [f] = await db.insert(schema.floors).values({ buildingId: building!.id, name: `Floor ${i}`, orderIndex: i }).returning();
    floors.push(f!);
  }
  for (const f of floors) {
    await db.insert(schema.zones).values([
      { floorId: f.id, name: `${f.name} — North` },
      { floorId: f.id, name: `${f.name} — South` },
    ]);
  }
  console.log(`created ${floors.length} floors with 2 zones each`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
