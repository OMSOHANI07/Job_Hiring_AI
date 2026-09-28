"""Calibration + edge-case tests. Run: python test_kargo_scoring.py  (or pytest)"""
import copy
from kargo_scoring_engine import evaluate, evaluate_candidate, rank_role, product_years

BLANK = {
    "candidate_id": "x", "applied_role": "PM", "location_status": "mumbai",
    "timeline": [],
    "ops": {"domain_tier": "none", "mode": "none", "months_hands_on": 0, "kargo_surfaces": [],
            "systems_hands_on": [], "live_crisis": False, "ops_before_current_function": False,
            "worked_at_forwarder_or_3pl": False},
    "builds": [],
    "ownership": {"layer_above": "close_supervision", "sole_owner": False, "area_owner": False,
                  "reports_to_founder_ceo": False, "owned_incident_to_closure": False, "team_framed_only": False},
    "shipping": {"shipped_count": 0, "outcome_measured": False, "killed_or_reversed": False,
                 "postmortem": False, "short_cycles": False},
    "environment": {"best_stage": "large", "first_of_kind": False},
    "discovery": {"method": "none", "users_are_ops": False, "changed_build": False, "quantified_effect": False},
    "eng_cadence": {"signal": "none"},
    "product_surfaces": {"surfaces": [], "customer_type": "none"},
    "decisions": {"final_decider": False, "irreversibility": "none", "lived_with_consequence": False},
    "integration": {"targets": [], "role": "none", "external_system_count": 0, "owned_migration_or_data_layer": False},
    "architecture": {"explicit_build_configure_avoid": False, "reliability_metric": False,
                     "data_quality_standard": False, "role": "none"},
    "commercial": {"deal_unblocked": False, "segment_opened": False,
                   "onboarding_or_integration_time_reduced": False, "functions_worked_with": []},
    "candour": {"reversed_or_failure_documented": False, "tradeoffs_visible": False, "data_informed": False},
    "cv_style": {"credential_led": False, "framework_terms_count": 0, "domain_claimed": False,
                 "maintenance_only": False, "feature_level_only": False},
    "evidence": {}, "evidence_grades": {}, "consistency_flags": [],
}


def make(**over):
    x = copy.deepcopy(BLANK)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(x.get(k), dict):
            x[k].update(v)
        else:
            x[k] = v
    return x


LAVANYA = make(
    candidate_id="cal_lavanya", applied_role="PM",
    timeline=[{"start": "2023-04", "end": "present", "is_pm_title": True},
              {"start": "2020-07", "end": "2023-03", "is_pm_title": False}],
    ops={"domain_tier": "A", "mode": "hands_on", "months_hands_on": 32,
         "kargo_surfaces": ["carrier_coordination", "exception_management", "shipment_tracking"],
         "systems_hands_on": ["SAP TM"], "live_crisis": True,
         "ops_before_current_function": True, "worked_at_forwarder_or_3pl": True},
    builds=[{"unprompted": True, "gap_type": "operational", "adoption_scope": "cross_team",
             "permanent": True, "measurable_effect": True}],
    ownership={"layer_above": "none", "sole_owner": True, "area_owner": True, "owned_incident_to_closure": True},
    shipping={"shipped_count": 6, "outcome_measured": True, "killed_or_reversed": True,
              "postmortem": True, "short_cycles": True},
    environment={"best_stage": "early", "first_of_kind": True},
    discovery={"method": "interviews", "users_are_ops": True, "changed_build": True, "quantified_effect": True},
    eng_cadence={"signal": "direct_scope"},
    product_surfaces={"surfaces": ["tracking_visibility", "carrier_coordination_scheduling"], "customer_type": "logistics"},
    evidence_grades={"P1": "A", "P2": "A", "P3": "A", "P4": "A", "P5": "A", "P6": "A", "P7": "B", "P8": "A"},
)

VIKRAM = make(
    candidate_id="cal_vikram", applied_role="PM",
    timeline=[{"start": "2022-01", "end": "present", "is_pm_title": True},
              {"start": "2020-07", "end": "2021-12", "is_pm_title": True}],
    builds=[{"unprompted": True, "gap_type": "functional_process", "adoption_scope": "own_team",
             "permanent": False, "measurable_effect": False}],
    ownership={"layer_above": "manager_only", "area_owner": True},
    shipping={"shipped_count": 12, "outcome_measured": True},
    environment={"best_stage": "mid", "first_of_kind": False},
    discovery={"method": "interviews", "users_are_ops": False, "changed_build": True, "quantified_effect": True},
    eng_cadence={"signal": "owns_rhythm"},
    product_surfaces={"surfaces": [], "customer_type": "other_b2b"},
    cv_style={"credential_led": True, "framework_terms_count": 4, "maintenance_only": True},
    evidence_grades={"P2": "B", "P3": "B", "P4": "A", "P5": "B", "P6": "A", "P7": "B", "P8": "B"},
)

