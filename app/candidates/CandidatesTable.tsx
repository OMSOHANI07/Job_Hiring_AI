"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DecisionBadge, FlagChip } from "@/components/Badges";
import { ROLE_LABEL } from "@/lib/decision";
import type { DashboardRow } from "@/lib/views";
import { ActionDialog } from "./ActionDialog";

type Role = "PM" | "SPM";
type SortKey = "rank" | "name" | "score" | "dnaTriad" | "scoredAt";
type Criteria = Record<Role, { id: string; name: string; weight: number }[]>;
const TOP_FLAG_ORDER = ["cleared_bar_capacity", "consider_for", "confirm_relocation", "check_level_fit", "overlapping_full_time_roles", "evidence_not_found"];

function topFlags(flags: string[]) {
  const rank = (f: string) => { const i = TOP_FLAG_ORDER.findIndex((p) => f.startsWith(p)); return i < 0 ? 99 : i; };
  return [...flags].sort((a, b) => rank(a) - rank(b)).slice(0, 2);
}

const LEVEL_CLS = ["bg-red-50 text-red-800 border-red-200", "bg-amber-50 text-amber-900 border-amber-200", "bg-sky-50 text-sky-900 border-sky-200", "bg-green-50 text-green-900 border-green-300"];

/** Level chips for every criterion of the rubric (0–3), so all scores per person are visible at a glance. */
function RubricChips({ row, criteria }: { row: DashboardRow; criteria: Criteria[Role] }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Level per criterion">
      {criteria.map((c) => {
        const lvl = row.levels[c.id] ?? 0;
        return (
          <span key={c.id} title={`${c.id} ${c.name} (weight ${c.weight}): level ${lvl}/3`}
            className={`inline-flex items-center rounded border px-1 py-0.5 font-mono text-[11px] ${LEVEL_CLS[lvl]}`}>
            {c.id}<span aria-hidden="true" className="px-0.5 opacity-50">:</span><span className="sr-only"> level </span><span className="font-semibold">{lvl}</span>
          </span>
        );
      })}
    </div>
  );
}

function Outreach({ row }: { row: DashboardRow }) {
  const o = row.outreach;
  if (o?.status === "sent") {
    return (
      <span className={`whitespace-nowrap text-xs font-semibold ${o.kind === "invite" ? "text-green-800" : "text-red-800"}`}>
        {o.kind === "invite" ? "✓ Interview invite sent" : "✓ Rejection sent"}{o.mode === "redirect" ? " (test)" : ""}
      </span>
    );
  }
  if (o) return <span className="whitespace-nowrap text-xs text-muted">{o.kind === "invite" ? "Invite" : "Rejection"} drafted{o.status === "failed" ? ", send failed" : ""}</span>;
  if (row.nextAction === "decide") return <span className="whitespace-nowrap text-xs text-amber-800">Awaiting your decision</span>;
  return null;
}

