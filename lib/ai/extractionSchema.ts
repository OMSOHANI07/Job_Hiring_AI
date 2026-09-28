import { z } from "zod";

// zod mirror of EXTRACTION_SCHEMA (rubrics/KARGO_RUBRICS.md §3). Enums are exhaustive: any value outside
// them fails validation and triggers the single retry. The same schema is converted to JSON Schema and sent
// to Gemini as responseJsonSchema, so the model and the validator can't disagree.

export const CRITERION_IDS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"] as const;

const YM = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM");
const Grade = z.enum(["A", "B", "C"]);
const Snippets = z.array(z.string().min(1)).max(3);

export const ExtractionSchema = z.object({
  candidate_id: z.string(),
  applied_role: z.enum(["PM", "SPM"]),
  summary: z.string(),
  location_status: z.enum(["mumbai", "willing_to_relocate", "explicitly_unwilling", "not_stated"]),
  timeline: z.array(
    z.object({
      title: z.string(),
      org: z.string(),
      function: z.enum(["product", "engineering", "operations", "sales", "cs", "marketing", "other"]),
      stage: z.enum(["early", "independent", "mid", "large", "unknown"]),
      start: YM,
      end: z.union([YM, z.literal("present")]),
      is_pm_title: z.boolean(),
      owns_product_decisions_without_pm: z.boolean(),
    }).strict(),
  ),
  ops: z.object({
    domain_tier: z.enum(["A", "B", "none"]),
    mode: z.enum(["hands_on", "desk_adjacent", "none"]),
    months_hands_on: z.number().int().min(0),
    kargo_surfaces: z.array(z.enum(["shipment_tracking", "documentation", "carrier_coordination", "customs_clearance", "exception_management"])),
    systems_hands_on: z.array(z.string()),
    live_crisis: z.boolean(),
    ops_before_current_function: z.boolean(),
    worked_at_forwarder_or_3pl: z.boolean(),
  }).strict(),
  builds: z.array(
    z.object({
      description: z.string(),
      unprompted: z.boolean(),
      gap_type: z.enum(["operational", "functional_process", "practice_standard"]),
      adoption_scope: z.enum(["self", "own_team", "cross_team", "org_standard", "customers"]),
      permanent: z.boolean(),
      measurable_effect: z.boolean(),
    }).strict(),
  ),
  ownership: z.object({
    layer_above: z.enum(["none", "manager_only", "senior_specialists", "close_supervision"]),
    sole_owner: z.boolean(),
    area_owner: z.boolean(),
    reports_to_founder_ceo: z.boolean(),
    owned_incident_to_closure: z.boolean(),
    team_framed_only: z.boolean(),
  }).strict(),
  shipping: z.object({
    shipped_count: z.number().int().min(0),
    outcome_measured: z.boolean(),
    killed_or_reversed: z.boolean(),
    postmortem: z.boolean(),
    short_cycles: z.boolean(),
  }).strict(),
  environment: z.object({
    best_stage: z.enum(["early", "independent", "mid", "large", "unknown"]),
    first_of_kind: z.boolean(),
  }).strict(),
  discovery: z.object({
    method: z.enum(["none", "secondhand", "interviews", "on_site"]),
    users_are_ops: z.boolean(),
    changed_build: z.boolean(),
    quantified_effect: z.boolean(),
  }).strict(),
  eng_cadence: z.object({ signal: z.enum(["none", "specs_handoff", "direct_scope", "owns_rhythm"]) }).strict(),
  product_surfaces: z.object({
    surfaces: z.array(z.enum(["tracking_visibility", "documentation_workflows", "carrier_coordination_scheduling", "ops_workflow_tool"])),
    customer_type: z.enum(["logistics", "ops_heavy_b2b", "other_b2b", "b2c", "none"]),
  }).strict(),
  decisions: z.object({
    final_decider: z.boolean(),
    irreversibility: z.enum(["none", "low", "medium", "high"]),
    lived_with_consequence: z.boolean(),
  }).strict(),
  integration: z.object({
    targets: z.array(z.enum(["carrier_systems", "port_customs_portals", "erp", "fms_tms", "other_3p_api"])),
    role: z.enum(["owner", "contributor", "consumer", "none"]),
    external_system_count: z.number().int().min(0),
    owned_migration_or_data_layer: z.boolean(),
  }).strict(),
  architecture: z.object({
    explicit_build_configure_avoid: z.boolean(),
    reliability_metric: z.boolean(),
    data_quality_standard: z.boolean(),
    role: z.enum(["owner", "contributor", "none"]),
  }).strict(),
  commercial: z.object({
    deal_unblocked: z.boolean(),
    segment_opened: z.boolean(),
    onboarding_or_integration_time_reduced: z.boolean(),
    functions_worked_with: z.array(z.enum(["sales", "engineering", "operations", "customer_success", "customers"])),
  }).strict(),
  candour: z.object({
    reversed_or_failure_documented: z.boolean(),
    tradeoffs_visible: z.boolean(),
    data_informed: z.boolean(),
  }).strict(),
  cv_style: z.object({
    credential_led: z.boolean(),
    framework_terms_count: z.number().int().min(0),
    domain_claimed: z.boolean(),
    maintenance_only: z.boolean(),
    feature_level_only: z.boolean(),
  }).strict(),
  evidence: z.object(Object.fromEntries(CRITERION_IDS.map((id) => [id, Snippets])) as Record<(typeof CRITERION_IDS)[number], typeof Snippets>).strict(),
  evidence_grades: z.object(Object.fromEntries(CRITERION_IDS.map((id) => [id, Grade.optional()])) as Record<(typeof CRITERION_IDS)[number], z.ZodOptional<typeof Grade>>).strict(),
  consistency_flags: z.array(z.string().regex(/^(overlapping_full_time_roles|implausible_metric:.{1,80})$/)),
}).strict();

export type ValidExtraction = z.infer<typeof ExtractionSchema>;

// Gemini's responseJsonSchema accepts a JSON Schema subset; drop keys outside it.
const ALLOWED_KEYS = new Set([
  "type", "format", "title", "description", "enum", "items", "prefixItems", "minItems", "maxItems",
  "minimum", "maximum", "anyOf", "oneOf", "properties", "additionalProperties", "required", "const",
]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === "properties") {
      out[k] = Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, sanitize(pv)]));
    } else if (k === "const") {
      out.enum = [v]; // express literals as single-value enums
    } else {
      out[k] = sanitize(v);
    }
  }
  return out;
}

export const EXTRACTION_JSON_SCHEMA = sanitize(z.toJSONSchema(ExtractionSchema, { target: "draft-2020-12" }));

/** Readable validation errors, appended to the retry prompt. */
export function formatZodIssues(err: z.ZodError): string {
  return err.issues.slice(0, 25).map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}
