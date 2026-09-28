import { describe, expect, it } from "vitest";
import { detectAll, detectPhones, guessName, isPhone } from "@/lib/pii/detect";
import { locationStatus } from "@/lib/pii/location";
import { redact } from "@/lib/pii/redact";
import { verifyRedaction } from "@/lib/pii/verify";
import { isResumeId, newResumeId, uniqueResumeId } from "@/lib/ids/resumeId";
import { cvHash, normalizeText } from "@/lib/parse/normalize";
import { HEADER_FIXTURES } from "../fixtures/headers";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM, sampleText } from "@/samples/sampleCvs";

describe("phone detector", () => {
  it.each([
    "+91 98204 37810", "+91-9820437810", "+919820437810", "98204-37810", "9820437810", "09820437810",
    "(022) 2345 6789", "+971 50 123 4567", "+1 415 555 0132", "91 98204 37810", "0 98765 43210",
  ])("matches %s", (p) => {
    expect(isPhone(p)).toBe(true);
    expect(detectPhones(`call ${p} today`).map((f) => f.value)).toEqual([p]);
  });

  it.each([
    "2019–2022", "2019 - 2022", "2019-22", "Jan 2019 – Mar 2022", "CGPA 8.7/10", "₹2.4Cr", "$180K", "35%",
    "150+ shipments", "300 live shipments", "grew 12.5% YoY", "2026-09", "Q3 2021", "1,20,000 users", "₹12,00,000",
    "ISO 9001:2015", "400 001", "30 days", "3.5 years",
  ])("does not match %s", (s) => {
    expect(detectPhones(`text ${s} text`)).toEqual([]);
  });
});

describe("name prefill heuristic", () => {
  it("reads the first line or its first segment", () => {
    expect(guessName("Sneha Pillai | sneha@x.com | +91 98204 37810")).toBe("Sneha Pillai");
    expect(guessName("RAKESH DESHPANDE\nFlat 12")).toBe("Rakesh Deshpande");
    expect(guessName("Zoya Mirza — Product Manager")).toBe("Zoya Mirza");
    expect(guessName("Curriculum Vitae\nx")).toBe("");
    expect(guessName("sneha@x.com")).toBe("");
  });
});

