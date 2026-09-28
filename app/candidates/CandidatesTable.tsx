"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DecisionBadge, FlagChip } from "@/components/Badges";
import { ROLE_LABEL } from "@/lib/decision";
import type { DashboardRow } from "@/lib/views";

type Role = "PM" | "SPM";
type SortKey = "rank" | "resumeId" | "name" | "score" | "dnaTriad" | "scoredAt";
const TOP_FLAG_ORDER = ["cleared_bar_capacity", "consider_for:SPM", "confirm_relocation", "check_level_fit", "overlapping_full_time_roles"];

function topFlags(flags: string[]) {
  const ranked = [...flags].sort((a, b) => {
    const ia = TOP_FLAG_ORDER.findIndex((f) => a.startsWith(f.split(":")[0]));
    const ib = TOP_FLAG_ORDER.findIndex((f) => b.startsWith(f.split(":")[0]));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return ranked.slice(0, 2);
}

export function CandidatesTable({ initialRole, data }: { initialRole: Role; data: Record<Role, { rows: DashboardRow[]; warnings: string[] }> }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole);
  const [q, setQ] = useState("");
  const [blind, setBlind] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });

  useEffect(() => {
    try { setBlind(localStorage.getItem("kargo_blind") === "1"); } catch { /* storage unavailable */ }
  }, []);
  function toggleBlind() {
    setBlind((b) => {
      try { localStorage.setItem("kargo_blind", b ? "0" : "1"); } catch { /* ignore */ }
      return !b;
    });
  }

  const { rows, warnings } = data[role];
  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => !needle || r.resumeId.toLowerCase().includes(needle) || (!blind && r.name.toLowerCase().includes(needle)));
    return [...filtered].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, q, blind, sort]);

  const th = (key: SortKey, label: string, cls = "") => (
    <th scope="col" className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "score" || key === "dnaTriad" || key === "scoredAt" ? -1 : 1 }))}>
        {label}<span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Role" className="flex gap-1 border-b border-line">
        {(["PM", "SPM"] as const).map((r) => (
          <button key={r} role="tab" aria-selected={role === r} aria-controls="cand-panel" id={`tab-${r}`}
            onClick={() => { setRole(r); router.replace(`/candidates?role=${r}`, { scroll: false }); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${role === r ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
            {ROLE_LABEL[r]} <span className="ml-1 rounded-full bg-surface px-1.5 text-xs">{data[r].rows.length}</span>
          </button>
        ))}
      </div>

      <div id="cand-panel" role="tabpanel" aria-labelledby={`tab-${role}`} className="pt-4">
        {warnings.map((w) => (
          <p key={w} role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span aria-hidden="true">⚠ </span>{w}
          </p>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="search">Search by name or Resume ID</label>
          <input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={blind ? "Search Resume ID" : "Search name or Resume ID"} className="w-64 rounded-md border border-line px-3 py-1.5 text-sm" />
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={blind} onChange={toggleBlind} className="h-4 w-4 accent-[var(--color-accent)]" />
            Blind mode (hide names)
          </label>
          <div className="ml-auto flex flex-wrap gap-2 text-sm">
            <span className="self-center text-muted">Export this view:</span>
            {(["csv", "xlsx"] as const).map((f) => (
              <a key={f} href={`/api/export/all?format=${f}&role=${role}&blind=${blind ? 1 : 0}`} download className="rounded-md border border-line px-3 py-1.5 font-medium hover:border-accent hover:text-accent">{f.toUpperCase()}</a>
            ))}
            <span className="self-center text-muted">All:</span>
            {(["csv", "xlsx"] as const).map((f) => (
              <a key={f} href={`/api/export/all?format=${f}&role=all&blind=${blind ? 1 : 0}`} download className="rounded-md border border-line px-3 py-1.5 font-medium hover:border-accent hover:text-accent">{f.toUpperCase()}</a>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="data">
            <caption className="sr-only">{ROLE_LABEL[role]} candidates, ranked</caption>
            <thead>
              <tr>
                {th("rank", "Rank", "w-16")}{th("resumeId", "Resume ID", "whitespace-nowrap")}{th("name", "Name")}
                <th scope="col">Applied role</th><th scope="col">Decision</th>
                {th("score", "Score", "text-right")}{th("dnaTriad", "DNA triad", "text-right")}
                <th scope="col">Top flags</th>{th("scoredAt", "Scored at")}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-muted">
                  {rows.length ? "No matches." : <>No scored candidates for this role yet. <Link href="/" className="text-accent underline">Upload a CV</Link> or <Link href="/examples" className="text-accent underline">run an example</Link>.</>}
                </td></tr>
              )}
              {view.map((r) => (
                <tr key={r.resumeId} className="cursor-pointer hover:bg-surface" onClick={() => router.push(`/results/${r.resumeId}`)}>
                  <td className="tabular-nums font-semibold">{r.rank}</td>
                  <td className="whitespace-nowrap font-mono"><Link href={`/results/${r.resumeId}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.resumeId}</Link></td>
                  <td>{blind ? <span className="text-muted">Hidden</span> : r.name}</td>
                  <td className="whitespace-nowrap">{ROLE_LABEL[r.appliedRole]}</td>
                  <td><DecisionBadge band={r.band} /></td>
                  <td className="text-right font-semibold tabular-nums">{r.score.toFixed(1)}</td>
                  <td className="text-right tabular-nums">{r.dnaTriad}/9</td>
                  <td><div className="flex flex-wrap gap-1">{topFlags(r.flags).map((f) => <FlagChip key={f} flag={f} />)}</div></td>
                  <td className="whitespace-nowrap text-muted">{new Date(r.scoredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
