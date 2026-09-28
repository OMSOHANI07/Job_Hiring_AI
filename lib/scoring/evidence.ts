import "server-only";
import { CFG } from "./config";
import { SequenceMatcher } from "./pymath";

/** Python: re.sub(r"\s+", " ", s.lower()).strip() */
export function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/gu, " ").trim();
}

/**
 * True if any snippet appears in the CV text: normalised substring, or a sliding window
 * (width = snippet length, step = width // 4) with SequenceMatcher ratio >= fuzzy_threshold.
 */
export function evidenceFound(snippets: string[] | undefined, cvText: string): boolean {
  const cvChars = Array.from(norm(cvText));
  const cv = cvChars.join("");
  const thr = CFG.evidence_validation.fuzzy_threshold;
  for (const s of snippets ?? []) {
    const n = norm(s);
    if (!n) continue;
    if (cv.includes(n)) return true;
    const w = Array.from(n).length;
    const step = Math.max(1, Math.floor(w / 4));
    const end = Math.max(1, cvChars.length - w + 1);
    for (let i = 0; i < end; i += step) {
      const window = cvChars.slice(i, i + w).join("");
      if (new SequenceMatcher(n, window).ratio() >= thr) return true;
    }
  }
  return false;
}
