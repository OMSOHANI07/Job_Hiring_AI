import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from "docx";
import { parseCv, ParseError, sniffKind } from "@/lib/parse";
import { redact } from "@/lib/pii/redact";
import { verifyRedaction } from "@/lib/pii/verify";
import { SAMPLES, sampleText } from "@/samples/sampleCvs";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const filler = Array.from({ length: 12 }, (_, i) => `— Coordinated carriers and customs for shipment batch ${i + 1} at the Nhava Sheva terminal.`);

/** Minimal text-based PDF with one page of Helvetica text lines. */
function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = ["BT", "/F1 10 Tf", "14 TL", "40 800 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

describe("file validation", () => {
  it("sniffs magic bytes", () => {
    expect(sniffKind(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("pdf");
    expect(sniffKind(new TextEncoder().encode("hello"))).toBeNull();
  });
  it("rejects a renamed text file", async () => {
    await expect(parseCv(new TextEncoder().encode("just text pretending"), "cv.pdf", "application/pdf")).rejects.toMatchObject({ code: "bad_type" });
  });
  it("rejects a PDF uploaded with a .docx name", async () => {
    await expect(parseCv(makePdf(["x"]), "cv.docx", DOCX_MIME)).rejects.toBeInstanceOf(ParseError);
  });
  it("rejects files over 4 MB", async () => {
    await expect(parseCv(new Uint8Array(4 * 1024 * 1024 + 1), "cv.pdf", "application/pdf")).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("PDF parsing", () => {
  it("extracts text from a text-based PDF", async () => {
    const pdf = makePdf(["Asha Menon | asha.menon@example.com | +91 98201 11122 | Mumbai", "Experience", ...filler]);
    const { kind, text } = await parseCv(pdf, "asha.pdf", "application/pdf");
    expect(kind).toBe("pdf");
    expect(text).toContain("asha.menon@example.com");
    expect(text).toContain("Nhava Sheva");
  });
  it("gives the scanned-PDF message when there is no text layer", async () => {
    await expect(parseCv(makePdf([]), "scan.pdf", "application/pdf")).rejects.toMatchObject({
      code: "no_text",
      message: "This PDF has no readable text (likely scanned). Upload a DOCX or text-based PDF.",
    });
  });
});

describe("DOCX parsing", () => {
  it("extracts a two-column table header", async () => {
    const cell = (t: string[]) => new TableCell({ children: t.map((x) => new Paragraph(x)), width: { size: 50, type: WidthType.PERCENTAGE } });
    const doc = new Document({
      sections: [{
        children: [
          new Table({ rows: [new TableRow({ children: [
            cell(["Nikhil Joshi", "Senior Operations Executive"]),
            cell(["nikhil.joshi.ops@gmail.com", "+91 98111 22233", "Thane"]),
          ] })] }),
          new Paragraph("Experience"),
          ...filler.map((f) => new Paragraph(f)),
        ],
      }],
    });
    const buf = new Uint8Array(await Packer.toBuffer(doc));
    const { kind, text } = await parseCv(buf, "nikhil.docx", DOCX_MIME);
    expect(kind).toBe("docx");
    for (const v of ["Nikhil Joshi", "nikhil.joshi.ops@gmail.com", "+91 98111 22233", "Thane"]) expect(text).toContain(v);
    const { redactedText, report } = redact(text, "Nikhil Joshi");
    expect(redactedText).not.toMatch(/nikhil|joshi|98111|thane/i);
    expect(redactedText).toContain("Senior Operations Executive");
    expect(verifyRedaction(redactedText, "Nikhil Joshi", report.values).ok).toBe(true);
  });

  it.each(SAMPLES)("parses the bundled $file identically to its source text", async (cv) => {
    const buf = new Uint8Array(readFileSync(path.join(process.cwd(), "samples", cv.file)));
    const { text } = await parseCv(buf, cv.file, DOCX_MIME);
    expect(text).toBe(sampleText(cv).replace(/\n{2,}/g, "\n").replace(/\n+$/, ""));
  });
});
