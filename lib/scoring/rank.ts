import "server-only";
import { CFG } from "./config";
import { BAND_ORDER } from "./evaluate";
import type { CandidateResult } from "./types";

// Tie-break order: band -> score -> P1/S1 level -> DNA triad -> DNA evidence multiplier -> P4/S2 level.
function rankKey(r: CandidateResult): number[] {
  const a = r.applied;
  const ops = a.levels.P1 ?? a.levels.S1;
  const sec = a.levels.P4 ?? a.levels.S2;
  return [BAND_ORDER.indexOf(a.band), -a.score, -ops, -a.dna_triad, -a.dna_evidence_multiplier, -sec];
}

function cmp(x: CandidateResult, y: CandidateResult): number {
  const kx = rankKey(x), ky = rankKey(y);
  for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] - ky[i];
  return 0;
}

/**
 * Rank one role's candidates and apply capacity caps (computed across candidates, so at read time).
 * Returns copies; the stored pre-capacity results are not mutated.
 */
export function rankRole(input: CandidateResult[]): { ranked: CandidateResult[]; warnings: string[] } {
  const cap = CFG.capacity;
  let results: CandidateResult[] = structuredClone(input).sort(cmp);
  const pri = results.filter((r) => r.applied.band === "priority_shortlist");
  for (const r of pri.slice(cap.max_priority_per_role)) {
    r.applied.band = "shortlist";
    r.applied.flags.push("cleared_bar_capacity");
  }
  results = results.sort(cmp);
  const top = results.filter((r) => r.applied.band === "priority_shortlist" || r.applied.band === "shortlist");
  for (const r of top.slice(cap.max_shortlist_total_per_role)) {
    r.applied.band = "review";
    r.applied.flags.push("cleared_bar_capacity");
  }
  results = results.sort(cmp);
  const warnings: string[] = [];
  const nTop = results.filter((r) => r.applied.band === "priority_shortlist" || r.applied.band === "shortlist").length;
  if (nTop < cap.thin_warning_below) {
    warnings.push(`Only ${nTop} candidate(s) cleared the bar. Top Review candidates are shown; the cutoff is not lowered.`);
  }
  return { ranked: results, warnings };
}