export function CandidatesTable({ initialRole, data, criteria, email }: {
  initialRole: Role;
  data: Record<Role, { rows: DashboardRow[]; warnings: string[] }>;
  criteria: Criteria;
  email: { ready: boolean; mode: "redirect" | "live"; redirectTo: string | null; problem: string | null };
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(initialRole);
  const [q, setQ] = useState("");
  const [blind, setBlind] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [dialog, setDialog] = useState<{ row: DashboardRow; action: "invite" | "reject" } | null>(null);

  useEffect(() => {
    try { if (localStorage.getItem("kargo_blind") === "1") setTimeout(() => setBlind(true), 0); } catch { /* storage unavailable */ }
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

  const all = [...data.PM.rows, ...data.SPM.rows];
  const counts = {
    evaluated: all.length,
    invited: all.filter((r) => r.outreach?.status === "sent" && r.outreach.kind === "invite").length,
    rejected: all.filter((r) => r.outreach?.status === "sent" && r.outreach.kind === "rejection").length,
    decide: all.filter((r) => r.nextAction === "decide" && r.outreach?.status !== "sent").length,
  };

  const th = (key: SortKey, label: string, cls = "") => (
    <th scope="col" className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "score" || key === "dnaTriad" || key === "scoredAt" ? -1 : 1 }))}>
        {label}<span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="mt-6">
      <dl className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {([["Evaluated", counts.evaluated], ["Interview invites sent", counts.invited], ["Rejections sent", counts.rejected], ["Awaiting your decision", counts.decide]] as const).map(([k, n]) => (
          <div key={k} className="rounded-lg border border-line px-3 py-2">
            <dt className="text-xs text-muted">{k}</dt><dd className="text-2xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>

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
        {!email.ready && <p role="status" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Email sending is off: {email.problem}</p>}
        {email.ready && email.mode === "redirect" && <p role="status" className="mb-3 rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">Test mode: every email goes to {email.redirectTo}, never to candidates.</p>}
        {warnings.map((w) => <p key={w} role="status" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><span aria-hidden="true">⚠ </span>{w}</p>)}

        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="search">Search by name or Resume ID</label>
          <input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={blind ? "Search Resume ID" : "Search name or Resume ID"}
            className="w-64 rounded-md border border-line px-3 py-1.5 text-sm" />
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={blind} onChange={toggleBlind} className="h-4 w-4 accent-[var(--color-accent)]" /> Blind mode
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            <Link href="/upload" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent-hover">+ Upload CVs</Link>
            <span className="text-muted">Export:</span>
            {(["csv", "xlsx"] as const).map((f) => (
              <a key={f} href={`/api/export/all?format=${f}&role=${role}&blind=${blind ? 1 : 0}`} download className="rounded-md border border-line px-3 py-1.5 font-medium hover:border-accent hover:text-accent">{f.toUpperCase()}</a>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="data">
            <caption className="sr-only">{ROLE_LABEL[role]} candidates, ranked</caption>
            <thead>
              <tr>
                {th("rank", "#", "w-10")}{th("name", "Candidate")}<th scope="col">Recommendation</th>
                {th("score", "Score", "text-right")}<th scope="col">Rubric levels (0–3)</th>{th("dnaTriad", "DNA", "text-right")}
                <th scope="col">Flags</th><th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-muted">
                  {rows.length ? "No matches." : <>No evaluated candidates for this role yet. <Link href="/upload" className="text-accent underline">Upload CVs</Link> or <Link href="/examples" className="text-accent underline">run an example</Link>.</>}
                </td></tr>
              )}
              {view.map((r) => {
                const sent = r.outreach?.status === "sent";
                return (
                  <tr key={r.resumeId} className="hover:bg-surface">
                    <td className="tabular-nums font-semibold">{r.rank}</td>
                    <td className="min-w-40">
                      <span className="block font-medium">{blind ? <span className="text-muted">Hidden</span> : r.name}</span>
                      <span className="block whitespace-nowrap font-mono text-xs text-muted">{r.resumeId}</span>
                      <Outreach row={r} />
                    </td>
                    <td><DecisionBadge band={r.band} /></td>
                    <td className="text-right text-base font-semibold tabular-nums">{r.score.toFixed(1)}</td>
                    <td className="min-w-52"><RubricChips row={r} criteria={criteria[role]} /></td>
                    <td className="text-right tabular-nums">{r.dnaTriad}/9</td>
                    <td><div className="flex max-w-48 flex-wrap gap-1">{topFlags(r.flags).map((f) => <FlagChip key={f} flag={f} />)}</div></td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button onClick={() => setDialog({ row: r, action: "invite" })} disabled={sent} title="Accept: draft and send an interview invitation"
                          className="whitespace-nowrap rounded-md border border-green-700 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-50 disabled:opacity-35">
                          Accept
                        </button>
                        <button onClick={() => setDialog({ row: r, action: "reject" })} disabled={sent}
                          className="whitespace-nowrap rounded-md border border-red-700 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-35">
                          Reject
                        </button>
                        <Link href={`/results/${r.resumeId}`} className="whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-accent hover:text-accent">
                          Details
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Recommendation comes from the rubric; Accept (interview invite) / Reject is your decision. Opening either drafts the email (AI, redacted inputs); nothing is sent until you click Send.
        </p>
      </div>

      {dialog && (
        <ActionDialog resumeId={dialog.row.resumeId} name={dialog.row.name} email={dialog.row.email}
          action={dialog.action} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
