import "server-only";
import { generateBrief, BRIEF_PROMPT_VERSION } from "@/lib/ai/brief";
import { generateEmail, NAME_PLACEHOLDER, rejectionViolations, renderEmail } from "@/lib/ai/email";
import type { GenerateFn } from "@/lib/ai/gemini";
import { getStore } from "@/lib/db/client";
import type { BriefRow, DecisionRow, EmailKind, EmailRow } from "@/lib/db/types";
export { nextAction, type NextAction };
import { EmailConfigError, emailConfig, sendViaResend } from "@/lib/email/resend";
import { proposeSlots } from "@/lib/email/slots";
import { nextAction, type NextAction } from "@/lib/decision";
import { PipelineError } from "@/lib/pipeline";
import { getResultView } from "@/lib/views";

// Components Map, second half: AI generates the interview brief and a personalised email (invite or rejection),
// Resend sends it only when Arjun clicks Send. email_policy: Priority/Shortlist -> invite; Not shortlisted ->
// rejection; Review -> nothing until Arjun decides. Arjun's own decision always overrides the recommendation.

export interface FollowUpState {
  action: NextAction;
  decision: DecisionRow | null;
  brief: BriefRow | null;
  email: EmailRow | null;
  emailConfig: { mode: "redirect" | "live"; ready: boolean; problem: string | null; redirectTo: string | null };
  warnings: string[];
}

export async function getFollowUp(resumeId: string): Promise<FollowUpState | null> {
  const store = getStore();
  const v = await getResultView(resumeId);
  if (!v) return null;
  const [decision, brief, email] = await Promise.all([store.getDecision(resumeId), store.getBrief(resumeId), store.getEmail(resumeId)]);
  const cfg = emailConfig();
  const warnings = email?.kind === "rejection" && email.status !== "sent" ? rejectionViolations(`${email.subject}\n${email.body}`) : [];
  return {
    action: nextAction(v.finalBand, decision), decision, brief, email,
    emailConfig: { mode: cfg.mode, ready: cfg.ready, problem: cfg.problem, redirectTo: cfg.redirectTo },
    warnings: warnings.length ? [`This rejection mentions ${warnings.join(", ")}. Rejections should never reference scores, criteria or penalties.`] : [],
  };
}

/**
 * Generate what's missing: the interview brief (anyone Arjun may interview) and the email draft for the next action.
 * Idempotent: existing brief/draft are kept unless `force`, or unless the draft is for a different action.
 */
export async function prepareFollowUp(resumeId: string, opts: { force?: "brief" | "email" | "all"; generate?: GenerateFn } = {}) {
  const store = getStore();
  const v = await getResultView(resumeId);
  if (!v) throw new PipelineError(404, "No scored result for this Resume ID.");
  const [resume, pii, decision, existingBrief, existingEmail] = await Promise.all([
    store.getResume(resumeId), store.getPii(resumeId), store.getDecision(resumeId), store.getBrief(resumeId), store.getEmail(resumeId),
  ]);
  if (!resume || !pii) throw new PipelineError(404, "Resume not found.");
  const action = nextAction(v.finalBand, decision);
  const piiValues = pii.redaction_values;
  const ext = (v.extraction?.extraction ?? {}) as { evidence?: Record<string, string[]>; evidence_grades?: Record<string, string>; summary?: string };

  const wantBrief = action !== "reject" && (!existingBrief || opts.force === "brief" || opts.force === "all");
  const wantKind: EmailKind | null = action === "invite" ? "invite" : action === "reject" ? "rejection" : null;
  const emailSent = existingEmail?.status === "sent" || existingEmail?.status === "sending";
  const wantEmail = !!wantKind && !emailSent &&
    (!existingEmail || existingEmail.kind !== wantKind || opts.force === "email" || opts.force === "all");

  // Highlights for the invite come from verified, redacted evidence on the strongest criteria.
  const strongest = [...v.criteria].sort((a, b) => b.points - a.points).filter((c) => c.level >= 2 && c.evidence.length).slice(0, 3);
  const highlights = strongest.map((c) => c.evidence[0]);

  const [briefRes, emailRes] = await Promise.allSettled([
    wantBrief
      ? generateBrief({
          resumeId, redactedText: resume.redacted_text, score: v.score, finalBand: v.finalBand, finalFlags: v.finalFlags,
          evidence: ext.evidence ?? {}, grades: ext.evidence_grades ?? {}, piiValues, generate: opts.generate,
        })
      : Promise.resolve(null),
    wantEmail
      ? generateEmail({
          kind: wantKind!, role: resume.applied_role, highlights, summary: ext.summary ?? "",
          slots: proposeSlots({ priority: v.finalBand === "priority_shortlist" }),
          askRelocation: v.finalFlags.includes("confirm_relocation"), piiValues, generate: opts.generate,
        })
      : Promise.resolve(null),
  ]);

  const errors: string[] = [];
  if (briefRes.status === "fulfilled" && briefRes.value) {
    await store.saveBrief({ resume_id: resumeId, brief: briefRes.value.brief, model: briefRes.value.model, prompt_version: BRIEF_PROMPT_VERSION });
    await store.audit("brief_generated", resumeId, { model: briefRes.value.model });
  } else if (briefRes.status === "rejected") {
    errors.push("The interview brief couldn't be generated. Try again.");
    await store.audit("brief_failed", resumeId, { reason: (briefRes.reason as Error)?.name ?? "error" });
  }
  if (emailRes.status === "fulfilled" && emailRes.value) {
    const d = emailRes.value;
    await store.saveEmailDraft({ resume_id: resumeId, kind: wantKind!, subject: d.subject, body: d.body, model: d.model });
    await store.audit("email_drafted", resumeId, { kind: wantKind, model: d.model ?? "template" });
  } else if (emailRes.status === "rejected") {
    errors.push("The email draft couldn't be generated. Try again.");
  }
  return { action, errors };
}

