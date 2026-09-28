# Worked examples: expected and actual outputs

Two **fictional** CVs, written in the style of the case CVs (header line, Summary, Experience with em-dash bullets,
Education, Certifications & Tools). Source text lives in [`sampleCvs.ts`](sampleCvs.ts); the `.docx` files are generated
from it with `npx tsx scripts/make-samples.ts`, so documents and tests can't drift apart.

Both are loadable in one click from **Examples** in the app and run through the real pipeline: parse → redact →
redaction preview (you confirm) → Gemini extraction → deterministic scoring.

Scoring note: in this build each CV is scored **only against the rubric of the role it was submitted for** (decision
by Arjun, 28 Sep 2026). Both samples are PM applications.

**Resume ID format:** `KRG-{YYYY}-{6 random uppercase alphanumerics}`, e.g. `KRG-2026-7QH2MZ` (crypto-random, retried on collision).

---

## Sample A — Accept

`sample_accept_pm.docx` · applied role **PM** · expected **Accept – Priority** (or Accept)

### Redacted text sent to Gemini

Location status is computed in code before redaction: `mumbai` (the contact line says Mumbai).
Redaction counts: name 1, email 1, phone 1, URL 1, location 1. The whole header collapses to one marker.

```text
[CONTACT_DETAILS_REMOVED]
Summary
Product Manager who spent almost four years inside freight forwarding operations before moving into product. Sole PM at a Series A freight visibility SaaS company, owning tracking and documentation workflows end to end.
Experience
Product Manager, Trackwell Logistics Technologies (Series A, 60 people), Mumbai | Apr 2023 – Present
— Sole Product Manager; own tracking and documentation workflows and report directly to the CEO.
— Shipped 5 features across shipment tracking and document management.
— Killed 2 features after usage data showed under 5% weekly adoption; redirected the sprint to a document-exception inbox used by 70% of accounts within 30 days.
— Ran on-site discovery at 6 forwarder offices; a finding on manual carrier confirmations led to a pivot that cut support tickets 45%.
— Own sprint planning and the quarterly roadmap that engineering works from.
— Wrote and ran the post-mortem after a 3-hour tracking outage and closed every action item.
Operations & Documentation Executive → Senior Executive, Konkan Cargo Movers Pvt Ltd (freight forwarder), Mumbai | Aug 2019 – Mar 2023
— Prepared Bills of Lading, shipping bills and certificates of origin for 150+ shipments a month.
— Coordinated shipping lines and the CHA on bookings, cut-offs and customs filings; managed shipment exceptions.
— Resolved a customs hold overnight before a vessel cut-off, getting the container loaded on time.
— Built a shipment status tracker in Google Sheets after finding the team had no single view of 300 live shipments; adopted by 3 branch teams within a month and still in use.
Education
B.E. Mechanical Engineering, 2019
Certifications & Tools
Jira, SQL, Mixpanel, CargoWise (working knowledge)
```

(Company locations in work lines, such as "Mumbai" after the employer, are kept. Only the home city on the contact line is removed.)

### Expected levels

| ID | Criterion | Expected level | Why |
|---|---|---|---|
| P1 | Freight-floor immersion | 3 | Tier A (freight forwarder), hands-on, 44 months, ≥ 2 Kargo surfaces (documentation, carrier coordination, customs, exceptions) |
| P2 | Builds the missing thing, and it spreads | 3 | Unprompted ("after finding"), operational gap, adopted cross-team (3 branch teams), permanent ("still in use") |
| P3 | Sole ownership, no product layer above | 3 | Sole PM, reports to the CEO, owned an outage post-mortem to closure |
| P4 | Ships and kills on evidence | 3 | Killed 2 features on usage data; outcome measured |
| P5 | 0→1 building | 2–3 | Early stage (Series A, 60 people). 3 only if the model also reads "first of kind" |
| P6 | Discovery with operations users | 3 | On-site at 6 forwarder offices; changed the build; −45% tickets |
| P7 | Engineering three sprints out | 3 | Owns sprint planning and the roadmap engineering works from |
| P8 | Kargo's core surfaces | 3 | Logistics customers; tracking and documentation workflows |

### Expected decision: Accept – Priority

- **Gates:** K1 pass (3.5 product years: Apr 2023 → Sep 2026), K2 pass (`mumbai`), K3 pass (P4 = 3).
- **Non-negotiables:** P1 ≥ 2 ✓, P3 ≥ 2 ✓, P4 ≥ 2 ✓, triad P1+P2+P3 = 9 ≥ 7 ✓.
- **Penalties:** none. **Bonuses:** B1 (ops before product, hands-on) +3, B2 (worked at a forwarder) +2 = +5 (cap +5).
- DNA evidence multiplier 1.0 ≥ 0.9, no consistency flags → **Priority shortlist**.

### Actual (E2E, `gemini-3.8-flash`, 3 independent runs, 28 Sep 2026)

| Run | Levels P1–P8 | Base | Penalties | Bonuses | **Score** | **Decision** |
|---|---|---|---|---|---|---|
| 1 | 3 3 3 3 **2** 3 3 3 | 95.78 | – | B1, B2 | **100.0** | **Accept – Priority** |
| 2 | 3 3 3 3 3 3 3 3 | 98.05 | – | B1, B2 | **100.0** | **Accept – Priority** |
| 3 | 3 3 3 3 **2** 3 3 3 | 95.78 | – | B1, B2 | **100.0** | **Accept – Priority** |

