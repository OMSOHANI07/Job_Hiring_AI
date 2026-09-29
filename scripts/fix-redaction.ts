// Re-redacts stored CVs with the current detectors (name read from the CV), deletes AI extraction records made
// from an earlier, less clean redaction, and re-scores from the clean text. Prints no PII.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/fix-redaction.ts KRG-... [KRG-...]
import { neon } from "@neondatabase/serverless";
import { getStore } from "../lib/db/client";
import { parseCv } from "../lib/parse";
import { guessName } from "../lib/pii/detect";
import { reRedact, scoreResume } from "../lib/pipeline";

const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as const;

async function main() {
  const store = getStore();
  const sql = neon(process.env.DATABASE_URL!);
  for (const id of process.argv.slice(2)) {
    const r = (await store.getResume(id))!;
    const { text } = await parseCv((await store.getOriginal(r.storage_path!))!, `cv.${r.file_type}`, MIME[r.file_type]);
    const name = guessName(text);
    if (!name) { console.log(`${id}: still no name found; left held back`); continue; }
    const rr = await reRedact(id, name);
    console.log(`${id}: re-redacted -> ${rr.status}${rr.leakTypes.length ? ` (leaks: ${rr.leakTypes})` : ""}`);
    if (rr.status !== "redacted") continue;
    const del = (await sql.query("delete from extractions where resume_id = $1 returning id", [id])) as unknown[];
    console.log(`  deleted ${del.length} old extraction record(s)`);
    const s = await scoreResume(id);
    console.log(`  re-scored from clean text: ${s.decision} ${s.score}`);
  }
}
main().catch((e) => { console.error("ERROR", (e as Error).message.replace(/postgres(ql)?:\/\/\S+/g, "[DB]")); process.exit(1); });
