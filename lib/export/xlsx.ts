import "server-only";
import ExcelJS from "exceljs";
import { BAND_LABEL, DECISION, flagHelp, ROLE_LABEL } from "@/lib/decision";
import type { Band, Role } from "@/lib/scoring/types";
import type { DashboardRow, ResultView } from "@/lib/views";
import { allCandidatesHeader, allCandidatesRows, CANDIDATE_HEADER, candidateBreakdownRows, candidateSummaryRows } from "./build";

const FILL: Record<Band, string> = {
  priority_shortlist: "FF166534", shortlist: "FF22C55E", review: "FFF59E0B", not_shortlisted: "FFDC2626",
};
const FONT: Record<Band, string> = {
  priority_shortlist: "FFFFFFFF", shortlist: "FF052E16", review: "FF451A03", not_shortlisted: "FFFFFFFF",
};

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function colourDecision(cell: ExcelJS.Cell, band: Band) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL[band] } };
  cell.font = { bold: true, color: { argb: FONT[band] } };
}

function widths(ws: ExcelJS.Worksheet, w: number[]) {
  w.forEach((width, i) => { ws.getColumn(i + 1).width = width; });
}

// Sheet names: Excel forbids : \ / ? * [ ] and caps at 31 chars; the en dash is fine.
export async function candidateXlsx(v: ResultView): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kargo Hiring Dashboard";
  const band = v.finalBand;

  const sum = wb.addWorksheet("Summary");
  sum.addRow(["Field", "Value"]);
  const decisionRow = [
    ["Resume ID", v.identity.resume_id], ["Candidate", v.identity.full_name], ["Email", v.identity.email ?? ""],
    ["Phone", v.identity.phone ?? ""], ["Applied role", ROLE_LABEL[v.score.role]], ["Decision", DECISION[band].label],
    ["Score (out of 100)", v.score.score], ["Band", BAND_LABEL[band]], ["Rank in role", `${v.rank} of ${v.roleCount}`],
    ["Flags", v.finalFlags.map((f) => `${f}: ${flagHelp(f)}`).join("\n")],
    ["Why ranked here", [...v.score.explanation.strongest.map((s) => `Strongest: ${s}`), ...v.score.explanation.held_back_by.map((h) => `Held back by: ${h}`)].join("\n")],
    ["Interview probes", v.score.interview_probes.join("\n")],
    ["Config version", v.score.config_version], ["Prompt version", v.extraction?.prompt_version ?? ""], ["Scored at", v.score.created_at],
  ];
  for (const r of decisionRow) sum.addRow(r);
  colourDecision(sum.getCell("B7"), band);
  sum.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  widths(sum, [22, 90]);
  styleHeader(sum);

  const bd = wb.addWorksheet(`Breakdown – ${v.score.role}`);
  bd.addRow(CANDIDATE_HEADER.slice(8)); // criterion columns
  for (const r of candidateBreakdownRows(v)) bd.addRow(r.slice(8));
  bd.addRow([]);
  bd.addRow(["", "Base total", "", "", "", "", v.score.base]);
  bd.addRow(["", "Penalties", "", "", "", "", v.score.penalty_total, v.score.penalties.join(" ")]);
  bd.addRow(["", "Bonuses", "", "", "", "", v.score.bonus_total, v.score.bonuses.join(" ")]);
  const fin = bd.addRow(["", "Final score", "", "", "", "", v.score.score]);
  fin.font = { bold: true };
  bd.getColumn(8).alignment = { wrapText: true, vertical: "top" };
  widths(bd, [8, 40, 8, 7, 10, 10, 9, 90]);
  styleHeader(bd);

  const el = wb.addWorksheet("Eligibility");
  el.addRow(["Section", "ID", "Detail", "Value"]);
  for (const r of candidateSummaryRows(v).slice(1)) el.addRow(r);
  el.eachRow((row, i) => {
    if (i === 1) return;
    const c = row.getCell(4);
    if (c.value === "PASS") c.font = { color: { argb: "FF166534" }, bold: true };
    if (c.value === "FAIL") c.font = { color: { argb: "FFDC2626" }, bold: true };
  });
  el.getColumn(3).alignment = { wrapText: true };
  widths(el, [16, 18, 80, 12]);
  styleHeader(el);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function allCandidatesXlsx(sections: { role: Role | "all"; title: string; rows: DashboardRow[] }[], blind = false): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kargo Hiring Dashboard";
  for (const s of sections) {
    const ws = wb.addWorksheet(s.title);
    const header = allCandidatesHeader(s.role);
    ws.addRow(header);
    const decisionCol = header.indexOf("decision") + 1;
    allCandidatesRows(s.rows, s.role, blind).forEach((r, i) => {
      const row = ws.addRow(r);
      colourDecision(row.getCell(decisionCol), s.rows[i].band);
    });
    widths(ws, header.map((h) => (h.endsWith("_level") ? 9 : h === "flags" ? 40 : h === "candidate_name" || h === "email" ? 26 : 16)));
    styleHeader(ws);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
