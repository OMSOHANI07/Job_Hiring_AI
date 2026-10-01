import type { Metadata } from "next";
import Link from "next/link";
import { BriefView } from "@/components/BriefView";
import { DecisionBadge } from "@/components/Badges";
import { ROLE_LABEL } from "@/lib/decision";
import { getInterviews } from "@/lib/interviews";
import { PageHero } from "@/components/PageHero";
import { GenerateBrief } from "./GenerateBrief";

export const metadata: Metadata = { title: "Interviews" };
export const dynamic = "force-dynamic";

export default async function InterviewsPage() {
  const { sent, draftedNotSent } = await getInterviews();
  return (
    <>
      <PageHero tag="Interview pipeline" title="Prepared For Every Conversation">
        Everyone you&apos;ve sent an interview invitation to, with their interview brief.
        {draftedNotSent > 0 && <> {draftedNotSent} more invitation{draftedNotSent === 1 ? " is" : "s are"} drafted but not sent yet (see <Link href="/candidates" className="text-accent underline">Candidates</Link>).</>}
      </PageHero>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">

      {sent.length === 0 ? (
        <div className="card mt-2 border-dashed p-10 text-center text-sm text-muted">
          No interview invitations sent yet. On <Link href="/candidates" className="text-accent underline">Candidates</Link>, click <strong>Interview</strong> on a candidate and send the invitation.
        </div>
      ) : (
        <>
          <nav aria-label="Candidates invited" className="mt-6 flex flex-wrap gap-2">
            {sent.map((c) => <a key={c.resumeId} href={`#${c.resumeId}`} className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent">{c.name}</a>)}
          </nav>
          <div className="mt-6 space-y-8">
            {sent.map((c) => (
              <article key={c.resumeId} id={c.resumeId} aria-labelledby={`h-${c.resumeId}`} className="card scroll-mt-24 p-6">
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">{ROLE_LABEL[c.role]}</p>
                    <h2 id={`h-${c.resumeId}`} className="text-xl font-semibold">{c.name}</h2>
                    <p className="text-sm text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                    <p className="font-mono text-xs text-accent">{c.resumeId}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 text-right">
                    <div className="flex items-center gap-3"><span className="text-2xl font-semibold tabular-nums">{c.score.toFixed(1)}</span><DecisionBadge band={c.band} /></div>
                    <p className="text-xs text-muted">Invite sent {c.sentAt ? new Date(c.sentAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}{c.mode === "redirect" ? " (test mode)" : ""}</p>
                    <Link href={`/results/${c.resumeId}`} className="text-sm text-accent hover:underline">Full score details →</Link>
                  </div>
                </header>
                {c.slots.length > 0 && (
                  <p className="mt-3 text-sm"><span className="font-medium">Slots offered:</span> {c.slots.join(" · ")}</p>
                )}
                <div className="mt-4">
                  <h3 className="mb-3 text-lg font-semibold">Interview brief</h3>
                  {c.brief ? <BriefView brief={c.brief.brief} model={c.brief.model} /> : <GenerateBrief resumeId={c.resumeId} />}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      </div>
    </>
  );
}