describe.each(HEADER_FIXTURES)("header style $id: $style", (fx) => {
  const { redactedText, report } = redact(fx.text, fx.name);

  it("removes every PII value", () => {
    for (const v of fx.mustRemove) expect(redactedText.toLowerCase()).not.toContain(v.toLowerCase());
  });
  it("keeps work evidence, money, years, CGPA and company locations", () => {
    for (const v of fx.mustKeep) expect(redactedText).toContain(v);
  });
  it("passes fail-closed verification", () => {
    const v = verifyRedaction(redactedText, fx.name, report.values);
    expect(v.leaks).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it("computes location status from the raw text", () => {
    expect(locationStatus(fx.text)).toBe(fx.expectLocation);
  });
});

describe("redaction output", () => {
  it("collapses a token-only header line", () => {
    const { redactedText } = redact(HEADER_FIXTURES[0].text, HEADER_FIXTURES[0].name);
    expect(redactedText.split("\n")[0]).toBe("[CONTACT_DETAILS_REMOVED]");
  });
  it("collapses a two-column header into one marker", () => {
    const { redactedText } = redact(HEADER_FIXTURES[2].text, HEADER_FIXTURES[2].name);
    expect(redactedText.split("\n").slice(0, 2)).toEqual(["[CONTACT_DETAILS_REMOVED]", "Summary"]);
  });
  it("keeps labels on personal-detail lines but removes the values", () => {
    const { redactedText, report } = redact(HEADER_FIXTURES[6].text, HEADER_FIXTURES[6].name);
    expect(redactedText).toContain("Gender: [PERSONAL_ID]");
    expect(redactedText).toContain("Address: [ADDRESS]");
    expect(report.counts.PERSONAL_ID).toBeGreaterThanOrEqual(6);
  });
  it("does not remove a body line that merely contains a 6-digit number and 'Phase'", () => {
    const t = "Jane Roe\njane@roe.io\nExperience\n— Led Phase 2 rollout to 120000 users in West region.";
    expect(redact(t, "Jane Roe").redactedText).toContain("Led Phase 2 rollout to 120000 users in West region.");
  });
  it("keeps bare company domains in work lines", () => {
    const t = "Jane Roe\njane@roe.io\nExperience\nProduct Manager, Freightly.in, Mumbai";
    expect(redact(t, "Jane Roe").redactedText).toContain("Freightly.in, Mumbai");
  });
  it("redacts name tokens anywhere in the body, case-insensitively", () => {
    const t = "Jane Roe\nExperience\nBuilt the ROE dashboard; colleagues call it Jane's tracker.";
    const r = redact(t, "Jane Roe").redactedText;
    expect(r).not.toMatch(/jane|roe/i);
  });
});

describe("verification fails closed", () => {
  it("flags a leaked email, phone and name", () => {
    const leaked = "[CONTACT_DETAILS_REMOVED]\nReach Sneha at sneha@x.com or 98204 37810";
    const v = verifyRedaction(leaked, "Sneha Pillai", []);
    expect(v.ok).toBe(false);
    expect(new Set(v.leaks.map((l) => l.type))).toEqual(new Set(["CANDIDATE", "EMAIL", "PHONE"]));
  });
  it("flags an original value that survived in a different form", () => {
    const v = verifyRedaction("phone 9820437810", "X Y", [{ type: "PHONE", value: "+91 98204 37810" }]);
    expect(v.ok).toBe(false);
  });
  it("never matches inside redaction tokens", () => {
    expect(detectAll("[CANDIDATE] [EMAIL] [PHONE] [URL] [LOCATION] [CONTACT_DETAILS_REMOVED]", "Candidate Email")).toEqual([]);
  });
});

describe("location status", () => {
  it("does not treat 'remote-only' work descriptions as a preference", () => {
    expect(locationStatus("A B\nMumbai\nExperience\n— Built remote-only onboarding for drivers")).toBe("mumbai");
  });
  it("detects explicit unwillingness anywhere", () => {
    expect(locationStatus("A B\nExperience\nNot willing to relocate.")).toBe("explicitly_unwilling");
  });
  it("ignores Mumbai in work lines", () => {
    expect(locationStatus("A B | a@b.com | Pune\nExperience\nOps Exec, Seabridge, Mumbai")).toBe("not_stated");
  });
});

describe("worked-example samples", () => {
  it.each([SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM])("$file redacts cleanly and keeps its evidence", (cv) => {
    const text = sampleText(cv);
    const { redactedText, report } = redact(text, cv.name);
    const [first, last] = cv.name.split(" ");
    expect(redactedText).not.toMatch(new RegExp(`${first}|${last}|@|\\+91|linkedin|github`, "i"));
    expect(verifyRedaction(redactedText, cv.name, report.values).ok).toBe(true);
    for (const s of cv.sections.flatMap((x) => x.lines).filter(Boolean)) expect(redactedText).toContain(s);
  });
  it("Sample A: header collapses; location mumbai", () => {
    const text = sampleText(SAMPLE_ACCEPT_PM);
    expect(redact(text, SAMPLE_ACCEPT_PM.name).redactedText.split("\n")[0]).toBe("[CONTACT_DETAILS_REMOVED]");
    expect(locationStatus(text)).toBe("mumbai");
  });
  it("Sample B: credentials survive on the header; location not stated", () => {
    const text = sampleText(SAMPLE_REJECT_PM);
    const first = redact(text, SAMPLE_REJECT_PM.name).redactedText.split("\n")[0];
    expect(first).toBe("[CANDIDATE] · [EMAIL] · [PHONE] · [LOCATION] · [URL] · CSPO · Reforge 2024 · Speaker, ProductCon");
    expect(locationStatus(text)).toBe("not_stated");
  });
});

describe("resume id and hashing", () => {
  it("has the KRG-YYYY-XXXXXX format", () => {
    const id = newResumeId(new Date("2026-09-28T00:00:00Z"));
    expect(id).toMatch(/^KRG-2026-[A-Z0-9]{6}$/);
    expect(isResumeId(id)).toBe(true);
  });
  it("retries on collision", async () => {
    let calls = 0;
    const id = await uniqueResumeId(async () => ++calls < 3);
    expect(calls).toBe(3);
    expect(isResumeId(id)).toBe(true);
  });
  it("hash is whitespace- and case-insensitive", () => {
    expect(cvHash(normalizeText("A  B\r\nC"))).toBe(cvHash(normalizeText("a b\nc ")));
  });
});
