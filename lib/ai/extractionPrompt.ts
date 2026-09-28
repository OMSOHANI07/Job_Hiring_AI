import "server-only";
import { CFG } from "@/lib/scoring/config";
import type { Role } from "@/lib/scoring/types";
import { EXTRACTION_SCHEMA_TEXT, EXTRACTION_SYSTEM_PROMPT } from "./rubricsPrompt.generated";

export const PROMPT_VERSION = "extract-v2.0";

/**
 * User turn per KARGO_RUBRICS.md §3: RUBRIC_CONFIG (the roles block) + EXTRACTION_SCHEMA + redacted text
 * + applied role. The location note implements build-spec §6.2: home city never reaches the model, so it
 * must report not_stated; the engine substitutes the value computed in code.
 */
export function buildUserPrompt(input: { resumeId: string; appliedRole: Role; redactedText: string }): string {
  return [
    "RUBRIC_CONFIG (roles block):",
    JSON.stringify(CFG.roles),
    "",
    "EXTRACTION_SCHEMA:",
    EXTRACTION_SCHEMA_TEXT,
    "",
    `candidate_id: ${input.resumeId}`,
    `applied_role: ${input.appliedRole}`,
    "",
    'Location note: personal details, including home city, were removed from this CV before you received it. Set "location_status" to "not_stated".',
    "Redaction tokens such as [CANDIDATE], [EMAIL], [PHONE], [URL], [LOCATION] and [CONTACT_DETAILS_REMOVED] stand for removed personal details. Never copy them into evidence snippets.",
    "",
    "REDACTED CV TEXT (between the markers):",
    "<<<CV",
    input.redactedText,
    "CV>>>",
  ].join("\n");
}

export { EXTRACTION_SYSTEM_PROMPT };