Evidence grades: A on P1–P4, P6, P8; B on P5 and P7. Product years 3.5. Flags: none. One Gemini attempt per run, 14.6–16.6 s.
The only run-to-run variation is P5 (whether the model marks `first_of_kind`), which the +5 bonus absorbs.

---

## Sample B — Reject

`sample_reject_pm.docx` · applied role **PM** · expected **Reject**

### Redacted text sent to Gemini

Location status: `not_stated` (Bengaluru on the contact line, no relocation statement). The header does **not** collapse,
because the credentials on it are not personal details and are exactly what the X1 penalty looks for.

```text
[CANDIDATE] · [EMAIL] · [PHONE] · [LOCATION] · [URL] · CSPO · Reforge 2024 · Speaker, ProductCon
Summary
Certified Scrum Product Owner with five years in consumer fintech product management. Skilled in JTBD, RICE prioritisation, OKRs, Agile/Scrum and North Star metrics.
Experience
Product Manager, PayNova (consumer fintech app, 2,500 employees), Bengaluru | Jun 2021 – Present
— Part of the payments squad on a 9-person PM team.
— Worked with senior PMs and a Group PM who set the roadmap to improve checkout conversion 6% on the established payments product.
— Wrote PRDs and handed them to engineering for delivery.
— Used JTBD, RICE, OKRs, Agile/Scrum and North Star frameworks to structure the squad's work.
Associate Product Manager, PayNova, Bengaluru | Jul 2019 – May 2021
— Supported senior PMs on the wallet and rewards features.
— Assisted with sprint ceremonies and backlog grooming.
Education
B.Tech Computer Science, 2019
Certifications & Tools
Certified Scrum Product Owner (CSPO), Reforge Product Strategy 2024, Speaker at ProductCon 2023
Jira, Confluence, Amplitude, Figma
```

### Expected levels

| ID | Expected | Why |
|---|---|---|
| P1 | **0** | No operations or logistics experience at all |
| P2 | 0 | Nothing built unprompted |
| P3 | 0 | One of 9 PMs, Group PM sets the roadmap, team-framed ("part of the payments squad") |
| P4 | 0–1 | A 6% conversion gain, but team-attributed and on an established product |
| P5 | 0 | Large company (2,500 people) |
| P6 | 0 | No discovery described |
| P7 | 1 | Specs handed to engineering |
| P8 | 0 | B2C fintech |

### Expected decision: Reject

- **P1 = 0.** The **P1 non-negotiable (P1 ≥ 2) fails**, and so do P3 ≥ 2, P4 ≥ 2 and the triad (0/9).
  The P1 **floor** ("P1 = 0 caps the band at Review") is in force, but it only *lowers* a band. This CV is already
  below Review, so the floor doesn't move it and no `floor:P1` flag is raised (same as the reference engine).
- **Penalties:** X1 credential-led (CSPO / Reforge / Speaker before outcomes) −3, X4 framework vocabulary without candour
  (JTBD, RICE, OKR, Agile, Scrum, North Star; nothing killed or reversed) −2, X5_PM maintenance-only (established product) −3.
  **Also X3** team-framed only (−3), because every achievement is framed as part of a team and P3 ≤ 1. The build spec didn't
  predict X3, but it follows directly from the rubric's X3 rule and the CV text.
- **Flags:** `confirm_relocation` (location not stated), plus `consider_for:SPM`: APM (Jul 2019) + PM (Jun 2021) comes to about
  7.2 product years, above the PM limit of 6. That flag only caps a PM band at Review; it doesn't lift a Reject, and this
  build does not route across roles.
- **Score below 60 → Reject.**

### Actual (E2E, `gemini-3.8-flash`, 3 independent runs, 28 Sep 2026)

| Run | Levels P1–P8 | Base | Penalties | Gate | **Score** | **Decision** |
|---|---|---|---|---|---|---|
| 1 | 0 0 0 **0** 0 0 1 0 | 1.42 | X1, X3, X4, X5_PM (−11) | K3_not_shipped | **0.0** | **Reject** |
| 2 | 0 0 0 1 0 0 1 0 | 3.82 | X1, X3, X4, X5_PM (−11) | – | **0.0** | **Reject** |
| 3 | 0 0 0 1 0 0 1 0 | 3.82 | X1, X3, X4, X5_PM (−11) | – | **0.0** | **Reject** |

Non-negotiables failed in every run: P1 ≥ 2, P3 ≥ 2, P4 ≥ 2, triad ≥ 7 (triad 0/9). Flags: `consider_for:SPM`, `confirm_relocation`.
Product years 7.2. Evidence grades: C on P3 and P4, B on P7. One Gemini attempt per run, 9.2–15.7 s.
In run 1 the model graded the 6% conversion outcome as not attributable, so P4 = 0 and gate K3 (has shipped) also failed.

---

## PII check (both samples, every run)

The E2E test (`npm run test:e2e`) wraps the real Gemini transport, captures each outgoing request, and checks it against every
PII value stored for that resume (name, email, phone, profile URL). **0 of 6 requests contained any stored value.** (The home
city is not checked, because the same city legitimately appears in company lines and in the rubric text; the contact-line city
itself is replaced with `[LOCATION]`.)

Re-run: `npm run test:e2e` → writes `tests/.out/e2e_results.json`.
