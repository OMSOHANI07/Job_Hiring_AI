// Runs the Python reference engine and the TypeScript port on identical inputs and diffs every output.
// Usage: npm run parity   (requires python3)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { evaluate, evaluateCandidate, productYears } from "../lib/scoring/evaluate";
import { evidenceFound } from "../lib/scoring/evidence";
import { rankRole } from "../lib/scoring/rank";
import type { Extraction } from "../lib/scoring/types";
import { LAVANYA, PREETHAM, ROHAN, VIKRAM, clone } from "../tests/fixtures/calibration";

const N = Number(process.env.PARITY_N ?? 500);
let seed = 20260928;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const bool = () => rnd() < 0.5;
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const subset = <T>(xs: readonly T[]) => xs.filter(() => rnd() < 0.4);

const WORDS = ("shipment bill of lading customs hold carrier allocation exception tracker sheet team adopted branch " +
  "sprint roadmap killed feature usage weekly outage postmortem forwarder dock scheduling vessel cut-off ₹2.4Cr " +
  "integration api migration vendor data layer reliability uptime deal segment onboarding owned built launched").split(" ");
const sentence = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(" ");
const typo = (s: string) => {
  const a = Array.from(s);
  for (let k = 0; k < Math.max(1, Math.floor(a.length / 25)); k++) a[int(0, a.length - 1)] = pick(["x", "e", " ", "a"]);
  return a.join("");
};
const ym = () => `${int(2012, 2026)}-${String(int(1, 12)).padStart(2, "0")}`;
const G = ["A", "B", "C"] as const;

function randomExtraction(i: number): { x: Extraction; cv: string | null } {
  const cvSentences = Array.from({ length: int(5, 30) }, () => sentence(int(4, 30)));
  const cv = cvSentences.join(". ") + ".";
  const ids = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
  const evidence: Record<string, string[]> = {};
  const grades: Record<string, "A" | "B" | "C"> = {};
  for (const id of ids) {
    const r = rnd();
    if (r < 0.15) continue;
    const s = pick(cvSentences);
    evidence[id] = [r < 0.45 ? s : r < 0.75 ? typo(s) : sentence(int(3, 25))];
    if (rnd() < 0.85) grades[id] = pick(G);
  }
  const start = ym();
  const x: Extraction = {
    candidate_id: `r${i}`, applied_role: pick(["PM", "SPM"] as const),
    location_status: pick(["mumbai", "willing_to_relocate", "explicitly_unwilling", "not_stated"] as const),
    timeline: Array.from({ length: int(0, 4) }, () => ({
      start, end: bool() ? "present" : `${Math.min(2026, Number(start.slice(0, 4)) + int(0, 6))}-${String(int(1, 12)).padStart(2, "0")}`,
      is_pm_title: rnd() < 0.4, owns_product_decisions_without_pm: rnd() < 0.3,
    })),
    ops: { domain_tier: pick(["A", "B", "none"] as const), mode: pick(["hands_on", "desk_adjacent", "none"] as const),
           months_hands_on: int(0, 60),
           kargo_surfaces: subset(["shipment_tracking", "documentation", "carrier_coordination", "customs_clearance", "exception_management"]),
           systems_hands_on: subset(["CargoWise", "ICEGATE", "SAP TM"]), live_crisis: bool(),
           ops_before_current_function: bool(), worked_at_forwarder_or_3pl: bool() },
    builds: Array.from({ length: int(0, 3) }, () => ({
      unprompted: bool(), gap_type: pick(["operational", "functional_process", "practice_standard"] as const),
      adoption_scope: pick(["self", "own_team", "cross_team", "org_standard", "customers"] as const),
      permanent: bool(), measurable_effect: bool() })),
    ownership: { layer_above: pick(["none", "manager_only", "senior_specialists", "close_supervision"] as const),
                 sole_owner: bool(), area_owner: bool(), reports_to_founder_ceo: bool(),
                 owned_incident_to_closure: bool(), team_framed_only: bool() },
    shipping: { shipped_count: int(0, 8), outcome_measured: bool(), killed_or_reversed: bool(), postmortem: bool(), short_cycles: bool() },
    environment: { best_stage: pick(["early", "independent", "mid", "large", "unknown"] as const), first_of_kind: bool() },
    discovery: { method: pick(["none", "secondhand", "interviews", "on_site"] as const), users_are_ops: bool(), changed_build: bool(), quantified_effect: bool() },
    eng_cadence: { signal: pick(["none", "specs_handoff", "direct_scope", "owns_rhythm"] as const) },
    product_surfaces: { surfaces: subset(["tracking_visibility", "documentation_workflows", "carrier_coordination_scheduling", "ops_workflow_tool"]),
                        customer_type: pick(["logistics", "ops_heavy_b2b", "other_b2b", "b2c", "none"] as const) },
    decisions: { final_decider: bool(), irreversibility: pick(["none", "low", "medium", "high"] as const), lived_with_consequence: bool() },
    integration: { targets: subset(["carrier_systems", "port_customs_portals", "erp", "fms_tms", "other_3p_api"]),
                   role: pick(["owner", "contributor", "consumer", "none"] as const), external_system_count: int(0, 5),
                   owned_migration_or_data_layer: bool() },
    architecture: { explicit_build_configure_avoid: bool(), reliability_metric: bool(), data_quality_standard: bool(),
                    role: pick(["owner", "contributor", "none"] as const) },
    commercial: { deal_unblocked: rnd() < 0.2, segment_opened: rnd() < 0.2, onboarding_or_integration_time_reduced: bool(),
                  functions_worked_with: subset(["sales", "engineering", "operations", "customer_success", "customers"]) },
    candour: { reversed_or_failure_documented: bool(), tradeoffs_visible: bool(), data_informed: bool() },
    cv_style: { credential_led: rnd() < 0.3, framework_terms_count: int(0, 7), domain_claimed: bool(),
                maintenance_only: rnd() < 0.3, feature_level_only: rnd() < 0.3 },
    evidence, evidence_grades: grades,
    consistency_flags: rnd() < 0.15 ? ["overlapping_full_time_roles"] : [],
  };
  return { x, cv: rnd() < 0.15 ? null : cv };
}

