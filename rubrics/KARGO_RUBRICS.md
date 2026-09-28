# Kargo Hiring Rubrics v2 — Build Spec for Claude Code

Read this file first. It explains how the three files fit together and what to build.

| File | What it is | Who changes it |
|---|---|---|
| `KARGO_RUBRICS.md` | This spec: pipeline, extraction prompt, rules and rationale | Humans |
| `kargo_rubrics_config.json` | Single source of truth: every weight, sub-signal, level rule, gate, non-negotiable, penalty, bonus, band, cap, and the JD or instinct line that grounds it | Humans only; bump `version` on any change |
| `kargo_scoring_engine.py` | Deterministic reference implementation of the config | Port to the app's backend language; the logic must stay identical |
| `test_kargo_scoring.py` | Calibration and edge-case tests (13 passing) | Port alongside the engine; all must pass in CI |

---

## 1. Non-negotiable design rules

1. **The LLM extracts; code decides.** The LLM returns sub-signal facts, evidence snippets and evidence grades. It never outputs a level, score, band or recommendation. Levels are derived by code from sub-signals, using the `level_rules` in the config.
2. **Evidence or zero.** Every level above 0 must be backed by a snippet found in the redacted CV text. If none is found, the level becomes 0 and a flag is raised.
3. **Score every CV against both rubrics** (Components Map: "both roles").
4. **PII never reaches the LLM.** Redact the name, email, phone, photo, URLs and street address before extraction. Store PII keyed by `candidate_id` and re-attach it only in the dashboard and Resend layer.
5. **Excluded attributes** (config `excluded_attributes`) carry zero weight. Career gaps are neither penalised nor flagged.
6. **The system recommends, Arjun decides.** Nothing is emailed without his click. Review candidates get no draft until he decides.
7. **Every rule is traceable.** Each rule in the config carries a `grounding` field quoting the JD or `arjun_instincts.md`. Do not add a rule without one.

---

## 2. Pipeline — 14 stages

| # | Stage | Owner | Output |
|---|---|---|---|
| 1 | Intake: file + `applied_role` (PM/SPM) | Upload UI | raw file |
| 2 | Parse PDF/DOCX to text; hash the text; dedupe (same hash, or same email + role → update the existing record) | Code | `cv_text`, `cv_hash` |
| 3 | Redact PII into a separate store | Code | `redacted_text`, `pii` |
| 4 | **Extraction**: sub-signals, evidence, grades, timeline (section 3) | LLM, temperature 0 | extraction JSON |
| 5 | Schema validation; retry once on failure; reject enum values not in the schema | Code | valid extraction |
| 6 | Evidence validation against `redacted_text` | Code (`evidence_found`) | levels zeroed + flags |
| 7 | Derive levels from sub-signals, both roles | Code (`derive_levels`) | 8 levels per role |
| 8 | Weighted points × evidence multiplier | Code | base score |
| 9 | Penalties (cap −12) and bonuses (cap +5); clamp 0–100 | Code | score |
| 10 | Gates (K1–K3 PM, K1–K4 SPM) | Code | `gate_failed`, flags |
| 11 | Non-negotiables, DNA triad, floors, band | Code | band |
| 12 | Cross-role routing | Code (`evaluate_candidate`) | `consider_for:*` flags |
| 13 | Rank per role, capacity caps, thin-shortlist warning | Code (`rank_role`) | ordered list |
| 14 | Explanations and interview probes (code), then brief and email drafts (LLM, redacted inputs) | Code + LLM | dashboard card |

Write an **audit record** per candidate: `cv_hash`, config `version`, extraction JSON, derived levels, score breakdown, band and timestamp. When the config version changes, re-score everyone from the stored extraction; no new LLM call is needed.

---

## 3. Extraction prompt (stage 4)

**System:**

