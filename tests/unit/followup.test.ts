import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackEmail, NAME_PLACEHOLDER, rejectionViolations, renderEmail } from "@/lib/ai/email";
import type { GeminiRequest } from "@/lib/ai/gemini";
import { CRITERION_IDS } from "@/lib/ai/extractionSchema";
import { getStore, setStoreForTests } from "@/lib/db/client";
import { nextAction } from "@/lib/decision";
import { proposeSlots } from "@/lib/email/slots";
import { editEmail, getFollowUp, prepareFollowUp, recordDecision, sendCandidateEmail } from "@/lib/followup";
import { scoreResume, uploadCv } from "@/lib/pipeline";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM, type SampleCv } from "@/samples/sampleCvs";
import { BLANK } from "../fixtures/calibration";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
let dir = "";
const env = { ...process.env };

beforeAll(() => { process.env.GEMINI_BACKOFF_MS = "1"; });
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kargo-fu-"));
  process.env.LOCAL_DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "local";
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.EMAIL_MODE = "redirect";
  process.env.EMAIL_REDIRECT_TO = "arjun-test@example.com";
  setStoreForTests(null);
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.unstubAllGlobals(); });
afterAll(() => { process.env = env; setStoreForTests(null); });

// ---------------------------------------------------------------- fake Gemini
const strong = {
  ...structuredClone(BLANK), summary: "Freight forwarding operations, then sole PM at a Series A freight SaaS.",
  timeline: [{ title: "Product Manager", org: "Trackwell", function: "product", stage: "early", start: "2023-04", end: "present", is_pm_title: true, owns_product_decisions_without_pm: false }],
  ops: { domain_tier: "A", mode: "hands_on", months_hands_on: 44, kargo_surfaces: ["documentation", "carrier_coordination", "customs_clearance"], systems_hands_on: [], live_crisis: true, ops_before_current_function: true, worked_at_forwarder_or_3pl: true },
  builds: [{ description: "tracker", unprompted: true, gap_type: "operational", adoption_scope: "cross_team", permanent: true, measurable_effect: true }],
  ownership: { layer_above: "none", sole_owner: true, area_owner: true, reports_to_founder_ceo: true, owned_incident_to_closure: true, team_framed_only: false },
  shipping: { shipped_count: 5, outcome_measured: true, killed_or_reversed: true, postmortem: true, short_cycles: true },
  environment: { best_stage: "early", first_of_kind: true },
  discovery: { method: "on_site", users_are_ops: true, changed_build: true, quantified_effect: true },
  eng_cadence: { signal: "owns_rhythm" },
  product_surfaces: { surfaces: ["tracking_visibility"], customer_type: "logistics" },
  evidence: Object.fromEntries(CRITERION_IDS.map((id) => [id, [] as string[]])),
  evidence_grades: { P1: "A", P2: "A", P3: "A", P4: "A", P5: "A", P6: "A", P7: "A", P8: "A" },
};
Object.assign(strong.evidence, {
  P1: ["Prepared Bills of Lading, shipping bills and certificates of origin for 150+ shipments a month."],
  P2: ["Built a shipment status tracker in Google Sheets after finding the team had no single view of 300 live shipments"],
  P3: ["Sole Product Manager; own tracking and documentation workflows and report directly to the CEO."],
  P4: ["Killed 2 features after usage data showed under 5% weekly adoption"],
  P5: ["Sole PM at a Series A freight visibility SaaS company"],
  P6: ["Ran on-site discovery at 6 forwarder offices"],
  P7: ["Own sprint planning and the quarterly roadmap that engineering works from."],
  P8: ["Shipped 5 features across shipment tracking and document management."],
});
const weak = { ...structuredClone(BLANK), summary: "Consumer fintech PM on a large team.", evidence: Object.fromEntries(CRITERION_IDS.map((id) => [id, []])), evidence_grades: {},
  timeline: [{ title: "PM", org: "PayNova", function: "product", stage: "large", start: "2021-06", end: "present", is_pm_title: true, owns_product_decisions_without_pm: false }],
  shipping: { ...BLANK.shipping, shipped_count: 1 } };
(weak.evidence as Record<string, string[]>).P4 = ["Wrote PRDs and handed them to engineering for delivery."];

