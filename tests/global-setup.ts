import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Integration tests run against an isolated database (crowdship_test) on the
 * local Supabase Postgres, recreated each run, so they never touch dev data or
 * compete with a running dev worker.
 */
export default async function setup() {
  const admin = postgres(process.env.TEST_ADMIN_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} });
  await admin.unsafe(`select pg_terminate_backend(pid) from pg_stat_activity where datname = 'crowdship_test' and pid <> pg_backend_pid()`);
  await admin.unsafe(`drop database if exists crowdship_test`);
  await admin.unsafe(`create database crowdship_test`);
  await admin.end();

  const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/crowdship_test", { max: 1, onnotice: () => {} });
  await sql.unsafe(readFileSync("tests/db/realtime-stub.sql", "utf8"));
  const dir = "supabase/migrations";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await sql.unsafe(readFileSync(join(dir, f), "utf8"));
  await sql.end();
}
