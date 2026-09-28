import "server-only";
import { CFG, RULE_THRESHOLDS as T } from "./config";
import { evidenceFound } from "./evidence";
import { explain, probes } from "./explain";
import { deriveLevels } from "./levels";
import { pyRound } from "./pymath";
import type { AppliedEvaluation, Band, CandidateResult, Evaluation, Extraction, Role, TimelineEntry } from "./types";

export const BAND_ORDER: Band[] = ["priority_shortlist", "shortlist", "review", "not_shortlisted"];

function months(start: string, end: string, asOf: string): number {
  const e = end === "present" ? asOf : end;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = e.split("-").map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

/** PM/APM/Product Owner titles count 100%; product decisions owned without a PM count 50%. */
export function productYears(timeline: TimelineEntry[], asOf: string = CFG.as_of): number {
  let total = 0.0;
  for (const r of timeline) {
    const m = months(r.start, r.end, asOf);
    if (r.is_pm_title) total += m;
    else if (r.owns_product_decisions_without_pm) total += 0.5 * m;
  }
  return pyRound(total / 12, 1);
}

/** Score one extraction against one role. cvText = null skips evidence validation (calibration fixtures). */
export function evaluate(x: Extraction, role: Role, cvText: string | null): Evaluation {
  const rc = CFG.roles[role];
  const crit = Object.fromEntries(rc.criteria.map((c) => [c.id, c]));
  const flags: string[] = [];

  const levels = deriveLevels(x, role);

  // Evidence validation: no traceable evidence -> level 0
  if (cvText !== null) {
    for (const [cid, lvl] of Object.entries(levels)) {
      if (lvl > 0 && !evidenceFound(x.evidence[cid] ?? [], cvText)) {
        levels[cid] = 0;
        flags.push(`evidence_not_found:${cid}`);
      }
    }
  }

  // Weighted points with evidence-grade multipliers
  const grades = x.evidence_grades ?? {};
  const points: Record<string, number> = {};
  const mults: Record<string, number> = {};
  for (const [cid, lvl] of Object.entries(levels)) {
    const g = grades[cid] ?? "C";
    const m = lvl > 0 ? CFG.evidence_grades[g].multiplier : 0.0;
    mults[cid] = m;
    points[cid] = pyRound(((crit[cid].weight * lvl) / 3) * m, 2);
  }
  let base = 0;
  for (const v of Object.values(points)) base += v;

  // Penalties
  const style = x.cv_style;
  const own = x.ownership;
  const opsId = role === "PM" ? "P1" : "S1";
  const ownLvl = role === "PM" ? levels.P3 : levels.S2;
  const anyCandour = x.shipping.killed_or_reversed || x.candour.reversed_or_failure_documented;
  const checks: Record<string, boolean> = {
    X1: style.credential_led,
    X2: style.domain_claimed && levels[opsId] <= 1,
    X3: own.team_framed_only && ownLvl <= 1,
    X4: style.framework_terms_count >= 4 && !anyCandour,
    X5_PM: role === "PM" && style.maintenance_only,
    X5_SPM: role === "SPM" && style.feature_level_only,
  };
  let penTotal = 0;
  const appliedPen: string[] = [];
  for (const p of CFG.penalties.items) {
    if (checks[p.id]) {
      penTotal += p.points;
      appliedPen.push(p.id);
    }
  }
  penTotal = Math.max(penTotal, CFG.penalties.cap);

  // Bonuses
  const o = x.ops;
  const bchecks: Record<string, boolean> = {
    B1: o.ops_before_current_function && o.mode === "hands_on",
    B2: o.worked_at_forwarder_or_3pl && o.mode === "hands_on",
  };
  let bonTotal = 0;
  const appliedBon: string[] = [];
  for (const b of CFG.bonuses.items) {
    if (bchecks[b.id]) {
      bonTotal += b.points;
      appliedBon.push(b.id);
    }
  }
  bonTotal = Math.min(bonTotal, CFG.bonuses.cap);

  const score = pyRound(Math.min(100.0, Math.max(0.0, base + penTotal + bonTotal)), 1);

  // Gates
  const years = productYears(x.timeline);
  let gateFail: string | null = null;
  if (role === "PM") {
    if (years < T.PM.min_product_years) gateFail = "K1_experience";
    else if (years > T.PM.over_experience_years) flags.push("consider_for:SPM");
    if (levels.P4 < 1) gateFail = gateFail ?? "K3_not_shipped";
  } else {
    if (years < T.SPM.min_product_years) gateFail = "K1_experience";
    else if (years > T.SPM.check_level_fit_years) flags.push("check_level_fit");
    if (!(own.area_owner || own.sole_owner)) gateFail = gateFail ?? "K3_no_area_ownership";
    if (levels.S4 < 1) gateFail = gateFail ?? "K4_no_integration";
  }
  if (x.location_status === "explicitly_unwilling") gateFail = gateFail ?? "K2_location";
  else if (x.location_status === "not_stated") flags.push("confirm_relocation");

  // Non-negotiables
  const dna = rc.dna_criteria;
  const triad = dna.reduce((s, c) => s + levels[c], 0);
  const nn: Record<string, boolean> =
    role === "PM"
      ? { "P1>=2": levels.P1 >= 2, "P3>=2": levels.P3 >= 2, "P4>=2": levels.P4 >= 2, "triad>=7": triad >= 7 }
      : { "S1>=2": levels.S1 >= 2, "S2>=2": levels.S2 >= 2, "S4>=2": levels.S4 >= 2, "triad>=7": triad >= 7 };
  const nnFailed = Object.entries(nn).filter(([, ok]) => !ok).map(([k]) => k);
  const dnaMult = pyRound(dna.reduce((s, c) => s + mults[c], 0) / dna.length, 3);
  const consistency = x.consistency_flags ?? [];

  // Band
  const B = CFG.bands;
  let band: Band;
  if (gateFail) band = "not_shortlisted";
  else if (score >= B.priority_shortlist.min_score && !nnFailed.length && dnaMult >= T.priority_min_dna_multiplier && !consistency.length)
    band = "priority_shortlist";
  else if (score >= B.shortlist.min_score && !nnFailed.length) band = "shortlist";
  else if (score >= B.review.min_score) band = "review";
  else band = "not_shortlisted";

  // PM over-experience cap
  if (role === "PM" && flags.includes("consider_for:SPM") && (band === "priority_shortlist" || band === "shortlist")) band = "review";

  // Floors
  for (const f of rc.floors) {
    if (levels[f.criterion] === f.if_level && BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf(f.cap_band)) {
      band = f.cap_band;
      flags.push(`floor:${f.criterion}`);
    }
  }

  return {
    role, score, band, levels, points,
    evidence_multipliers: mults, base: pyRound(base, 2),
    penalties: appliedPen, penalty_total: penTotal,
    bonuses: appliedBon, bonus_total: bonTotal,
    product_years: years, gate_failed: gateFail,
    non_negotiables_failed: nnFailed, dna_triad: triad,
    dna_evidence_multiplier: dnaMult, flags: [...flags, ...consistency],
  };
}

function finalize(a: Evaluation): AppliedEvaluation {
  const out = a as AppliedEvaluation;
  out.explanation = explain(out);
  out.interview_probes = probes(out);
  out.email = CFG.email_policy[out.band];
  return out;
}

/**
 * Reference evaluate_candidate(): scores both roles and applies cross-role routing.
 * Kept for parity with the Python engine; the app itself uses evaluateAppliedRole().
 */
export function evaluateCandidate(x: Extraction, cvText: string | null = null): CandidateResult {
  const applied = x.applied_role;
  const other: Role = applied === "PM" ? "SPM" : "PM";
  const a = evaluate(x, applied, cvText) as AppliedEvaluation;
  const o = evaluate(x, other, cvText);
  const top: Band[] = ["priority_shortlist", "shortlist"];
  if (!top.includes(a.band) && top.includes(o.band)) {
    a.flags.push(`consider_for:${other}`);
    if (a.band === "not_shortlisted") a.band = "review";
  }
  a.other_role = { role: other, score: o.score, band: o.band };
  return { candidate_id: x.candidate_id, applied: finalize(a), other: o };
}

/**
 * Product decision (Arjun, 2026-09-28): a CV is scored only against the rubric of the role it was
 * submitted for. No other-role score and no cross-role routing.
 */
export function evaluateAppliedRole(x: Extraction, cvText: string | null): CandidateResult {
  const a = evaluate(x, x.applied_role, cvText);
  return { candidate_id: x.candidate_id, applied: finalize(a) };
}
