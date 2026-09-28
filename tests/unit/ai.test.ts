import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertNoPii, extractEvidence, ExtractionError, PiiInPayloadError, type GeminiRequest } from "@/lib/ai/gemini";
import { CRITERION_IDS, EXTRACTION_JSON_SCHEMA, ExtractionSchema } from "@/lib/ai/extractionSchema";
import { buildUserPrompt, EXTRACTION_SYSTEM_PROMPT, PROMPT_VERSION } from "@/lib/ai/extractionPrompt";
import { locationStatus } from "@/lib/pii/location";
import { redact } from "@/lib/pii/redact";
import { renderGenerated } from "@/scripts/gen-prompt";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM, sampleText } from "@/samples/sampleCvs";
import { BLANK } from "../fixtures/calibration";

beforeAll(() => { process.env.GEMINI_BACKOFF_MS = "1"; });

/** A schema-valid extraction (BLANK plus the fields the strict schema requires). */
function validExtraction(over: Record<string, unknown> = {}) {
  return {
    ...structuredClone(BLANK),
    summary: "Operations then product.",
    location_status: "mumbai", // the model is told not_stated; the pipeline must override either way
    timeline: [{ title: "Product Manager", org: "Acme", function: "product", stage: "early", start: "2023-04", end: "present",
                 is_pm_title: true, owns_product_decisions_without_pm: false }],
    evidence: Object.fromEntries(CRITERION_IDS.map((id) => [id, []])),
    evidence_grades: {},
    ...over,
  };
}

function capture(responses: (string | Error)[]) {
  const calls: GeminiRequest[] = [];
  const fn = async (req: GeminiRequest) => {
    calls.push(req);
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r ?? "";
  };
  return { calls, fn };
}

describe("extraction prompt", () => {
  it("generated prompt module is in sync with KARGO_RUBRICS.md §3", () => {
    const md = readFileSync(path.join(process.cwd(), "rubrics/KARGO_RUBRICS.md"), "utf8");
    const onDisk = readFileSync(path.join(process.cwd(), "lib/ai/rubricsPrompt.generated.ts"), "utf8");
    expect(onDisk).toBe(renderGenerated(md));
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/^You extract structured hiring evidence/);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/No preamble, no Markdown fences\.$/);
  });
  it("user turn carries roles config, schema, role and the redacted text only", () => {
    const p = buildUserPrompt({ resumeId: "KRG-2026-ABCDEF", appliedRole: "SPM", redactedText: "[CONTACT_DETAILS_REMOVED]\nBody" });
    expect(p).toContain('"dna_criteria":["P1","P2","P3"]');
    expect(p).toContain('"candidate_id": "string"');
    expect(p).toContain("applied_role: SPM");
    expect(p).toContain('Set "location_status" to "not_stated"');
    expect(p).not.toContain("penalties"); // only the roles block, not the whole config
    expect(PROMPT_VERSION).toBe("extract-v2.0");
  });
  it("JSON schema sent to Gemini uses only supported keywords and exhaustive enums", () => {
    const s = JSON.stringify(EXTRACTION_JSON_SCHEMA);
    expect(s).not.toMatch(/"\$schema"|"pattern"|"\$ref"|"const"/);
    expect(s).toContain('"hands_on","desk_adjacent","none"');
  });
});

describe.each([SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM])("Gemini payload for $file", (cv) => {
  const raw = sampleText(cv);
  const { redactedText, report } = redact(raw, cv.name);
  const loc = locationStatus(raw);

  it("contains none of the PII values stored for the resume", async () => {
    const { calls, fn } = capture([JSON.stringify(validExtraction())]);
    await extractEvidence({ resumeId: "KRG-2026-TEST01", appliedRole: "PM", redactedText, locationStatus: loc, piiValues: report.values }, fn);
    expect(calls).toHaveLength(1);
    const body = JSON.stringify(calls[0]).toLowerCase();
    for (const { type, value } of report.values) {
      if (type === "LOCATION") continue; // the city may appear in company lines and in the rubric text
      expect(body, `${type} leaked`).not.toContain(value.toLowerCase());
    }
    for (const token of cv.name.toLowerCase().split(" ")) expect(body).not.toContain(token);
    expect(body).not.toMatch(/\+91|@gmail|linkedin\.com|github\.com/);
    expect(calls[0].config.temperature).toBe(0);
    expect(calls[0].config.responseMimeType).toBe("application/json");
  });
});

describe("extraction behaviour", () => {
  const input = (redactedText = "Body text", piiValues: { type: string; value: string }[] = []) => ({
    resumeId: "KRG-2026-TEST02", appliedRole: "PM" as const, redactedText, locationStatus: "not_stated" as const, piiValues,
  });

  it("overrides location_status and candidate_id", async () => {
    const { fn } = capture([JSON.stringify(validExtraction({ candidate_id: "something-else" }))]);
    const out = await extractEvidence(input(), fn);
    expect(out.extraction.location_status).toBe("not_stated");
    expect(out.extraction.candidate_id).toBe("KRG-2026-TEST02");
    expect(out.attempts).toBe(1);
  });

  it("retries once with validation errors appended, then succeeds", async () => {
    const bad = validExtraction({ ops: { ...BLANK.ops, mode: "sort_of_hands_on" } });
    const { calls, fn } = capture([JSON.stringify(bad), JSON.stringify(validExtraction())]);
    const out = await extractEvidence(input(), fn);
    expect(out.attempts).toBe(2);
    expect(calls[1].contents).toContain("failed schema validation");
    expect(calls[1].contents).toContain("ops.mode");
  });

  it("fails after two invalid responses", async () => {
    const { fn } = capture(["not json", "{}"]);
    await expect(extractEvidence(input(), fn)).rejects.toBeInstanceOf(ExtractionError);
  });

  it("retries a 429 once with backoff", async () => {
    const e = Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
    const { calls, fn } = capture([e, JSON.stringify(validExtraction())]);
    const out = await extractEvidence(input(), fn);
    expect(calls).toHaveLength(2);
    expect(out.attempts).toBe(2);
  });

  it("surfaces a transient error after the retry", async () => {
    const e = Object.assign(new Error("timeout"), { status: 504 });
    const { fn } = capture([e, e]);
    await expect(extractEvidence(input(), fn)).rejects.toMatchObject({ transient: true });
  });

  it("refuses to send a payload that still contains PII", async () => {
    const { calls, fn } = capture([JSON.stringify(validExtraction())]);
    await expect(
      extractEvidence(input("call me on 98204 37810", [{ type: "PHONE", value: "+91 98204 37810" }]), fn),
    ).rejects.toBeInstanceOf(PiiInPayloadError);
    expect(calls).toHaveLength(0);
  });

  it("name guard ignores past-hire names in the rubric text but catches them in the CV", () => {
    const vals = [{ type: "CANDIDATE", value: "Rohan" }];
    expect(() => assertNoPii("rubric mentions Rohan Desai", vals, "clean cv text")).not.toThrow();
    expect(() => assertNoPii("x", vals, "cv says Rohan built it")).toThrow(PiiInPayloadError);
  });

  it("schema rejects values outside the enums", () => {
    expect(ExtractionSchema.safeParse(validExtraction()).success).toBe(true);
    expect(ExtractionSchema.safeParse(validExtraction({ applied_role: "CPO" })).success).toBe(false);
    expect(ExtractionSchema.safeParse(validExtraction({ consistency_flags: ["career_gap"] })).success).toBe(false);
  });
});
