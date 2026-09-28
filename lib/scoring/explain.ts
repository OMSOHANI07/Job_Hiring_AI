import "server-only";
import { CFG } from "./config";
import type { Evaluation, Explanation } from "./types";

/** The two strongest criteria plus whatever held the candidate back. */
export function explain(a: Evaluation): Explanation {
  const crit = Object.fromEntries(CFG.roles[a.role].criteria.map((c) => [c.id, c]));
  const strongest = Object.keys(a.points)
    .sort((c1, c2) => a.points[c2] - a.points[c1])
    .slice(0, 2);
  const binding: string[] = [];
  if (a.gate_failed) binding.push(`gate ${a.gate_failed}`);
  binding.push(...a.non_negotiables_failed.map((n) => `non-negotiable ${n}`));
  binding.push(...a.flags.filter((f) => f.startsWith("floor:") || f === "cleared_bar_capacity"));
  return {
    strongest: strongest.map((c) => `${crit[c].name} (level ${a.levels[c]})`),
    held_back_by: binding.length ? binding : ["nothing: cleared every rule for this band"],
    adjustments: { penalties: a.penalties, bonuses: a.bonuses },
  };
}

/** The three weakest criteria, plus a "verify" probe for any DNA criterion graded below B. */
export function probes(a: Evaluation): string[] {
  if (a.band === "not_shortlisted") return [];
  const rc = CFG.roles[a.role];
  const crit = Object.fromEntries(rc.criteria.map((c) => [c.id, c]));
  const order = Object.keys(crit).sort(
    (c1, c2) => a.levels[c1] - a.levels[c2] || -crit[c1].weight - -crit[c2].weight,
  );
  const chosen = order.slice(0, 3);
  const verifyBelow = CFG.evidence_grades.B.multiplier;
  for (const c of rc.dna_criteria) {
    const m = a.evidence_multipliers[c];
    if (m && m < verifyBelow && !chosen.includes(c)) chosen.push(c);
  }
  return chosen.map((c) => `[${c}] ${crit[c].interview_probe}`);
}
