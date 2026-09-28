import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CANDIDATE_HEADER, candidateBreakdownRows, candidateSummaryRows, allCandidatesRows, allCandidatesHeader } from "@/lib/export/build";
import { csvCell, toCsv } from "@/lib/export/csv";
import { allCandidatesXlsx, candidateXlsx } from "@/lib/export/xlsx";
import { evaluateAppliedRole } from "@/lib/scoring/evaluate";
import { CFG } from "@/lib/scoring/config";
import { toScoreRow } from "@/lib/pipeline";
import type { DashboardRow, ResultView } from "@/lib/views";
import { LAVANYA, clone } from "../fixtures/calibration";

function fixtureView(): ResultView {
  const x = clone(LAVANYA);
  x.evidence = { P1: ['Managed a ₹2.4Cr book, "quoted", with commas, and\nnewlines'] };
  const a = evaluateAppliedRole(x, null).applied;
  const s = { ...toScoreRow("KRG-2026-EXPRT1", a), id: "1", created_at: "2026-09-28T10:00:00Z" };
  return {
    identity: { resume_id: "KRG-2026-EXPRT1", full_name: "Test Person", email: "t@example.com", phone: "+91 90000 00000", links: [] },
    resume: { resume_id: "KRG-2026-EXPRT1", applied_role: "PM", file_name: "cv.docx", file_type: "docx", storage_path: null, cv_hash: "h",
      redaction_counts: { CANDIDATE: 1, EMAIL: 1, PHONE: 1, URL: 0, ADDRESS: 0, PERSONAL_ID: 0, LOCATION: 0 }, location_status: "mumbai", status: "scored", created_at: "" },
    score: s, finalBand: "priority_shortlist", finalFlags: [], rank: 1, roleCount: 1,
    criteria: CFG.roles.PM.criteria.map((c) => ({ id: c.id, name: c.name, block: "Kargo DNA", weight: c.weight, level: a.levels[c.id],
      grade: "A" as const, multiplier: a.evidence_multipliers[c.id], points: a.points[c.id], evidence: x.evidence[c.id] ?? [], levelRule: "" })),
    gates: CFG.roles.PM.gates.map((g) => ({ id: g.id, name: g.name, rule: g.rule, passed: true })),
    nonNegotiables: CFG.roles.PM.non_negotiables.map((n) => ({ rule: n.rule, passed: true })), floors: [], extraction: null,
  };
}

/** Minimal RFC 4180 parser, to prove the output round-trips. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += c;
  }
  return rows;
}

describe("CSV", () => {
  it("escapes per RFC 4180", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(null)).toBe("");
  });
  it("neutralises formula injection (phones starting with + stay text)", () => {
    expect(csvCell("+91 98190 44120")).toBe("'+91 98190 44120");
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell(-3)).toBe("-3"); // numbers are not prefixed
  });
  it("starts with a UTF-8 BOM, uses CRLF and keeps ₹", () => {
    const out = toCsv([["a", "₹2.4Cr"], ["b", "c"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toBe("﻿a,₹2.4Cr\r\nb,c\r\n");
    expect(Buffer.from(out, "utf8").subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });
  it("per-candidate CSV round-trips: header, 8 criterion rows, blank row, summary", () => {
    const v = fixtureView();
    const csv = toCsv([CANDIDATE_HEADER, ...candidateBreakdownRows(v), [], ...candidateSummaryRows(v)]);
    const rows = parseCsv(csv.slice(1));
    expect(rows[0]).toEqual(CANDIDATE_HEADER);
    expect(rows.slice(1, 9).map((r) => r[8])).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
    expect(rows[1][15]).toBe('Managed a ₹2.4Cr book, "quoted", with commas, and\nnewlines');
    expect(rows[1][3]).toBe("'+91 90000 00000");
    expect(rows[9]).toEqual([""]);
    const sections = new Set(rows.slice(10).map((r) => r[0]));
    for (const s of ["section", "score", "bonus", "gate", "non_negotiable", "eligibility"]) expect(sections).toContain(s);
  });
  it("blind export drops names and contacts", () => {
    const row: DashboardRow = { rank: 1, resumeId: "KRG-2026-EXPRT1", name: "Test Person", email: "t@example.com", phone: "+91 1", appliedRole: "PM",
      band: "review", preCapacityBand: "review", decision: "Review – Arjun decides", score: 70, dnaTriad: 6, flags: [], levels: { P1: 2 },
      penalties: [], bonuses: [], gateFailed: null, scoredAt: "" };
    const out = allCandidatesRows([row], "PM", true)[0];
    expect(out.slice(2, 5)).toEqual(["", "", ""]);
    expect(allCandidatesHeader("PM")).toContain("P8_level");
    expect(allCandidatesHeader("all")).toContain("S8_level");
  });
});

describe("XLSX", () => {
  it("per-candidate workbook has Summary, Breakdown and Eligibility sheets, frozen bold headers, coloured decision", async () => {
    const buf = await candidateXlsx(fixtureView());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Breakdown – PM", "Eligibility"]);
    for (const ws of wb.worksheets) {
      expect(ws.getRow(1).font?.bold).toBe(true);
      expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    }
    const sum = wb.getWorksheet("Summary")!;
    expect(sum.getCell("A7").value).toBe("Decision");
    expect(sum.getCell("B7").value).toBe("Accept – Priority");
    expect((sum.getCell("B7").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF166534");
    const bd = wb.getWorksheet("Breakdown – PM")!;
    expect(bd.getCell("A2").value).toBe("P1");
    expect(String(bd.getCell("H2").value)).toContain("₹2.4Cr");
  });
  it("all-candidates workbook has one sheet per role", async () => {
    const buf = await allCandidatesXlsx([{ role: "PM", title: "Product Manager", rows: [] }, { role: "SPM", title: "Senior Product Manager", rows: [] }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Product Manager", "Senior Product Manager"]);
  });
});
