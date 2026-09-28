import { describe, expect, it } from "vitest";
import raw from "@/rubrics/kargo_rubrics_config.json";
import { CFG, ConfigSchema, RULE_THRESHOLDS as T } from "@/lib/scoring/config";
import { pyRound, SequenceMatcher } from "@/lib/scoring/pymath";

describe("rubric config", () => {
  it("validates against the zod schema", () => {
    expect(() => ConfigSchema.parse(raw)).not.toThrow();
    expect(CFG.version).toBe("2.0");
  });

  it("weights sum to 100 per role", () => {
    for (const role of ["PM", "SPM"] as const) {
      expect(CFG.roles[role].criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
    }
  });

  it("rejects a malformed config", () => {
    const bad = structuredClone(raw) as { bands: { review: { min_score: unknown } } };
    bad.bands.review.min_score = "sixty";
    expect(() => ConfigSchema.parse(bad)).toThrow();
  });

  // Drift guard: prose-only thresholds in RULE_THRESHOLDS must still match the config text.
  it("prose thresholds still match the config", () => {
    const gate = (role: "PM" | "SPM", id: string) => CFG.roles[role].gates.find((g) => g.id === id)!.rule;
    expect(gate("PM", "K1")).toContain(`product_years >= ${T.PM.min_product_years}`);
    expect(gate("PM", "K1")).toContain(`If > ${T.PM.over_experience_years}`);
    expect(gate("SPM", "K1")).toContain(`product_years >= ${T.SPM.min_product_years}`);
    expect(gate("SPM", "K1")).toContain(`Above ${T.SPM.check_level_fit_years}`);
    expect(CFG.bands.priority_shortlist.requires.join(" ")).toContain(`>= ${T.priority_min_dna_multiplier}`);
    const p1 = CFG.roles.PM.criteria.find((c) => c.id === "P1")!.level_rules["3"];
    expect(p1).toContain(`months >= ${T.ops_top_months}`);
    expect(p1).toContain(`>= ${T.ops_top_surfaces} kargo_surfaces`);
    expect(CFG.roles.SPM.criteria.find((c) => c.id === "S1")!.level_rules["3"]).toContain(`>= ${T.spm_ops_top_surfaces} kargo_surfaces`);
    expect(CFG.roles.SPM.criteria.find((c) => c.id === "S6")!.level_rules["2"]).toContain(`>= ${T.commercial_functions} functions`);
    expect(CFG.roles.SPM.criteria.find((c) => c.id === "S4")!.level_rules["3"]).toContain(`external_system_count >= ${T.integration_min_systems}`);
    expect(CFG.penalties.items.find((p) => p.id === "X4")!.when).toContain("framework_terms_count >= 4");
  });
});

describe("python numeric parity helpers", () => {
  it("round() ties to even like Python", () => {
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(0.375, 2)).toBe(0.38);
    expect(pyRound(2.5, 0)).toBe(2);
    expect(pyRound(3.5, 0)).toBe(4);
    expect(pyRound(2.675, 2)).toBe(2.67); // binary value is below the tie
    expect(pyRound(97.8333333, 2)).toBe(97.83);
  });

  it("SequenceMatcher.ratio matches difflib on known values", () => {
    // Values computed with CPython difflib
    expect(new SequenceMatcher("abcd", "bcde").ratio()).toBe(0.75);
    expect(new SequenceMatcher("", "").ratio()).toBe(1);
    expect(new SequenceMatcher("kitten", "sitting").ratio()).toBeCloseTo(0.6153846153846154, 15);
  });
});