function fakeGemini(extraction: unknown, overrides: Partial<Record<"invite" | "reject" | "brief", unknown>> = {}) {
  const calls: GeminiRequest[] = [];
  const fn = async (req: GeminiRequest) => {
    calls.push(req);
    const sys = req.config.systemInstruction;
    if (sys.startsWith("You extract")) return JSON.stringify(extraction);
    if (sys.includes("interview brief")) {
      return JSON.stringify(overrides.brief ?? {
        summary: "Hands-on freight operations for four years, then sole PM at a Series A freight SaaS; clears every rule.",
        strengths: [{ criterion: "P1", point: "Did the documentation work herself.", evidence: "Prepared Bills of Lading, shipping bills and certificates of origin for 150+ shipments a month." }],
        risks: [{ criterion: "P5", point: "Check what was first-of-kind." }],
        questions: [1, 2, 3, 4].map((i) => ({ criterion: "P1", question: `Question ${i}?`, listen_for: "Specifics." })),
      });
    }
    if (sys.includes("interview invitation")) {
      const slots = [...req.contents.matchAll(/^- (.+ IST)$/gm)].map((m) => m[1]);
      return JSON.stringify(overrides.invite ?? {
        subject: "Kargo · Product Manager · Let's talk",
        body: `Hi ${NAME_PLACEHOLDER},\n\nYour freight operations work stood out.\n\n${slots.map((s) => `- ${s}`).join("\n")}\n\nArjun Mehta\nFounder, Kargo`,
      });
    }
    return JSON.stringify(overrides.reject ?? {
      subject: "Kargo · Product Manager · Your application",
      body: `Hi ${NAME_PLACEHOLDER},\n\nThank you for applying. We've decided to move forward with other candidates whose experience is closer to what this role needs right now. You're welcome to apply for future openings.\n\nArjun Mehta\nFounder, Kargo`,
    });
  };
  return { calls, fn };
}

async function scored(cv: SampleCv, extraction: unknown, g = fakeGemini(extraction)) {
  const data = new Uint8Array(readFileSync(path.join(process.cwd(), "samples", cv.file)));
  const up = await uploadCv({ data, fileName: cv.file, mime: DOCX, role: cv.appliedRole });
  if (up.kind !== "created") throw new Error("upload failed");
  await scoreResume(up.resumeId, g.fn);
  return { id: up.resumeId, g };
}

// ---------------------------------------------------------------- pure helpers
describe("policy and helpers", () => {
  it("next action follows email_policy; Arjun's decision overrides", () => {
    expect(nextAction("priority_shortlist", null)).toBe("invite");
    expect(nextAction("shortlist", null)).toBe("invite");
    expect(nextAction("review", null)).toBe("decide");
    expect(nextAction("not_shortlisted", null)).toBe("reject");
    expect(nextAction("review", { action: "reject" })).toBe("reject");
    expect(nextAction("not_shortlisted", { action: "invite" })).toBe("invite");
  });
  it("rejection guard catches scores, criteria and rubric language", () => {
    expect(rejectionViolations("Your score of 42/100 was below our bar")).toEqual(expect.arrayContaining(["score", "42/100"]));
    expect(rejectionViolations("You lacked Freight-floor immersion")).toContain("Freight-floor immersion");
    expect(rejectionViolations("Our rubric and DNA criteria")).toEqual(expect.arrayContaining(["rubric", "dna", "criteria"]));
    expect(rejectionViolations("At this point we have decided to move forward with other candidates.")).toEqual([]);
    const f = fallbackEmail("rejection", "PM", [], false);
    expect(rejectionViolations(`${f.subject}\n${f.body}`)).toEqual([]);
  });
  it("renders the first name only at send time", () => {
    expect(renderEmail({ subject: "Hi", body: `Hi ${NAME_PLACEHOLDER},` }, "Ananya").body).toBe("Hi Ananya,");
  });
  it("proposes 3 weekday IST slots within 5 working days for priority", () => {
    const slots = proposeSlots({ priority: true, now: new Date("2026-10-02T06:00:00Z") }); // a Friday
    expect(slots).toHaveLength(3);
    for (const s of slots) expect(s).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday) \d{1,2} \w+, \d{2}:\d{2} IST$/);
    expect(slots[0]).toMatch(/^Monday 5 October/);
    expect(slots[2]).toMatch(/^Friday 9 October/);
  });
});