```
You extract structured hiring evidence from an anonymised CV for Kargo, a Series A logistics SaaS company in Mumbai whose customers are mid-sized freight forwarders and 3PLs. You do NOT score, rank or recommend. You report facts.

Definitions for every field are in RUBRIC_CONFIG (roles.*.criteria[].sub_signals). Follow them literally.

Rules:
1. Report only what the CV states. If it is not stated, use false / 0 / "none" / "unknown".
2. "Did the work" vs "near the work": ops.mode = "hands_on" only if the candidate personally prepared documents, coordinated carriers or customs, allocated capacity, or managed exceptions. Building software for, selling to, supporting, marketing to or integrating with operations is "desk_adjacent".
3. For each builds[] item, "unprompted" means the CV shows they noticed the gap themselves ("after finding", "identified", "nobody had", "for the first time"). Assigned projects are unprompted=false.
4. evidence: for every criterion id (P1–P8, S1–S8) give 1–3 snippets copied VERBATIM from the CV, each 25 words or fewer. If there is no evidence, give [].
5. evidence_grades per criterion id with evidence:
   A = specific, attributable to the candidate personally, quantified or with a verifiable outcome
   B = specific and attributable, no number or outcome
   C = team-attributed ("part of", "supported", "assisted", "we"), generic, or a bare claim
6. timeline: every role with start/end as YYYY-MM ("present" allowed), function, stage, is_pm_title, and owns_product_decisions_without_pm (true only if the CV explicitly shows them defining what gets built with no PM).
7. cv_style.credential_led = certifications, community memberships, talks or coding-profile links appear before or in place of outcomes. framework_terms_count = count of distinct method terms (JTBD, OKR, Agile, Scrum, RICE, North Star, Kano, etc.). domain_claimed = the CV asserts logistics or ops expertise. maintenance_only = product work was only on an established product with no first version or new product built. feature_level_only = never owned a product area, only features.
8. consistency_flags: add "overlapping_full_time_roles" or "implausible_metric:<short>" only when clearly true. Never flag career gaps.
9. Ignore name, gender, age, college name, family background and home city. They must not influence any field.

Return ONLY valid JSON matching EXTRACTION_SCHEMA. No preamble, no Markdown fences.
```

**User:** `RUBRIC_CONFIG` (the `roles` block) + `EXTRACTION_SCHEMA` (below) + `{{redacted_text}}` + `applied_role`.

**EXTRACTION_SCHEMA** (enum values are exhaustive; the engine expects exactly these keys):

