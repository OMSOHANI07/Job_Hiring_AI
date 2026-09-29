"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunExample({ sample }: { sample: "accept" | "reject" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("Reading CV…");
  async function run() {
    setBusy(true);
    setError(null);
    setStage("Reading CV and removing personal info…");
    const res = await fetch("/api/examples/load", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sample }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); return setError(body.error ?? "Could not load the example."); }
    if (body.kind === "duplicate" && body.status === "scored") return router.push(`/results/${body.resumeId}`);
    if (body.status === "redaction_failed") return router.push(`/review/${body.resumeId}`);
    setStage("Evaluating against the rubric…");
    const sr = await fetch(`/api/score/${body.resumeId}`, { method: "POST" });
    const sb = await sr.json().catch(() => ({}));
    if (!sr.ok) { setBusy(false); return setError(sb.error ?? "Scoring failed."); }
    router.push(`/results/${body.resumeId}`);
  }
  return (
    <>
      <button onClick={run} disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
        {busy ? stage : "Run this example"}
      </button>
      {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    </>
  );
}
