/**
 * CLI entry point for seeding the "App Store reviewer" demo organisation.
 *
 *   npm run db:seed:demo        (on Render, or locally with DATABASE_URL set)
 *   tsx src/seed-demo.ts
 *
 * Env vars:
 *   DEMO_ADMIN_EMAIL    default: reviewer@bor-systems.demo
 *   DEMO_ADMIN_PASSWORD default: BorReview2026!Demo
 *
 * The actual seeding logic lives in services/demo-seed.ts and ALSO runs
 * automatically on server boot, so this script is now just a manual trigger
 * that prints the credentials. Safe to run repeatedly (idempotent).
 */

import { seedDemoOrg } from "./services/demo-seed.js";

async function main(): Promise<void> {
  const creds = await seedDemoOrg();
  console.log("\n=== Demo credentials ===");
  console.log(`Org:        ${creds.orgName}`);
  console.log(`Admin:      ${creds.adminEmail}`);
  console.log(`Password:   ${creds.adminPassword}`);
  console.log(`Supervisor: ${creds.supervisorEmail}`);
  console.log(`Cleaner:    ${creds.cleanerEmail}`);
  console.log("Paste the admin email/password into App Store Connect → App Review Information.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