```json
{
  "candidate_id": "string",
  "applied_role": "PM | SPM",
  "summary": "2 sentences, career path, no PII",
  "location_status": "mumbai | willing_to_relocate | explicitly_unwilling | not_stated",
  "timeline": [{ "title": "string", "org": "string", "function": "product|engineering|operations|sales|cs|marketing|other",
                 "stage": "early|independent|mid|large|unknown", "start": "YYYY-MM", "end": "YYYY-MM|present",
                 "is_pm_title": false, "owns_product_decisions_without_pm": false }],
  "ops": { "domain_tier": "A|B|none", "mode": "hands_on|desk_adjacent|none", "months_hands_on": 0,
           "kargo_surfaces": ["shipment_tracking|documentation|carrier_coordination|customs_clearance|exception_management"],
           "systems_hands_on": ["string"], "live_crisis": false,
           "ops_before_current_function": false, "worked_at_forwarder_or_3pl": false },
  "builds": [{ "description": "string", "unprompted": false,
               "gap_type": "operational|functional_process|practice_standard",
               "adoption_scope": "self|own_team|cross_team|org_standard|customers",
               "permanent": false, "measurable_effect": false }],
  "ownership": { "layer_above": "none|manager_only|senior_specialists|close_supervision",
                 "sole_owner": false, "area_owner": false, "reports_to_founder_ceo": false,
                 "owned_incident_to_closure": false, "team_framed_only": false },
  "shipping": { "shipped_count": 0, "outcome_measured": false, "killed_or_reversed": false,
                "postmortem": false, "short_cycles": false },
  "environment": { "best_stage": "early|independent|mid|large|unknown", "first_of_kind": false },
  "discovery": { "method": "none|secondhand|interviews|on_site", "users_are_ops": false,
                 "changed_build": false, "quantified_effect": false },
  "eng_cadence": { "signal": "none|specs_handoff|direct_scope|owns_rhythm" },
  "product_surfaces": { "surfaces": ["tracking_visibility|documentation_workflows|carrier_coordination_scheduling|ops_workflow_tool"],
                        "customer_type": "logistics|ops_heavy_b2b|other_b2b|b2c|none" },
  "decisions": { "final_decider": false, "irreversibility": "none|low|medium|high", "lived_with_consequence": false },
  "integration": { "targets": ["carrier_systems|port_customs_portals|erp|fms_tms|other_3p_api"],
                   "role": "owner|contributor|consumer|none", "external_system_count": 0,
                   "owned_migration_or_data_layer": false },
  "architecture": { "explicit_build_configure_avoid": false, "reliability_metric": false,
                    "data_quality_standard": false, "role": "owner|contributor|none" },
  "commercial": { "deal_unblocked": false, "segment_opened": false,
                  "onboarding_or_integration_time_reduced": false,
                  "functions_worked_with": ["sales|engineering|operations|customer_success|customers"] },
  "candour": { "reversed_or_failure_documented": false, "tradeoffs_visible": false, "data_informed": false },
  "cv_style": { "credential_led": false, "framework_terms_count": 0, "domain_claimed": false,
                "maintenance_only": false, "feature_level_only": false },
  "evidence": { "P1": ["verbatim snippet"], "...": [], "S8": [] },
  "evidence_grades": { "P1": "A|B|C", "...": "A|B|C" },
  "consistency_flags": []
}
```

---

## 4. The rubrics at a glance

Full sub-signals, level rules and grounding are in the config. Points per criterion = weight × (level ÷ 3) × evidence multiplier (A 1.0 / B 0.85 / C 0.6).

### Product Manager (archetype: Lavanya Iyer)

| ID | Criterion | Wt | Block |
|---|---|---|---|
| P1 | Freight-floor immersion | 28 | Kargo DNA |
| P2 | Builds the missing thing, and it spreads | 16 | Kargo DNA |
| P3 | Sole ownership, no product layer above | 16 | Kargo DNA |
| P4 | Ships and kills on evidence, in short cycles | 12 | PM craft |
| P5 | 0→1 building | 8 | PM craft |
| P6 | Discovery with operations users | 10 | PM craft |
| P7 | Engineering knows what's coming three sprints out | 5 | PM craft |
| P8 | Built for Kargo's core surfaces | 5 | PM craft |

- **Gates:** K1 product years ≥ 1.5 (above 6 → capped at Review, flagged for SPM) · K2 location · K3 has shipped.
- **Non-negotiables for Shortlist:** P1 ≥ 2 · P3 ≥ 2 · P4 ≥ 2 · P1+P2+P3 ≥ 7.
- **Floor:** P1 = 0 → capped at Review.

### Senior Product Manager (archetype: Rohan Desai)

| ID | Criterion | Wt | Block |
|---|---|---|---|
| S1 | Freight-floor immersion, including the systems | 22 | Kargo DNA |
| S2 | Consequential calls, no layer above | 16 | Kargo DNA |
| S3 | Sets standards that others adopt | 12 | Kargo DNA |
| S4 | Owns the integration and data layer | 18 | SPM craft |
| S5 | Build / configure / stay-away judgement and reliability | 10 | SPM craft |
| S6 | Integrations that unlock revenue | 10 | SPM craft |
| S7 | Environments where the rules weren't written | 7 | SPM craft |
| S8 | Candour: lives with and learns from calls | 5 | SPM craft |

