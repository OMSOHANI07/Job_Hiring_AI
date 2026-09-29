"use client";
import Link from "next/link";
import { useRef, useState } from "react";

const MAX = 4 * 1024 * 1024;
const MAX_FILES = 60;
type Role = "PM" | "SPM";
type Status =
  | { s: "queued" } | { s: "uploading" } | { s: "redacted"; id: string } | { s: "needs_review"; id: string; why: string }
  | { s: "duplicate"; id: string; scored: boolean } | { s: "scoring"; id: string } | { s: "scored"; id: string; decision: string; score: number }
  | { s: "error"; msg: string; id?: string };
interface Item { key: string; file: File; status: Status }

/** Run tasks with a small concurrency limit (keeps Gemini and the server comfortable). */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()!); }));
}

export function BulkUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<"pick" | "uploading" | "ready" | "scoring" | "done">("pick");
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, status: Status) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, status } : x)));

  function add(list: FileList | null) {
    setError(null);
    if (!list) return;
    const rejected: string[] = [];
    const next: Item[] = [];
    for (const f of Array.from(list)) {
      const ext = f.name.toLowerCase().split(".").pop();
      if ((ext !== "pdf" && ext !== "docx") || f.size > MAX) { rejected.push(f.name); continue; }
      if (items.some((x) => x.file.name === f.name && x.file.size === f.size)) continue;
      next.push({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, status: { s: "queued" } });
    }
    if (items.length + next.length > MAX_FILES) return setError(`Up to ${MAX_FILES} files at a time.`);
    if (rejected.length) setError(`Skipped (not PDF/DOCX or over 4 MB): ${rejected.join(", ")}`);
    setItems((xs) => [...xs, ...next]);
  }

  async function upload() {
    if (!role) return setError("Select the role these candidates applied for.");
    setError(null);
    setPhase("uploading");
    await pool(items.filter((x) => x.status.s === "queued" || x.status.s === "error"), 3, async (it) => {
      set(it.key, { s: "uploading" });
      const fd = new FormData();
      fd.set("file", it.file);
      fd.set("role", role);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const b = await res.json().catch(() => ({}));
        if (!res.ok) return set(it.key, { s: "error", msg: b.error ?? "Upload failed" });
        if (b.kind === "duplicate") return set(it.key, { s: "duplicate", id: b.resumeId, scored: b.status === "scored" });
        if (b.status === "redaction_failed") {
          return set(it.key, { s: "needs_review", id: b.resumeId, why: b.leakTypes?.length ? `still contains: ${b.leakTypes.join(", ").toLowerCase()}` : "name not detected" });
        }
        set(it.key, { s: "redacted", id: b.resumeId });
      } catch {
        set(it.key, { s: "error", msg: "Network error" });
      }
    });
    setPhase("ready");
  }

  async function scoreAll() {
    setPhase("scoring");
    const ready = items.filter((x) => x.status.s === "redacted") as (Item & { status: { s: "redacted"; id: string } })[];
    await pool(ready, 2, async (it) => {
      const id = it.status.id;
      set(it.key, { s: "scoring", id });
      try {
        const res = await fetch(`/api/score/${id}`, { method: "POST" });
        const b = await res.json().catch(() => ({}));
        if (!res.ok) return set(it.key, { s: "error", msg: b.error ?? "Scoring failed", id });
        set(it.key, { s: "scored", id, decision: b.decision, score: b.score });
      } catch {
        set(it.key, { s: "error", msg: "Network error", id });
      }
    });
    setPhase("done");
  }

  const count = (k: Status["s"]) => items.filter((x) => x.status.s === k).length;
  const readyN = count("redacted");

  return (
    <div className="mt-8 space-y-6">
      <fieldset>
        <legend className="block text-sm font-medium">Applied role <span className="text-red-700">*</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup">
          {(["PM", "SPM"] as const).map((r) => (
            <button type="button" key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)} disabled={phase !== "pick"}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:opacity-60 ${role === r ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line hover:border-accent/50"}`}>
              <span className="block font-semibold">{r === "PM" ? "Product Manager" : "Senior Product Manager"}</span>
              <span className="block text-xs text-muted">All files in this batch are scored against the {r} rubric</span>
            </button>
          ))}
        </div>
      </fieldset>

      {phase === "pick" && (
        <div
          role="button" tabIndex={0} aria-label="Choose CV files"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition ${drag ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50"}`}
        >
          <span className="font-medium">Drop CVs here, or click to choose</span>
          <span className="text-xs text-muted">PDF or DOCX, up to 4 MB each, up to {MAX_FILES} files</span>
          <input ref={input} type="file" multiple accept=".pdf,.docx" className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>
      )}

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="data">
            <caption className="sr-only">Files in this batch</caption>
            <thead><tr><th scope="col">File</th><th scope="col">Status</th><th scope="col">Resume ID</th><th scope="col" /></tr></thead>
            <tbody>
              {items.map((it) => {
                const st = it.status;
                const id = "id" in st ? st.id : undefined;
                return (
                  <tr key={it.key}>
                    <td className="max-w-64 truncate" title={it.file.name}>{it.file.name}</td>
                    <td aria-live="polite">
                      {st.s === "queued" && <span className="text-muted">Waiting</span>}
                      {st.s === "uploading" && <span className="text-accent">Removing personal info…</span>}
                      {st.s === "redacted" && <span className="text-green-800">✓ Redacted, ready to score</span>}
                      {st.s === "needs_review" && <span className="text-amber-800">⚠ Needs your review ({st.why})</span>}
                      {st.s === "duplicate" && <span className="text-muted">Duplicate of an existing CV</span>}
                      {st.s === "scoring" && <span className="text-accent">Extracting evidence and scoring…</span>}
                      {st.s === "scored" && <span className="font-medium">✓ {st.decision} · {st.score.toFixed(1)}</span>}
                      {st.s === "error" && <span className="text-red-700">✕ {st.msg}</span>}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">{id ?? "–"}</td>
                    <td className="whitespace-nowrap text-right text-sm">
                      {id && (st.s === "scored" || (st.s === "duplicate" && st.scored)) && <Link className="text-accent hover:underline" href={`/results/${id}`}>Details</Link>}
                      {id && (st.s === "redacted" || st.s === "needs_review" || (st.s === "duplicate" && !st.scored)) && <Link className="text-accent hover:underline" href={`/review/${id}`} target="_blank">Preview redaction</Link>}
                      {phase === "pick" && <button onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} className="text-muted hover:text-red-700" aria-label={`Remove ${it.file.name}`}>Remove</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {phase === "pick" && (
          <button onClick={upload} disabled={!items.length} className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50">
            Upload {items.length || ""} CV{items.length === 1 ? "" : "s"} &amp; remove personal info
          </button>
        )}
        {phase === "uploading" && <p role="status" className="text-sm text-muted">Parsing and redacting…</p>}
        {phase === "ready" && (
          <>
            <button onClick={scoreAll} disabled={!readyN} className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              Confirm &amp; score {readyN} CV{readyN === 1 ? "" : "s"}
            </button>
            <p className="max-w-md text-xs text-muted">
              Only the redacted text is sent to the AI. You can open any preview first.
              {count("needs_review") > 0 && ` ${count("needs_review")} file(s) need a name fix on their preview page before scoring.`}
            </p>
          </>
        )}
        {phase === "scoring" && <p role="status" className="text-sm text-muted">Scoring {count("scoring")} at a time… {count("scored")} of {readyN + count("scored") + count("scoring")} done</p>}
        {phase === "done" && (
          <>
            <Link href="/candidates" className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover">Open Candidates</Link>
            <button onClick={() => { setItems([]); setPhase("pick"); }} className="rounded-md border border-line px-4 py-2.5 text-sm font-medium">Upload another batch</button>
          </>
        )}
      </div>
    </div>
  );
}
