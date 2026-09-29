"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FollowUpState } from "@/lib/followup";

const PLACEHOLDER = "[CANDIDATE_FIRST_NAME]";
type Action = "invite" | "reject";

/**
 * Interview / Reject from the dashboard. Opening it records Arjun's decision and drafts the email with the AI
 * (redacted inputs only); he can edit, then Send. Nothing is sent without that click.
 */
export function ActionDialog(props: {
  resumeId: string;
  name: string;
  email: string | null;
  action: Action;
  onClose: () => void;
}) {
  const { resumeId, action } = props;
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<FollowUpState | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<"drafting" | "ready" | "sending" | "sent">("drafting");
  const [error, setError] = useState<string | null>(null);
  const firstName = props.name.split(/\s+/)[0] ?? "";

  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    (async () => {
      const res = await fetch(`/api/followup/${resumeId}/decision`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!live) return;
      if (!res.ok) { setError(j.error ?? "Couldn't prepare the email."); setPhase("ready"); return; }
      const s = j.state as FollowUpState;
      setState(s);
      setSubject(s.email?.subject ?? "");
      setBody(s.email?.body ?? "");
      if (j.errors?.length) setError(j.errors.join(" "));
      setPhase(s.email?.status === "sent" ? "sent" : "ready");
    })();
    return () => { live = false; };
  }, [resumeId, action]);

  function close() {
    ref.current?.close();
    router.refresh();
    props.onClose();
  }

  async function send() {
    if (!state?.email) return;
    setPhase("sending"); setError(null);
    try {
      if (subject !== state.email.subject || body !== state.email.body) {
        const r = await fetch(`/api/followup/${resumeId}/email`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, body }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't save your edits.");
      }
      const r = await fetch(`/api/followup/${resumeId}/send`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Sending failed.");
      setState(j.state);
      setPhase("sent");
    } catch (e) {
      setError((e as Error).message);
      setPhase("ready");
    }
  }

  const cfg = state?.emailConfig;
  const deliverTo = cfg?.mode === "redirect" ? cfg.redirectTo : props.email;
  const title = action === "invite" ? `Invite ${props.name} to interview` : `Reject ${props.name}`;

  return (
    <dialog ref={ref} onClose={close} aria-labelledby="ad-title"
      className="m-auto w-[min(720px,calc(100vw-2rem))] rounded-xl border border-line p-0 shadow-2xl backdrop:bg-ink/40">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="ad-title" className="text-lg font-semibold">{title}</h2>
        <button onClick={close} aria-label="Close" className="rounded px-2 text-xl leading-none text-muted hover:text-ink">×</button>
      </div>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
        {phase === "drafting" && (
          <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">
            Drafting the {action === "invite" ? "invitation and interview brief" : "email"} from the redacted CV…
          </p>
        )}
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
        {phase === "sent" && state?.email && (
          <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            ✓ Sent{state.email.delivery_mode === "redirect" ? ` in test mode to ${cfg?.redirectTo}` : ` to ${props.email}`}.
            {action === "invite" && " The candidate now appears under Interviews with their brief."}
          </div>
        )}
        {state?.email && phase !== "drafting" && (
          <>
            <p className="text-sm">
              <span className="text-muted">To:</span> {props.name} &lt;{props.email ?? "no email on CV"}&gt;
              {cfg?.mode === "redirect" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Test mode: goes to {cfg.redirectTo ?? "(not set)"}</span>}
            </p>
            <div>
              <label htmlFor="ad-subject" className="block text-sm font-medium">Subject</label>
              <input id="ad-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={phase !== "ready"}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm disabled:bg-surface" />
            </div>
            <div>
              <label htmlFor="ad-body" className="block text-sm font-medium">Message</label>
              <textarea id="ad-body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} disabled={phase !== "ready"}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm leading-relaxed disabled:bg-surface" />
              <p className="mt-1 text-xs text-muted"><code className="tok">{PLACEHOLDER}</code> becomes “{firstName}” when sent.</p>
            </div>
            {state.warnings.map((w) => <p key={w} className="text-sm text-amber-900">⚠ {w}</p>)}
            {cfg && !cfg.ready && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Email isn&apos;t configured: {cfg.problem}</p>}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-3">
        <button onClick={close} className="rounded-md border border-line px-4 py-2 text-sm font-medium">{phase === "sent" ? "Done" : "Cancel"}</button>
        {phase !== "sent" && (
          <button onClick={send} disabled={phase !== "ready" || !state?.email || !cfg?.ready || !props.email}
            className={`rounded-md px-5 py-2 text-sm font-medium text-white disabled:opacity-40 ${action === "invite" ? "bg-green-800 hover:bg-green-900" : "bg-red-700 hover:bg-red-800"}`}>
            {phase === "sending" ? "Sending…" : `Send ${action === "invite" ? "invitation" : "rejection"}${deliverTo ? ` to ${deliverTo}` : ""}`}
          </button>
        )}
      </div>
    </dialog>
  );
}
