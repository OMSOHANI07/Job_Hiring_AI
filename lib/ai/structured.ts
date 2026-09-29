import "server-only";
import { z } from "zod";
import { assertNoPii, defaultModel, ExtractionError, isTransient, realGenerate, type GeminiRequest, type GenerateFn } from "./gemini";

// Shared structured-output call for the brief and email generators: temperature 0, JSON schema, the payload PII
// guard, one validation retry (errors appended) and one transient retry. Inputs are always redacted.

const ALLOWED = new Set(["type", "description", "enum", "items", "minItems", "maxItems", "properties", "additionalProperties", "required", "anyOf"]);
function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!ALLOWED.has(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, sanitize(pv)])) : sanitize(v);
  }
  return out;
}

export interface StructuredOutcome<T> { data: T; model: string; attempts: number; raw: string }

export async function generateStructured<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  piiValues: { type: string; value: string }[];
  /** Extra semantic check after schema validation (e.g. "rejection must not mention scores"). Return an error or null. */
  check?: (data: T) => string | null;
  generate?: GenerateFn;
}): Promise<StructuredOutcome<T>> {
  const generate = opts.generate ?? realGenerate;
  const model = defaultModel();
  const jsonSchema = sanitize(z.toJSONSchema(opts.schema));
  let prompt = opts.user;
  let attempts = 0;
  let raw = "";
  for (let v = 0; v < 2; v++) {
    const req: GeminiRequest = {
      model, contents: prompt,
      config: { systemInstruction: opts.system, temperature: 0, responseMimeType: "application/json", responseJsonSchema: jsonSchema },
    };
    assertNoPii(JSON.stringify(req), opts.piiValues, prompt);
    try {
      attempts++;
      raw = await generate(req);
    } catch (e) {
      if (!isTransient(e)) throw new ExtractionError(`AI request failed: ${(e as Error).message}`, attempts, null);
      await new Promise((r) => setTimeout(r, Number(process.env.GEMINI_BACKOFF_MS ?? 2000)));
      try { attempts++; raw = await generate(req); }
      catch (e2) { throw new ExtractionError(`AI service unavailable after retry: ${(e2 as Error).message}`, attempts, null, true); }
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")); }
    catch { prompt = `${opts.user}\n\nYour previous response was not valid JSON. Return ONLY valid JSON.`; continue; }
    const res = opts.schema.safeParse(parsed);
    if (!res.success) {
      prompt = `${opts.user}\n\nYour previous response failed validation:\n${res.error.issues.slice(0, 15).map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}\nReturn the complete corrected JSON only.`;
      continue;
    }
    const problem = opts.check?.(res.data) ?? null;
    if (problem) { prompt = `${opts.user}\n\nYour previous response broke a rule: ${problem}\nReturn corrected JSON only.`; continue; }
    return { data: res.data, model, attempts, raw };
  }
  throw new ExtractionError("The AI response failed validation twice.", attempts, raw);
}
