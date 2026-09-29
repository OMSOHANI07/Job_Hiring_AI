// Runs both sample CVs through the real pipeline against the Neon database (STORAGE_DRIVER=neon):
// upload -> redact -> score (Gemini) -> brief + email draft (Gemini) -> dashboard + interviews queries.
// Sends no email. Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/neon-smoke.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { getStore } from "../lib/db/client";
import { getFollowUp, prepareFollowUp } from "../lib/followup";
import { getInterviews } from "../lib/interviews";
import { scoreResume, uploadCv } from "../lib/pipeline";
import { getResultView, getRoleRanking } from "../lib/views";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM } from "../samples/sampleCvs";

async function main() {
  const store = getStore();
  if (store.driver !== "neon") throw new Error(`expected neon driver, got ${store.driver}`);
  for (const cv of [SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM]) {
    const data = new Uint8Array(readFileSync(path.join("samples", cv.file)));
    const up = await uploadCv({ data, fileName: cv.file, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", role: cv.appliedRole });
    const id = up.resumeId;
    console.log(`${cv.file}: upload ${up.kind} ${id} (${up.status})`);
    const orig = await store.getOriginal((await store.getResume(id))!.storage_path!);
    console.log(`  original stored in Neon: ${orig?.byteLength === data.byteLength ? "PASS" : "FAIL"} (${orig?.byteLength} bytes)`);
    const s = await scoreResume(id);
    console.log(`  scored: ${s.decision} ${s.score}`);
    const v = await getResultView(id);
    console.log(`  result view: ${v ? "PASS" : "FAIL"} rank ${v?.rank}/${v?.roleCount}, ${v?.criteria.length} criteria`);
    const p = await prepareFollowUp(id);
    const f = await getFollowUp(id);
    console.log(`  follow-up: action ${p.action}, brief ${f?.brief ? "yes" : "no"}, email ${f?.email?.kind ?? "none"} (${f?.email?.status ?? "-"}) ${p.errors.join(" ")}`);
  }
  const r = await getRoleRanking("PM");
  console.log(`dashboard PM rows: ${r.rows.length} [${r.rows.map((x) => `${x.name.split(" ")[0]} ${x.score}`).join(", ")}]`);
  const iv = await getInterviews();
  console.log(`interviews: ${iv.sent.length} sent, ${iv.draftedNotSent} drafted`);
  console.log(`audit events for last: ${(await store.listAudit(r.rows[r.rows.length - 1].resumeId)).map((a) => a.event).join(",")}`);
}
main().catch((e) => { console.error("ERROR", (e as Error).message.replace(/postgres(ql)?:\/\/\S+/g, "[DATABASE_URL]")); process.exit(1); });