- **Gates:** K1 product-ownership years ≥ 4.5 · K2 location · K3 has owned an area · K4 has integration exposure.
- **Non-negotiables for Shortlist:** S1 ≥ 2 · S2 ≥ 2 · S4 ≥ 2 · S1+S2+S3 ≥ 7.
- **Floor:** S1 = 0 → capped at Review.

### Adjustments (both roles)

- **Penalties (cap −12):** X1 credential-led CV −3 · X2 domain claimed but not lived −3 · X3 team-framed only −3 · X4 framework vocabulary without candour −2 · X5 maintenance-only (PM) or feature-level-only (SPM) −3.
- **Bonuses (cap +5):** B1 operations before the current function +3 · B2 worked at a forwarder, 3PL or CHA +2.

---

## 5. Bands, cutoff and caps

| Band | Rule | Action |
|---|---|---|
| **Priority shortlist** | ≥ 85, gates pass, all non-negotiables, DNA evidence multiplier ≥ 0.9, no consistency flags | Invite; propose slots within 5 working days |
| **Shortlist** | ≥ 75, gates pass, all non-negotiables | Invite |
| **Review** | 60–74.9, or ≥ 75 failing a non-negotiable, or capped by a floor, capacity or routing | Arjun decides; no draft |
| **Not shortlisted** | < 60, or a gate failed (unless routed) | Rejection drafted; sent on click |

**Capacity:** at most 3 Priority and 6 Shortlist-or-better per role. Overflow drops a band with the flag `cleared_bar_capacity`. If fewer than 2 candidates clear the bar, the dashboard shows a warning. **The cutoff is never lowered automatically.**

**Tie-break order:** band → score → P1/S1 level → DNA triad → DNA evidence multiplier → P4/S2 level.

---

## 6. Calibration results (from `test_kargo_scoring.py`)

| Profile | Role | Base | Adj. | Score | Band | Note |
|---|---|---|---|---|---|---|
| Lavanya Iyer | PM | 97.8 | +5 | **100.0** | Priority | The archetype clears every rule |
| Vikram Nair | PM | 32.2 | −8 | **24.2** | Not shortlisted | No ops; credential-led; maintenance work; 1 of 4 PMs |
| Rohan Desai | SPM | 90.1 | +5 | **95.1** | Not shortlisted (K1) | Perfect DNA, but 3.2 product-ownership years: the gate holds even for the archetype |
| Preetham Rao | SPM | 30.1 | −9 | **21.1** | Not shortlisted | Desk-adjacent 3PL integrations; team-framed; large company |

The edge-case tests cover: a PM with no ops experience (maximum score 72, so structurally below the cutoff), the triad rule, SPM-to-PM routing, both location paths, evidence validation zeroing a level, consistency and weak-evidence flags blocking Priority, capacity caps, and product-years counting.

---

## 7. Dashboard card per candidate

- Name and contact (from the PII store), applied role, **band**, **score**, and the other role's score and band
- Score breakdown: each criterion's level, points, evidence snippet and grade; penalties and bonuses by name
- **Why ranked here:** the two strongest criteria plus what held the candidate back (gate, non-negotiable, floor or cap), from `explain()`
- **Interview probes:** the three weakest criteria, plus a "verify" probe for any DNA criterion graded C, from `probes()`
- Flags as chips: `confirm_relocation`, `consider_for:SPM`, `cleared_bar_capacity`, `evidence_not_found:*`
- Email draft per `email_policy`. Rejections must never mention scores, criteria, penalties or the instincts.

---

## 8. Limitations to show in an "About this ranking" panel

- The DNA criteria come from 8 past hires (5 thriving). They are a strong hypothesis, not proof.
- There is no senior PM among past hires; the SPM archetype is borrowed from the Head of Engineering.
- The rubric is deliberately exclusive. Expect few Shortlist candidates. A thin list is a signal to review the Review band, not to lower the bar.
- Scores support Arjun's decision; they never make it.


