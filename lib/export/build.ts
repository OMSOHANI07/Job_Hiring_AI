import "server-only";
import { BAND_LABEL, bonusLabel, DECISION, flagHelp, penaltyLabel, ROLE_LABEL } from "@/lib/decision";
import { CFG } from "@/lib/scoring/config";
import type { Role } from "@/lib/scoring/types";
import type { DashboardRow, ResultView } from "@/lib/views";
import type { Cell } from "./csv";

// Row builders shared by the CSV and XLSX exports, so both formats always carry the same data.

export const CANDIDATE_HEADER = [
  "resume_id", "candidate_name", "email", "phone", "applied_role", "decision", "band", "final_score",
  "criterion_id", "criterion_name", "weight", "level", "evidence_grade", "multiplier", "points", "evidence",
];

export function candidateBreakdownRows(v: ResultView): Cell[][] {
  const d = DECISION[v.finalBand];
  return v.criteria.map((c) => [
    v.identity.resume_id, v.identity.full_name, v.identity.email, v.identity.phone, v.score.role, d.label,
    BAND_LABEL[v.finalBand], v.score.score, c.id, c.name, c.weight, c.level, c.grade, c.multiplier, c.points,
    c.evidence.join(" | "),
  ]);
}

export function candidateSummaryRows(v: ResultView): Cell[][] {
  const rows: Cell[][] = [["section", "id", "detail", "value"]];
  rows.push(["score", "base", "Weighted criteria total", v.score.base]);
  for (const p of v.score.penalties) {
    const pts = CFG.penalties.items.find((i) => i.id === p)?.points ?? 0;
    rows.push(["penalty", p, penaltyLabel(p), pts]);
  }
  rows.push(["penalty", "total", `Penalty total (cap ${CFG.penalties.cap})`, v.score.penalty_total]);
  for (const b of v.score.bonuses) {
    const pts = CFG.bonuses.items.find((i) => i.id === b)?.points ?? 0;
    rows.push(["bonus", b, bonusLabel(b), pts]);
  }
  rows.push(["bonus", "total", `Bonus total (cap +${CFG.bonuses.cap})`, v.score.bonus_total]);
  rows.push(["score", "final", "Final score (clamped 0–100)", v.score.score]);
  for (const g of v.gates) rows.push(["gate", g.id, `${g.name}: ${g.rule}`, g.passed ? "PASS" : "FAIL"]);
  for (const n of v.nonNegotiables) rows.push(["non_negotiable", n.rule, "Required for Shortlist", n.passed ? "PASS" : "FAIL"]);
  rows.push(["eligibility", "dna_triad", "Kargo DNA triad (of 9)", v.score.dna_triad]);
  rows.push(["eligibility", "product_years", "Product experience (years)", v.score.product_years]);
  for (const f of v.floors) rows.push(["floor", f, flagHelp(f), "applied"]);
  for (const f of v.finalFlags) rows.push(["flag", f, flagHelp(f), ""]);
  return rows;
}

export function allCandidatesHeader(role: Role | "all"): string[] {
  const ids = role === "PM" ? CFG.roles.PM.criteria.map((c) => c.id) : role === "SPM" ? CFG.roles.SPM.criteria.map((c) => c.id)
    : [...CFG.roles.PM.criteria, ...CFG.roles.SPM.criteria].map((c) => c.id);
  return [
    "rank", "resume_id", "candidate_name", "email", "phone", "applied_role", "decision", "band", "score", "dna_triad",
    ...ids.map((id) => `${id}_level`), "penalties", "bonuses", "gate_failed", "flags", "scored_at",
  ];
}

export function allCandidatesRows(rows: DashboardRow[], role: Role | "all", blind = false): Cell[][] {
  const header = allCandidatesHeader(role);
  const levelIds = header.filter((h) => h.endsWith("_level")).map((h) => h.replace("_level", ""));
  return rows.map((r) => [
    r.rank, r.resumeId, blind ? "" : r.name, blind ? "" : r.email, blind ? "" : r.phone, ROLE_LABEL[r.appliedRole],
    r.decision, BAND_LABEL[r.band], r.score, r.dnaTriad,
    ...levelIds.map((id) => r.levels[id] ?? ""),
    r.penalties.join(" "), r.bonuses.join(" "), r.gateFailed ?? "", r.flags.join(" "), r.scoredAt,
  ]);
}
