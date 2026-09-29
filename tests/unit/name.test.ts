import { describe, expect, it } from "vitest";
import { guessName } from "@/lib/pii/detect";
import { HEADER_FIXTURES } from "../fixtures/headers";
import { SAMPLES, sampleText } from "@/samples/sampleCvs";

describe("name detection from the CV", () => {
  it.each(HEADER_FIXTURES)("header style $id finds $name", (fx) => {
    expect(guessName(fx.text).toLowerCase()).toBe(fx.name.toLowerCase());
  });
  it.each(SAMPLES)("sample $file finds $name", (cv) => {
    expect(guessName(sampleText(cv))).toBe(cv.name);
  });
  it("skips a job-title first line and finds the name below it", () => {
    expect(guessName("Senior Product Manager\nNeha Kapoor\nneha.k@example.com | +91 98200 11111")).toBe("Neha Kapoor");
  });
  it("reads a Name: label and strips honorifics", () => {
    expect(guessName("CURRICULUM VITAE\nName: Mr. Arvind Rao\nEmail: arvind@example.com")).toBe("Arvind Rao");
  });
  it("falls back to email tokens that also appear in the CV", () => {
    expect(guessName("RESUME\nContact: sana.shaikh.pm@gmail.com\nExperience\nSana Shaikh led the tracking squad.")).toBe("Sana Shaikh");
  });
  it("returns empty when nothing credible exists (upload fails closed)", () => {
    expect(guessName("RESUME\nExperience\nWorked on logistics products.")).toBe("");
  });
});

describe("designed/two-column PDF layout (contact block extracted at the end, words glued)", () => {
  // Fictional person. Mirrors real PDFs where the header block comes out last and text runs together.
  const raw = [
    "Marketing & Analytics Lead",
    "PROFESSIONAL SUMMARY",
    "I build growth systems for 5+ years across consumer and logistics products.",
    "WORK EXPERIENCE",
    "Growth Manager, Freightly | 2021 – 2024",
    "● Ran 40 experiments; lifted activation 12%.",
    "Tools: SQL, Mixpanel, Amplitude",
    "RIYA KAPOORGrowth Marketer",
    "riya_7@pg27.mesaschool.co+91 98765 4321098765 43210 linkedin.com/in/riya-kapoor-growth-a",
    "Product Analyst | ABC Corp Jan 2019 – Dec 2020",
  ].join("\n");

  it("finds the name next to the contact line and removes glued phones completely", async () => {
    const { normalizeText } = await import("@/lib/parse/normalize");
    const { redact } = await import("@/lib/pii/redact");
    const { verifyRedaction } = await import("@/lib/pii/verify");
    const text = normalizeText(raw);
    expect(text).toContain("RIYA KAPOOR Growth Marketer");
    expect(text).toContain("mesaschool.co +91");
    const name = guessName(text);
    expect(name).toBe("Riya Kapoor");
    const { redactedText, report } = redact(text, name);
    expect(redactedText).not.toMatch(/riya|kapoor|98765|43210|pg27|linkedin/i);
    expect(verifyRedaction(redactedText, name, report.values).ok).toBe(true);
    expect(redactedText).toContain("Growth Marketer");
    expect(redactedText).toContain("2021 – 2024");
  });
});
