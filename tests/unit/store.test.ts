import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStore } from "@/lib/db/local";
import type { PiiRow, ResumeRow } from "@/lib/db/types";

const dir = mkdtempSync(path.join(tmpdir(), "kargo-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const now = new Date().toISOString();
const pii = (id: string): PiiRow => ({
  resume_id: id, full_name: "Test Person", email: "test.person@example.com", phone: "+91 90000 00000",
  links: [], location_raw: null, redaction_values: [], created_at: now,
});
const resume = (id: string, hash = "h1"): ResumeRow => ({
  resume_id: id, applied_role: "PM", file_name: "cv.docx", file_type: "docx", storage_path: null, cv_hash: hash,
  redacted_text: "[CONTACT_DETAILS_REMOVED]", redaction_counts: { CANDIDATE: 1, EMAIL: 1, PHONE: 1, URL: 0, ADDRESS: 0, PERSONAL_ID: 0, LOCATION: 0 },
  location_status: "not_stated", status: "redacted", created_at: now,
});

describe("local store", () => {
  const s = new LocalStore(dir);

  it("creates, reads, dedupes and updates", async () => {
    await s.createResume(pii("KRG-2026-AAAAAA"), resume("KRG-2026-AAAAAA"));
    expect(await s.idExists("KRG-2026-AAAAAA")).toBe(true);
    expect((await s.findByHash("h1", "PM"))?.resume_id).toBe("KRG-2026-AAAAAA");
    expect(await s.findByHash("h1", "SPM")).toBeNull();
    expect(await s.findByEmailRole("TEST.PERSON@example.com", "PM")).toBe("KRG-2026-AAAAAA");
    await expect(s.createResume(pii("KRG-2026-BBBBBB"), resume("KRG-2026-BBBBBB"))).rejects.toThrow(/unique/);
    await s.updateResume("KRG-2026-AAAAAA", { status: "scored" });
    expect((await s.getResume("KRG-2026-AAAAAA"))?.status).toBe("scored");
  });

  it("keeps PII out of non-PII tables", async () => {
    await s.audit("uploaded", "KRG-2026-AAAAAA", { file_type: "docx" });
    const db = JSON.parse(readFileSync(path.join(dir, "db.json"), "utf8"));
    const nonPii = JSON.stringify({ r: db.resumes, e: db.extractions, s: db.scores, a: db.audit_log });
    expect(nonPii).not.toContain("Test Person");
    expect(nonPii).not.toContain("test.person@example.com");
  });

  it("serialises concurrent writes", async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => s.audit("exported", "KRG-2026-AAAAAA", { i })));
    expect((await s.listAudit("KRG-2026-AAAAAA")).filter((a) => a.event === "exported")).toHaveLength(25);
  });

  it("writes files owner-only", async () => {
    const p = await s.saveOriginal("KRG-2026-AAAAAA", "docx", new Uint8Array([1, 2, 3]));
    expect(p).toBe("cv-originals/KRG-2026-AAAAAA.docx");
    expect(statSync(path.join(dir, "cv-originals/KRG-2026-AAAAAA.docx")).mode & 0o077).toBe(0);
    expect(statSync(path.join(dir, "db.json")).mode & 0o077).toBe(0);
  });
});
