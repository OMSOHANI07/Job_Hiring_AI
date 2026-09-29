"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FollowUpState } from "@/lib/followup";

const PLACEHOLDER = "[CANDIDATE_FIRST_NAME]";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed.");
  return json as { state?: FollowUpState; errors?: string[]; warnings?: string[]; mode?: string };
}

export function FollowUpPanel(props: {
  resumeId: string;
  initial: FollowUpState;
  candidateEmail: string | null;
  firstName: string;
  recommendation: string;
}) {
  const { resumeId, candidateEmail, firstName } = props;
  const [state, setState] = useState(props.initial);
  const [busy, setBusy] = useState<null | "prepare" | "decide" | "save" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [subject, setSubject] = useState(props.initial.email?.subject ?? "");
  const [body, setBody] = useState(props.initial.email?.body ?? "");
  const [confirming, setConfirming] = useState(false);
  const auto = useRef(false);

  const apply = useCallback((s?: FollowUpState, errs?: string[]) => {
    if (s) {
      setState(s);
      setSubject(s.email?.subject ?? "");
      setBody(s.email?.body ?? "");
    }
    if (errs?.length) setError(errs.join(" "));
  }, []);

  const prepare = useCallback(async (force?: "brief" | "email" | "all") => {
    setBusy("prepare"); setError(null); setNotice(null);
    try { const r = await call(`/api/followup/${resumeId}/prepare`, "POST", force ? { force } : {}); apply(r.state, r.errors); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }, [resumeId, apply]);

  // Components Map: after scoring, the AI step generates the brief and the draft automatically (never sends).
  useEffect(() => {
    if (auto.current) return;
    const s = props.initial;
    const needBrief = s.action !== "reject" && s.action !== "decide" && !s.brief;
    const needEmail = s.action !== "decide" && !s.email;
    if (!(needBrief || needEmail)) return;
    const t = setTimeout(() => { auto.current = true; void prepare(); }, 0);
    return () => clearTimeout(t);
  }, [props.initial, prepare]);

  async function decide(action: "invite" | "reject") {
    setBusy("decide"); setError(null); setNotice(null);
    try { const r = await call(`/api/followup/${resumeId}/decision`, "POST", { action }); apply(r.state, r.errors); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  async function save() {
    setBusy("save"); setError(null);
    try {
      const r = await call(`/api/followup/${resumeId}/email`, "PUT", { subject, body });
      apply(r.state);
      setNotice(r.warnings?.length ? `Saved, but check the wording: ${r.warnings.join(", ")}.` : "Draft saved.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  async function send() {
    setBusy("send"); setError(null); setConfirming(false);
    try {
      if (dirty) await call(`/api/followup/${resumeId}/email`, "PUT", { subject, body });
      const r = await call(`/api/followup/${resumeId}/send`, "POST");
      apply(r.state);
      setNotice(r.mode === "redirect" ? `Sent in test mode to ${state.emailConfig.redirectTo}.` : `Sent to ${candidateEmail}.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const email = state.email;
  const sent = email?.status === "sent";
  const dirty = !!email && (subject !== email.subject || body !== email.body);
  const deliverTo = state.emailConfig.mode === "redirect" ? state.emailConfig.redirectTo : candidateEmail;
  const brief = state.brief?.brief;
  const actionLabel = { invite: "Invite to interview", reject: "Send a rejection", decide: "Arjun decides" }[state.action];

  return (
    <section id="followup" aria-labelledby="fu-h" className="space-y-6 scroll-mt-20">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-8">
        <h2 id="fu-h" className="text-xl font-semibold">Next step</h2>
        <p className="text-sm text-muted">The system recommends. Arjun decides. Nothing is sent without your click.</p>
      </div>

      {/* Decision */}
      <div className="rounded-lg border border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              {state.decision ? "Your decision" : "Recommendation"} · {props.recommendation}
            </p>
            <p className="mt-1 text-lg font-semibold">{actionLabel}</p>
            {state.action === "decide" && <p className="mt-1 text-sm text-muted">Review band: no email is drafted until you decide.</p>}
            {state.decision && <p className="mt-1 text-xs text-muted">Recorded {new Date(state.decision.created_at).toLocaleString("en-IN")}</p>}
          </div>
          {!sent && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Your decision">
              <button onClick={() => decide("invite")} disabled={busy !== null || state.action === "invite"}
                className="rounded-md border border-green-700 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50 disabled:opacity-40">
                ✓ Invite to interview
              </button>
              <button onClick={() => decide("reject")} disabled={busy !== null || state.action === "reject"}
                className="rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-40">
                ✕ Reject
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">{notice}</p>}
      {busy === "prepare" || busy === "decide" ? (
        <p role="status" aria-live="polite" className="rounded-md border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-accent">
          Generating the interview brief and email draft from the redacted CV…
        </p>
      ) : null}

      {/* Interview brief */}
      {state.action !== "reject" && (
        <div className="rounded-lg border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Interview brief</h3>
            {brief && <button onClick={() => prepare("brief")} disabled={busy !== null} className="text-sm text-accent hover:underline disabled:opacity-50">Regenerate</button>}
          </div>
          {!brief ? (
            <p className="mt-2 text-sm text-muted">
              {state.action === "decide" ? "Decide to invite and a brief will be prepared." : busy ? "Preparing…" : "No brief yet."}
              {state.action !== "decide" && !busy && <button onClick={() => prepare()} className="ml-2 text-accent underline">Generate</button>}
            </p>
          ) : (
            <div className="mt-3 space-y-5 text-sm">
              <p className="leading-relaxed">{brief.summary}</p>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Strengths</h4>
                  <ul className="mt-2 space-y-2">
                    {brief.strengths.map((s, i) => (
                      <li key={i}><span className="font-mono text-xs text-accent">{s.criterion}</span> {s.point}
                        <span className="mt-0.5 block border-l-2 border-line pl-2 text-[13px] italic text-muted">“{s.evidence}”</span></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Risks to test</h4>
                  <ul className="mt-2 space-y-2">
                    {brief.risks.map((r, i) => <li key={i}><span className="font-mono text-xs text-accent">{r.criterion}</span> {r.point}</li>)}
                  </ul>
                  {brief.logistics.length > 0 && (
                    <>
                      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Logistics</h4>
                      <ul className="mt-2 list-disc space-y-1 pl-5">{brief.logistics.map((l) => <li key={l}>{l}</li>)}</ul>
                    </>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="data">
                  <caption className="sr-only">Interview questions</caption>
                  <thead><tr><th scope="col">#</th><th scope="col">Criterion</th><th scope="col">Question</th><th scope="col">Listen for</th></tr></thead>
                  <tbody>
                    {brief.questions.map((q, i) => (
                      <tr key={i}><td className="tabular-nums">{i + 1}</td><td className="font-mono">{q.criterion}</td><td className="min-w-64">{q.question}</td><td className="min-w-56 text-muted">{q.listen_for}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">Generated by {state.brief!.model} from the redacted CV and the rubric result. Levels and scores above come from code, not from this brief.</p>
            </div>
          )}
        </div>
      )}

      {/* Email */}
      {state.action !== "decide" && (
        <div className="rounded-lg border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">
              {email?.kind === "rejection" ? "Rejection email" : "Interview invitation"}
              {sent && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">✓ Sent</span>}
              {email?.status === "failed" && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">Send failed</span>}
            </h3>
            {email && !sent && <button onClick={() => prepare("email")} disabled={busy !== null} className="text-sm text-accent hover:underline disabled:opacity-50">Regenerate draft</button>}
          </div>

          {!email ? (
            <p className="mt-2 text-sm text-muted">{busy ? "Drafting…" : "No draft yet."} {!busy && <button onClick={() => prepare("email")} className="text-accent underline">Generate</button>}</p>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm">
                <span className="text-muted">To:</span> {firstName} &lt;{candidateEmail ?? "no email on CV"}&gt;
                {state.emailConfig.mode === "redirect" && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                    Test mode: delivered to {state.emailConfig.redirectTo ?? "(EMAIL_REDIRECT_TO not set)"}
                  </span>
                )}
              </p>
              {sent ? (
                <div className="rounded-md border border-line bg-surface p-4 text-sm">
                  <p className="font-medium">{email.subject.replaceAll(PLACEHOLDER, firstName)}</p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans">{email.body.replaceAll(PLACEHOLDER, firstName)}</pre>
                  <p className="mt-3 text-xs text-muted">Sent {email.sent_at ? new Date(email.sent_at).toLocaleString("en-IN") : ""} via Resend ({email.delivery_mode} mode) · id {email.provider_id}</p>
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="em-subject" className="block text-sm font-medium">Subject</label>
                    <input id="em-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="em-body" className="block text-sm font-medium">Message</label>
                    <textarea id="em-body" value={body} onChange={(e) => setBody(e.target.value)} rows={14}
                      className="mt-1 w-full rounded-md border border-line px-3 py-2 font-sans text-sm leading-relaxed" aria-describedby="em-help" />
                    <p id="em-help" className="mt-1 text-xs text-muted">
                      <code className="tok">{PLACEHOLDER}</code> becomes “{firstName}” when sent. The AI never saw the name.
                      {email.model ? ` Drafted by ${email.model}.` : " Drafted from the standard template."}
                    </p>
                  </div>
                  {state.warnings.map((w) => <p key={w} role="alert" className="text-sm text-amber-900">⚠ {w}</p>)}
                  {email.error && <p className="text-sm text-red-800">Last attempt: {email.error}</p>}
                  {!state.emailConfig.ready && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Email isn&apos;t configured yet: {state.emailConfig.problem}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={save} disabled={busy !== null || !dirty} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-accent/50 disabled:opacity-40">
                      {busy === "save" ? "Saving…" : "Save draft"}
                    </button>
                    {!confirming ? (
                      <button onClick={() => setConfirming(true)} disabled={busy !== null || !state.emailConfig.ready || !candidateEmail}
                        className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40">
                        {email.status === "failed" ? "Retry send" : "Send"}
                      </button>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-1.5 text-sm" role="alertdialog" aria-label="Confirm send">
                        Send to <strong>{deliverTo}</strong>{state.emailConfig.mode === "redirect" ? " (test)" : ""}?
                        <button onClick={send} className="rounded bg-accent px-3 py-1 font-medium text-white hover:bg-accent-hover" autoFocus>Yes, send</button>
                        <button onClick={() => setConfirming(false)} className="px-2 py-1 text-muted hover:text-ink">Cancel</button>
                      </span>
                    )}
                    {busy === "send" && <span role="status" className="text-sm text-muted">Sending…</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
