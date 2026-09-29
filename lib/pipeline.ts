import "server-only";
import { extractEvidence, ExtractionError, PiiInPayloadError, realGenerate, type GenerateFn } from "@/lib/ai/gemini";
import { getStore } from "@/lib/db/client";
import type { PiiRow, ResumeRow, ScoreRow } from "@/lib/db/types";
import { DECISION } from "@/lib/decision";
import { uniqueResumeId } from "@/lib/ids/resumeId";
import { parseCv, type FileKind } from "@/lib/parse";
import { cvHash } from "@/lib/parse/normalize";
import { guessName, type PiiType } from "@/lib/pii/detect";
import { locationStatus } from "@/lib/pii/location";
import { redact, type RedactionResult } from "@/lib/pii/redact";
import { verifyRedaction } from "@/lib/pii/verify";
import { CFG } from "@/lib/scoring/config";
import { evaluateAppliedRole } from "@/lib/scoring/evaluate";
import type { AppliedEvaluation, Extraction, Role } from "@/lib/scoring/types";

// Components Map: Trigger/Input -> Context (parse, redact, ID, store; no AI) -> [Arjun confirms]
// -> Processing (Gemini extraction on redacted text, deterministic scoring) -> Output.
// Logging rule: only Resume IDs, statuses, counts and types. Never names, contacts or CV text.

const MIME: Record<FileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type UploadResult =
  | { kind: "created"; resumeId: string; name: string; status: "redacted" | "redaction_failed"; leakTypes: PiiType[]; emailMatch: string | null }
  | { kind: "duplicate"; resumeId: string; status: ResumeRow["status"] };

function piiFields(r: RedactionResult) {
  const first = (t: PiiType) => r.report.values.find((v) => v.type === t)?.value ?? null;
  return {
    email: first("EMAIL")?.toLowerCase() ?? null,
    phone: first("PHONE"),
    links: [...new Set(r.report.values.filter((v) => v.type === "URL").map((v) => v.value))],
    location_raw: first("LOCATION"),
    redaction_values: r.report.values,
  };
}

/** Parse -> redact -> verify -> Resume ID -> store. No AI call happens here. */
export async function uploadCv(input: {
  data: Uint8Array;
  fileName: string;
  mime: string;
  role: Role;
  candidateName?: string;
}): Promise<UploadResult> {
  const store = getStore();
  const { kind, text } = await parseCv(input.data, input.fileName, input.mime);
  const hash = cvHash(text);

  const existing = await store.findByHash(hash, input.role);
  if (existing) {
    await store.audit("duplicate", existing.resume_id, { applied_role: input.role });
    return { kind: "duplicate", resumeId: existing.resume_id, status: existing.status };
  }

  const name = (input.candidateName?.trim() || guessName(text)).slice(0, 120);
  const loc = locationStatus(text); // computed before redaction; home city never reaches the AI
  const red = redact(text, name);
  const check = verifyRedaction(red.redactedText, name, red.report.values);
  const status = !name || !check.ok ? "redaction_failed" : "redacted";

  const resumeId = await uniqueResumeId((id) => store.idExists(id));
  const fields = piiFields(red);
  const emailMatch = fields.email ? await store.findByEmailRole(fields.email, input.role) : null;
  const now = new Date().toISOString();
  const pii: PiiRow = { resume_id: resumeId, full_name: name || "(name not detected)", ...fields, created_at: now };
  const resume: ResumeRow = {
    resume_id: resumeId, applied_role: input.role, file_name: sanitizeFileName(input.fileName), file_type: kind,
    storage_path: null, cv_hash: hash, redacted_text: red.redactedText, redaction_counts: red.report.counts,
    location_status: loc, status, created_at: now,
  };
  await store.createResume(pii, resume);
  // original file after the rows exist (Neon keeps it in a table with a foreign key to candidate_pii)
  const storagePath = await store.saveOriginal(resumeId, kind, input.data, MIME[kind]);
  await store.updateResume(resumeId, { storage_path: storagePath });
  await store.audit("uploaded", resumeId, { file_type: kind, applied_role: input.role, bytes: input.data.byteLength });
  const leakTypes = [...new Set(check.leaks.map((l) => l.type))];
  if (status === "redacted") await store.audit("redacted", resumeId, { counts: red.report.counts });
  else await store.audit("redaction_failed", resumeId, { leak_types: name ? leakTypes : ["CANDIDATE_NAME_MISSING"] });
  return { kind: "created", resumeId, name, status, leakTypes, emailMatch: emailMatch !== resumeId ? emailMatch : null };
}

/** File names can contain the candidate's name; keep only the extension-level shape for non-PII tables. */
function sanitizeFileName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "bin";
  return `cv.${ext}`;
}

/** "Edit name & re-redact": re-parse the stored original with a corrected name. Clears any prior scores. */
export async function reRedact(resumeId: string, newName: string) {
  const store = getStore();
  const resume = await store.getResume(resumeId);
  if (!resume || !resume.storage_path) throw new PipelineError(404, "Resume not found.");
  if (resume.status === "extracting") throw new PipelineError(409, "Scoring is in progress.");
  const original = await store.getOriginal(resume.storage_path);
  if (!original) throw new PipelineError(410, "The original file is no longer available.");
  const { text } = await parseCv(original, `cv.${resume.file_type}`, MIME[resume.file_type]);
  const name = newName.trim().slice(0, 120);
  if (!name) throw new PipelineError(400, "Enter the candidate's name.");
  const red = redact(text, name);
  const check = verifyRedaction(red.redactedText, name, red.report.values);
  const status = check.ok ? "redacted" : "redaction_failed";
  await store.updatePii(resumeId, { full_name: name, ...piiFields(red) });
  await store.updateResume(resumeId, { redacted_text: red.redactedText, redaction_counts: red.report.counts, status });
  await store.replaceScores(resumeId, []);
  await store.audit("re_redacted", resumeId, { status, counts: red.report.counts });
  if (!check.ok) await store.audit("redaction_failed", resumeId, { leak_types: [...new Set(check.leaks.map((l) => l.type))] });
  return { status, leakTypes: [...new Set(check.leaks.map((l) => l.type))] };
}

