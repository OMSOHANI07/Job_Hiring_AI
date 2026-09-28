import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/db/client";
import { PII_TYPE_LABEL, ROLE_LABEL } from "@/lib/decision";
import { isResumeId } from "@/lib/ids/resumeId";
import { verifyRedaction } from "@/lib/pii/verify";
import { ReviewActions } from "./ReviewActions";

export const metadata: Metadata = { title: "Review redaction" };
export const dynamic = "force-dynamic";

const TOKEN_RE = /(\[(?:CANDIDATE|EMAIL|PHONE|URL|ADDRESS|PERSONAL_ID|LOCATION|CONTACT_DETAILS_REMOVED)\])/g;
const IS_TOKEN = /^\[(?:CANDIDATE|EMAIL|PHONE|URL|ADDRESS|PERSONAL_ID|LOCATION|CONTACT_DETAILS_REMOVED)\]$/;
const LOCATION_LABEL = {
  mumbai: "Mumbai-based", willing_to_relocate: "Willing to relocate", explicitly_unwilling: "Explicitly unwilling to relocate", not_stated: "Not stated",
} as const;

export default async function ReviewPage({ params, searchParams }: PageProps<"/review/[resumeId]">) {
  const { resumeId } = await params;
  const sp = await searchParams;
  if (!isResumeId(resumeId)) notFound();
  const store = getStore();
  const [resume, pii] = await Promise.all([store.getResume(resumeId), store.getPii(resumeId)]);
  if (!resume || !pii) notFound();

  // PII side: this page is the only place leaked values are shown, so Arjun can fix them.
  const check = verifyRedaction(resume.redacted_text, pii.full_name, pii.redaction_values);
  const grouped = Object.entries(
    pii.redaction_values.reduce<Record<string, Set<string>>>((acc, v) => ((acc[v.type] ??= new Set()).add(v.value), acc), {}),
  );
  const emailMatch = typeof sp.emailMatch === "string" && isResumeId(sp.emailMatch) ? sp.emailMatch : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Step 2 of 3 · Check what the AI will see</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Redaction preview</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Resume ID</p>
          <p className="font-mono text-xl font-semibold text-accent">{resumeId}</p>
          <p className="text-xs text-muted">{ROLE_LABEL[resume.applied_role]}</p>
        </div>
      </div>

      {emailMatch && (
        <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Another CV with the same email was already uploaded for this role: <Link className="font-mono underline" href={`/results/${emailMatch}`}>{emailMatch}</Link>. This may be an updated CV.
        </p>
      )}
      {!check.ok && (
        <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Redaction check failed. Nothing will be sent to the AI.</p>
          <ul className="mt-1 list-disc pl-5">
            {check.leaks.map((l, i) => (
              <li key={i}>{PII_TYPE_LABEL[l.type] ?? l.type} still present: <span className="font-mono">{l.value}</span></li>
            ))}
          </ul>
          <p className="mt-1">Correct the candidate&apos;s name below and re-redact.</p>
        </div>
      )}
      {pii.full_name === "(name not detected)" && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          The candidate&apos;s name couldn&apos;t be detected. Enter it below and re-redact before scoring.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="redacted-h">
          <h2 id="redacted-h" className="text-sm font-semibold">Text that will be sent to the AI</h2>
          <pre className="mt-2 max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface p-4 font-mono text-[13px] leading-relaxed">
            {resume.redacted_text.split(TOKEN_RE).map((part, i) =>
              IS_TOKEN.test(part) ? (
                <mark key={i} className={`tok ${part === "[CONTACT_DETAILS_REMOVED]" ? "tok-contact" : ""}`}>{part}</mark>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </pre>
        </section>

        <aside aria-labelledby="pii-h" className="space-y-5">
          <div className="rounded-lg border border-line p-4">
            <h2 id="pii-h" className="text-sm font-semibold">Personal details removed</h2>
            <p className="mt-0.5 text-xs text-muted">Stored separately under the Resume ID. Never sent to the AI.</p>
            {grouped.length === 0 && <p className="mt-3 text-sm text-muted">None detected.</p>}
            <dl className="mt-3 space-y-3 text-sm">
              {grouped.map(([type, vals]) => (
                <div key={type}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">{PII_TYPE_LABEL[type] ?? type} · {vals.size}</dt>
                  {[...vals].map((v) => <dd key={v} className="break-all font-mono text-[13px]">{v}</dd>)}
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-lg border border-line p-4 text-sm">
            <h2 className="text-sm font-semibold">Location status</h2>
            <p className="mt-1">{LOCATION_LABEL[resume.location_status]}</p>
            <p className="mt-0.5 text-xs text-muted">Worked out in code from the original text. The AI never sees the city.</p>
          </div>
        </aside>
      </div>

      <ReviewActions resumeId={resumeId} initialName={pii.full_name === "(name not detected)" ? "" : pii.full_name}
        status={resume.status} canScore={check.ok && pii.full_name !== "(name not detected)"} />
    </div>
  );
}
