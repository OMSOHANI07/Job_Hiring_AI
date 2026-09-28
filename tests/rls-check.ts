// Supabase verification (Phase 3 / security checklist). Run once keys are in .env.local:
//   npx tsx --env-file=.env.local tests/rls-check.ts
// Checks: tables exist, the service role can write+read, the anon key is denied on every table,
// and the cv-originals bucket is private. Prints no secrets.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const TABLES = ["candidate_pii", "resumes", "extractions", "scores", "audit_log"];
let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) fail++;
};

async function main() {
  for (const t of TABLES) {
    const { error } = await service.from(t).select("*", { head: true, count: "exact" });
    ok(`service role can read ${t}`, !error, error?.message);
  }
  const id = `KRG-0000-RLS${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const w = await service.from("audit_log").insert({ resume_id: id, event: "uploaded", payload: { rls_check: true } }).select("id");
  ok("service role can write audit_log", !w.error, w.error?.message);

  for (const t of TABLES) {
    const r = await anon.from(t).select("*").limit(1);
    ok(`anon key cannot read ${t}`, !!r.error || (r.data?.length ?? 0) === 0, r.error ? "error returned" : `${r.data?.length ?? 0} rows`);
    const ins = await anon.from(t).insert({ resume_id: id, event: "uploaded" });
    ok(`anon key cannot write ${t}`, !!ins.error);
  }
  const { data: bucket, error: bErr } = await service.storage.getBucket("cv-originals");
  ok("bucket cv-originals exists", !bErr, bErr?.message);
  ok("bucket cv-originals is private", bucket?.public === false);
  const list = await anon.storage.from("cv-originals").list();
  ok("anon key cannot list cv-originals", !!list.error || (list.data?.length ?? 0) === 0);

  await service.from("audit_log").delete().eq("resume_id", id);
  console.log(fail ? `${fail} check(s) failed` : "all RLS checks passed");
  process.exit(fail ? 1 : 0);
}
void main();
