import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, ExtractionRow, PiiRow, ResumeRow, ScoreRow, Store } from "./types";

// Supabase store. Uses the service-role key, server-side only. RLS is on with no policies, so the anon key
// can't read anything; see tests/rls-check.ts.

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));

function scoreFromDb(r: Record<string, unknown>): ScoreRow {
  return {
    ...(r as unknown as ScoreRow),
    score: num(r.score) as number,
    base: num(r.base) as number,
    product_years: num(r.product_years) as number,
    penalty_total: num(r.penalty_total) as number,
    bonus_total: num(r.bonus_total) as number,
    dna_evidence_multiplier: num(r.dna_evidence_multiplier) as number,
  };
}

export class SupabaseStore implements Store {
  readonly driver = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`supabase: ${res.error.message}`);
    return res.data;
  }

  async idExists(id: string) {
    const { count, error } = await this.db.from("candidate_pii").select("resume_id", { count: "exact", head: true }).eq("resume_id", id);
    if (error) throw new Error(`supabase: ${error.message}`);
    return (count ?? 0) > 0;
  }
  async findByHash(h: string, role: string) {
    return this.check(await this.db.from("resumes").select("*").eq("cv_hash", h).eq("applied_role", role).maybeSingle()) as ResumeRow | null;
  }
  async findByEmailRole(email: string, role: string) {
    const pii = this.check(await this.db.from("candidate_pii").select("resume_id").eq("email", email.toLowerCase())) as { resume_id: string }[];
    if (!pii.length) return null;
    const r = this.check(await this.db.from("resumes").select("resume_id").in("resume_id", pii.map((p) => p.resume_id)).eq("applied_role", role).limit(1));
    return (r as { resume_id: string }[])[0]?.resume_id ?? null;
  }
  async createResume(pii: PiiRow, resume: ResumeRow) {
    this.check(await this.db.from("candidate_pii").insert(pii));
    const res = await this.db.from("resumes").insert(resume);
    if (res.error) {
      await this.db.from("candidate_pii").delete().eq("resume_id", pii.resume_id);
      throw new Error(`supabase: ${res.error.message}`);
    }
  }
  async getResume(id: string) {
    return this.check(await this.db.from("resumes").select("*").eq("resume_id", id).maybeSingle()) as ResumeRow | null;
  }
  async updateResume(id: string, patch: Partial<ResumeRow>) { this.check(await this.db.from("resumes").update(patch).eq("resume_id", id)); }
  async getPii(id: string) {
    return this.check(await this.db.from("candidate_pii").select("*").eq("resume_id", id).maybeSingle()) as PiiRow | null;
  }
  async updatePii(id: string, patch: Partial<PiiRow>) { this.check(await this.db.from("candidate_pii").update(patch).eq("resume_id", id)); }
  async listPii(ids: string[]) {
    if (!ids.length) return [];
    return this.check(await this.db.from("candidate_pii").select("*").in("resume_id", ids)) as PiiRow[];
  }
  async saveOriginal(id: string, ext: string, data: Uint8Array, contentType: string) {
    const name = `${id}.${ext}`;
    const { error } = await this.db.storage.from("cv-originals").upload(name, data, { contentType, upsert: true });
    if (error) throw new Error(`supabase storage: ${error.message}`);
    return `cv-originals/${name}`;
  }
  async insertExtraction(row: Omit<ExtractionRow, "id" | "created_at">) { this.check(await this.db.from("extractions").insert(row)); }
  async latestExtraction(id: string) {
    return this.check(
      await this.db.from("extractions").select("*").eq("resume_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ) as ExtractionRow | null;
  }
  async replaceScores(id: string, rows: Omit<ScoreRow, "id" | "created_at">[]) {
    this.check(await this.db.from("scores").delete().eq("resume_id", id));
    if (rows.length) this.check(await this.db.from("scores").insert(rows));
  }
  async getScores(id: string) {
    return (this.check(await this.db.from("scores").select("*").eq("resume_id", id)) as Record<string, unknown>[]).map(scoreFromDb);
  }
  async listScores(role?: string) {
    let q = this.db.from("scores").select("*");
    if (role) q = q.eq("role", role);
    return (this.check(await q) as Record<string, unknown>[]).map(scoreFromDb);
  }
  async listResumes() { return this.check(await this.db.from("resumes").select("*")) as ResumeRow[]; }
  async audit(event: AuditEvent, resumeId: string | null, payload?: Record<string, unknown>) {
    this.check(await this.db.from("audit_log").insert({ event, resume_id: resumeId, payload: payload ?? null }));
  }
  async listAudit(id: string) {
    return this.check(
      await this.db.from("audit_log").select("event,payload,created_at").eq("resume_id", id).order("id"),
    ) as { event: AuditEvent; payload: unknown; created_at: string }[];
  }
}
