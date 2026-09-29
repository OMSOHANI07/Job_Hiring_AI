import "server-only";
import { z } from "zod";
import type { EmailKind } from "@/lib/db/types";
import { ROLE_LABEL } from "@/lib/decision";
import { CFG } from "@/lib/scoring/config";
import type { Role } from "@/lib/scoring/types";
import type { GenerateFn } from "./gemini";
import { generateStructured } from "./structured";

export const EMAIL_PROMPT_VERSION = "email-v1.1";
export const NAME_PLACEHOLDER = "[CANDIDATE_FIRST_NAME]";
const SIGNATURE = "Arjun Mehta\nFounder, Kargo";

const EmailSchema = z.object({ subject: z.string().min(5).max(120), body: z.string().min(80).max(2200) });

/**
 * Words a rejection must never contain (email_policy: never mention scores, criteria, penalties or the instincts),
 * plus every rubric criterion name. Also used to warn Arjun when he edits a rejection by hand.
 */
export function rejectionViolations(text: string): string[] {
  const t = text.toLowerCase();
  const hits: string[] = [];
  const TERMS = /\b(score[sd]?|scoring|rubrics?|criteri(on|a)|penalt(y|ies)|\d+\s*points?|band|dna|instincts?|non-negotiables?|gates?|ranked|ranking|algorithm|automated|artificial intelligence|a\.?i\.?|weight(ed|ing)?|shortlist(ed)?|\d+\s*(\/|out of)\s*100)\b/g;
  for (const m of t.matchAll(TERMS)) hits.push(m[0]);
  for (const role of ["PM", "SPM"] as const) {
    for (const c of CFG.roles[role].criteria) if (t.includes(c.name.toLowerCase())) hits.push(c.name);
  }
  return [...new Set(hits)];
}

function commonChecks(e: { subject: string; body: string }): string | null {
  const all = `${e.subject}\n${e.body}`;
  const tokens = all.match(/\[[A-Z_]+\]/g)?.filter((x) => x !== NAME_PLACEHOLDER) ?? [];
  if (tokens.length) return `remove the tokens ${tokens.join(", ")}; only ${NAME_PLACEHOLDER} is allowed`;
  if (!e.body.trimStart().match(/^(Hi|Dear|Hello)\s+\[CANDIDATE_FIRST_NAME\]/)) return `the body must start with "Hi ${NAME_PLACEHOLDER},"`;
  if (!e.body.includes("Arjun")) return "sign off as Arjun Mehta, Founder, Kargo";
  if (e.body.split(/\s+/).length > 260) return "keep the body under 250 words";
  if (/\bwith Arjun\b|\bArjun (will|would|is)\b/.test(e.body)) return "write in the first person as Arjun; don't refer to Arjun in the third person";
  return null;
}

const SYSTEM_INVITE = `You write a short, warm interview invitation from Arjun Mehta, founder of Kargo (Series A logistics SaaS in Mumbai for freight forwarders and 3PLs), to a candidate.
Rules:
- Greet with "Hi ${NAME_PLACEHOLDER}," exactly. You do not know their name; never guess it.
- Mention one or two specific things from their background (given below) that made Arjun want to talk, in plain words. No jargon, no rubric language, no scores.
- Write in the first person as Arjun ("I", "me"); never refer to Arjun in the third person.
- Offer the exact interview slots given, as a list, and ask them to reply with the one that works (or suggest another time if none do).
- Propose a 45-minute conversation, in person at Kargo's Mumbai office or on a video call.
- If told to ask about relocation, add one friendly line asking them to confirm they are Mumbai-based or open to relocating, since the role is in-office.
- Under 180 words. Sign off exactly as:
${SIGNATURE}
Return ONLY JSON {"subject": ..., "body": ...}. Plain text body, no Markdown.`;

