import "server-only";
import { detectAll, nameTokensOf, phoneKeys, type PiiType } from "./detect";

export interface VerifyResult {
  ok: boolean;
  /** Types that leaked. Values are included only for the PII-side review page; never log them. */
  leaks: { type: PiiType; value: string }[];
}

/**
 * Fail closed: re-run every detector on the redacted text, and separately check that no name token,
 * known email, phone or URL value from the original survives. Any hit blocks the Gemini call.
 */
export function verifyRedaction(
  redactedText: string,
  fullName: string,
  originalValues: { type: PiiType; value: string }[],
): VerifyResult {
  const leaks: VerifyResult["leaks"] = detectAll(redactedText, fullName).map((f) => ({ type: f.type, value: f.value }));
  const lower = redactedText.toLowerCase();
  const keys = phoneKeys(redactedText);
  for (const t of nameTokensOf(fullName)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");
    if (re.test(redactedText)) leaks.push({ type: "CANDIDATE", value: t });
  }
  for (const v of originalValues) {
    if (!["EMAIL", "PHONE", "URL", "PERSONAL_ID"].includes(v.type)) continue;
    if (v.value.length >= 5 && lower.includes(v.value.toLowerCase())) leaks.push(v);
    if (v.type === "PHONE") {
      const digits = v.value.replace(/\D/g, "");
      if (digits.length >= 8 && keys.has(digits.slice(-10))) leaks.push(v);
    }
  }
  const seen = new Set<string>();
  const unique = leaks.filter((l) => {
    const k = `${l.type}:${l.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { ok: unique.length === 0, leaks: unique };
}