ROHAN = make(
    candidate_id="cal_rohan", applied_role="SPM",
    timeline=[{"start": "2020-06", "end": "present", "owns_product_decisions_without_pm": True}],
    ops={"domain_tier": "A", "mode": "hands_on", "months_hands_on": 32,
         "kargo_surfaces": ["documentation", "customs_clearance", "carrier_coordination", "shipment_tracking"],
         "systems_hands_on": [], "live_crisis": False,
         "ops_before_current_function": True, "worked_at_forwarder_or_3pl": True},
    builds=[{"unprompted": True, "gap_type": "operational", "adoption_scope": "org_standard",
             "permanent": True, "measurable_effect": True}],
    ownership={"layer_above": "none", "sole_owner": False, "area_owner": True, "owned_incident_to_closure": True},
    decisions={"final_decider": True, "irreversibility": "high", "lived_with_consequence": True},
    integration={"targets": ["carrier_systems", "other_3p_api"], "role": "owner",
                 "external_system_count": 2, "owned_migration_or_data_layer": True},
    architecture={"reliability_metric": True, "role": "owner"},
    commercial={"functions_worked_with": ["operations", "engineering", "customers"]},
    environment={"best_stage": "early", "first_of_kind": True},
    candour={"tradeoffs_visible": True, "data_informed": True},
    evidence_grades={"S1": "A", "S2": "A", "S3": "A", "S4": "A", "S5": "A", "S6": "A", "S7": "B", "S8": "B"},
)

PREETHAM = make(
    candidate_id="cal_preetham", applied_role="SPM",
    timeline=[{"start": "2019-07", "end": "present", "is_pm_title": False}],
    ops={"domain_tier": "A", "mode": "desk_adjacent"},
    builds=[{"unprompted": True, "gap_type": "functional_process", "adoption_scope": "self",
             "permanent": False, "measurable_effect": True}],
    ownership={"layer_above": "senior_specialists", "area_owner": False, "team_framed_only": True},
    decisions={"final_decider": False, "irreversibility": "medium", "lived_with_consequence": True},
    integration={"targets": ["carrier_systems"], "role": "contributor", "external_system_count": 3},
    architecture={"reliability_metric": True, "role": "owner"},
    environment={"best_stage": "large"},
    candour={"data_informed": True},
    cv_style={"credential_led": True, "feature_level_only": True},
    evidence_grades={"S1": "B", "S2": "C", "S3": "C", "S4": "B", "S5": "A", "S8": "B"},
)


def test_lavanya_pm_priority():
    r = evaluate(LAVANYA, "PM", None)
    assert r["levels"] == {"P1": 3, "P2": 3, "P3": 3, "P4": 3, "P5": 3, "P6": 3, "P7": 2, "P8": 3}
    assert r["score"] == 100.0 and r["band"] == "priority_shortlist", r


def test_vikram_pm_rejected():
    r = evaluate(VIKRAM, "PM", None)
    assert r["levels"]["P1"] == 0
    assert r["penalties"] == ["X1", "X4", "X5_PM"]
    assert r["score"] == 24.2, r["score"]
    assert r["band"] == "not_shortlisted"
    assert "consider_for:SPM" in r["flags"]  # 6.2 product years


def test_rohan_spm_scoring():
    r = evaluate(ROHAN, "SPM", None)
    assert r["levels"] == {"S1": 3, "S2": 3, "S3": 3, "S4": 3, "S5": 2, "S6": 2, "S7": 3, "S8": 2}
    assert r["score"] == 95.1, r["score"]
    assert r["gate_failed"] == "K1_experience"  # engineer: 76 months × 50% = 3.2 yrs
    assert r["band"] == "not_shortlisted"


def test_preetham_spm_scoring():
    r = evaluate(PREETHAM, "SPM", None)
    assert r["levels"]["S1"] == 1 and r["levels"]["S4"] == 2
    assert r["penalties"] == ["X1", "X3", "X5_SPM"]
    assert r["score"] < 40 and r["band"] == "not_shortlisted", r["score"]


