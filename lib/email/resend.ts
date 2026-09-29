import "server-only";

// Resend delivery. Only called from sendCandidateEmail() after Arjun clicks Send.
// EMAIL_MODE=redirect (default): every email goes to EMAIL_REDIRECT_TO instead of the candidate, marked [TEST].
// EMAIL_MODE=live: goes to the candidate. Needs a verified sending domain in RESEND_FROM
// (onboarding@resend.dev can only deliver to the Resend account owner's own address).

export type DeliveryMode = "redirect" | "live";

export class EmailConfigError extends Error {}

export function emailConfig(): { mode: DeliveryMode; from: string; redirectTo: string | null; ready: boolean; problem: string | null } {
  const mode: DeliveryMode = process.env.EMAIL_MODE === "live" ? "live" : "redirect";
  const from = process.env.RESEND_FROM || "Kargo Hiring <onboarding@resend.dev>";
  const redirectTo = process.env.EMAIL_REDIRECT_TO?.trim() || null;
  let problem: string | null = null;
  if (!process.env.RESEND_API_KEY) problem = "RESEND_API_KEY is not set.";
  else if (mode === "redirect" && !redirectTo) problem = "Test mode: set EMAIL_REDIRECT_TO to the address that should receive test emails.";
  else if (mode === "live" && /@resend\.dev>?$/i.test(from)) problem = "Live mode needs RESEND_FROM on a domain you've verified in Resend.";
  return { mode, from, redirectTo, ready: !problem, problem };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function toHtml(body: string, banner?: string): string {
  const paras = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const b = banner ? `<p style="margin:0 0 16px;padding:8px 12px;background:#fef3c7;color:#78350f;font-size:13px;border-radius:6px">${escapeHtml(banner)}</p>` : "";
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px">${b}${paras}</div>`;
}

export interface SendResult { id: string; mode: DeliveryMode; deliveredTo: string }

export async function sendViaResend(msg: { to: string; subject: string; text: string; idempotencyKey: string; replyTo?: string }): Promise<SendResult> {
  const cfg = emailConfig();
  if (!cfg.ready) throw new EmailConfigError(cfg.problem!);
  const to = cfg.mode === "redirect" ? cfg.redirectTo! : msg.to;
  const banner = cfg.mode === "redirect" ? `TEST MODE: in live mode this email would go to ${msg.to}.` : undefined;
  const subject = cfg.mode === "redirect" ? `[TEST] ${msg.subject}` : msg.subject;
  const text = banner ? `${banner}\n\n${msg.text}` : msg.text;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": msg.idempotencyKey,
    },
    body: JSON.stringify({
      from: cfg.from, to: [to], subject, text, html: toHtml(msg.text, banner),
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      tags: [{ name: "app", value: "kargo_hiring" }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? "send failed"}`);
  return { id: body.id, mode: cfg.mode, deliveredTo: to };
}