// ---------- build inputs
const extractions = [
  ...[LAVANYA, VIKRAM, ROHAN, PREETHAM].map((x) => ({ x: clone(x), cv: null as string | null })),
  ...Array.from({ length: N }, (_, i) => randomExtraction(i)),
];
const evidenceCases = Array.from({ length: 400 }, () => {
  const cv = Array.from({ length: int(3, 40) }, () => sentence(int(5, 40))).join(". ");
  const src = sentence(int(3, 60)); // long snippets (>= 200 chars) exercise difflib autojunk
  const base = rnd() < 0.5 ? cv.slice(int(0, Math.max(0, cv.length - 50)), undefined).slice(0, int(10, 260)) : src;
  return { snippets: [rnd() < 0.6 ? typo(base) : base], cv: rnd() < 0.3 ? cv + " " + typo(base) : cv };
});
const rankGroups = Array.from({ length: 60 }, () =>
  Array.from({ length: int(1, 12) }, (_, i) => ({ ...randomExtraction(i).x, candidate_id: `g${i}` })));

const outDir = path.join(process.cwd(), "tests/.out");
mkdirSync(outDir, { recursive: true });
const inFile = path.join(outDir, "parity_inputs.json");
const pyFile = path.join(outDir, "parity_python.json");
writeFileSync(inFile, JSON.stringify({ extractions, evidence: evidenceCases, rank_groups: rankGroups }));
execFileSync("python3", ["parity_ref.py", inFile, pyFile], { cwd: path.join(process.cwd(), "reference"), stdio: "inherit" });
const py = JSON.parse(readFileSync(pyFile, "utf8"));

// ---------- compare
let fails = 0, checks = 0;
const same = (label: string, a: unknown, b: unknown) => {
  checks++;
  // JSON round-trip on both sides so -0/0 and undefined keys compare as Python would serialise them
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)))) {
    fails++;
    if (fails <= 10) console.log(`MISMATCH ${label}\n  ts: ${JSON.stringify(a)}\n  py: ${JSON.stringify(b)}`);
  }
};
extractions.forEach(({ x, cv }, i) => {
  for (const r of ["PM", "SPM"] as const) same(`evaluate[${i}].${r}`, evaluate(clone(x), r, cv), py.evaluations[i][r]);
  const c = evaluateCandidate(clone(x), cv);
  const pyc = py.candidates[i];
  delete pyc.applied.email; // compared separately below (same string from config)
  same(`candidate[${i}]`, { ...c, applied: { ...c.applied, email: undefined } }, pyc);
  same(`years[${i}]`, productYears(x.timeline), py.years[i]);
});
evidenceCases.forEach((e, i) => same(`evidence[${i}]`, evidenceFound(e.snippets, e.cv), py.evidence[i]));
rankGroups.forEach((g, i) => {
  const { ranked, warnings } = rankRole(g.map((x) => evaluateCandidate(clone(x))));
  same(`rank[${i}]`, { order: ranked.map((r) => r.candidate_id), bands: ranked.map((r) => r.applied.band), warnings }, py.ranks[i]);
});
const evTrue = py.evidence.filter(Boolean).length;
console.log(`parity: ${checks - fails}/${checks} checks identical ` +
  `(${extractions.length} extractions x [PM, SPM, candidate, years], ${evidenceCases.length} evidence cases [${evTrue} found], ${rankGroups.length} rank groups)`);
process.exit(fails ? 1 : 0);
