// RFC 4180 CSV with a UTF-8 BOM (so Excel shows ₹ correctly) and CRLF line endings.
// Cells that start with = + - @ (or tab/CR) are prefixed with ' so spreadsheets never evaluate them as formulas
// (a phone number like +91 98190 44120 would otherwise become a formula in Excel).

export type Cell = string | number | boolean | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v;
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
