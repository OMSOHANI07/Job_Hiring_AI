import "server-only";
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const RESUME_ID_RE = /^KRG-\d{4}-[A-Z0-9]{6}$/;

/** KRG-{YYYY}-{6 crypto-random uppercase alphanumerics}, e.g. KRG-2026-7QH2MZ. */
export function newResumeId(now = new Date()): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `KRG-${now.getUTCFullYear()}-${s}`;
}

/** Generate an ID that the store doesn't already hold (retry on collision). */
export async function uniqueResumeId(exists: (id: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const id = newResumeId();
    if (!(await exists(id))) return id;
  }
  throw new Error("Could not allocate a unique Resume ID");
}

export function isResumeId(s: string): boolean {
  return RESUME_ID_RE.test(s);
}
