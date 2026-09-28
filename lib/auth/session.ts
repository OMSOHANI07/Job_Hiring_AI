// Signed session cookie (HMAC-SHA256 with SESSION_SECRET, 7-day expiry). Web Crypto only, so the same code
// runs in proxy.ts and in route handlers.

export const SESSION_COOKIE = "kargo_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ sub: "arjun", exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    if (!safeEqual(sig, await hmac(payload))) return false;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp: number };
    return typeof exp === "number" && exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

/** Constant-time password check against APP_PASSWORD (compares HMACs so lengths don't leak). */
export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(await hmac(`pw:${candidate}`), await hmac(`pw:${expected}`));
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

// Simple in-memory login limiter: 5 failures per 15 minutes per IP. Per server instance; enough for a
// single-user app, and it resets on cold start (documented in the README).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

export function loginBlocked(ip: string, now = Date.now()): boolean {
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, recent);
  return recent.length >= MAX_FAILURES;
}
export function recordLoginFailure(ip: string, now = Date.now()) {
  failures.set(ip, [...(failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS), now]);
}
export function clearLoginFailures(ip: string) {
  failures.delete(ip);
}
