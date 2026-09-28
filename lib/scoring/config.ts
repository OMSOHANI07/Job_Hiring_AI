import "server-only";
import { z } from "zod";
import rawConfig from "@/rubrics/kargo_rubrics_config.json";

// rubrics/kargo_rubrics_config.json is the single source of truth for the rubric.
// It is imported at build time and validated here; a malformed config fails loudly on first import.

const Grounded = { grounding: z.string().min(1) };

const CriterionSchema = z.object({
  id: z.string().regex(/^[PS][1-8]$/),
  name: z.string(),
  weight: z.number().positive(),
  block: z.string(),
  grounding: z.string(),
  sub_signals: z.record(z.string(), z.string()),
  level_rules: z.object({ "0": z.string(), "1": z.string(), "2": z.string(), "3": z.string() }),
  interview_probe: z.string(),
});

const RoleSchema = z.object({
  title: z.string(),
  archetype: z.string(),
  dna_criteria: z.array(z.string()).length(3),
  gates: z.array(z.object({ id: z.string(), name: z.string(), rule: z.string(), ...Grounded })),
  non_negotiables: z.array(z.object({ rule: z.string(), ...Grounded })),
  floors: z.array(
    z.object({
      criterion: z.string(),
      if_level: z.number().int().min(0).max(3),
      cap_band: z.enum(["priority_shortlist", "shortlist", "review", "not_shortlisted"]),
      ...Grounded,
    }),
  ),
  criteria: z.array(CriterionSchema).length(8),
});

export const ConfigSchema = z.object({
  version: z.string(),
  as_of: z.string().regex(/^\d{4}-\d{2}$/),
  sources: z.array(z.string()),
  evidence_grades: z.object({
    A: z.object({ multiplier: z.number(), rule: z.string() }),
    B: z.object({ multiplier: z.number(), rule: z.string() }),
    C: z.object({ multiplier: z.number(), rule: z.string() }),
    grounding: z.string(),
  }),
  evidence_validation: z.object({ rule: z.string(), fuzzy_threshold: z.number().min(0).max(1), ...Grounded }),
  bands: z.object({
    priority_shortlist: z.object({ min_score: z.number(), requires: z.array(z.string()), meaning: z.string() }),
    shortlist: z.object({ min_score: z.number(), requires: z.array(z.string()), meaning: z.string() }),
    review: z.object({ min_score: z.number(), meaning: z.string() }),
    not_shortlisted: z.object({ max_score: z.number(), meaning: z.string() }),
  }),
  capacity: z.object({
    max_priority_per_role: z.number().int().positive(),
    max_shortlist_total_per_role: z.number().int().positive(),
    overflow_action: z.string(),
    thin_warning_below: z.number().int().nonnegative(),
    ...Grounded,
  }),
  penalties: z.object({
    cap: z.number().max(0),
    items: z.array(
      z.object({ id: z.string(), role: z.enum(["PM", "SPM"]).optional(), points: z.number().max(0), when: z.string(), ...Grounded }),
    ),
  }),
  bonuses: z.object({
    cap: z.number().min(0),
    items: z.array(z.object({ id: z.string(), points: z.number().min(0), when: z.string(), ...Grounded })),
  }),
  roles: z.object({ PM: RoleSchema, SPM: RoleSchema }),
  routing: z.object({ rule: z.string(), ...Grounded }),
  excluded_attributes: z.array(z.string()),
  email_policy: z.object({
    priority_shortlist: z.string(),
    shortlist: z.string(),
    review: z.string(),
    not_shortlisted: z.string(),
    send: z.string(),
  }),
});

export type RubricConfig = z.infer<typeof ConfigSchema>;

export const CFG: RubricConfig = ConfigSchema.parse(rawConfig);

/**
 * Thresholds that the config states only in prose (gate rules, band requirements, level rules).
 * They are kept here, in one place, and tests/unit/config.test.ts asserts that the config text still
 * contains each number, so editing the config without editing this file fails CI.
 */
export const RULE_THRESHOLDS = {
  PM: { min_product_years: 1.5, over_experience_years: 6 },
  SPM: { min_product_years: 4.5, check_level_fit_years: 10 },
  priority_min_dna_multiplier: 0.9,
  ops_top_months: 12,
  ops_top_surfaces: 2,
  spm_ops_top_surfaces: 3,
  commercial_functions: 3,
  integration_min_systems: 2,
} as const;
