import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type {
  AuditEvent, BriefRow, DecisionRow, EmailRow, EmailStatus, ExtractionRow, PiiRow, ResumeRow, ScoreRow, Store,
} from "./types";

// Neon Postgres store (HTTP driver: works locally and on serverless without a connection pool).
// Server-side only: DATABASE_URL never reaches the browser. Schema: db/neon/0001_init.sql.

type Row = Record<string, unknown>;

/** Normalise driver types: numeric -> number, timestamptz -> ISO string. */
function fix<T>(r: Row, numeric: string[] = []): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    out[k] = v instanceof Date ? v.toISOString() : numeric.includes(k) && v !== null ? Number(v) : v;
  }
  return out as T;
}
const SCORE_NUMERIC = ["score", "base", "penalty_total", "bonus_total", "product_years", "dna_evidence_multiplier"];
const j = (v: unknown) => JSON.stringify(v ?? null);

export class NeonStore implements Store {
  readonly driver = "neon" as const;
  private sql: NeonQueryFunction<false, false>;

  constructor(url: string) {
    this.sql = neon(url);
  }

  private q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    return this.sql.query(text, params) as Promise<T[]>;
  }

  async idExists(id: string) {
    return (await this.q("select 1 from candidate_pii where resume_id = $1", [id])).length > 0;
  }
  async findByHash(h: string, role: string) {
    const [r] = await this.q("select * from resumes where cv_hash = $1 and applied_role = $2", [h, role]);
    return r ? fix<ResumeRow>(r) : null;
  }
  async findByEmailRole(email: string, role: string) {
    const [r] = await this.q<{ resume_id: string }>(
      "select p.resume_id from candidate_pii p join resumes r using (resume_id) where p.email = $1 and r.applied_role = $2 limit 1",
      [email.toLowerCase(), role],
    );
    return r?.resume_id ?? null;
  }
  async createResume(pii: PiiRow, resume: ResumeRow) {
    await this.sql.transaction([
      this.sql.query(
        `insert into candidate_pii (resume_id, full_name, email, phone, links, location_raw, redaction_values, created_at)
         values ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8)`,
        [pii.resume_id, pii.full_name, pii.email, pii.phone, j(pii.links), pii.location_raw, j(pii.redaction_values), pii.created_at],
      ),
      this.sql.query(
        `insert into resumes (resume_id, applied_role, file_name, file_type, storage_path, cv_hash, redacted_text,
           redaction_counts, location_status, status, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
        [resume.resume_id, resume.applied_role, resume.file_name, resume.file_type, resume.storage_path, resume.cv_hash,
         resume.redacted_text, j(resume.redaction_counts), resume.location_status, resume.status, resume.created_at],
      ),
    ]);
  }
  async getResume(id: string) {
    const [r] = await this.q("select * from resumes where resume_id = $1", [id]);
    return r ? fix<ResumeRow>(r) : null;
  }
  async updateResume(id: string, patch: Partial<ResumeRow>) {
    await this.update("resumes", "resume_id", id, patch, ["redaction_counts"]);
  }
  async getPii(id: string) {
    const [r] = await this.q("select * from candidate_pii where resume_id = $1", [id]);
    return r ? fix<PiiRow>(r) : null;
  }
  async updatePii(id: string, patch: Partial<PiiRow>) {
    await this.update("candidate_pii", "resume_id", id, patch, ["links", "redaction_values"]);
  }
  async listPii(ids: string[]) {
    if (!ids.length) return [];
    return (await this.q("select * from candidate_pii where resume_id = any($1)", [ids])).map((r) => fix<PiiRow>(r));
  }
  async saveOriginal(id: string, ext: string, data: Uint8Array, contentType: string) {
    await this.q(
      `insert into cv_originals (resume_id, ext, content_type, data) values ($1,$2,$3,decode($4,'base64'))
       on conflict (resume_id) do update set data = excluded.data, ext = excluded.ext, content_type = excluded.content_type`,
      [id, ext, contentType, Buffer.from(data).toString("base64")],
    );
    return `db:cv_originals/${id}.${ext}`;
  }
  async getOriginal(storagePath: string) {
    const id = storagePath.replace(/^db:cv_originals\//, "").replace(/\.(pdf|docx)$/, "");
    const [r] = await this.q<{ b64: string }>("select encode(data,'base64') as b64 from cv_originals where resume_id = $1", [id]);
    return r ? new Uint8Array(Buffer.from(r.b64, "base64")) : null;
  }
  async insertExtraction(row: Omit<ExtractionRow, "id" | "created_at">) {
    await this.q(
      `insert into extractions (resume_id, model, prompt_version, config_version, extraction, raw_response, attempts, latency_ms)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [row.resume_id, row.model, row.prompt_version, row.config_version, j(row.extraction), row.raw_response, row.attempts, row.latency_ms],
    );
  }
  async latestExtraction(id: string) {
    const [r] = await this.q("select * from extractions where resume_id = $1 order by created_at desc limit 1", [id]);
    return r ? fix<ExtractionRow>(r) : null;
  }
  async replaceScores(id: string, rows: Omit<ScoreRow, "id" | "created_at">[]) {
    const cols = ["resume_id", "role", "is_applied_role", "score", "band", "decision", "levels", "points", "evidence_multipliers",
      "base", "penalties", "bonuses", "penalty_total", "bonus_total", "product_years", "gate_failed", "non_negotiables_failed",
      "dna_triad", "dna_evidence_multiplier", "flags", "explanation", "interview_probes", "config_version"] as const;
    const jsonCols = new Set(["levels", "points", "evidence_multipliers", "penalties", "bonuses", "non_negotiables_failed", "flags", "explanation", "interview_probes"]);
    const ph = cols.map((c, i) => `$${i + 1}${jsonCols.has(c) ? "::jsonb" : ""}`).join(",");
    await this.sql.transaction([
      this.sql.query("delete from scores where resume_id = $1", [id]),
      ...rows.map((r) => this.sql.query(
        `insert into scores (${cols.join(",")}) values (${ph})`,
        cols.map((c) => (jsonCols.has(c) ? j(r[c]) : r[c])),
      )),
    ]);
  }
  async getScores(id: string) {
    return (await this.q("select * from scores where resume_id = $1", [id])).map((r) => fix<ScoreRow>(r, SCORE_NUMERIC));
  }
  async listScores(role?: string) {
    const rows = role ? await this.q("select * from scores where role = $1", [role]) : await this.q("select * from scores");
    return rows.map((r) => fix<ScoreRow>(r, SCORE_NUMERIC));
  }
  async listResumes() { return (await this.q("select * from resumes")).map((r) => fix<ResumeRow>(r)); }

  async saveBrief(row: Omit<BriefRow, "created_at">) {
    await this.q(
      `insert into interview_briefs (resume_id, brief, model, prompt_version) values ($1,$2::jsonb,$3,$4)
       on conflict (resume_id) do update set brief = excluded.brief, model = excluded.model,
         prompt_version = excluded.prompt_version, created_at = now()`,
      [row.resume_id, j(row.brief), row.model, row.prompt_version],
    );
  }
  async getBrief(id: string) {
    const [r] = await this.q("select * from interview_briefs where resume_id = $1", [id]);
    return r ? fix<BriefRow>(r) : null;
  }
  async listBriefIds() {
    return (await this.q<{ resume_id: string }>("select resume_id from interview_briefs")).map((r) => r.resume_id);
  }
  async saveEmailDraft(row: Pick<EmailRow, "resume_id" | "kind" | "subject" | "body" | "model">) {
    const [sent] = await this.q("select 1 from emails where resume_id = $1 and status in ('sent','sending')", [row.resume_id]);
    if (sent) throw new Error("An email has already been sent for this candidate.");
    const [r] = await this.q(
      `insert into emails (resume_id, kind, subject, body, model, status) values ($1,$2,$3,$4,$5,'draft')
       on conflict (resume_id) do update set kind = excluded.kind, subject = excluded.subject, body = excluded.body,
         model = excluded.model, status = 'draft', error = null, provider_id = null, delivery_mode = null, updated_at = now()
       where emails.status not in ('sent','sending')
       returning *`,
      [row.resume_id, row.kind, row.subject, row.body, row.model],
    );
    if (!r) throw new Error("An email has already been sent for this candidate.");
    return fix<EmailRow>(r);
  }
  async getEmail(id: string) {
    const [r] = await this.q("select * from emails where resume_id = $1", [id]);
    return r ? fix<EmailRow>(r) : null;
  }
  async updateEmail(id: string, patch: Partial<Omit<EmailRow, "id" | "resume_id">>) {
    await this.update("emails", "id", id, { ...patch, updated_at: new Date().toISOString() }, []);
  }
  async transitionEmail(id: string, from: EmailStatus[], to: EmailStatus) {
    const rows = await this.q("update emails set status = $1, updated_at = now() where id = $2 and status = any($3) returning id", [to, id, from]);
    return rows.length === 1;
  }
  async listEmails() { return (await this.q("select * from emails")).map((r) => fix<EmailRow>(r)); }
  async setDecision(id: string, action: DecisionRow["action"]) {
    await this.q(
      "insert into decisions (resume_id, action) values ($1,$2) on conflict (resume_id) do update set action = excluded.action, created_at = now()",
      [id, action],
    );
  }
  async getDecision(id: string) {
    const [r] = await this.q("select * from decisions where resume_id = $1", [id]);
    return r ? fix<DecisionRow>(r) : null;
  }
  async listDecisions() { return (await this.q("select * from decisions")).map((r) => fix<DecisionRow>(r)); }

  async audit(event: AuditEvent, resumeId: string | null, payload?: Record<string, unknown>) {
    await this.q("insert into audit_log (resume_id, event, payload) values ($1,$2,$3::jsonb)", [resumeId, event, j(payload ?? null)]);
  }
  async listAudit(id: string) {
    return (await this.q("select event, payload, created_at from audit_log where resume_id = $1 order by id", [id]))
      .map((r) => fix<{ event: AuditEvent; payload: unknown; created_at: string }>(r));
  }

  /** Generic partial update with an allow-list of jsonb columns. Column names come from code, never from input. */
  private async update(table: string, key: string, id: string, patch: Row, jsonCols: string[]) {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (!entries.length) return;
    const sets = entries.map(([k], i) => `${k} = $${i + 2}${jsonCols.includes(k) ? "::jsonb" : ""}`);
    await this.q(`update ${table} set ${sets.join(", ")} where ${key} = $1`, [id, ...entries.map(([k, v]) => (jsonCols.includes(k) ? j(v) : v))]);
  }
}
