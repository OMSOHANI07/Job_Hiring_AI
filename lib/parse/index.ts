import "server-only";
import { parseDocx } from "./docx";
import { normalizeText } from "./normalize";
import { parsePdf } from "./pdf";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MIN_READABLE_CHARS = 200;

export type FileKind = "pdf" | "docx";

export class ParseError extends Error {
  constructor(public code: "too_large" | "bad_type" | "unreadable" | "no_text", message: string) {
    super(message);
  }
}

/** Identify the file from its magic bytes, never from the name or client MIME type alone. */
export function sniffKind(buf: Uint8Array): FileKind | null {
  if (buf.length >= 5 && String.fromCharCode(...buf.slice(0, 5)) === "%PDF-") return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // ZIP container: a DOCX must contain word/document.xml (the name is stored uncompressed in the local headers)
    const head = Buffer.from(buf).toString("latin1");
    if (head.includes("word/document.xml") || head.includes("word/")) return "docx";
  }
  return null;
}

const ALLOWED_MIME: Record<FileKind, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream", ""],
};

export async function parseCv(
  buf: Uint8Array,
  fileName: string,
  mime: string,
): Promise<{ kind: FileKind; text: string }> {
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new ParseError("too_large", "File is larger than 4 MB.");
  const kind = sniffKind(buf);
  const ext = fileName.toLowerCase().split(".").pop();
  if (!kind || ext !== kind || !ALLOWED_MIME[kind].includes(mime)) {
    throw new ParseError("bad_type", "Only PDF and DOCX files are accepted.");
  }
  let raw: string;
  try {
    raw = kind === "pdf" ? await parsePdf(buf) : await parseDocx(buf);
  } catch {
    throw new ParseError("unreadable", "The file could not be read. It may be corrupted or password-protected.");
  }
  const text = normalizeText(raw);
  if (text.replace(/\s/g, "").length < MIN_READABLE_CHARS) {
    throw new ParseError(
      "no_text",
      kind === "pdf"
        ? "This PDF has no readable text (likely scanned). Upload a DOCX or text-based PDF."
        : "This document has almost no readable text.",
    );
  }
  return { kind, text };
}