def test_pm_no_ops_cannot_shortlist():
    x = copy.deepcopy(LAVANYA)
    x["ops"].update({"domain_tier": "none", "mode": "none", "months_hands_on": 0,
                     "kargo_surfaces": [], "ops_before_current_function": False,
                     "worked_at_forwarder_or_3pl": False})
    x["eng_cadence"]["signal"] = "owns_rhythm"
    x["evidence_grades"]["P7"] = "A"
    r = evaluate(x, "PM", None)
    assert r["score"] == 72.0 and r["band"] == "review"
    assert "P1>=2" in r["non_negotiables_failed"] and "floor:P1" not in r["flags"]


def test_triad_rule():
    x = copy.deepcopy(LAVANYA)
    x["builds"] = [{"unprompted": False, "gap_type": "functional_process", "adoption_scope": "self",
                    "permanent": False, "measurable_effect": False}]   # P2 = 1
    x["ownership"]["owned_incident_to_closure"] = False                # P3 = 2
    r = evaluate(x, "PM", None)
    assert r["dna_triad"] == 6 and "triad>=7" in r["non_negotiables_failed"]
    assert r["band"] == "review", r


def test_routing_to_pm():
    x = copy.deepcopy(LAVANYA)
    x["applied_role"] = "SPM"
    out = evaluate_candidate(x)
    a = out["applied"]
    assert a["gate_failed"] == "K1_experience"
    assert "consider_for:PM" in a["flags"] and a["band"] == "review"


def test_location():
    x = copy.deepcopy(LAVANYA); x["location_status"] = "explicitly_unwilling"
    assert evaluate(x, "PM", None)["band"] == "not_shortlisted"
    x["location_status"] = "not_stated"
    r = evaluate(x, "PM", None)
    assert "confirm_relocation" in r["flags"] and r["band"] == "priority_shortlist"


def test_evidence_validation_zeroes_level():
    x = copy.deepcopy(LAVANYA)
    cv = "Sole PM responsible for dock scheduling. Killed 2 features after usage data."
    x["evidence"] = {"P3": ["Sole PM responsible for dock scheduling"],
                     "P4": ["killed 2 features after usage data"],
                     "P1": ["Managed carrier allocation for 800 shipments"]}  # not in CV
    r = evaluate(x, "PM", cv)
    assert r["levels"]["P1"] == 0 and "evidence_not_found:P1" in r["flags"]
    assert r["levels"]["P3"] == 3 and r["levels"]["P4"] == 3


def test_consistency_blocks_priority():
    x = copy.deepcopy(LAVANYA); x["consistency_flags"] = ["overlapping_full_time_roles"]
    assert evaluate(x, "PM", None)["band"] == "shortlist"


def test_weak_evidence_blocks_priority():
    x = copy.deepcopy(LAVANYA); x["evidence_grades"].update({"P2": "C", "P3": "C"})
    r = evaluate(x, "PM", None)
    assert r["dna_evidence_multiplier"] < 0.9 and r["band"] == "shortlist"


def test_capacity_cap():
    results = []
    for i in range(8):
        x = copy.deepcopy(LAVANYA); x["candidate_id"] = f"c{i}"
        results.append(evaluate_candidate(x))
    ranked, warn = rank_role(results)
    bands = [r["applied"]["band"] for r in ranked]
    assert bands.count("priority_shortlist") == 3
    assert bands.count("shortlist") == 3 and bands.count("review") == 2
    assert not warn


def test_product_years():
    assert product_years(LAVANYA["timeline"]) == 3.5
    assert product_years(ROHAN["timeline"]) == 3.2


if __name__ == "__main__":
    import sys
    fails = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try:
                fn(); print("PASS", name)
            except AssertionError as e:
                fails += 1; print("FAIL", name, e)
    for label, x, role in [("Lavanya", LAVANYA, "PM"), ("Vikram", VIKRAM, "PM"),
                           ("Rohan", ROHAN, "SPM"), ("Preetham", PREETHAM, "SPM")]:
        r = evaluate(x, role, None)
        print(f"{label:9} {role}: base {r['base']:6} pen {r['penalty_total']:3} bon {r['bonus_total']} -> {r['score']:5}  {r['band']}")
    sys.exit(1 if fails else 0)


