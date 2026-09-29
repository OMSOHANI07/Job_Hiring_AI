// Diagnose name detection on stored uploads (reads originals from the DB, prints only shapes, not PII).
import { getStore } from "../lib/db/client";
import { parseCv } from "../lib/parse";
import { guessName } from "../lib/pii/detect";
const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as const;
const shape = (l: string) => l.replace(/\p{Lu}/gu, "A").replace(/\p{Ll}/gu, "a").replace(/\d/g, "9").slice(0, 90);
async function main() {
  const store = getStore();
  const resumes = (await store.listResumes()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15);
  for (const r of resumes) {
    const pii = await store.getPii(r.resume_id);
    const orig = r.storage_path ? await store.getOriginal(r.storage_path) : null;
    let first: string[] = [], guess = "";
    if (orig) {
      const { text } = await parseCv(orig, `cv.${r.file_type}`, MIME[r.file_type]);
      first = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4);
      guess = guessName(text);
    }
    console.log(`${r.resume_id} ${r.file_type} status=${r.status} stored_name=${pii?.full_name === "(name not detected)" ? "MISSING" : "ok"} guess_now=${guess ? "found" : "NONE"} counts=${JSON.stringify(r.redaction_counts)}`);
    if (!guess || pii?.full_name === "(name not detected)") first.forEach((l) => console.log(`    | ${shape(l)}`));
  }
}
main().catch((e) => { console.error((e as Error).message.replace(/postgres(ql)?:\/\/\S+/g, "[DB]")); process.exit(1); });
