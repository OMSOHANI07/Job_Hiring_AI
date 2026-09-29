// Applies db/neon/0001_init.sql to the Neon database in DATABASE_URL, then verifies every table and runs a
// write/read/delete round trip. Prints no secrets.
// Usage: npx tsx --env-file=.env.local scripts/neon-setup.ts
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const TABLES = ["candidate_pii", "resumes", "extractions", "scores", "audit_log", "interview_briefs", "emails", "decisions", "cv_originals", "schema_migrations"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in .env.local");
  const sql = neon(url);
  const host = new URL(url).host.replace(/^[^.]+/, (s) => s.slice(0, 6) + "…");
  console.log(`connecting to ${host}`);
  const statements = readFileSync("db/neon/0001_init.sql", "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    .split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const s of statements) await sql.query(s);
  console.log(`applied ${statements.length} statements`);
  const rows = (await sql.query("select table_name from information_schema.tables where table_schema = 'public'")) as { table_name: string }[];
  const have = new Set(rows.map((r) => r.table_name));
  let ok = true;
  for (const t of TABLES) { console.log(`${have.has(t) ? "PASS" : "FAIL"}  table ${t}`); ok &&= have.has(t); }
  await sql.query("insert into audit_log (resume_id, event, payload) values ('KRG-0000-SETUP0','uploaded','{\"setup\":true}'::jsonb)");
  const r = (await sql.query("select count(*)::int as n from audit_log where resume_id = 'KRG-0000-SETUP0'")) as { n: number }[];
  await sql.query("delete from audit_log where resume_id = 'KRG-0000-SETUP0'");
  console.log(`${r[0].n === 1 ? "PASS" : "FAIL"}  write/read/delete round trip`);
  ok &&= r[0].n === 1;
  console.log(ok ? "Neon is ready. Set STORAGE_DRIVER=neon in .env.local." : "Neon setup incomplete.");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("ERROR:", (e as Error).message.replace(/postgres(ql)?:\/\/\S+/g, "[DATABASE_URL]")); process.exit(1); });
