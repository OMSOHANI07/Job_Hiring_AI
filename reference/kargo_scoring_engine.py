"""
Kargo Hiring Dashboard — deterministic scoring engine (reference implementation).

The LLM only produces the extraction JSON (sub-signals + evidence + evidence grades).
Everything here — levels, weights, penalties, bonuses, gates, non-negotiables,
floors, bands, routing, capacity and ranking — is pure code driven by
kargo_rubrics_config.json. Same input, same output, every time.
"""
from __future__ import annotations

import difflib
import json
import re
from pathlib import Path

CONFIG_PATH = Path(__file__).with_name("kargo_rubrics_config.json")
CFG = json.loads(CONFIG_PATH.read_text())

BAND_ORDER = ["priority_shortlist", "shortlist", "review", "not_shortlisted"]
LOGISTICS_TARGETS = {"carrier_systems", "port_customs_portals", "erp", "fms_tms"}
WIDE_SCOPES = {"cross_team", "org_standard", "customers"}


# ---------------------------------------------------------------- helpers
def _months(start: str, end: str, as_of: str) -> int:
    end = as_of if end == "present" else end
    sy, sm = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    return max(0, (ey - sy) * 12 + (em - sm) + 1)


def product_years(timeline: list[dict], as_of: str = CFG["as_of"]) -> float:
    total = 0.0
    for r in timeline:
        m = _months(r["start"], r["end"], as_of)
        if r.get("is_pm_title"):
            total += m
        elif r.get("owns_product_decisions_without_pm"):
            total += 0.5 * m
    return round(total / 12, 1)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def evidence_found(snippets: list[str], cv_text: str) -> bool:
    cv = _norm(cv_text)
    thr = CFG["evidence_validation"]["fuzzy_threshold"]
    for s in snippets or []:
        n = _norm(s)
        if not n:
            continue
        if n in cv:
            return True
        w = len(n)
        step = max(1, w // 4)
        for i in range(0, max(1, len(cv) - w + 1), step):
            if difflib.SequenceMatcher(None, n, cv[i:i + w]).ratio() >= thr:
                return True
    return False


# ---------------------------------------------------------------- level rules
def lvl_ops(o: dict, spm: bool = False) -> int:
    tier, mode = o["domain_tier"], o["mode"]
    months, surf = o["months_hands_on"], len(o["kargo_surfaces"])
    top = mode == "hands_on" and tier == "A" and months >= 12 and surf >= 2
    if top:
        if spm and not (len(o.get("systems_hands_on", [])) >= 1 or surf >= 3):
            return 2
        return 3
    if mode == "hands_on" and tier == "A":
        return 2
    if mode == "hands_on" and tier == "B" and months >= 12:
        return 2
    if mode in ("hands_on", "desk_adjacent") and tier in ("A", "B"):
        return 1
    return 0


def lvl_builds_pm(builds: list[dict]) -> int:
    best = 0
    for b in builds:
        wide = b["adoption_scope"] in WIDE_SCOPES or b["permanent"]
        if b["unprompted"] and b["gap_type"] == "operational" and wide:
            lvl = 3
        elif (b["unprompted"] and b["adoption_scope"] != "self") or (b["gap_type"] == "operational" and wide):
            lvl = 2
        else:
            lvl = 1
        best = max(best, lvl)
    return best


def lvl_builds_spm(builds: list[dict]) -> int:
    best = 0
    for b in builds:
        wide = b["adoption_scope"] in WIDE_SCOPES or b["permanent"]
        if b["unprompted"] and wide and b["measurable_effect"]:
            lvl = 3
        elif b["unprompted"] and b["adoption_scope"] != "self":
            lvl = 2
        else:
            lvl = 1
        best = max(best, lvl)
    return best


def lvl_ownership(w: dict) -> int:
    top = w["layer_above"] == "none" or w["sole_owner"]
    if top and w["owned_incident_to_closure"]:
        return 3
    if top or (w["area_owner"] and w["owned_incident_to_closure"]):
        return 2
    if w["area_owner"]:
        return 1
    return 0


def lvl_shipping(s: dict) -> int:
    if s["killed_or_reversed"] and s["outcome_measured"]:
        return 3
    if s["outcome_measured"] and (s["postmortem"] or s["short_cycles"]):
        return 2
    return 1 if s["shipped_count"] >= 1 else 0


def lvl_env(e: dict) -> int:
    early = e["best_stage"] in ("early", "independent")
    if early and e["first_of_kind"]:
        return 3
    if early or (e["best_stage"] == "mid" and e["first_of_kind"]):
        return 2
    return 1 if e["best_stage"] == "mid" else 0


def lvl_discovery(d: dict) -> int:
    direct = d["method"] in ("interviews", "on_site")
    if direct and d["users_are_ops"] and d["changed_build"] and d["quantified_effect"]:
        return 3
    if direct and (d["changed_build"] or d["users_are_ops"]):
        return 2
    return 1 if d["method"] in ("secondhand", "interviews", "on_site") else 0


def lvl_eng(e: dict) -> int:
    return {"owns_rhythm": 3, "direct_scope": 2, "specs_handoff": 1}.get(e["signal"], 0)


def lvl_surfaces(p: dict) -> int:
    core = {"tracking_visibility", "documentation_workflows", "carrier_coordination_scheduling"}
    ct, s = p["customer_type"], set(p["surfaces"])
    if ct == "logistics" and s & core:
        return 3
    if ct == "logistics" or (ct == "ops_heavy_b2b" and s):
        return 2
    return 1 if ct in ("other_b2b", "ops_heavy_b2b") else 0


def lvl_decisions(d: dict) -> int:
    irr = d["irreversibility"]
    if d["final_decider"] and irr == "high" and d["lived_with_consequence"]:
        return 3
    if (d["final_decider"] and irr in ("medium", "high")) or (irr == "high" and d["lived_with_consequence"]):
        return 2
    return 1 if irr != "none" else 0


def lvl_integration(i: dict) -> int:
    logi = bool(set(i["targets"]) & LOGISTICS_TARGETS)
    if i["role"] == "owner" and logi and (i["external_system_count"] >= 2 or i["owned_migration_or_data_layer"]):
        return 3
    if i["role"] == "owner" or (i["role"] == "contributor" and logi and i["external_system_count"] >= 2):
        return 2
    return 1 if i["role"] in ("contributor", "consumer") else 0


def lvl_architecture(a: dict) -> int:
    rel = a["reliability_metric"] or a["data_quality_standard"]
    if a["explicit_build_configure_avoid"] and rel and a["role"] == "owner":
        return 3
    if (a["role"] == "owner" and rel) or a["explicit_build_configure_avoid"]:
        return 2
    return 1 if a["role"] == "contributor" and rel else 0


def lvl_commercial(c: dict) -> int:
    if c["deal_unblocked"] or c["segment_opened"]:
        return 3
    if c["onboarding_or_integration_time_reduced"] or len(c["functions_worked_with"]) >= 3:
        return 2
    return 1 if c["functions_worked_with"] else 0


def lvl_candour(c: dict) -> int:
    if c["reversed_or_failure_documented"]:
        return 3
    if c["tradeoffs_visible"]:
        return 2
    return 1 if c["data_informed"] else 0


def derive_levels(x: dict, role: str) -> dict:
    if role == "PM":
        return {
            "P1": lvl_ops(x["ops"]), "P2": lvl_builds_pm(x["builds"]),
            "P3": lvl_ownership(x["ownership"]), "P4": lvl_shipping(x["shipping"]),
            "P5": lvl_env(x["environment"]), "P6": lvl_discovery(x["discovery"]),
            "P7": lvl_eng(x["eng_cadence"]), "P8": lvl_surfaces(x["product_surfaces"]),
        }
    return {
        "S1": lvl_ops(x["ops"], spm=True), "S2": lvl_decisions(x["decisions"]),
        "S3": lvl_builds_spm(x["builds"]), "S4": lvl_integration(x["integration"]),
        "S5": lvl_architecture(x["architecture"]), "S6": lvl_commercial(x["commercial"]),
        "S7": lvl_env(x["environment"]), "S8": lvl_candour(x["candour"]),
    }


# ---------------------------------------------------------------- evaluation
def evaluate(x: dict, role: str, cv_text: str | None) -> dict:
    rc = CFG["roles"][role]
    crit = {c["id"]: c for c in rc["criteria"]}
    flags: list[str] = []

    levels = derive_levels(x, role)

    # Evidence validation: no traceable evidence → level 0
    if cv_text is not None:
        for cid, lvl in levels.items():
            if lvl > 0 and not evidence_found(x["evidence"].get(cid, []), cv_text):
                levels[cid] = 0
                flags.append(f"evidence_not_found:{cid}")

    # Weighted points with evidence-grade multipliers
    grades = x.get("evidence_grades", {})
    points, mults = {}, {}
    for cid, lvl in levels.items():
        g = grades.get(cid, "C")
        m = CFG["evidence_grades"][g]["multiplier"] if lvl > 0 else 0.0
        mults[cid] = m
        points[cid] = round(crit[cid]["weight"] * lvl / 3 * m, 2)
    base = sum(points.values())

    # Penalties
    style, own = x["cv_style"], x["ownership"]
    ops_id = "P1" if role == "PM" else "S1"
    own_lvl = levels["P3"] if role == "PM" else levels["S2"]
    any_candour = x["shipping"]["killed_or_reversed"] or x["candour"]["reversed_or_failure_documented"]
    applied_pen = []
    checks = {
        "X1": style["credential_led"],
        "X2": style["domain_claimed"] and levels[ops_id] <= 1,
        "X3": own["team_framed_only"] and own_lvl <= 1,
        "X4": style["framework_terms_count"] >= 4 and not any_candour,
        "X5_PM": role == "PM" and style["maintenance_only"],
        "X5_SPM": role == "SPM" and style["feature_level_only"],
    }
    pen_total = 0
    for p in CFG["penalties"]["items"]:
        if checks.get(p["id"]):
            pen_total += p["points"]
            applied_pen.append(p["id"])
    pen_total = max(pen_total, CFG["penalties"]["cap"])

    # Bonuses
    o = x["ops"]
    bchecks = {
        "B1": o["ops_before_current_function"] and o["mode"] == "hands_on",
        "B2": o["worked_at_forwarder_or_3pl"] and o["mode"] == "hands_on",
    }
    bon_total, applied_bon = 0, []
    for b in CFG["bonuses"]["items"]:
        if bchecks[b["id"]]:
            bon_total += b["points"]
            applied_bon.append(b["id"])
    bon_total = min(bon_total, CFG["bonuses"]["cap"])

    score = round(min(100.0, max(0.0, base + pen_total + bon_total)), 1)

    # Gates
    years = product_years(x["timeline"])
    gate_fail = None
    if role == "PM":
        if years < 1.5:
            gate_fail = "K1_experience"
        elif years > 6:
            flags.append("consider_for:SPM")
        if levels["P4"] < 1:
            gate_fail = gate_fail or "K3_not_shipped"
    else:
        if years < 4.5:
            gate_fail = "K1_experience"
        elif years > 10:
            flags.append("check_level_fit")
        if not (own["area_owner"] or own["sole_owner"]):
            gate_fail = gate_fail or "K3_no_area_ownership"
        if levels["S4"] < 1:
            gate_fail = gate_fail or "K4_no_integration"
    if x["location_status"] == "explicitly_unwilling":
        gate_fail = gate_fail or "K2_location"
    elif x["location_status"] == "not_stated":
        flags.append("confirm_relocation")

    # Non-negotiables
    dna = rc["dna_criteria"]
    triad = sum(levels[c] for c in dna)
    if role == "PM":
        nn = {"P1>=2": levels["P1"] >= 2, "P3>=2": levels["P3"] >= 2,
              "P4>=2": levels["P4"] >= 2, "triad>=7": triad >= 7}
    else:
        nn = {"S1>=2": levels["S1"] >= 2, "S2>=2": levels["S2"] >= 2,
              "S4>=2": levels["S4"] >= 2, "triad>=7": triad >= 7}
    nn_failed = [k for k, ok in nn.items() if not ok]
    dna_mult = round(sum(mults[c] for c in dna) / len(dna), 3)
    consistency = x.get("consistency_flags", [])

    # Band
    if gate_fail:
        band = "not_shortlisted"
    elif score >= 85 and not nn_failed and dna_mult >= 0.9 and not consistency:
        band = "priority_shortlist"
    elif score >= 75 and not nn_failed:
        band = "shortlist"
    elif score >= 60:
        band = "review"
    else:
        band = "not_shortlisted"

    # PM over-experience cap
    if role == "PM" and "consider_for:SPM" in flags and band in ("priority_shortlist", "shortlist"):
        band = "review"

    # Floors
    for f in rc["floors"]:
        if levels[f["criterion"]] == f["if_level"] and BAND_ORDER.index(band) < BAND_ORDER.index(f["cap_band"]):
            band = f["cap_band"]
            flags.append(f"floor:{f['criterion']}")

    return {
        "role": role, "score": score, "band": band, "levels": levels, "points": points,
        "evidence_multipliers": mults, "base": round(base, 2),
        "penalties": applied_pen, "penalty_total": pen_total,
        "bonuses": applied_bon, "bonus_total": bon_total,
        "product_years": years, "gate_failed": gate_fail,
        "non_negotiables_failed": nn_failed, "dna_triad": triad,
        "dna_evidence_multiplier": dna_mult, "flags": flags + consistency,
    }


def evaluate_candidate(x: dict, cv_text: str | None = None) -> dict:
    applied = x["applied_role"]
    other = "SPM" if applied == "PM" else "PM"
    a = evaluate(x, applied, cv_text)
    o = evaluate(x, other, cv_text)
    top = ("priority_shortlist", "shortlist")
    if a["band"] not in top and o["band"] in top:
        a["flags"].append(f"consider_for:{other}")
        if a["band"] == "not_shortlisted":
            a["band"] = "review"
    a["other_role"] = {"role": other, "score": o["score"], "band": o["band"]}
    a["explanation"] = explain(a)
    a["interview_probes"] = probes(a, x)
    a["email"] = CFG["email_policy"][a["band"]]
    return {"candidate_id": x["candidate_id"], "applied": a, "other": o}


# ---------------------------------------------------------------- ranking
def _rank_key(r: dict):
    a = r["applied"]
    ops = a["levels"].get("P1", a["levels"].get("S1"))
    sec = a["levels"].get("P4", a["levels"].get("S2"))
    return (BAND_ORDER.index(a["band"]), -a["score"], -ops, -a["dna_triad"],
            -a["dna_evidence_multiplier"], -sec)


def rank_role(results: list[dict]) -> tuple[list[dict], list[str]]:
    cap = CFG["capacity"]
    results = sorted(results, key=_rank_key)
    pri = [r for r in results if r["applied"]["band"] == "priority_shortlist"]
    for r in pri[cap["max_priority_per_role"]:]:
        r["applied"]["band"] = "shortlist"
        r["applied"]["flags"].append("cleared_bar_capacity")
    results = sorted(results, key=_rank_key)
    top = [r for r in results if r["applied"]["band"] in ("priority_shortlist", "shortlist")]
    for r in top[cap["max_shortlist_total_per_role"]:]:
        r["applied"]["band"] = "review"
        r["applied"]["flags"].append("cleared_bar_capacity")
    results = sorted(results, key=_rank_key)
    warnings = []
    n_top = sum(r["applied"]["band"] in ("priority_shortlist", "shortlist") for r in results)
    if n_top < cap["thin_warning_below"]:
        warnings.append(f"Only {n_top} candidate(s) cleared the bar. Top Review candidates are shown; the cutoff is not lowered.")
    return results, warnings


# ---------------------------------------------------------------- explanations
def explain(a: dict) -> dict:
    crit = {c["id"]: c for c in CFG["roles"][a["role"]]["criteria"]}
    strongest = sorted(a["points"], key=lambda c: -a["points"][c])[:2]
    binding = []
    if a["gate_failed"]:
        binding.append(f"gate {a['gate_failed']}")
    binding += [f"non-negotiable {n}" for n in a["non_negotiables_failed"]]
    binding += [f for f in a["flags"] if f.startswith("floor:") or f == "cleared_bar_capacity"]
    return {
        "strongest": [f"{crit[c]['name']} (level {a['levels'][c]})" for c in strongest],
        "held_back_by": binding or ["nothing: cleared every rule for this band"],
        "adjustments": {"penalties": a["penalties"], "bonuses": a["bonuses"]},
    }


def probes(a: dict, x: dict) -> list[str]:
    if a["band"] == "not_shortlisted":
        return []
    rc = CFG["roles"][a["role"]]
    crit = {c["id"]: c for c in rc["criteria"]}
    order = sorted(crit, key=lambda c: (a["levels"][c], -crit[c]["weight"]))
    chosen = order[:3]
    for c in rc["dna_criteria"]:  # verify weakly-evidenced DNA claims
        if a["evidence_multipliers"][c] and a["evidence_multipliers"][c] < 0.85 and c not in chosen:
            chosen.append(c)
    return [f"[{c}] {crit[c]['interview_probe']}" for c in chosen]


