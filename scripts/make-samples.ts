// Renders the fictional worked-example CVs (samples/sampleCvs.ts) into real .docx files in /samples.
// Usage: npx tsx scripts/make-samples.ts
import { writeFileSync } from "node:fs";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { SAMPLES, type SampleCv } from "../samples/sampleCvs";

export function sampleDocument(cv: SampleCv): Document {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: cv.header, bold: true, size: 22 })] }),
  ];
  for (const s of cv.sections) {
    children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }));
    for (const line of s.lines) {
      const isRoleLine = !line.startsWith("—") && line.includes("|");
      children.push(new Paragraph({ children: [new TextRun({ text: line, bold: isRoleLine })] }));
    }
  }
  return new Document({ creator: "Kargo Hiring Dashboard (fictional sample)", sections: [{ children }] });
}

async function main() {
  for (const cv of SAMPLES) {
    const buf = await Packer.toBuffer(sampleDocument(cv));
    const out = path.join(process.cwd(), "samples", cv.file);
    writeFileSync(out, buf);
    console.log(`wrote ${path.relative(process.cwd(), out)} (${buf.length} bytes)`);
  }
}

if (process.argv[1]?.endsWith("make-samples.ts")) void main();
