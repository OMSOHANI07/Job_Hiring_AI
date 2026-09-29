import { createHash } from "node:crypto";

/** Normalise extracted CV text so hashing, detection and evidence matching are stable. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‍⁠﻿­]/g, "") // zero-width chars, soft hyphen
    .replace(/[   \t]/g, " ") // non-breaking spaces, tabs
    .replace(/[ ]{2,}/g, "  ") // keep a double space (column separator), drop longer runs
    // Designed PDFs often glue words together; split them so detection and redaction see separate tokens:
    .replace(/(\p{L})(\+\d)/gu, "$1 $2") // "domain.co+91 98..." -> "domain.co +91 98..."
    .replace(/(\p{Lu}{2,})(?=\p{Lu}\p{Ll}{2,})/gu, "$1 ") // "SHARMAProduct" -> "SHARMA Product"
    .replace(/(\d{4,})(?=\p{L}{3,})/gu, "$1 ") // "43210linkedin.com" -> "43210 linkedin.com"
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** SHA-256 of the normalised text, whitespace-insensitive, for dedupe. */
export function cvHash(normalized: string): string {
  return createHash("sha256").update(normalized.replace(/\s+/g, " ").toLowerCase()).digest("hex");
}
