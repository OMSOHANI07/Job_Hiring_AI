import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AuditEvent, BriefRow, DecisionRow, EmailRow, EmailStatus, ExtractionRow, PiiRow, ResumeRow, ScoreRow, Store,
} from "./types";

// Local development store: one JSON file plus an originals folder under .data/ (gitignored, contains PII).
// Not for production: serverless filesystems are not persistent. Use STORAGE_DRIVER=supabase there.

interface Db {
  candidate_pii: PiiRow[];
  resumes: ResumeRow[];
  extractions: ExtractionRow[];
  scores: ScoreRow[];
  briefs: BriefRow[];
  emails: EmailRow[];
  decisions: DecisionRow[];
  audit_log: { id: number; resume_id: string | null; event: AuditEvent; payload: unknown; created_at: string }[];
}

const empty = (): Db => ({
  candidate_pii: [], resumes: [], extractions: [], scores: [], briefs: [], emails: [], decisions: [], audit_log: [],
});

export class LocalStore implements Store {
  readonly driver = "local" as const;
  private file: string;
  private originals: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir = process.env.LOCAL_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data")) {
    this.file = path.join(/*turbopackIgnore: true*/ dir, "db.json");
    this.originals = path.join(/*turbopackIgnore: true*/ dir, "cv-originals");
    mkdirSync(this.originals, { recursive: true, mode: 0o700 });
  }

  private read(): Db {
    try {
      return { ...empty(), ...JSON.parse(readFileSync(this.file, "utf8")) };
    } catch {
      return empty();
    }
  }

  /** Serialise read-modify-write cycles within this process; atomic rename on write. */
  private mutate<T>(fn: (db: Db) => T): Promise<T> {
    const run = this.queue.then(() => {
      const db = this.read();
      const out = fn(db);
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
      renameSync(tmp, this.file);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async idExists(id: string) { return this.read().candidate_pii.some((p) => p.resume_id === id); }
  async findByHash(h: string, role: string) { return this.read().resumes.find((r) => r.cv_hash === h && r.applied_role === role) ?? null; }
  async findByEmailRole(email: string, role: string) {
    const db = this.read();
    const ids = new Set(db.resumes.filter((r) => r.applied_role === role).map((r) => r.resume_id));
    return db.candidate_pii.find((p) => ids.has(p.resume_id) && p.email?.toLowerCase() === email.toLowerCase())?.resume_id ?? null;
  }
  createResume(pii: PiiRow, resume: ResumeRow) {
    return this.mutate((db) => {
      if (db.resumes.some((r) => r.cv_hash === resume.cv_hash && r.applied_role === resume.applied_role)) {
        throw new Error("duplicate key value violates unique constraint (cv_hash, applied_role)");
      }
      db.candidate_pii.push(pii);
      db.resumes.push(resume);
    });
  }
  async getResume(id: string) { return this.read().resumes.find((r) => r.resume_id === id) ?? null; }
  updateResume(id: string, patch: Partial<ResumeRow>) {
    return this.mutate((db) => { const r = db.resumes.find((x) => x.resume_id === id); if (r) Object.assign(r, patch); });
  }
  async getPii(id: string) { return this.read().candidate_pii.find((p) => p.resume_id === id) ?? null; }
  updatePii(id: string, patch: Partial<PiiRow>) {
    return this.mutate((db) => { const p = db.candidate_pii.find((x) => x.resume_id === id); if (p) Object.assign(p, patch); });
  }
  async listPii(ids: string[]) { const s = new Set(ids); return this.read().candidate_pii.filter((p) => s.has(p.resume_id)); }
  async saveOriginal(id: string, ext: string, data: Uint8Array) {
    const name = `${id}.${ext}`;
    writeFileSync(path.join(/*turbopackIgnore: true*/ this.originals, name), data, { mode: 0o600 });
    return `cv-originals/${name}`;
  }
  async getOriginal(storagePath: string) {
    const p = path.join(/*turbopackIgnore: true*/ path.dirname(this.originals), storagePath);
    if (!p.startsWith(this.originals) || !existsSync(p)) return null;
    return new Uint8Array(readFileSync(p));
  }
  insertExtraction(row: Omit<ExtractionRow, "id" | "created_at">) {
    return this.mutate((db) => { db.extractions.push({ ...row, id: randomUUID(), created_at: new Date().toISOString() }); });
  }
  async latestExtraction(id: string) {
    const rows = this.read().extractions.filter((e) => e.resume_id === id);
    return rows[rows.length - 1] ?? null;
  }
  replaceScores(id: string, rows: Omit<ScoreRow, "id" | "created_at">[]) {
    return this.mutate((db) => {
      db.scores = db.scores.filter((s) => s.resume_id !== id);
      const now = new Date().toISOString();
      db.scores.push(...rows.map((r) => ({ ...r, id: randomUUID(), created_at: now })));
    });
  }
  async getScores(id: string) { return this.read().scores.filter((s) => s.resume_id === id); }
  async listScores(role?: string) { return this.read().scores.filter((s) => !role || s.role === role); }
  async listResumes() { return this.read().resumes; }
  saveBrief(row: Omit<BriefRow, "created_at">) {
    return this.mutate((db) => {
      db.briefs = db.briefs.filter((b) => b.resume_id !== row.resume_id);
      db.briefs.push({ ...row, created_at: new Date().toISOString() });
    });
  }
  async getBrief(id: string) { return this.read().briefs.find((b) => b.resume_id === id) ?? null; }
  async listBriefIds() { return this.read().briefs.map((b) => b.resume_id); }
  saveEmailDraft(row: Pick<EmailRow, "resume_id" | "kind" | "subject" | "body" | "model">) {
    return this.mutate((db) => {
      if (db.emails.some((e) => e.resume_id === row.resume_id && (e.status === "sent" || e.status === "sending"))) {
        throw new Error("An email has already been sent for this candidate.");
      }
      db.emails = db.emails.filter((e) => e.resume_id !== row.resume_id);
      const now = new Date().toISOString();
      const email: EmailRow = { ...row, id: randomUUID(), status: "draft", provider_id: null, delivery_mode: null, error: null, created_at: now, updated_at: now, sent_at: null };
      db.emails.push(email);
      return email;
    });
  }
  async getEmail(id: string) { return this.read().emails.find((e) => e.resume_id === id) ?? null; }
  updateEmail(id: string, patch: Partial<Omit<EmailRow, "id" | "resume_id">>) {
    return this.mutate((db) => {
      const e = db.emails.find((x) => x.id === id);
      if (e) Object.assign(e, patch, { updated_at: new Date().toISOString() });
    });
  }
  transitionEmail(id: string, from: EmailStatus[], to: EmailStatus) {
    return this.mutate((db) => {
      const e = db.emails.find((x) => x.id === id);
      if (!e || !from.includes(e.status)) return false;
      e.status = to;
      e.updated_at = new Date().toISOString();
      return true;
    });
  }
  async listEmails() { return this.read().emails; }
  setDecision(id: string, action: DecisionRow["action"]) {
    return this.mutate((db) => {
      db.decisions = db.decisions.filter((d) => d.resume_id !== id);
      db.decisions.push({ resume_id: id, action, created_at: new Date().toISOString() });
    });
  }
  async getDecision(id: string) { return this.read().decisions.find((d) => d.resume_id === id) ?? null; }
  async listDecisions() { return this.read().decisions; }
  audit(event: AuditEvent, resumeId: string | null, payload?: Record<string, unknown>) {
    return this.mutate((db) => {
      db.audit_log.push({ id: db.audit_log.length + 1, resume_id: resumeId, event, payload: payload ?? null, created_at: new Date().toISOString() });
    });
  }
  async listAudit(id: string) {
    return this.read().audit_log.filter((a) => a.resume_id === id).map(({ event, payload, created_at }) => ({ event, payload, created_at }));
  }
}
