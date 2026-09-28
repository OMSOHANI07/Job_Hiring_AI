"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function Form() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Sign-in failed.");
      return;
    }
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <input
          id="password" type="password" autoComplete="current-password" required autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-line px-3 py-2"
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>
      {error && <p id="login-error" role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-60">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function LoginForm() {
  return <Suspense><Form /></Suspense>;
}
