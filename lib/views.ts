import "server-only";
import { getStore } from "@/lib/db/client";
import { getDisplayIdentities, getDisplayIdentity, type DisplayIdentity } from "@/lib/db/queries";
import type { ExtractionRow, ResumeRow, ScoreRow } from "@/lib/db/types";
import { DECISION, nextAction, type NextAction } from "@/lib/decision";
import { CFG, RULE_THRESHOLDS } from "@/lib/scoring/config";
import { rankRole } from "@/lib/scoring/rank";
import type { AppliedEvaluation, Band, CandidateResult, Role } from "@/lib/scoring/types";

export interface CriterionView {
  id: string; name: string; block: string; weight: number; level: number; grade: "A" | "B" | "C" | "–";
  multiplier: number; points: number; evidence: string[]; levelRule: string;
}

export interface ResultView {
  identity: DisplayIdentity;
  resume: Omit<ResumeRow, "redacted_text">;
  score: ScoreRow;
  /** Band after capacity caps across this role's candidates (computed at read time). */
  finalBand: Band;
  finalFlags: string[];
  rank: number;
  roleCount: number;
  criteria: CriterionView[];
  gates: { id: string; name: string; rule: string; passed: boolean }[];
  nonNegotiables: { rule: string; passed: boolean }[];
  floors: string[];
  extraction: ExtractionRow | null;
}

/** ScoreRow -> the engine's CandidateResult shape, so rankRole() can apply capacity caps at read time. */
function asCandidate(s: ScoreRow): CandidateResult {
  const applied = {
    role: s.role, score: s.score, band: s.band, levels: s.levels, points: s.points,
    evidence_multipliers: s.evidence_multipliers, base: s.base, penalties: s.penalties, penalty_total: s.penalty_total,
    bonuses: s.bonuses, bonus_total: s.bonus_total, product_years: s.product_years, gate_failed: s.gate_failed,
    non_negotiables_failed: s.non_negotiables_failed, dna_triad: s.dna_triad,
    dna_evidence_multiplier: s.dna_evidence_multiplier, flags: [...s.flags],
    explanation: s.explanation, interview_probes: s.interview_probes, email: CFG.email_policy[s.band],
  } satisfies AppliedEvaluation;
  return { candidate_id: s.resume_id, applied };
}

export interface DashboardRow {
  rank: number;
  resumeId: string;
  name: string;
  email: string | null;
  phone: string | null;
  appliedRole: Role;
  band: Band;
  preCapacityBand: Band;
  decision: string;
  score: number;
  dnaTriad: number;
  flags: string[];
  levels: Record<string, number>;
  penalties: string[];
  bonuses: string[];
  gateFailed: string | null;
  scoredAt: string;
  nextAction: NextAction;
  decidedByArjun: boolean;
  hasBrief: boolean;
  outreach: { kind: "invite" | "rejection"; status: "draft" | "sending" | "sent" | "failed"; sentAt: string | null; mode: string | null } | null;
}

/** Ranked, capacity-capped list for one role. Each CV appears only under the role it was submitted for. */
export async function getRoleRanking(role: Role): Promise<{ rows: DashboardRow[]; warnings: string[] }> {
  const store = getStore();
  const scores = (await store.listScores(role)).filter((s) => s.is_applied_role);
  const byId = new Map(scores.map((s) => [s.resume_id, s]));
  const { ranked, warnings } = rankRole(scores.map(asCandidate));
  const [ids, emails, decisions, briefIds] = await Promise.all([
    getDisplayIdentities(ranked.map((r) => r.candidate_id)), store.listEmails(), store.listDecisions(), store.listBriefIds(),
  ]);
  const emailBy = new Map(emails.map((e) => [e.resume_id, e]));
  const decisionBy = new Map(decisions.map((d) => [d.resume_id, d]));
  const briefSet = new Set(briefIds);
  const rows = ranked.map((r, i): DashboardRow => {
    const s = byId.get(r.candidate_id)!;
    const who = ids.get(r.candidate_id);
    return {
      rank: i + 1, resumeId: r.candidate_id, name: who?.full_name ?? "(unknown)", email: who?.email ?? null, phone: who?.phone ?? null,
      appliedRole: role, band: r.applied.band, preCapacityBand: s.band, decision: DECISION[r.applied.band].label,
      score: r.applied.score, dnaTriad: r.applied.dna_triad, flags: r.applied.flags, levels: r.applied.levels,
      penalties: r.applied.penalties, bonuses: r.applied.bonuses, gateFailed: r.applied.gate_failed, scoredAt: s.created_at,
      nextAction: nextAction(r.applied.band, decisionBy.get(r.candidate_id) ?? null),
      decidedByArjun: decisionBy.has(r.candidate_id),
      hasBrief: briefSet.has(r.candidate_id),
      outreach: (() => {
        const e = emailBy.get(r.candidate_id);
        return e ? { kind: e.kind, status: e.status, sentAt: e.sent_at, mode: e.delivery_mode } : null;
      })(),
    };
  });
  return { rows, warnings: scores.length ? warnings : [] };
}

