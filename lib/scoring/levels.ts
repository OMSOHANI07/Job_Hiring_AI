import "server-only";
import { RULE_THRESHOLDS as T } from "./config";
import type { Build, Extraction, Levels, Role } from "./types";

// Level rules from kargo_rubrics_config.json roles.*.criteria[].level_rules,
// ported line-for-line from reference/kargo_scoring_engine.py.

const LOGISTICS_TARGETS = new Set(["carrier_systems", "port_customs_portals", "erp", "fms_tms"]);
const WIDE_SCOPES = new Set(["cross_team", "org_standard", "customers"]);

export function lvlOps(o: Extraction["ops"], spm = false): number {
  const { domain_tier: tier, mode } = o;
  const months = o.months_hands_on;
  const surf = o.kargo_surfaces.length;
  const top = mode === "hands_on" && tier === "A" && months >= T.ops_top_months && surf >= T.ops_top_surfaces;
  if (top) {
    if (spm && !((o.systems_hands_on ?? []).length >= 1 || surf >= T.spm_ops_top_surfaces)) return 2;
    return 3;
  }
  if (mode === "hands_on" && tier === "A") return 2;
  if (mode === "hands_on" && tier === "B" && months >= T.ops_top_months) return 2;
  if ((mode === "hands_on" || mode === "desk_adjacent") && (tier === "A" || tier === "B")) return 1;
  return 0;
}

const isWide = (b: Build) => WIDE_SCOPES.has(b.adoption_scope) || b.permanent;

export function lvlBuildsPm(builds: Build[]): number {
  let best = 0;
  for (const b of builds) {
    let lvl: number;
    if (b.unprompted && b.gap_type === "operational" && isWide(b)) lvl = 3;
    else if ((b.unprompted && b.adoption_scope !== "self") || (b.gap_type === "operational" && isWide(b))) lvl = 2;
    else lvl = 1;
    best = Math.max(best, lvl);
  }
  return best;
}

export function lvlBuildsSpm(builds: Build[]): number {
  let best = 0;
  for (const b of builds) {
    let lvl: number;
    if (b.unprompted && isWide(b) && b.measurable_effect) lvl = 3;
    else if (b.unprompted && b.adoption_scope !== "self") lvl = 2;
    else lvl = 1;
    best = Math.max(best, lvl);
  }
  return best;
}

export function lvlOwnership(w: Extraction["ownership"]): number {
  const top = w.layer_above === "none" || w.sole_owner;
  if (top && w.owned_incident_to_closure) return 3;
  if (top || (w.area_owner && w.owned_incident_to_closure)) return 2;
  if (w.area_owner) return 1;
  return 0;
}

export function lvlShipping(s: Extraction["shipping"]): number {
  if (s.killed_or_reversed && s.outcome_measured) return 3;
  if (s.outcome_measured && (s.postmortem || s.short_cycles)) return 2;
  return s.shipped_count >= 1 ? 1 : 0;
}

export function lvlEnv(e: Extraction["environment"]): number {
  const early = e.best_stage === "early" || e.best_stage === "independent";
  if (early && e.first_of_kind) return 3;
  if (early || (e.best_stage === "mid" && e.first_of_kind)) return 2;
  return e.best_stage === "mid" ? 1 : 0;
}

export function lvlDiscovery(d: Extraction["discovery"]): number {
  const direct = d.method === "interviews" || d.method === "on_site";
  if (direct && d.users_are_ops && d.changed_build && d.quantified_effect) return 3;
  if (direct && (d.changed_build || d.users_are_ops)) return 2;
  return d.method === "secondhand" || direct ? 1 : 0;
}

export function lvlEng(e: Extraction["eng_cadence"]): number {
  return ({ owns_rhythm: 3, direct_scope: 2, specs_handoff: 1 } as Record<string, number>)[e.signal] ?? 0;
}

export function lvlSurfaces(p: Extraction["product_surfaces"]): number {
  const core = ["tracking_visibility", "documentation_workflows", "carrier_coordination_scheduling"];
  const ct = p.customer_type;
  const s = new Set(p.surfaces);
  if (ct === "logistics" && core.some((c) => s.has(c))) return 3;
  if (ct === "logistics" || (ct === "ops_heavy_b2b" && s.size > 0)) return 2;
  return ct === "other_b2b" || ct === "ops_heavy_b2b" ? 1 : 0;
}

export function lvlDecisions(d: Extraction["decisions"]): number {
  const irr = d.irreversibility;
  if (d.final_decider && irr === "high" && d.lived_with_consequence) return 3;
  if ((d.final_decider && (irr === "medium" || irr === "high")) || (irr === "high" && d.lived_with_consequence)) return 2;
  return irr !== "none" ? 1 : 0;
}

export function lvlIntegration(i: Extraction["integration"]): number {
  const logi = i.targets.some((t) => LOGISTICS_TARGETS.has(t));
  if (i.role === "owner" && logi && (i.external_system_count >= T.integration_min_systems || i.owned_migration_or_data_layer)) return 3;
  if (i.role === "owner" || (i.role === "contributor" && logi && i.external_system_count >= T.integration_min_systems)) return 2;
  return i.role === "contributor" || i.role === "consumer" ? 1 : 0;
}

export function lvlArchitecture(a: Extraction["architecture"]): number {
  const rel = a.reliability_metric || a.data_quality_standard;
  if (a.explicit_build_configure_avoid && rel && a.role === "owner") return 3;
  if ((a.role === "owner" && rel) || a.explicit_build_configure_avoid) return 2;
  return a.role === "contributor" && rel ? 1 : 0;
}

export function lvlCommercial(c: Extraction["commercial"]): number {
  if (c.deal_unblocked || c.segment_opened) return 3;
  if (c.onboarding_or_integration_time_reduced || c.functions_worked_with.length >= T.commercial_functions) return 2;
  return c.functions_worked_with.length ? 1 : 0;
}

export function lvlCandour(c: Extraction["candour"]): number {
  if (c.reversed_or_failure_documented) return 3;
  if (c.tradeoffs_visible) return 2;
  return c.data_informed ? 1 : 0;
}

export function deriveLevels(x: Extraction, role: Role): Levels {
  if (role === "PM") {
    return {
      P1: lvlOps(x.ops), P2: lvlBuildsPm(x.builds),
      P3: lvlOwnership(x.ownership), P4: lvlShipping(x.shipping),
      P5: lvlEnv(x.environment), P6: lvlDiscovery(x.discovery),
      P7: lvlEng(x.eng_cadence), P8: lvlSurfaces(x.product_surfaces),
    };
  }
  return {
    S1: lvlOps(x.ops, true), S2: lvlDecisions(x.decisions),
    S3: lvlBuildsSpm(x.builds), S4: lvlIntegration(x.integration),
    S5: lvlArchitecture(x.architecture), S6: lvlCommercial(x.commercial),
    S7: lvlEnv(x.environment), S8: lvlCandour(x.candour),
  };
}
