// Engine-facing types. Shapes mirror EXTRACTION_SCHEMA in rubrics/KARGO_RUBRICS.md §3.
// Timeline entries are loose because the reference fixtures only carry start/end/title flags.

export type Role = "PM" | "SPM";
export type Band = "priority_shortlist" | "shortlist" | "review" | "not_shortlisted";
export type Grade = "A" | "B" | "C";
export type LocationStatus = "mumbai" | "willing_to_relocate" | "explicitly_unwilling" | "not_stated";

export interface TimelineEntry {
  title?: string;
  org?: string;
  function?: string;
  stage?: string;
  start: string;
  end: string;
  is_pm_title?: boolean;
  owns_product_decisions_without_pm?: boolean;
}

export interface Build {
  description?: string;
  unprompted: boolean;
  gap_type: "operational" | "functional_process" | "practice_standard";
  adoption_scope: "self" | "own_team" | "cross_team" | "org_standard" | "customers";
  permanent: boolean;
  measurable_effect: boolean;
}

export interface Extraction {
  candidate_id: string;
  applied_role: Role;
  summary?: string;
  location_status: LocationStatus;
  timeline: TimelineEntry[];
  ops: {
    domain_tier: "A" | "B" | "none";
    mode: "hands_on" | "desk_adjacent" | "none";
    months_hands_on: number;
    kargo_surfaces: string[];
    systems_hands_on: string[];
    live_crisis: boolean;
    ops_before_current_function: boolean;
    worked_at_forwarder_or_3pl: boolean;
  };
  builds: Build[];
  ownership: {
    layer_above: "none" | "manager_only" | "senior_specialists" | "close_supervision";
    sole_owner: boolean;
    area_owner: boolean;
    reports_to_founder_ceo: boolean;
    owned_incident_to_closure: boolean;
    team_framed_only: boolean;
  };
  shipping: {
    shipped_count: number;
    outcome_measured: boolean;
    killed_or_reversed: boolean;
    postmortem: boolean;
    short_cycles: boolean;
  };
  environment: { best_stage: "early" | "independent" | "mid" | "large" | "unknown"; first_of_kind: boolean };
  discovery: {
    method: "none" | "secondhand" | "interviews" | "on_site";
    users_are_ops: boolean;
    changed_build: boolean;
    quantified_effect: boolean;
  };
  eng_cadence: { signal: "none" | "specs_handoff" | "direct_scope" | "owns_rhythm" };
  product_surfaces: {
    surfaces: string[];
    customer_type: "logistics" | "ops_heavy_b2b" | "other_b2b" | "b2c" | "none";
  };
  decisions: {
    final_decider: boolean;
    irreversibility: "none" | "low" | "medium" | "high";
    lived_with_consequence: boolean;
  };
  integration: {
    targets: string[];
    role: "owner" | "contributor" | "consumer" | "none";
    external_system_count: number;
    owned_migration_or_data_layer: boolean;
  };
  architecture: {
    explicit_build_configure_avoid: boolean;
    reliability_metric: boolean;
    data_quality_standard: boolean;
    role: "owner" | "contributor" | "none";
  };
  commercial: {
    deal_unblocked: boolean;
    segment_opened: boolean;
    onboarding_or_integration_time_reduced: boolean;
    functions_worked_with: string[];
  };
  candour: { reversed_or_failure_documented: boolean; tradeoffs_visible: boolean; data_informed: boolean };
  cv_style: {
    credential_led: boolean;
    framework_terms_count: number;
    domain_claimed: boolean;
    maintenance_only: boolean;
    feature_level_only: boolean;
  };
  evidence: Record<string, string[]>;
  evidence_grades: Record<string, Grade>;
  consistency_flags: string[];
}

export type Levels = Record<string, number>;

export interface Evaluation {
  role: Role;
  score: number;
  band: Band;
  levels: Levels;
  points: Record<string, number>;
  evidence_multipliers: Record<string, number>;
  base: number;
  penalties: string[];
  penalty_total: number;
  bonuses: string[];
  bonus_total: number;
  product_years: number;
  gate_failed: string | null;
  non_negotiables_failed: string[];
  dna_triad: number;
  dna_evidence_multiplier: number;
  flags: string[];
}

export interface Explanation {
  strongest: string[];
  held_back_by: string[];
  adjustments: { penalties: string[]; bonuses: string[] };
}

export interface AppliedEvaluation extends Evaluation {
  other_role?: { role: Role; score: number; band: Band };
  explanation: Explanation;
  interview_probes: string[];
  email: string;
}

export interface CandidateResult {
  candidate_id: string;
  applied: AppliedEvaluation;
  other?: Evaluation;
}
