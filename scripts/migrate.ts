import { readdirSync, readFileSync } from "fs";
import path from "path";
import { Pool } from "pg";
import { pgPoolConfig } from "../lib/database-url";
import { env } from "../lib/env";
import { loadEnv } from "./load-env";

loadEnv();

export async function migrate(): Promise<void> {
  const pool = new Pool(pgPoolConfig(env.ownerDatabaseUrl(), 1));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
  // The ledger id is the full filename. Production already applied
  // 014_member_public_profiles.sql. A second file numbered 014 would be a
  // different id and would run on the next deploy. Refuse duplicate numbers.
  const seen = new Map<string, string>();
  for (const file of files) {
    const number = /^(\d+)/.exec(file)?.[1];
    if (!number) continue;
    const other = seen.get(number);
    if (other) {
      throw new Error(
        `Two migrations share version ${number}: ${other} and ${file}. ` +
          "Already applied 014_member_public_profiles.sql must stay 014. New work needs the next free number.",
      );
    }
    seen.set(number, file);
  }
  for (const file of files) {
    const { rows } = await pool.query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [file]);
    if (rows.length) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = readFileSync(path.join(dir, file), "utf8");
    console.log(`apply ${file}`);
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file]);
  }
  await pool.end();
  console.log("migrations done");
}

const entry = process.argv[1] || "";
if (entry.endsWith("migrate.ts") || entry.endsWith("migrate.js")) {
  migrate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
