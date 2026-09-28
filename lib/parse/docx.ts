import "server-only";
import mammoth from "mammoth";

/**
 * DOCX to plain text. mammoth's raw-text mode emits every paragraph, including paragraphs inside
 * table cells, so two-column table headers come through as consecutive lines.
 */
export async function parseDocx(buf: Uint8Array): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return value.replace(/\n{2,}/g, "\n");
}
