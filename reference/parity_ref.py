"""Parity harness: evaluates JSON inputs with the Python reference engine. Used by scripts/parity.ts."""
import json, sys
from kargo_scoring_engine import evaluate, evaluate_candidate, evidence_found, product_years, rank_role

inp = json.load(open(sys.argv[1]))
out = {"evaluations": [], "candidates": [], "evidence": [], "years": [], "ranks": []}
for case in inp["extractions"]:
    x, cv = case["x"], case.get("cv")
    out["evaluations"].append({r: evaluate(json.loads(json.dumps(x)), r, cv) for r in ("PM", "SPM")})
    out["candidates"].append(evaluate_candidate(json.loads(json.dumps(x)), cv))
    out["years"].append(product_years(x["timeline"]))
for e in inp["evidence"]:
    out["evidence"].append(evidence_found(e["snippets"], e["cv"]))
for group in inp["rank_groups"]:
    res = [evaluate_candidate(json.loads(json.dumps(x))) for x in group]
    ranked, warn = rank_role(res)
    out["ranks"].append({"order": [r["candidate_id"] for r in ranked],
                         "bands": [r["applied"]["band"] for r in ranked], "warnings": warn})
json.dump(out, open(sys.argv[2], "w"))
