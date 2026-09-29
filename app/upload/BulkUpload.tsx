"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAX = 4 * 1024 * 1024;
const MAX_FILES = 60;
type Role = "PM" | "SPM";
type Status =
  | { s: "queued" } | { s: "uploading" } | { s: "scoring"; id: string; name: string }
  | { s: "scored"; id: string; name: string; decision: string; score: number }
  | { s: "duplicate"; id: string; scored: boolean }
  | { s: "held"; id: string; why: string }
  | { s: "error"; msg: string; id?: string };
interface Item { key: string; file: File; status: Status }

/** Run tasks with a small concurrency limit. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()!); }));
}

/**
 * Automatic evaluation: as soon as there are files and a role, each CV is parsed, its name is read from the CV,
 * personal details are removed and verified, and it is scored. Only the redacted text reaches the AI; if the
 * automatic redaction check fails, that CV is held back (never sent) and flagged for review.
 */
export function BulkUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(new Set<string>());

  const set = (key: string, status: Status) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, status } : x)));

  function add(list: FileList | null) {
    setError(null);
    if (!list) return;
    const rejected: string[] = [];
    const next: Item[] = [];
    for (const f of Array.from(list)) {
      const ext = f.name.toLowerCase().split(".").pop();
      if ((ext !== "pdf" && ext !== "docx") || f.size > MAX) { rejected.push(f.name); continue; }
      const key = `${f.name}-${f.size}-${f.lastModified}`;
      if (items.some((x) => x.key === key)) continue;
      next.push({ key, file: f, status: { s: "queued" } });
    }
    if (items.length + next.length > MAX_FILES) return setError(`Up to ${MAX_FILES} files at a time.`);
    if (rejected.length) setError(`Skipped (not PDF/DOCX or over 4 MB): ${rejected.join(", ")}`);
    setFinished(false);
    setItems((xs) => [...xs, ...next]);
  }

  async function evaluate(it: Item, r: Role) {
    set(it.key, { s: "uploading" });
    const fd = new FormData();
    fd.set("file", it.file);
    fd.set("role", r);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) return set(it.key, { s: "error", msg: b.error ?? "Upload failed" });
      if (b.kind === "duplicate") return set(it.key, { s: "duplicate", id: b.resumeId, scored: b.status === "scored" });
      if (b.status === "redaction_failed") {
        const why = b.leakTypes?.length ? `personal details still detected (${b.leakTypes.join(", ").toLowerCase()})` : "couldn't find the candidate's name in the CV";
        return set(it.key, { s: "held", id: b.resumeId, why });
      }
      const name = b.name ?? "";
      set(it.key, { s: "scoring", id: b.resumeId, name });
      const sr = await fetch(`/api/score/${b.resumeId}`, { method: "POST" });
      const sb = await sr.json().catch(() => ({}));
      if (!sr.ok) return set(it.key, { s: "error", msg: sb.error ?? "Scoring failed", id: b.resumeId });
      set(it.key, { s: "scored", id: b.resumeId, name, decision: sb.decision, score: sb.score });
    } catch {
      set(it.key, { s: "error", msg: "Network error" });
    }
  }

  // Start automatically whenever there are queued files and a role.
  useEffect(() => {
    if (!role) return;
    const todo = items.filter((x) => x.status.s === "queued" && !started.current.has(x.key));
    if (!todo.length) return;
    todo.forEach((x) => started.current.add(x.key));
    const t = setTimeout(() => {
      setRunning(true);
      setFinished(false);
      void pool(todo, 3, (x) => evaluate(x, role)).then(() => { setRunning(false); setFinished(true); });
    }, 0);
    return () => clearTimeout(t);
  }, [items, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (k: Status["s"]) => items.filter((x) => x.status.s === k).length;
  const needsAttention = count("held") + count("error");

  // When a batch finishes cleanly, go straight to the dashboard.
  useEffect(() => {
    if (!finished || running || needsAttention || !items.length) return;
    const t = setTimeout(() => router.push(`/candidates?role=${role ?? "PM"}`), 1500);
    return () => clearTimeout(t);
  }, [finished, running, needsAttention, items.length, role, router]);

  return (
    <div className="mt-8 space-y-6">
      <fieldset>
        <legend className="block text-sm font-medium">Applied role <span className="text-red-700">*</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup">
          {(["PM", "SPM"] as const).map((r) => (
            <button type="button" key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)} disabled={running}
              className={`rounded-lg border px-4 py-3 text-left transition disabled:opacity-60 ${role === r ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line hover:border-accent/50"}`}>
              <span className="block font-semibold">{r === "PM" ? "Product Manager" : "Senior Product Manager"}</span>
              <span className="block text-xs text-muted">Scored against the {r} rubric</span>
            </button>
          ))}
        </div>
      </fieldset>

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
        <span className="text-xs text-muted">PDF or DOCX, up to 4 MB each, up to {MAX_FILES} files. Evaluation starts automatically.</span>
        <input ref={input} type="file" multiple accept=".pdf,.docx" className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>

      {!role && items.length > 0 && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Choose the role above and evaluation will start.</p>}
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="data">
            <caption className="sr-only">Files being evaluated</caption>
            <thead><tr><th scope="col">File</th><th scope="col">Candidate</th><th scope="col">Status</th><th scope="col" /></tr></thead>
            <tbody>
              {items.map((it) => {
                const st = it.status;
                const id = "id" in st ? st.id : undefined;
                const name = "name" in st ? st.name : "";
                return (
                  <tr key={it.key}>
                    <td className="max-w-56 truncate" title={it.file.name}>{it.file.name}</td>
                    <td className="whitespace-nowrap">{name || <span className="text-muted">–</span>}{id && <span className="block font-mono text-xs text-muted">{id}</span>}</td>
                    <td aria-live="polite">
                      {st.s === "queued" && <span className="text-muted">{role ? "Waiting" : "Waiting for role"}</span>}
                      {st.s === "uploading" && <span className="text-accent">Reading CV and removing personal info…</span>}
                      {st.s === "scoring" && <span className="text-accent">Evaluating against the rubric…</span>}
                      {st.s === "scored" && <span className="font-medium">✓ {st.decision} · {st.score.toFixed(1)}</span>}
                      {st.s === "duplicate" && <span className="text-muted">Already evaluated (duplicate)</span>}
                      {st.s === "held" && <span className="text-amber-800">⚠ Held back, not sent to AI: {st.why}</span>}
                      {st.s === "error" && <span className="text-red-700">✕ {st.msg}</span>}
                    </td>
                    <td className="whitespace-nowrap text-right text-sm">
                      {id && (st.s === "scored" || (st.s === "duplicate" && st.scored)) && <Link className="text-accent hover:underline" href={`/results/${id}`}>Details</Link>}
                      {id && (st.s === "held" || (st.s === "duplicate" && !st.scored) || st.s === "error") && <Link className="text-accent hover:underline" href={`/review/${id}`}>Fix &amp; score</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {running && <p role="status" className="text-sm text-muted">Evaluating… {count("scored")} of {items.length} done</p>}
      {finished && !running && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/candidates?role=${role ?? "PM"}`} className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover">Open dashboard</Link>
          <p className="text-sm text-muted">
            {count("scored")} evaluated{needsAttention ? `, ${needsAttention} need attention` : ". Taking you to the dashboard…"}
          </p>
        </div>
      )}
    </div>
  );
}
