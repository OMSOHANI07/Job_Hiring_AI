import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { LocationStatus, Role } from "@/lib/scoring/types";
import { phoneKeys } from "@/lib/pii/detect";
import { buildUserPrompt, EXTRACTION_SYSTEM_PROMPT, PROMPT_VERSION } from "./extractionPrompt";
import { EXTRACTION_JSON_SCHEMA, ExtractionSchema, formatZodIssues, type ValidExtraction } from "./extractionSchema";

export interface GeminiRequest {
  model: string;
  contents: string;
  config: {
    systemInstruction: string;
    temperature: number;
    responseMimeType: "application/json";
    responseJsonSchema: unknown;
  };
}

/** Injectable transport so tests can capture the exact outgoing payload. Returns the model's text. */
export type GenerateFn = (req: GeminiRequest) => Promise<string>;

export class PiiInPayloadError extends Error {
  constructor(public types: string[]) {
    super(`Refusing to call the AI: payload contains personal details (${types.join(", ")})`);
  }
}
export class ExtractionError extends Error {
  constructor(message: string, public attempts: number, public rawResponse: string | null, public transient = false) {
    super(message);
  }
}

export function defaultModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

let client: GoogleGenAI | null = null;
export const realGenerate: GenerateFn = async (req) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ExtractionError("GEMINI_API_KEY is not set", 0, null);
  client ??= new GoogleGenAI({ apiKey: key });
  const res = await client.models.generateContent({ ...req, config: { ...req.config, httpOptions: { timeout: 45_000 } } });
  return res.text ?? "";
};

function isTransient(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = String((e as Error)?.message ?? e);
  return status === 429 || (status !== undefined && status >= 500) || /timeout|timed out|ECONNRESET|fetch failed|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
}

/**
 * Defence in depth: the caller passes every stored PII value; if any appears in the payload, stop.
 * Contact details and identifiers are checked against the whole payload. Name values are checked against the
 * CV part only, because the fixed rubric text names past hires (a candidate called "Rohan" is not a leak there).
 * Home-city values are not checked: the same city legitimately appears in work lines and in the rubric.
 */
export function assertNoPii(payload: string, piiValues: { type: string; value: string }[], cvPart: string = payload): void {
  const hits = new Set<string>();
  const keys = phoneKeys(payload);
  for (const { type, value } of piiValues) {
    if (type === "LOCATION") continue;
    const v = value.trim().toLowerCase();
    if (v.length < 3) continue;
    const lower = (type === "CANDIDATE" ? cvPart : payload).toLowerCase();
    // name tokens and places need word boundaries ("Rao" inside "Rao-Bahadur Road" is still a hit; inside "tRAOn" is not)
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");
    if (re.test(lower)) hits.add(type);
    if (type === "PHONE") {
      const d = v.replace(/\D/g, "");
      if (d.length >= 8 && keys.has(d.slice(-10))) hits.add(type);
    }
  }
  if (hits.size) throw new PiiInPayloadError([...hits]);
}

export interface ExtractionOutcome {
  extraction: ValidExtraction;
  rawResponse: string;
  attempts: number;
  latencyMs: number;
  model: string;
  promptVersion: string;
}

/**
 * Stage 4: structured evidence extraction from the REDACTED text only.
 * Temperature 0, JSON mode with schema. One validation retry (errors appended); one transient retry (429 / 5xx / timeout).
 * location_status is overridden with the code-computed value and candidate_id is forced to the Resume ID.
 */
export async function extractEvidence(
  input: { resumeId: string; appliedRole: Role; redactedText: string; locationStatus: LocationStatus; piiValues: { type: string; value: string }[] },
  generate: GenerateFn = realGenerate,
): Promise<ExtractionOutcome> {
  const model = defaultModel();
  const basePrompt = buildUserPrompt(input);
  const t0 = Date.now();
  let attempts = 0;
  let lastRaw: string | null = null;
  let prompt = basePrompt;

  for (let validationTry = 0; validationTry < 2; validationTry++) {
    const req: GeminiRequest = {
      model,
      contents: prompt,
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: EXTRACTION_JSON_SCHEMA,
      },
    };
    assertNoPii(JSON.stringify(req), input.piiValues, input.redactedText);

    let raw: string;
    try {
      attempts++;
      raw = await generate(req);
    } catch (e) {
      if (!isTransient(e)) throw new ExtractionError(`AI request failed: ${(e as Error).message}`, attempts, null);
      await new Promise((r) => setTimeout(r, Number(process.env.GEMINI_BACKOFF_MS ?? 2000)));
      try {
        attempts++;
        raw = await generate(req);
      } catch (e2) {
        throw new ExtractionError(`AI service unavailable after retry: ${(e2 as Error).message}`, attempts, null, true);
      }
    }
    lastRaw = raw;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
    } catch {
      prompt = `${basePrompt}\n\nYour previous response was not valid JSON. Return ONLY valid JSON matching EXTRACTION_SCHEMA.`;
      continue;
    }
    const result = ExtractionSchema.safeParse(parsed);
    if (result.success) {
      const extraction = { ...result.data, candidate_id: input.resumeId, applied_role: input.appliedRole, location_status: input.locationStatus };
      return { extraction, rawResponse: raw, attempts, latencyMs: Date.now() - t0, model, promptVersion: PROMPT_VERSION };
    }
    prompt = `${basePrompt}\n\nYour previous response failed schema validation:\n${formatZodIssues(result.error)}\nReturn the complete corrected JSON only.`;
  }
  throw new ExtractionError("The AI returned an extraction that failed validation twice.", attempts, lastRaw);
}