const SYSTEM_REJECT = `You write a short, warm, respectful rejection from Arjun Mehta, founder of Kargo (Series A logistics SaaS in Mumbai), to a candidate who applied for the role given.
Rules:
- Greet with "Hi ${NAME_PLACEHOLDER}," exactly. You do not know their name; never guess it.
- Thank them for applying and for their time; say clearly and kindly that Kargo won't take the application forward for this role.
- You may acknowledge their background in one neutral, genuine sentence using the summary given. Do not critique them.
- NEVER mention scores, ratings, rankings, criteria, rubrics, penalties, bands, shortlists, "DNA", instincts, algorithms, AI or automated screening. Give no reasons beyond "we've decided to move forward with other candidates whose experience is closer to what this role needs right now".
- Do not promise future roles. You may say they're welcome to apply for future openings.
- Under 130 words. Sign off exactly as:
${SIGNATURE}
Return ONLY JSON {"subject": ..., "body": ...}. Plain text body, no Markdown.`;

export interface EmailDraft { subject: string; body: string; model: string | null }

/** Deterministic fallbacks so Arjun always has a draft, even if the model fails twice. */
export function fallbackEmail(kind: EmailKind, role: Role, slots: string[], askRelocation: boolean): EmailDraft {
  const title = ROLE_LABEL[role];
  if (kind === "invite") {
    return {
      subject: `Kargo · ${title} · Interview invitation`,
      body: `Hi ${NAME_PLACEHOLDER},\n\nThank you for applying for the ${title} role at Kargo. Your background stood out and I'd like to meet.\n\nCould you reply with the slot that works best for a 45-minute conversation (at our Mumbai office or on video)?\n${slots.map((s) => `- ${s}`).join("\n")}\n\n${askRelocation ? "The role is in-office in Mumbai, so please also confirm you're Mumbai-based or open to relocating.\n\n" : ""}Looking forward to it.\n\n${SIGNATURE}`,
      model: null,
    };
  }
  return {
    subject: `Kargo · ${title} · Your application`,
    body: `Hi ${NAME_PLACEHOLDER},\n\nThank you for applying for the ${title} role at Kargo and for the time you put into your application.\n\nAfter careful consideration, we've decided to move forward with other candidates whose experience is closer to what this role needs right now. I know this isn't the news you were hoping for.\n\nYou're welcome to apply for future openings at Kargo, and I wish you the very best in your search.\n\n${SIGNATURE}`,
    model: null,
  };
}

export async function generateEmail(input: {
  kind: EmailKind;
  role: Role;
  highlights: string[];   // redacted evidence / brief strengths (invite)
  summary: string;        // redacted 2-sentence career summary (rejection)
  slots: string[];
  askRelocation: boolean;
  piiValues: { type: string; value: string }[];
  generate?: GenerateFn;
}): Promise<EmailDraft> {
  const title = ROLE_LABEL[input.role];
  const user = input.kind === "invite"
    ? [`ROLE: ${title}`, "WHAT STOOD OUT (from the anonymised CV):", ...input.highlights.map((h) => `- ${h}`),
       "INTERVIEW SLOTS (offer exactly these):", ...input.slots.map((s) => `- ${s}`),
       `ASK ABOUT RELOCATION: ${input.askRelocation ? "yes" : "no"}`].join("\n")
    : [`ROLE: ${title}`, `CANDIDATE BACKGROUND SUMMARY (anonymised): ${input.summary}`].join("\n");
  try {
    const out = await generateStructured({
      system: input.kind === "invite" ? SYSTEM_INVITE : SYSTEM_REJECT,
      user, schema: EmailSchema, piiValues: input.piiValues, generate: input.generate,
      check: (e) => {
        const c = commonChecks(e);
        if (c) return c;
        if (input.kind === "invite") {
          const missing = input.slots.find((s) => !e.body.includes(s));
          if (missing) return `include every slot exactly as written, e.g. "${missing}"`;
        } else {
          const v = rejectionViolations(`${e.subject}\n${e.body}`);
          if (v.length) return `the rejection must not mention: ${v.join(", ")}`;
        }
        return null;
      },
    });
    return { ...out.data, model: out.model };
  } catch {
    return fallbackEmail(input.kind, input.role, input.slots, input.askRelocation);
  }
}

/** Fill the placeholder with the real first name at send time (the only place the name enters an email). */
export function renderEmail(t: { subject: string; body: string }, firstName: string) {
  const name = firstName.trim() || "there";
  return { subject: t.subject.replaceAll(NAME_PLACEHOLDER, name), body: t.body.replaceAll(NAME_PLACEHOLDER, name) };
}
