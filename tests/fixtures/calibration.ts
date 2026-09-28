// Ported verbatim from reference/test_kargo_scoring.py. Same fixtures, same expected numbers.
import type { Extraction } from "@/lib/scoring/types";

export const BLANK: Extraction = {
  candidate_id: "x", applied_role: "PM", location_status: "mumbai",
  timeline: [],
  ops: { domain_tier: "none", mode: "none", months_hands_on: 0, kargo_surfaces: [],
         systems_hands_on: [], live_crisis: false, ops_before_current_function: false,
         worked_at_forwarder_or_3pl: false },
  builds: [],
  ownership: { layer_above: "close_supervision", sole_owner: false, area_owner: false,
               reports_to_founder_ceo: false, owned_incident_to_closure: false, team_framed_only: false },
  shipping: { shipped_count: 0, outcome_measured: false, killed_or_reversed: false,
              postmortem: false, short_cycles: false },
  environment: { best_stage: "large", first_of_kind: false },
  discovery: { method: "none", users_are_ops: false, changed_build: false, quantified_effect: false },
  eng_cadence: { signal: "none" },
  product_surfaces: { surfaces: [], customer_type: "none" },
  decisions: { final_decider: false, irreversibility: "none", lived_with_consequence: false },
  integration: { targets: [], role: "none", external_system_count: 0, owned_migration_or_data_layer: false },
  architecture: { explicit_build_configure_avoid: false, reliability_metric: false,
                  data_quality_standard: false, role: "none" },
  commercial: { deal_unblocked: false, segment_opened: false,
                onboarding_or_integration_time_reduced: false, functions_worked_with: [] },
  candour: { reversed_or_failure_documented: false, tradeoffs_visible: false, data_informed: false },
  cv_style: { credential_led: false, framework_terms_count: 0, domain_claimed: false,
              maintenance_only: false, feature_level_only: false },
  evidence: {}, evidence_grades: {}, consistency_flags: [],
};

type Over = { [K in keyof Extraction]?: Extraction[K] extends object[] ? Extraction[K]
  : Extraction[K] extends object ? Partial<Extraction[K]> : Extraction[K] };

/** Python make(): shallow-merge dict fields, replace everything else. */
export function make(over: Over): Extraction {
  const x = structuredClone(BLANK) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    const cur = x[k];
    if (v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur)) {
      x[k] = { ...(cur as object), ...(v as object) };
    } else {
      x[k] = v;
    }
  }
  return x as unknown as Extraction;
}

export const clone = <T>(v: T): T => structuredClone(v);

export const LAVANYA = make({
  candidate_id: "cal_lavanya", applied_role: "PM",
  timeline: [{ start: "2023-04", end: "present", is_pm_title: true },
             { start: "2020-07", end: "2023-03", is_pm_title: false }],
  ops: { domain_tier: "A", mode: "hands_on", months_hands_on: 32,
         kargo_surfaces: ["carrier_coordination", "exception_management", "shipment_tracking"],
         systems_hands_on: ["SAP TM"], live_crisis: true,
         ops_before_current_function: true, worked_at_forwarder_or_3pl: true },
  builds: [{ unprompted: true, gap_type: "operational", adoption_scope: "cross_team",
             permanent: true, measurable_effect: true }],
  ownership: { layer_above: "none", sole_owner: true, area_owner: true, owned_incident_to_closure: true },
  shipping: { shipped_count: 6, outcome_measured: true, killed_or_reversed: true,
              postmortem: true, short_cycles: true },
  environment: { best_stage: "early", first_of_kind: true },
  discovery: { method: "interviews", users_are_ops: true, changed_build: true, quantified_effect: true },
  eng_cadence: { signal: "direct_scope" },
  product_surfaces: { surfaces: ["tracking_visibility", "carrier_coordination_scheduling"], customer_type: "logistics" },
  evidence_grades: { P1: "A", P2: "A", P3: "A", P4: "A", P5: "A", P6: "A", P7: "B", P8: "A" },
});

export const VIKRAM = make({
  candidate_id: "cal_vikram", applied_role: "PM",
  timeline: [{ start: "2022-01", end: "present", is_pm_title: true },
             { start: "2020-07", end: "2021-12", is_pm_title: true }],
  builds: [{ unprompted: true, gap_type: "functional_process", adoption_scope: "own_team",
             permanent: false, measurable_effect: false }],
  ownership: { layer_above: "manager_only", area_owner: true },
  shipping: { shipped_count: 12, outcome_measured: true },
  environment: { best_stage: "mid", first_of_kind: false },
  discovery: { method: "interviews", users_are_ops: false, changed_build: true, quantified_effect: true },
  eng_cadence: { signal: "owns_rhythm" },
  product_surfaces: { surfaces: [], customer_type: "other_b2b" },
  cv_style: { credential_led: true, framework_terms_count: 4, maintenance_only: true },
  evidence_grades: { P2: "B", P3: "B", P4: "A", P5: "B", P6: "A", P7: "B", P8: "B" },
});

export const ROHAN = make({
  candidate_id: "cal_rohan", applied_role: "SPM",
  timeline: [{ start: "2020-06", end: "present", owns_product_decisions_without_pm: true }],
  ops: { domain_tier: "A", mode: "hands_on", months_hands_on: 32,
         kargo_surfaces: ["documentation", "customs_clearance", "carrier_coordination", "shipment_tracking"],
         systems_hands_on: [], live_crisis: false,
         ops_before_current_function: true, worked_at_forwarder_or_3pl: true },
  builds: [{ unprompted: true, gap_type: "operational", adoption_scope: "org_standard",
             permanent: true, measurable_effect: true }],
  ownership: { layer_above: "none", sole_owner: false, area_owner: true, owned_incident_to_closure: true },
  decisions: { final_decider: true, irreversibility: "high", lived_with_consequence: true },
  integration: { targets: ["carrier_systems", "other_3p_api"], role: "owner",
                 external_system_count: 2, owned_migration_or_data_layer: true },
  architecture: { reliability_metric: true, role: "owner" },
  commercial: { functions_worked_with: ["operations", "engineering", "customers"] },
  environment: { best_stage: "early", first_of_kind: true },
  candour: { tradeoffs_visible: true, data_informed: true },
  evidence_grades: { S1: "A", S2: "A", S3: "A", S4: "A", S5: "A", S6: "A", S7: "B", S8: "B" },
});

export const PREETHAM = make({
  candidate_id: "cal_preetham", applied_role: "SPM",
  timeline: [{ start: "2019-07", end: "present", is_pm_title: false }],
  ops: { domain_tier: "A", mode: "desk_adjacent" },
  builds: [{ unprompted: true, gap_type: "functional_process", adoption_scope: "self",
             permanent: false, measurable_effect: true }],
  ownership: { layer_above: "senior_specialists", area_owner: false, team_framed_only: true },
  decisions: { final_decider: false, irreversibility: "medium", lived_with_consequence: true },
  integration: { targets: ["carrier_systems"], role: "contributor", external_system_count: 3 },
  architecture: { reliability_metric: true, role: "owner" },
  environment: { best_stage: "large" },
  candour: { data_informed: true },
  cv_style: { credential_led: true, feature_level_only: true },
  evidence_grades: { S1: "B", S2: "C", S3: "C", S4: "B", S5: "A", S8: "B" },
});
