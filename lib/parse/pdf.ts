import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/** Text-based PDF extraction via unpdf (serverless build of pdf.js; no native deps). No OCR. */
export async function parsePdf(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join("\n\n");
}