export async function getResultView(resumeId: string): Promise<ResultView | null> {
  const store = getStore();
  const [resume, scores, identity, extraction] = await Promise.all([
    store.getResume(resumeId), store.getScores(resumeId), getDisplayIdentity(resumeId), store.latestExtraction(resumeId),
  ]);
  const score = scores.find((s) => s.is_applied_role);
  if (!resume || !score || !identity) return null;
  const { rows } = await getRoleRanking(resume.applied_role);
  const me = rows.find((r) => r.resumeId === resumeId);
  const rc = CFG.roles[score.role];
  const ev = (extraction?.extraction ?? {}) as { evidence?: Record<string, string[]>; evidence_grades?: Record<string, "A" | "B" | "C"> };
  const criteria = rc.criteria.map((c): CriterionView => ({
    id: c.id, name: c.name, block: c.block === "Kargo DNA" ? "Kargo DNA" : "Craft", weight: c.weight,
    level: score.levels[c.id], grade: score.levels[c.id] > 0 ? (ev.evidence_grades?.[c.id] ?? "C") : "–",
    multiplier: score.evidence_multipliers[c.id], points: score.points[c.id],
    evidence: ev.evidence?.[c.id] ?? [], levelRule: c.level_rules[String(score.levels[c.id]) as "0" | "1" | "2" | "3"],
  }));
  // Each gate evaluated independently for display (the engine records only the first failure).
  const own = (extraction?.extraction as { ownership?: { area_owner?: boolean; sole_owner?: boolean } } | undefined)?.ownership;
  const T = RULE_THRESHOLDS;
  const gatePass: Record<string, boolean> = score.role === "PM"
    ? { K1: score.product_years >= T.PM.min_product_years, K2: resume.location_status !== "explicitly_unwilling", K3: score.levels.P4 >= 1 }
    : { K1: score.product_years >= T.SPM.min_product_years, K2: resume.location_status !== "explicitly_unwilling",
        K3: !!(own?.area_owner || own?.sole_owner), K4: score.levels.S4 >= 1 };
  const gates = rc.gates.map((g) => ({ id: g.id, name: g.name, rule: g.rule, passed: gatePass[g.id] ?? true }));
  const nnMap: Record<string, string> = score.role === "PM"
    ? { "P1 >= 2": "P1>=2", "P3 >= 2": "P3>=2", "P4 >= 2": "P4>=2", "P1 + P2 + P3 >= 7": "triad>=7" }
    : { "S1 >= 2": "S1>=2", "S2 >= 2": "S2>=2", "S4 >= 2": "S4>=2", "S1 + S2 + S3 >= 7": "triad>=7" };
  const nonNegotiables = rc.non_negotiables.map((n) => ({ rule: n.rule, passed: !score.non_negotiables_failed.includes(nnMap[n.rule] ?? n.rule) }));
  const { redacted_text: _omit, ...resumeMeta } = resume;
  void _omit;
  return {
    identity, resume: resumeMeta, score, extraction,
    finalBand: me?.band ?? score.band, finalFlags: me?.flags ?? score.flags,
    rank: me?.rank ?? 0, roleCount: rows.length, criteria, gates, nonNegotiables,
    floors: score.flags.filter((f) => f.startsWith("floor:")),
  };
}
