import "server-only";
import type { LocationStatus } from "@/lib/scoring/types";
import { headerZone, splitLines } from "./detect";

const UNWILLING = /\b(?:not\s+willing\s+to\s+relocate|unwilling\s+to\s+relocate|cannot\s+relocate|can'?t\s+relocate|not\s+open\s+to\s+relocat(?:e|ion))\b/i;
const REMOTE_ONLY = /\b(?:remote[\s-]only|only\s+remote)\b/i;
// "remote only" counts only as a stated preference, not as a description of work ("built remote-only onboarding")
const PREFERENCE = /\b(?:looking|seeking|prefer|preference|open\s+to|available|roles?|opportunit|positions?|location|work\s+mode|relocat)/i;
const WILLING = /\b(?:willing\s+to\s+relocate|open\s+to\s+relocat(?:e|ion|ing)|relocating\s+to\s+mumbai|ready\s+to\s+relocate|happy\s+to\s+relocate)\b/i;
const MUMBAI = /(?<![\p{L}])(?:navi\s+mumbai|mumbai|bombay|thane)(?![\p{L}])/iu;
const PROFILE_HEADING = /^\s*(?:professional\s+|career\s+)?(?:summary|profile|about(?:\s+me)?|objective)\s*:?\s*$/i;
const NEXT_HEADING = /^\s*[A-Z][A-Za-z &]{2,40}:?\s*$/;

/**
 * Computed in code from the raw text BEFORE redaction, because home city never reaches the AI.
 * The engine uses this value and overrides whatever the model returns.
 */
export function locationStatus(rawText: string): LocationStatus {
  const lines = splitLines(rawText);
  const headerLines = headerZone(lines);
  const header = headerLines.map((l) => l.text).join("\n");
  if (UNWILLING.test(rawText)) return "explicitly_unwilling";
  if (lines.some((l) => REMOTE_ONLY.test(l.text) && (PREFERENCE.test(l.text) || headerLines.includes(l)))) {
    return "explicitly_unwilling";
  }
  if (WILLING.test(rawText)) return "willing_to_relocate";
  if (MUMBAI.test(header)) return "mumbai";
  // profile / summary section
  const idx = lines.findIndex((l) => PROFILE_HEADING.test(l.text));
  if (idx >= 0) {
    const body: string[] = [];
    for (const l of lines.slice(idx + 1)) {
      if (NEXT_HEADING.test(l.text) && body.length) break;
      body.push(l.text);
    }
    if (/\b(?:based\s+in|located\s+in|living\s+in|resident\s+of)\s+(?:navi\s+mumbai|mumbai|thane)\b/i.test(body.join(" "))) return "mumbai";
  }
  if (/^\s*(?:location|city|based\s+in)\s*[:\-–]\s*.*\b(?:navi\s+mumbai|mumbai|thane)\b/im.test(rawText)) return "mumbai";
  return "not_stated";
}
