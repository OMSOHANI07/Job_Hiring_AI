"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardRow } from "@/lib/views";

/** Dashboard "Next step" cell: prepare, one-click send (with confirm), or "Arjun decides". */
export function NextStep({ row, emailReady, deliverTo }: { row: DashboardRow; emailReady: boolean; deliverTo: (r: DashboardRow) => string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  async function post(url: string) {
    setBusy(true); setError(null); setConfirm(false);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Failed");
    router.refresh();
  }

  const o = row.outreach;
  const kindLabel = row.nextAction === "invite" ? "invite" : "rejection";
  let content: React.ReactNode;
  if (o?.status === "sent") {
    content = <span className="whitespace-nowrap font-medium text-green-800">✓ {o.kind === "invite" ? "Invite" : "Rejection"} sent{o.mode === "redirect" ? " (test)" : ""}</span>;
  } else if (row.nextAction === "decide") {
    content = <Link href={`/results/${row.resumeId}#followup`} onClick={stop} className="whitespace-nowrap rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100">Arjun decides →</Link>;
  } else if (!o || (o.kind === "invite") !== (row.nextAction === "invite")) {
    content = (
      <button onClick={(e) => { stop(e); void post(`/api/followup/${row.resumeId}/prepare`); }} disabled={busy}
        className="whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-50">
        {busy ? "Drafting…" : `Draft ${kindLabel}${row.nextAction === "invite" ? " + brief" : ""}`}
      </button>
    );
  } else if (confirm) {
    content = (
      <span className="inline-flex flex-wrap items-center gap-1 text-xs" onClick={stop} role="alertdialog" aria-label="Confirm send">
        Send to {deliverTo(row)}?
        <button onClick={() => post(`/api/followup/${row.resumeId}/send`)} className="rounded bg-accent px-2 py-0.5 font-medium text-white" autoFocus>Send</button>
        <button onClick={() => setConfirm(false)} className="px-1 text-muted">Cancel</button>
      </span>
    );
  } else {
    content = (
      <span className="inline-flex items-center gap-2">
        <button onClick={(e) => { stop(e); setConfirm(true); }} disabled={busy || !emailReady || !row.email}
          title={!emailReady ? "Email isn't configured yet" : !row.email ? "No email address on the CV" : undefined}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40 ${o.kind === "invite" ? "bg-green-800 hover:bg-green-900" : "bg-accent hover:bg-accent-hover"}`}>
          {busy ? "Sending…" : o.status === "failed" ? "Retry send" : `Send ${o.kind}`}
        </button>
        <Link href={`/results/${row.resumeId}#followup`} onClick={stop} className="text-xs text-accent hover:underline">Review</Link>
      </span>
    );
  }
  return (
    <div>
      {content}
      {error && <p role="alert" className="mt-1 max-w-56 text-xs text-red-700">{error}</p>}
    </div>
  );
}
