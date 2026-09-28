// End-to-end: both bundled samples through the REAL pipeline (parse -> redact -> verify -> Gemini -> score),
// using an isolated local store in a temp dir. Captures every outgoing Gemini request and asserts that it
// contains none of the PII values stored for that resume.
// Usage: npm run test:e2e   (needs GEMINI_API_KEY in .env.local; E2E_RUNS=3 by default)
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { realGenerate, type GeminiRequest } from "../../lib/ai/gemini";
import { getStore } from "../../lib/db/client";
import { scoreResume, uploadCv } from "../../lib/pipeline";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM, type SampleCv } from "../../samples/sampleCvs";

process.env.STORAGE_DRIVER = "local";
const RUNS = Number(process.env.E2E_RUNS ?? 3);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let fails = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) fails++;
};

async function runOnce(cv: SampleCv, run: number) {
  process.env.LOCAL_DATA_DIR = mkdtempSync(path.join(tmpdir(), `kargo-e2e-${run}-`));
  // fresh store per run so dedupe doesn't short-circuit
  (await import("../../lib/db/client")).setStoreForTests(null);
  const data = new Uint8Array(readFileSync(path.join(process.cwd(), "samples", cv.file)));
  const up = await uploadCv({ data, fileName: cv.file, mime: DOCX, role: cv.appliedRole });
  if (up.kind !== "created" || up.status !== "redacted") throw new Error(`upload failed: ${JSON.stringify(up)}`);
  const captured: GeminiRequest[] = [];
  const out = await scoreResume(up.resumeId, async (req) => { captured.push(req); return realGenerate(req); });
  const store = getStore();
  const [pii, score, ext] = await Promise.all([store.getPii(up.resumeId), store.getScores(up.resumeId), store.latestExtraction(up.resumeId)]);
  const body = JSON.stringify(captured).toLowerCase();
  const leaked = pii!.redaction_values.filter((v) => v.type !== "LOCATION" && body.includes(v.value.toLowerCase())).map((v) => v.type);
  return { resumeId: up.resumeId, out, score: score[0], ext, captured: captured.length, leaked, pii: pii! };
}

async function main() {
  const results: Record<string, unknown[]> = {};
  for (const [cv, expectOk, label] of [
    [SAMPLE_ACCEPT_PM, (d: string) => d === "Accept – Priority" || d === "Accept", "Accept – Priority or Accept"],
    [SAMPLE_REJECT_PM, (d: string) => d === "Reject", "Reject"],
  ] as const) {
    results[cv.file] = [];
    for (let i = 1; i <= RUNS; i++) {
      const r = await runOnce(cv, i);
      const s = r.score;
      check(`${cv.file} run ${i}: decision ${label}`, expectOk(r.out.decision), `got "${r.out.decision}" score ${r.out.score}`);
      check(`${cv.file} run ${i}: Gemini request contains no PII`, r.leaked.length === 0, r.leaked.length ? `leaked: ${r.leaked.join(",")}` : `${r.captured} request(s) checked against ${r.pii.redaction_values.length} stored values`);
      results[cv.file].push({
        run: i, resume_id_format_ok: /^KRG-\d{4}-[A-Z0-9]{6}$/.test(r.resumeId), decision: r.out.decision, score: s.score, base: s.base,
        levels: s.levels, penalties: s.penalties, bonuses: s.bonuses, gate_failed: s.gate_failed,
        non_negotiables_failed: s.non_negotiables_failed, dna_triad: s.dna_triad, flags: s.flags, product_years: s.product_years,
        evidence_grades: (r.ext?.extraction as { evidence_grades?: unknown })?.evidence_grades, attempts: r.ext?.attempts, latency_ms: r.ext?.latency_ms, model: r.ext?.model,
      });
    }
  }
  mkdirSync("tests/.out", { recursive: true });
  writeFileSync("tests/.out/e2e_results.json", JSON.stringify(results, null, 2));
  console.log(fails ? `\n${fails} E2E check(s) failed` : "\nall E2E checks passed");
  console.log("results written to tests/.out/e2e_results.json");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error("E2E ERROR:", (e as Error).message); process.exit(1); });
