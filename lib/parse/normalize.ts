import { createHash } from "node:crypto";

/** Normalise extracted CV text so hashing, detection and evidence matching are stable. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‍⁠﻿­]/g, "") // zero-width chars, soft hyphen
    .replace(/[   \t]/g, " ") // non-breaking spaces, tabs
    .replace(/[ ]{2,}/g, "  ") // keep a double space (column separator), drop longer runs
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
