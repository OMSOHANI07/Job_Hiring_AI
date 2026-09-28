// Port of reference/test_kargo_scoring.py: same fixtures, same expected numbers.
import { describe, expect, it } from "vitest";
import { evaluate, evaluateCandidate, productYears, evaluateAppliedRole } from "@/lib/scoring/evaluate";
import { rankRole } from "@/lib/scoring/rank";
import { LAVANYA, PREETHAM, ROHAN, VIKRAM, clone } from "../fixtures/calibration";

describe("calibration (reference parity)", () => {
  it("Lavanya PM → 100.0 priority", () => {
    const r = evaluate(LAVANYA, "PM", null);
    expect(r.levels).toEqual({ P1: 3, P2: 3, P3: 3, P4: 3, P5: 3, P6: 3, P7: 2, P8: 3 });
    expect(r.base).toBe(97.83);
    expect(r.score).toBe(100.0);
    expect(r.band).toBe("priority_shortlist");
  });

  it("Vikram PM → 24.2 not shortlisted", () => {
    const r = evaluate(VIKRAM, "PM", null);
    expect(r.levels.P1).toBe(0);
    expect(r.penalties).toEqual(["X1", "X4", "X5_PM"]);
    expect(r.base).toBe(32.21);
    expect(r.penalty_total).toBe(-8);
    expect(r.score).toBe(24.2);
    expect(r.band).toBe("not_shortlisted");
    expect(r.flags).toContain("consider_for:SPM"); // 6.2 product years
  });

  it("Rohan SPM → 95.1 but gate K1", () => {
    const r = evaluate(ROHAN, "SPM", null);
    expect(r.levels).toEqual({ S1: 3, S2: 3, S3: 3, S4: 3, S5: 2, S6: 2, S7: 3, S8: 2 });
    expect(r.base).toBe(90.12);
    expect(r.score).toBe(95.1);
    expect(r.gate_failed).toBe("K1_experience"); // engineer: 76 months x 50% = 3.2 yrs
    expect(r.band).toBe("not_shortlisted");
  });

  it("Preetham SPM → below 40", () => {
    const r = evaluate(PREETHAM, "SPM", null);
    expect(r.levels.S1).toBe(1);
    expect(r.levels.S4).toBe(2);
    expect(r.penalties).toEqual(["X1", "X3", "X5_SPM"]);
    expect(r.score).toBe(21.1);
    expect(r.score).toBeLessThan(40);
    expect(r.band).toBe("not_shortlisted");
  });
});

describe("edge cases (reference parity)", () => {
  it("PM with no ops cannot shortlist (max 72)", () => {
    const x = clone(LAVANYA);
    Object.assign(x.ops, { domain_tier: "none", mode: "none", months_hands_on: 0, kargo_surfaces: [],
                           ops_before_current_function: false, worked_at_forwarder_or_3pl: false });
    x.eng_cadence.signal = "owns_rhythm";
    x.evidence_grades.P7 = "A";
    const r = evaluate(x, "PM", null);
    expect(r.score).toBe(72.0);
    expect(r.band).toBe("review");
    expect(r.non_negotiables_failed).toContain("P1>=2");
    expect(r.flags).not.toContain("floor:P1");
  });

  it("triad rule", () => {
    const x = clone(LAVANYA);
    x.builds = [{ unprompted: false, gap_type: "functional_process", adoption_scope: "self",
                  permanent: false, measurable_effect: false }]; // P2 = 1
    x.ownership.owned_incident_to_closure = false; // P3 = 2
    const r = evaluate(x, "PM", null);
    expect(r.dna_triad).toBe(6);
    expect(r.non_negotiables_failed).toContain("triad>=7");
    expect(r.band).toBe("review");
  });

  it("routing to PM (reference evaluate_candidate)", () => {
    const x = clone(LAVANYA);
    x.applied_role = "SPM";
    const a = evaluateCandidate(x).applied;
    expect(a.gate_failed).toBe("K1_experience");
    expect(a.flags).toContain("consider_for:PM");
    expect(a.band).toBe("review");
  });

  it("location: explicitly unwilling fails, not stated flags", () => {
    const x = clone(LAVANYA);
    x.location_status = "explicitly_unwilling";
    expect(evaluate(x, "PM", null).band).toBe("not_shortlisted");
    x.location_status = "not_stated";
    const r = evaluate(x, "PM", null);
    expect(r.flags).toContain("confirm_relocation");
    expect(r.band).toBe("priority_shortlist");
  });

  it("evidence validation zeroes a level", () => {
    const x = clone(LAVANYA);
    const cv = "Sole PM responsible for dock scheduling. Killed 2 features after usage data.";
    x.evidence = { P3: ["Sole PM responsible for dock scheduling"],
                   P4: ["killed 2 features after usage data"],
                   P1: ["Managed carrier allocation for 800 shipments"] }; // not in CV
    const r = evaluate(x, "PM", cv);
    expect(r.levels.P1).toBe(0);
    expect(r.flags).toContain("evidence_not_found:P1");
    expect(r.levels.P3).toBe(3);
    expect(r.levels.P4).toBe(3);
  });

  it("consistency flags block priority", () => {
    const x = clone(LAVANYA);
    x.consistency_flags = ["overlapping_full_time_roles"];
    expect(evaluate(x, "PM", null).band).toBe("shortlist");
  });

  it("weak evidence blocks priority", () => {
    const x = clone(LAVANYA);
    Object.assign(x.evidence_grades, { P2: "C", P3: "C" });
    const r = evaluate(x, "PM", null);
    expect(r.dna_evidence_multiplier).toBeLessThan(0.9);
    expect(r.band).toBe("shortlist");
  });

  it("capacity cap: 3 priority, 3 shortlist, 2 review", () => {
    const results = Array.from({ length: 8 }, (_, i) => {
      const x = clone(LAVANYA);
      x.candidate_id = `c${i}`;
      return evaluateCandidate(x);
    });
    const { ranked, warnings } = rankRole(results);
    const bands = ranked.map((r) => r.applied.band);
    expect(bands.filter((b) => b === "priority_shortlist")).toHaveLength(3);
    expect(bands.filter((b) => b === "shortlist")).toHaveLength(3);
    expect(bands.filter((b) => b === "review")).toHaveLength(2);
    expect(warnings).toEqual([]);
    expect(results.every((r) => r.applied.band === "priority_shortlist")).toBe(true); // inputs untouched
  });

  it("product years 3.5 and 3.2", () => {
    expect(productYears(LAVANYA.timeline)).toBe(3.5);
    expect(productYears(ROHAN.timeline)).toBe(3.2);
  });
});

describe("applied-role-only scoring (app behaviour)", () => {
  it("scores only the applied role and never routes", () => {
    const x = clone(LAVANYA);
    x.applied_role = "SPM";
    const out = evaluateAppliedRole(x, null);
    expect(out.other).toBeUndefined();
    expect(out.applied.other_role).toBeUndefined();
    expect(out.applied.role).toBe("SPM");
    expect(out.applied.flags).not.toContain("consider_for:PM");
    expect(out.applied.band).toBe("not_shortlisted"); // K1 holds; no routing uplift
  });

  it("thin shortlist warning fires below 2", () => {
    const { warnings } = rankRole([evaluateAppliedRole(clone(VIKRAM), null)]);
    expect(warnings[0]).toMatch(/Only 0 candidate/);
  });
});
