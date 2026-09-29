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