/** Arjun's decision (required for Review, optional override otherwise). Regenerates the draft for the new action. */
export async function recordDecision(resumeId: string, action: DecisionRow["action"], generate?: GenerateFn) {
  const store = getStore();
  const email = await store.getEmail(resumeId);
  if (email && (email.status === "sent" || email.status === "sending")) throw new PipelineError(409, "An email has already been sent to this candidate.");
  await store.setDecision(resumeId, action);
  await store.audit("decision_recorded", resumeId, { action });
  return prepareFollowUp(resumeId, { generate });
}

/** Arjun edits the draft by hand. The only placeholder allowed is the first-name token. */
export async function editEmail(resumeId: string, subject: string, body: string) {
  const store = getStore();
  const email = await store.getEmail(resumeId);
  if (!email) throw new PipelineError(404, "No draft for this candidate.");
  if (email.status === "sent" || email.status === "sending") throw new PipelineError(409, "This email has already been sent.");
  const stray = `${subject}\n${body}`.match(/\[[A-Z_]+\]/g)?.filter((t) => t !== NAME_PLACEHOLDER);
  if (stray?.length) throw new PipelineError(400, `Remove ${stray.join(", ")}. Only ${NAME_PLACEHOLDER} is filled in automatically.`);
  await store.updateEmail(email.id, { subject, body, status: "draft", error: null });
  await store.audit("email_edited", resumeId, { kind: email.kind });
  return { warnings: email.kind === "rejection" ? rejectionViolations(`${subject}\n${body}`) : [] };
}

/** The one-click send. Re-maps the Resume ID to the real name and address only here, at send time. */
export async function sendCandidateEmail(resumeId: string) {
  const store = getStore();
  const [email, pii] = await Promise.all([store.getEmail(resumeId), store.getPii(resumeId)]);
  if (!email || !pii) throw new PipelineError(404, "No draft to send.");
  if (email.status === "sent") throw new PipelineError(409, "Already sent.");
  if (!pii.email) throw new PipelineError(400, "No email address was found on this CV.");
  const cfg = emailConfig();
  if (!cfg.ready) throw new PipelineError(400, cfg.problem!);
  if (!(await store.transitionEmail(email.id, ["draft", "failed"], "sending"))) throw new PipelineError(409, "This email is already being sent.");
  const firstName = pii.full_name.split(/\s+/)[0] ?? "";
  const { subject, body } = renderEmail(email, firstName);
  try {
    // Idempotency key = draft id + last edit, so a double click never sends twice but an edited retry can.
    const r = await sendViaResend({ to: pii.email, subject, text: body, idempotencyKey: `kargo-${email.id}-${email.updated_at}` });
    await store.updateEmail(email.id, { status: "sent", provider_id: r.id, delivery_mode: r.mode, sent_at: new Date().toISOString(), error: null });
    await store.audit("email_sent", resumeId, { kind: email.kind, mode: r.mode, provider_id: r.id });
    return { status: "sent" as const, mode: r.mode };
  } catch (e) {
    const msg = e instanceof EmailConfigError ? e.message : (e as Error).message.replace(/[\w.+-]+@[\w.-]+/g, "[address]");
    await store.updateEmail(email.id, { status: "failed", error: msg.slice(0, 300) });
    await store.audit("email_failed", resumeId, { kind: email.kind, mode: cfg.mode });
    throw new PipelineError(502, `Sending failed: ${msg}`, true);
  }
}