export class PipelineError extends Error {
  constructor(public status: number, message: string, public retryable = false) {
    super(message);
  }
}

/** Build the persisted score row for one evaluation. */
export function toScoreRow(resumeId: string, a: AppliedEvaluation): Omit<ScoreRow, "id" | "created_at"> {
  return {
    resume_id: resumeId, role: a.role, is_applied_role: true, score: a.score, band: a.band,
    decision: DECISION[a.band].label, levels: a.levels, points: a.points, evidence_multipliers: a.evidence_multipliers,
    base: a.base, penalties: a.penalties, bonuses: a.bonuses, penalty_total: a.penalty_total, bonus_total: a.bonus_total,
    product_years: a.product_years, gate_failed: a.gate_failed, non_negotiables_failed: a.non_negotiables_failed,
    dna_triad: a.dna_triad, dna_evidence_multiplier: a.dna_evidence_multiplier, flags: a.flags,
    explanation: a.explanation, interview_probes: a.interview_probes, config_version: CFG.version,
  };
}

/**
 * Arjun clicked "Confirm & score". Asserts the resume is redacted and re-verifies before anything leaves
 * the server, then extracts (Gemini) and scores the applied role only.
 */
export async function scoreResume(
  resumeId: string,
  generate: GenerateFn = realGenerate, // injectable so the E2E test can capture the outgoing Gemini payload
): Promise<{ status: "scored"; decision: string; score: number }> {
  const store = getStore();
  const resume = await store.getResume(resumeId);
  if (!resume) throw new PipelineError(404, "Resume not found.");
  if (resume.status === "scored") {
    const [s] = await store.getScores(resumeId);
    if (s) return { status: "scored", decision: s.decision, score: s.score };
  }
  if (resume.status === "extracting") throw new PipelineError(409, "Scoring is already in progress.");
  if (resume.status === "redaction_failed") throw new PipelineError(409, "Redaction failed. Fix the name and re-redact before scoring.");
  if (!["redacted", "extraction_failed", "scored"].includes(resume.status)) throw new PipelineError(409, `Cannot score from status ${resume.status}.`);

  const pii = await store.getPii(resumeId);
  if (!pii) throw new PipelineError(404, "Resume not found.");
  const check = verifyRedaction(resume.redacted_text, pii.full_name, pii.redaction_values);
  if (!check.ok) {
    await store.updateResume(resumeId, { status: "redaction_failed" });
    await store.audit("redaction_failed", resumeId, { leak_types: [...new Set(check.leaks.map((l) => l.type))], at: "pre_score" });
    throw new PipelineError(409, "Personal details were found in the redacted text. Scoring was blocked.");
  }

  await store.updateResume(resumeId, { status: "extracting" });
  await store.audit("confirmed", resumeId, { applied_role: resume.applied_role });
  try {
    const out = await extractEvidence({
      resumeId, appliedRole: resume.applied_role, redactedText: resume.redacted_text,
      locationStatus: resume.location_status, piiValues: pii.redaction_values,
    }, generate);
    await store.insertExtraction({
      resume_id: resumeId, model: out.model, prompt_version: out.promptVersion, config_version: CFG.version,
      extraction: out.extraction, raw_response: out.rawResponse, attempts: out.attempts, latency_ms: out.latencyMs,
    });
    await store.audit("extraction_ok", resumeId, { model: out.model, attempts: out.attempts, latency_ms: out.latencyMs });
    const result = evaluateAppliedRole(out.extraction as unknown as Extraction, resume.redacted_text);
    await store.replaceScores(resumeId, [toScoreRow(resumeId, result.applied)]);
    await store.updateResume(resumeId, { status: "scored" });
    await store.audit("scored", resumeId, { role: resume.applied_role, score: result.applied.score, band: result.applied.band, config_version: CFG.version });
    return { status: "scored", decision: DECISION[result.applied.band].label, score: result.applied.score };
  } catch (e) {
    await store.updateResume(resumeId, { status: "extraction_failed" });
    const reason = e instanceof PiiInPayloadError ? "pii_in_payload" : e instanceof ExtractionError ? (e.transient ? "transient" : "invalid") : "error";
    await store.audit("extraction_failed", resumeId, { reason, attempts: (e as ExtractionError).attempts ?? null });
    if (e instanceof PiiInPayloadError) throw new PipelineError(409, "Scoring blocked: personal details detected in the AI request.");
    const msg = e instanceof ExtractionError ? e.message : "Unexpected error during extraction.";
    throw new PipelineError(502, msg, true);
  }
}

/** Re-score from the stored extraction (no AI call), e.g. after the rubric config version changes. */
export async function rescoreFromStored(resumeId: string) {
  const store = getStore();
  const [resume, ext] = await Promise.all([store.getResume(resumeId), store.latestExtraction(resumeId)]);
  if (!resume || !ext) return null;
  const result = evaluateAppliedRole(ext.extraction as Extraction, resume.redacted_text);
  await store.replaceScores(resumeId, [toScoreRow(resumeId, result.applied)]);
  await store.audit("scored", resumeId, { role: resume.applied_role, score: result.applied.score, band: result.applied.band, config_version: CFG.version, rescored: true });
  return result.applied;
}
