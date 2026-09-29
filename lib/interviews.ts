import "server-only";
import { getStore } from "@/lib/db/client";
import { getDisplayIdentities } from "@/lib/db/queries";
import type { BriefRow, EmailRow, ScoreRow } from "@/lib/db/types";
import type { Band, Role } from "@/lib/scoring/types";

export interface InterviewItem {
  resumeId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  score: number;
  band: Band;
  sentAt: string | null;
  mode: EmailRow["delivery_mode"];
  slots: string[];
  brief: BriefRow | null;
}

/** Everyone who has been sent an interview invitation, newest first, with their interview brief. */
export async function getInterviews(): Promise<{ sent: InterviewItem[]; draftedNotSent: number }> {
  const store = getStore();
  const emails = (await store.listEmails()).filter((e) => e.kind === "invite");
  const sentEmails = emails.filter((e) => e.status === "sent");
  const ids = sentEmails.map((e) => e.resume_id);
  const [who, scores, briefs] = await Promise.all([
    getDisplayIdentities(ids),
    Promise.all(ids.map((id) => store.getScores(id))),
    Promise.all(ids.map((id) => store.getBrief(id))),
  ]);
  const sent = sentEmails.map((e, i): InterviewItem => {
    const s = scores[i].find((x) => x.is_applied_role) as ScoreRow | undefined;
    const p = who.get(e.resume_id);
    return {
      resumeId: e.resume_id, name: p?.full_name ?? "(unknown)", email: p?.email ?? null, phone: p?.phone ?? null,
      role: (s?.role ?? "PM") as Role, score: s?.score ?? 0, band: (s?.band ?? "review") as Band,
      sentAt: e.sent_at, mode: e.delivery_mode,
      slots: [...e.body.matchAll(/^\s*[-•]\s*(.+?\bIST)\s*$/gm)].map((m) => m[1]),
      brief: briefs[i],
    };
  }).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  return { sent, draftedNotSent: emails.length - sentEmails.length };
}
