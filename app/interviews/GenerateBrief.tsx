"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateBrief({ resumeId }: { resumeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/followup/${resumeId}/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: "brief" }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || j.errors?.length) return setError(j.error ?? j.errors?.join(" ") ?? "Failed");
    router.refresh();
  }
  return (
    <div className="text-sm">
      <p className="text-muted">No brief yet.</p>
      <button onClick={run} disabled={busy} className="mt-2 rounded-md border border-accent px-3 py-1.5 font-medium text-accent hover:bg-accent-soft disabled:opacity-50">
        {busy ? "Generating…" : "Generate interview brief"}
      </button>
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
