"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Steps } from "@/components/Steps";

export function ReviewActions({ resumeId, initialName, status, canScore }: { resumeId: string; initialName: string; status: string; canScore: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(!initialName || !canScore);
  const [busy, setBusy] = useState<"redact" | "score" | null>(null);
  const [step, setStep] = useState(3);
  const [error, setError] = useState<{ msg: string; retry: boolean } | null>(
    status === "extraction_failed" ? { msg: "The last scoring attempt failed. You can retry; the stored redacted text is reused.", retry: true } : null,
  );

  async function reRedact(e: React.FormEvent) {
    e.preventDefault();
    setBusy("redact");
    setError(null);
    const res = await fetch(`/api/reredact/${resumeId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError({ msg: body.error ?? "Re-redaction failed.", retry: false });
    setEditing(false);
    router.refresh();
  }

  async function score() {
    setBusy("score");
    setError(null);
    setStep(3);
    const t = setTimeout(() => setStep(4), 9000);
    const res = await fetch(`/api/score/${resumeId}`, { method: "POST" });
    clearTimeout(t);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(null);
      router.refresh();
      return setError({ msg: body.error ?? "Scoring failed.", retry: !!body.retryable });
    }
    setStep(5);
    router.push(`/results/${resumeId}`);
  }

  if (status === "scored") {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href={`/results/${resumeId}`} className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover">View result</Link>
        <p className="text-sm text-muted">Already scored. Re-redacting clears the score.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4 border-t border-line pt-6">
      {editing ? (
        <form onSubmit={reRedact} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label htmlFor="rr-name" className="block text-sm font-medium">Candidate full name</label>
            <input id="rr-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120}
              className="mt-1 w-full rounded-md border border-line px-3 py-2" autoComplete="off" />
          </div>
          <button disabled={busy !== null} className="rounded-md border border-accent px-4 py-2 font-medium text-accent hover:bg-accent-soft disabled:opacity-60">
            {busy === "redact" ? "Re-redacting…" : "Re-redact"}
          </button>
          {initialName && <button type="button" onClick={() => setEditing(false)} className="px-2 py-2 text-sm text-muted hover:text-ink">Cancel</button>}
        </form>
      ) : (
        <p className="text-sm">Candidate name: <span className="font-medium">{initialName}</span></p>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error.msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={score} disabled={!canScore || busy !== null}
          className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
          {busy === "score" ? "Scoring…" : error?.retry ? "Retry scoring" : "Confirm & score"}
        </button>
        {!editing && (
          <button onClick={() => setEditing(true)} disabled={busy !== null} className="rounded-md border border-line px-4 py-2.5 font-medium hover:border-accent/50">
            Edit name &amp; re-redact
          </button>
        )}
        {!canScore && <p className="text-sm text-red-800">Scoring is blocked until the redaction check passes.</p>}
      </div>
      <p className="text-xs text-muted">Nothing is sent to the AI until you click Confirm &amp; score. Only the redacted text above is sent.</p>
      {busy === "score" && <div aria-live="polite"><Steps current={step} /></div>}
    </div>
  );
}
