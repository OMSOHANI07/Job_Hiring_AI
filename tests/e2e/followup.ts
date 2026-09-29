// Real-Gemini run of the follow-up step on both samples: scores, then generates brief + email drafts.
// SENDS NOTHING. Asserts: correct email kind per policy, no PII in any AI request, placeholder present,
// rejection passes the wording guard. Usage: npx tsx --conditions=react-server --env-file=.env.local tests/e2e/followup.ts
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NAME_PLACEHOLDER, rejectionViolations } from "../../lib/ai/email";
import { realGenerate, type GeminiRequest } from "../../lib/ai/gemini";
import { getStore, setStoreForTests } from "../../lib/db/client";
import { getFollowUp, prepareFollowUp } from "../../lib/followup";
import { scoreResume, uploadCv } from "../../lib/pipeline";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM } from "../../samples/sampleCvs";

process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_DATA_DIR = mkdtempSync(path.join(tmpdir(), "kargo-fu-e2e-"));
setStoreForTests(null);
let fails = 0;
const check = (l: string, ok: boolean, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${l}${d ? `  ${d}` : ""}`); if (!ok) fails++; };

async function main() {
  const out: Record<string, unknown> = {};
  for (const [cv, kind] of [[SAMPLE_ACCEPT_PM, "invite"], [SAMPLE_REJECT_PM, "rejection"]] as const) {
    const data = new Uint8Array(readFileSync(path.join("samples", cv.file)));
    const up = await uploadCv({ data, fileName: cv.file, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", role: cv.appliedRole });
    if (up.kind !== "created") throw new Error("upload failed");
    const calls: GeminiRequest[] = [];
    const gen = async (r: GeminiRequest) => { calls.push(r); return realGenerate(r); };
    await scoreResume(up.resumeId, gen);
    const t0 = Date.now();
    const res = await prepareFollowUp(up.resumeId, { generate: gen });
    const s = (await getFollowUp(up.resumeId))!;
    const pii = (await getStore().getPii(up.resumeId))!;
    const body = JSON.stringify(calls).toLowerCase();
    const leaked = pii.redaction_values.filter((v) => v.type !== "LOCATION" && body.includes(v.value.toLowerCase()));
    check(`${cv.file}: no generation errors`, res.errors.length === 0, res.errors.join(" "));
    check(`${cv.file}: email kind = ${kind}`, s.email?.kind === kind, `got ${s.email?.kind}`);
    check(`${cv.file}: drafted by the model (not the fallback)`, !!s.email?.model);
    check(`${cv.file}: placeholder greeting`, !!s.email?.body.startsWith(`Hi ${NAME_PLACEHOLDER}`));
    check(`${cv.file}: no PII in ${calls.length} AI requests`, leaked.length === 0, leaked.map((l) => l.type).join(","));
    if (kind === "invite") check(`${cv.file}: brief generated`, !!s.brief && s.brief.brief.questions.length >= 3);
    else check(`${cv.file}: rejection passes wording guard, no brief`, rejectionViolations(s.email!.body).length === 0 && !s.brief);
    out[cv.file] = { ms: Date.now() - t0, brief: s.brief?.brief ?? null, email: s.email && { kind: s.email.kind, subject: s.email.subject, body: s.email.body, model: s.email.model } };
  }
  mkdirSync("tests/.out", { recursive: true });
  writeFileSync("tests/.out/followup_e2e.json", JSON.stringify(out, null, 2));
  console.log(fails ? `${fails} check(s) failed` : "all follow-up E2E checks passed (nothing was sent)");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error("ERROR", (e as Error).message); process.exit(1); });
