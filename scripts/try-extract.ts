// Runs a sample CV through parse -> redact -> verify -> Gemini extraction -> scoring, without the web app.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/try-extract.ts [accept|reject]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { extractEvidence } from "../lib/ai/gemini";
import { parseCv } from "../lib/parse";
import { locationStatus } from "../lib/pii/location";
import { redact } from "../lib/pii/redact";
import { verifyRedaction } from "../lib/pii/verify";
import { evaluateAppliedRole } from "../lib/scoring/evaluate";
import type { Extraction } from "../lib/scoring/types";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM } from "../samples/sampleCvs";

async function main() {
  const which = process.argv[2] === "reject" ? SAMPLE_REJECT_PM : SAMPLE_ACCEPT_PM;
  const buf = new Uint8Array(readFileSync(path.join(process.cwd(), "samples", which.file)));
  const { text } = await parseCv(buf, which.file, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const { redactedText, report } = redact(text, which.name);
  const v = verifyRedaction(redactedText, which.name, report.values);
  if (!v.ok) throw new Error(`redaction failed: ${v.leaks.map((l) => l.type).join(",")}`);
  const out = await extractEvidence({
    resumeId: "KRG-2026-TRY000", appliedRole: which.appliedRole, redactedText,
    locationStatus: locationStatus(text), piiValues: report.values,
  });
  const r = evaluateAppliedRole(out.extraction as unknown as Extraction, redactedText).applied;
  mkdirSync("tests/.out", { recursive: true });
  writeFileSync(`tests/.out/extraction_${process.argv[2] ?? "accept"}.json`, JSON.stringify(out.extraction, null, 2));
  console.log(JSON.stringify({
    sample: which.file, model: out.model, attempts: out.attempts, latency_ms: out.latencyMs,
    levels: r.levels, grades: out.extraction.evidence_grades, base: r.base, penalties: r.penalties, bonuses: r.bonuses,
    score: r.score, band: r.band, gate: r.gate_failed, nn_failed: r.non_negotiables_failed, flags: r.flags,
    product_years: r.product_years, triad: r.dna_triad,
  }, null, 1));
}
main().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
