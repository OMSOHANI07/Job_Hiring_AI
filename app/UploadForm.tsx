"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Steps } from "@/components/Steps";

const MAX = 4 * 1024 * 1024;
type Role = "PM" | "SPM";

export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [drag, setDrag] = useState(false);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; scored: boolean } | null>(null);

  function pick(f: File | undefined) {
    setError(null);
    setDuplicate(null);
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "docx") return setError("Only .pdf and .docx files are accepted.");
    if (f.size > MAX) return setError("File is larger than 4 MB.");
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a CV file.");
    if (!role) return setError("Select the role the candidate applied for.");
    setError(null);
    setStep(0);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("role", role);
    if (name.trim()) fd.set("name", name.trim());
    const t = setTimeout(() => setStep(1), 250);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    clearTimeout(t);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStep(-1);
      return setError(body.error ?? "Upload failed.");
    }
    setStep(2);
    if (body.kind === "duplicate") {
      setDuplicate({ id: body.resumeId, scored: body.status === "scored" });
      setStep(-1);
      return;
    }
    router.push(`/review/${body.resumeId}${body.emailMatch ? `?emailMatch=${body.emailMatch}` : ""}`);
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6" noValidate>
      <div>
        <span id="file-label" className="block text-sm font-medium">CV file</span>
        <div
          role="button" tabIndex={0} aria-labelledby="file-label" aria-describedby="file-help"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className={`mt-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition ${drag ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50"}`}
        >
          {file ? (
            <>
              <span className="font-medium">{file.name}</span>
              <span className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB · click to change</span>
            </>
          ) : (
            <>
              <span className="font-medium">Drop a CV here, or click to choose</span>
              <span id="file-help" className="text-xs text-muted">PDF or DOCX, up to 4 MB</span>
            </>
          )}
        </div>
        <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <fieldset>
        <legend className="block text-sm font-medium">Applied role <span className="text-red-700">*</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup">
          {(["PM", "SPM"] as const).map((r) => (
            <button
              type="button" key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)}
              className={`rounded-lg border px-4 py-4 text-left transition ${role === r ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line hover:border-accent/50"}`}
            >
              <span className="block font-semibold">{r === "PM" ? "Product Manager" : "Senior Product Manager"}</span>
              <span className="block text-xs text-muted">Scored against the {r} rubric only</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="cand-name" className="block text-sm font-medium">Candidate name <span className="font-normal text-muted">(optional)</span></label>
        <input
          id="cand-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off"
          aria-describedby="name-help" className="mt-1 w-full rounded-md border border-line px-3 py-2"
        />
        <p id="name-help" className="mt-1 text-xs text-muted">Leave blank to detect it from the CV. You can correct it on the next screen before anything is sent to the AI.</p>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {duplicate && (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Duplicate: this CV was already uploaded for this role as <span className="font-mono">{duplicate.id}</span>.{" "}
          <Link className="underline" href={duplicate.scored ? `/results/${duplicate.id}` : `/review/${duplicate.id}`}>
            {duplicate.scored ? "Open the existing result" : "Open the existing review"}
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button disabled={step >= 0} className="rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-60">
          {step >= 0 ? "Working…" : "Upload & remove personal info"}
        </button>
      </div>
      {step >= 0 && <div aria-live="polite"><Steps current={step} /></div>}
    </form>
  );
}
