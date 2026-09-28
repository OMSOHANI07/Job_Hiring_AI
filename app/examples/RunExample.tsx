"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunExample({ sample }: { sample: "accept" | "reject" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/examples/load", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sample }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); return setError(body.error ?? "Could not load the example."); }
    router.push(body.kind === "duplicate" && body.status === "scored" ? `/results/${body.resumeId}` : `/review/${body.resumeId}`);
  }
  return (
    <>
      <button onClick={run} disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
        {busy ? "Loading…" : "Run this example"}
      </button>
      {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    </>
  );
}
