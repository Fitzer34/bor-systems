// Tiny SQL migration runner. Reads migrations/*.sql in lexical order and runs
// each that hasn't been applied yet. Tracks applied migrations in a
// `_migrations` table so it's safe to run on every deploy.

import "dotenv/config";
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1 });

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const allFiles = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedRows = await sql<{ filename: string }[]>`SELECT filename FROM _migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  for (const file of allFiles) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const content = await fs.readFile(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`apply  ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO _migrations (filename) VALUES (${file})`;
    });
  }

  await sql.end();
  console.log("migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
