import "server-only";
import { CONTACT_REMOVED, detectAll, headerZone, splitLines, TOKEN, type Finding, type PiiType } from "./detect";

export interface RedactionReport {
  counts: Record<PiiType, number>;
  /** Original values. Stored only in the PII store; never logged, never sent to the AI. */
  values: { type: PiiType; value: string }[];
}

export interface RedactionResult {
  redactedText: string;
  report: RedactionReport;
  findings: Finding[];
}

const EMPTY_COUNTS = (): Record<PiiType, number> => ({
  CANDIDATE: 0, EMAIL: 0, PHONE: 0, URL: 0, ADDRESS: 0, PERSONAL_ID: 0, LOCATION: 0,
});

// A header line that is nothing but tokens and separators collapses into one marker line.
const TOKEN_ONLY_LINE =
  /^[\s|·•∙◦,;:\-–—/()📍✉☎📞📧🔗]*(?:(?:\[(?:CANDIDATE|EMAIL|PHONE|URL|ADDRESS|PERSONAL_ID|LOCATION)\]|(?:e-?mail|phone|mobile|mob|tel|ph|contact|linkedin|github|location|address|portfolio|web(?:site)?)\s*[:.]?)[\s|·•∙◦,;:\-–—/()📍✉☎📞📧🔗]*)+$/iu;

export function redact(text: string, fullName: string): RedactionResult {
  const findings = detectAll(text, fullName);
  const counts = EMPTY_COUNTS();
  const values: RedactionReport["values"] = [];
  let out = "";
  let pos = 0;
  for (const f of findings) {
    out += text.slice(pos, f.start) + TOKEN[f.type];
    pos = f.end;
    counts[f.type]++;
    values.push({ type: f.type, value: f.value });
  }
  out += text.slice(pos);

  const lines = out.split("\n");
  const headerCount = headerZone(splitLines(out)).length;
  const collapsed: string[] = [];
  for (const [i, line] of lines.entries()) {
    const isTokenOnly = i < headerCount && line.includes("[") && TOKEN_ONLY_LINE.test(line);
    if (isTokenOnly) {
      if (collapsed[collapsed.length - 1] !== CONTACT_REMOVED) collapsed.push(CONTACT_REMOVED);
    } else {
      collapsed.push(line);
    }
  }
  return { redactedText: collapsed.join("\n"), report: { counts, values }, findings };
}