// ---------------------------------------------------------------- pipeline with fakes
describe("brief + email generation", () => {
  it("Priority candidate: brief + invite drafted; no PII in any AI request; slots included", async () => {
    const { id, g } = await scored(SAMPLE_ACCEPT_PM, strong);
    const out = await prepareFollowUp(id, { generate: g.fn });
    expect(out).toEqual({ action: "invite", errors: [] });
    const s = (await getFollowUp(id))!;
    expect(s.brief?.brief.strengths[0].criterion).toBe("P1");
    expect(s.email?.kind).toBe("invite");
    expect(s.email?.body.startsWith(`Hi ${NAME_PLACEHOLDER},`)).toBe(true);
    expect(s.email?.body).not.toMatch(/Ananya|Kulkarni/i);
    const body = JSON.stringify(g.calls).toLowerCase();
    for (const v of ["ananya", "kulkarni", "98190", "gmail.com", "linkedin.com/in"]) expect(body).not.toContain(v);
    expect(g.calls.filter((c) => c.config.systemInstruction.includes("interview brief"))).toHaveLength(1);
  });

  it("Reject candidate: rejection drafted, no brief", async () => {
    const { id, g } = await scored(SAMPLE_REJECT_PM, weak);
    const out = await prepareFollowUp(id, { generate: g.fn });
    expect(out.action).toBe("reject");
    const s = (await getFollowUp(id))!;
    expect(s.brief).toBeNull();
    expect(s.email?.kind).toBe("rejection");
    expect(rejectionViolations(s.email!.body)).toEqual([]);
  });

  it("a rejection that mentions scores is retried, then falls back to the safe template", async () => {
    const bad = { subject: "Kargo application", body: `Hi ${NAME_PLACEHOLDER},\n\nYour score was 12/100 on our rubric, so we won't proceed with you for this role at this time.\n\nArjun Mehta\nFounder, Kargo` };
    const { id } = await scored(SAMPLE_REJECT_PM, weak);
    const g = fakeGemini(weak, { reject: bad });
    await prepareFollowUp(id, { generate: g.fn });
    const e = (await getFollowUp(id))!.email!;
    expect(e.model).toBeNull(); // template
    expect(rejectionViolations(e.body)).toEqual([]);
    expect(g.calls.filter((c) => c.config.systemInstruction.includes("rejection"))).toHaveLength(2);
    expect(g.calls[1].contents).toContain("must not mention");
  });

  it("brief evidence that is not verbatim from the CV is rejected", async () => {
    const { id } = await scored(SAMPLE_ACCEPT_PM, strong);
    const g = fakeGemini(strong, { brief: {
      summary: "Invented summary that is long enough to pass.", strengths: [{ criterion: "P1", point: "x", evidence: "Ran the Singapore office for ten years" }],
      risks: [{ criterion: "P5", point: "y" }], questions: [1, 2, 3].map(() => ({ criterion: "P1", question: "q?", listen_for: "l" })) } });
    const out = await prepareFollowUp(id, { generate: g.fn });
    expect(out.errors[0]).toMatch(/brief couldn't be generated/);
    expect((await getFollowUp(id))!.brief).toBeNull();
  });
});

describe("Arjun decides, edits and sends", () => {
  it("Review needs a decision: no draft until he decides; then the matching email is drafted", async () => {
    const reviewish = structuredClone(strong);
    reviewish.ownership = { ...reviewish.ownership, layer_above: "manager_only", sole_owner: false, owned_incident_to_closure: false }; // P3 = 1 -> Review
    const { id, g } = await scored(SAMPLE_ACCEPT_PM, reviewish);
    expect((await getFollowUp(id))!.action).toBe("decide");
    await prepareFollowUp(id, { generate: g.fn });
    expect((await getFollowUp(id))!.email).toBeNull();
    await recordDecision(id, "invite", g.fn);
    const s = (await getFollowUp(id))!;
    expect(s.action).toBe("invite");
    expect(s.email?.kind).toBe("invite");
    expect(s.brief).not.toBeNull();
    await recordDecision(id, "reject", g.fn);
    expect((await getFollowUp(id))!.email?.kind).toBe("rejection");
  });

  it("edits allow only the first-name token", async () => {
    const { id, g } = await scored(SAMPLE_REJECT_PM, weak);
    await prepareFollowUp(id, { generate: g.fn });
    await expect(editEmail(id, "Subject", `Hi [CANDIDATE], this leaks a token.`)).rejects.toThrow(/Remove \[CANDIDATE\]/);
    const r = await editEmail(id, "Kargo", `Hi ${NAME_PLACEHOLDER}, your score was low. Arjun`);
    expect(r.warnings).toContain("score");
  });

  it("send: redirect mode delivers to the test address, with the real name filled in, exactly once", async () => {
    const { id, g } = await scored(SAMPLE_ACCEPT_PM, strong);
    await prepareFollowUp(id, { generate: g.fn });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_msg_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await sendCandidateEmail(id);
    expect(out).toEqual({ status: "sent", mode: "redirect" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const sent = JSON.parse(String(init.body));
    expect(sent.to).toEqual(["arjun-test@example.com"]);
    expect(sent.subject.startsWith("[TEST] ")).toBe(true);
    expect(sent.text).toContain("Hi Ananya,");
    expect(sent.text).toContain("would go to ananya.kulkarni.pm@gmail.com");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^kargo-/);
    await expect(sendCandidateEmail(id)).rejects.toThrow(/Already sent/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const e = (await getFollowUp(id))!.email!;
    expect(e).toMatchObject({ status: "sent", provider_id: "re_msg_123", delivery_mode: "redirect" });
    expect(e.body).toContain(NAME_PLACEHOLDER); // stored template still has no name
    await expect(recordDecision(id, "reject", g.fn)).rejects.toThrow(/already been sent/);
  });

  it("send refuses without a test recipient and records failures without leaking addresses", async () => {
    const { id, g } = await scored(SAMPLE_ACCEPT_PM, strong);
    await prepareFollowUp(id, { generate: g.fn });
    process.env.EMAIL_REDIRECT_TO = "";
    await expect(sendCandidateEmail(id)).rejects.toThrow(/EMAIL_REDIRECT_TO/);
    process.env.EMAIL_REDIRECT_TO = "arjun-test@example.com";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "to ananya.kulkarni.pm@gmail.com not allowed" }), { status: 403 })));
    await expect(sendCandidateEmail(id)).rejects.toThrow(/Sending failed/);
    const e = (await getFollowUp(id))!.email!;
    expect(e.status).toBe("failed");
    expect(e.error).not.toContain("@");
    const audit = JSON.stringify(await getStore().listAudit(id));
    expect(audit).not.toMatch(/ananya|kulkarni|@gmail/i);
  });
});
