import type { PiiType } from "@/lib/pii/detect";
import type { Band, Explanation, LocationStatus, Role } from "@/lib/scoring/types";

// Row shapes mirror supabase/migrations/0001_init.sql.

export type ResumeStatus = "redacted" | "redaction_failed" | "extracting" | "extraction_failed" | "scored";

export interface PiiRow {
  resume_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  links: string[];
  location_raw: string | null;
  redaction_values: { type: PiiType; value: string }[];
  created_at: string;
}

export interface ResumeRow {
  resume_id: string;
  applied_role: Role;
  file_name: string;
  file_type: "pdf" | "docx";
  storage_path: string | null;
  cv_hash: string;
  redacted_text: string;
  redaction_counts: Record<PiiType, number>;
  location_status: LocationStatus;
  status: ResumeStatus;
  created_at: string;
}

export interface ExtractionRow {
  id: string;
  resume_id: string;
  model: string;
  prompt_version: string;
  config_version: string;
  extraction: unknown;
  raw_response: string | null;
  attempts: number;
  latency_ms: number | null;
  created_at: string;
}

export interface ScoreRow {
  id: string;
  resume_id: string;
  role: Role;
  is_applied_role: boolean;
  score: number;
  band: Band; // pre-capacity band from evaluate()
  decision: string;
  levels: Record<string, number>;
  points: Record<string, number>;
  evidence_multipliers: Record<string, number>;
  base: number;
  penalties: string[];
  bonuses: string[];
  product_years: number;
  gate_failed: string | null;
  non_negotiables_failed: string[];
  dna_triad: number;
  flags: string[];
  explanation: Explanation;
  interview_probes: string[];
  config_version: string;
  created_at: string;
  // additions to the spec's table: needed to rank and to reproduce the breakdown without re-scoring
  dna_evidence_multiplier: number;
  penalty_total: number;
  bonus_total: number;
}

export type AuditEvent =
  | "uploaded" | "redacted" | "redaction_failed" | "confirmed" | "extraction_ok" | "extraction_failed"
  | "scored" | "exported" | "duplicate" | "re_redacted" | "login_failed"
  | "brief_generated" | "brief_failed" | "email_drafted" | "email_edited" | "email_sent" | "email_failed" | "decision_recorded";

/** Interview brief generated from redacted inputs only. Contains no PII. */
export interface BriefRow {
  resume_id: string;
  brief: InterviewBrief;
  model: string;
  prompt_version: string;
  created_at: string;
}

export interface InterviewBrief {
  summary: string;
  strengths: { criterion: string; point: string; evidence: string }[];
  risks: { criterion: string; point: string }[];
  questions: { criterion: string; question: string; listen_for: string }[];
  logistics: string[];
}

export type EmailKind = "invite" | "rejection";
export type EmailStatus = "draft" | "sending" | "sent" | "failed";

/**
 * Email draft. Stored as a template with [CANDIDATE_FIRST_NAME] and the model never sees the name;
 * the real name and address are merged in only at send time.
 */
export interface EmailRow {
  id: string;
  resume_id: string;
  kind: EmailKind;
  subject: string;
  body: string;
  status: EmailStatus;
  model: string | null;
  provider_id: string | null;
  delivery_mode: "redirect" | "live" | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

/** Arjun's own call. The system recommends; this is the decision. */
export interface DecisionRow {
  resume_id: string;
  action: "invite" | "reject";
  created_at: string;
}

export interface Store {
  readonly driver: "local" | "supabase" | "neon";
  idExists(resumeId: string): Promise<boolean>;
  findByHash(cvHash: string, role: Role): Promise<ResumeRow | null>;
  findByEmailRole(email: string, role: Role): Promise<string | null>;
  createResume(pii: PiiRow, resume: ResumeRow): Promise<void>;
  getResume(resumeId: string): Promise<ResumeRow | null>;
  updateResume(resumeId: string, patch: Partial<ResumeRow>): Promise<void>;
  getPii(resumeId: string): Promise<PiiRow | null>;
  updatePii(resumeId: string, patch: Partial<PiiRow>): Promise<void>;
  listPii(resumeIds: string[]): Promise<PiiRow[]>;
  saveOriginal(resumeId: string, ext: string, data: Uint8Array, contentType: string): Promise<string>;
  getOriginal(storagePath: string): Promise<Uint8Array | null>;
  insertExtraction(row: Omit<ExtractionRow, "id" | "created_at">): Promise<void>;
  latestExtraction(resumeId: string): Promise<ExtractionRow | null>;
  replaceScores(resumeId: string, rows: Omit<ScoreRow, "id" | "created_at">[]): Promise<void>;
  getScores(resumeId: string): Promise<ScoreRow[]>;
  listScores(role?: Role): Promise<ScoreRow[]>;
  listResumes(): Promise<ResumeRow[]>;
  saveBrief(row: Omit<BriefRow, "created_at">): Promise<void>;
  getBrief(resumeId: string): Promise<BriefRow | null>;
  /** One current draft per resume: replaces any unsent draft. */
  saveEmailDraft(row: Pick<EmailRow, "resume_id" | "kind" | "subject" | "body" | "model">): Promise<EmailRow>;
  getEmail(resumeId: string): Promise<EmailRow | null>;
  updateEmail(id: string, patch: Partial<Omit<EmailRow, "id" | "resume_id">>): Promise<void>;
  /** Atomically move an email from one status to another; false if it wasn't in `from` (prevents double send). */
  transitionEmail(id: string, from: EmailStatus[], to: EmailStatus): Promise<boolean>;
  listEmails(): Promise<EmailRow[]>;
  setDecision(resumeId: string, action: DecisionRow["action"]): Promise<void>;
  getDecision(resumeId: string): Promise<DecisionRow | null>;
  listDecisions(): Promise<DecisionRow[]>;
  listBriefIds(): Promise<string[]>;
  audit(event: AuditEvent, resumeId: string | null, payload?: Record<string, unknown>): Promise<void>;
  listAudit(resumeId: string): Promise<{ event: AuditEvent; payload: unknown; created_at: string }[]>;
}
