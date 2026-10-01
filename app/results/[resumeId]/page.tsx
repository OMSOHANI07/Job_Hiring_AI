import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionBadge, FlagChip, PassFail } from "@/components/Badges";
import { BAND_LABEL, bonusLabel, penaltyLabel, ROLE_LABEL } from "@/lib/decision";
import { isResumeId } from "@/lib/ids/resumeId";
import { CFG } from "@/lib/scoring/config";
import { getFollowUp } from "@/lib/followup";
import { getResultView } from "@/lib/views";
import { FollowUpPanel } from "./FollowUpPanel";

export const metadata: Metadata = { title: "Result" };
export const dynamic = "force-dynamic";

const fmt = (n: number, d = 1) => n.toFixed(d);

export default async function ResultPage({ params }: PageProps<"/results/[resumeId]">) {
  const { resumeId } = await params;
  if (!isResumeId(resumeId)) notFound();
  const v = await getResultView(resumeId);
  if (!v) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold">Not scored yet</h1>
        <p className="mt-2 text-sm text-muted">
          <span className="font-mono">{resumeId}</span> has no score. <Link className="text-accent underline" href={`/review/${resumeId}`}>Open the redaction review</Link>.
        </p>
      </div>
    );
  }
  const followUp = await getFollowUp(resumeId);
  const s = v.score;
  const demoted = v.finalBand !== s.band;
  const penPts = (id: string) => CFG.penalties.items.find((p) => p.id === id)?.points ?? 0;
  const bonPts = (id: string) => CFG.bonuses.items.find((b) => b.id === id)?.points ?? 0;
  const rawPen = s.penalties.reduce((a, p) => a + penPts(p), 0);
  const rawBon = s.bonuses.reduce((a, b) => a + bonPts(b), 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 space-y-10">
      {/* Header */}
      <section aria-labelledby="cand-h" className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{ROLE_LABEL[s.role]} · Rank {v.rank} of {v.roleCount}</p>
          <h1 id="cand-h" className="mt-1 text-3xl font-semibold tracking-tight">{v.identity.full_name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[v.identity.email, v.identity.phone].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 font-mono text-sm text-accent">{resumeId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="text-right">
            <p className="text-4xl font-semibold tabular-nums">{fmt(s.score)}<span className="text-lg text-muted">/100</span></p>
            <p className="text-sm text-muted">{BAND_LABEL[v.finalBand]}</p>
          </div>
          <DecisionBadge band={v.finalBand} size="lg" />
        </div>
      </section>
      {demoted && (
        <p role="status" className="-mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Cleared the bar for {BAND_LABEL[s.band]}, but this role&apos;s shortlist is at capacity, so it shows as {BAND_LABEL[v.finalBand]}.
        </p>
      )}

      {/* Flags + downloads */}
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2" aria-label="Flags">
          <span className="text-sm font-medium">Flags:</span>
          {v.finalFlags.length ? v.finalFlags.map((f) => <FlagChip key={f} flag={f} />) : <span className="text-sm text-muted">none</span>}
        </div>
        <div className="flex gap-2 text-sm" aria-label="Downloads">
          {(["csv", "xlsx", "json"] as const).map((f) => (
            <a key={f} href={`/api/export/${resumeId}?format=${f}`} download
              className="rounded-md border border-line px-3 py-1.5 font-medium hover:border-accent hover:text-accent">
              {f === "xlsx" ? "Excel (.xlsx)" : f.toUpperCase()}
            </a>
          ))}
        </div>
      </section>

      {/* Table 1 */}
      <section aria-labelledby="t1">
        <h2 id="t1" className="text-lg font-semibold">Score breakdown · {ROLE_LABEL[s.role]}</h2>
        <p className="mt-0.5 text-xs text-muted">Points = weight × (level ÷ 3) × evidence multiplier (A 1.0 · B 0.85 · C 0.6). Levels come from code, not the AI.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="data">
            <caption className="sr-only">Per-criterion score breakdown</caption>
            <thead>
              <tr>
                <th scope="col">ID</th><th scope="col">Criterion</th><th scope="col">Block</th>
                <th scope="col" className="text-right">Weight</th><th scope="col" className="text-center">Level</th>
                <th scope="col" className="text-center">Evidence</th><th scope="col" className="text-right">Mult.</th>
                <th scope="col" className="text-right">Points</th><th scope="col">Evidence snippets</th>
              </tr>
            </thead>
            <tbody>
              {v.criteria.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono font-semibold">{c.id}</td>
                  <td className="min-w-48">{c.name}</td>
                  <td className="whitespace-nowrap text-muted">{c.block}</td>
                  <td className="text-right tabular-nums">{c.weight}</td>
                  <td className="text-center tabular-nums" title={`Level ${c.level}: ${c.levelRule}`}>
                    <span className="font-semibold">{c.level}</span><span className="text-muted">/3</span>
                  </td>
                  <td className="text-center font-mono">{c.grade}</td>
                  <td className="text-right tabular-nums">{fmt(c.multiplier, 2)}</td>
                  <td className="text-right font-semibold tabular-nums">{fmt(c.points, 2)}</td>
                  <td className="min-w-72 text-[13px]">
                    {c.evidence.length ? (
                      <ul className="space-y-1">{c.evidence.map((e, i) => <li key={i} className="border-l-2 border-line pl-2 italic">“{e}”</li>)}</ul>
                    ) : <span className="text-muted">No evidence</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={7} className="text-right">Base total</td><td className="text-right tabular-nums">{fmt(s.base, 2)}</td><td /></tr>
              {s.penalties.map((p) => (
                <tr key={p}><td colSpan={7} className="text-right">Penalty {p}: {penaltyLabel(p)}</td><td className="text-right tabular-nums text-red-700">{penPts(p)}</td><td /></tr>
              ))}
              {rawPen !== s.penalty_total && (
                <tr><td colSpan={7} className="text-right">Penalty total after cap ({CFG.penalties.cap})</td><td className="text-right tabular-nums text-red-700">{s.penalty_total}</td><td /></tr>
              )}
              {s.bonuses.map((b) => (
                <tr key={b}><td colSpan={7} className="text-right">Bonus {b}: {bonusLabel(b)}</td><td className="text-right tabular-nums text-green-800">+{bonPts(b)}</td><td /></tr>
              ))}
              {rawBon !== s.bonus_total && (
                <tr><td colSpan={7} className="text-right">Bonus total after cap (+{CFG.bonuses.cap})</td><td className="text-right tabular-nums text-green-800">+{s.bonus_total}</td><td /></tr>
              )}
              <tr><td colSpan={7} className="text-right font-semibold">Final score (clamped 0–100)</td><td className="text-right text-base font-semibold tabular-nums">{fmt(s.score)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Table 2 */}
      <section aria-labelledby="t2">
        <h2 id="t2" className="text-lg font-semibold">Eligibility</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="data">
            <caption className="sr-only">Gates, non-negotiables and floors</caption>
            <thead><tr><th scope="col">Check</th><th scope="col">Rule</th><th scope="col">Result</th></tr></thead>
            <tbody>
              {v.gates.map((g) => (
                <tr key={g.id}><td className="whitespace-nowrap font-medium">Gate {g.id}: {g.name}</td><td className="text-[13px] text-muted">{g.rule}</td><td><PassFail passed={g.passed} /></td></tr>
              ))}
              {v.nonNegotiables.map((n) => (
                <tr key={n.rule}><td className="whitespace-nowrap font-medium">Non-negotiable</td><td className="font-mono text-[13px]">{n.rule}</td><td><PassFail passed={n.passed} /></td></tr>
              ))}
              <tr><td className="font-medium">Kargo DNA triad</td><td className="text-[13px] text-muted">{CFG.roles[s.role].dna_criteria.join(" + ")} levels (≥ 7 needed for Shortlist)</td><td className="font-semibold tabular-nums">{s.dna_triad}/9</td></tr>
              <tr><td className="font-medium">Product years</td><td className="text-[13px] text-muted">PM / Product Owner titles 100%; product decisions owned without a PM 50%</td><td className="font-semibold tabular-nums">{fmt(s.product_years)}</td></tr>
              <tr><td className="font-medium">Floors triggered</td><td className="text-[13px] text-muted">{CFG.roles[s.role].floors.map((f) => `${f.criterion} = ${f.if_level} caps the band at Review`).join("; ")}</td><td>{v.floors.length ? v.floors.join(", ") : "None"}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="why" className="rounded-lg border border-line p-5">
          <h2 id="why" className="text-lg font-semibold">Why ranked here</h2>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Strongest</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">{s.explanation.strongest.map((x) => <li key={x}>{x}</li>)}</ul>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Held back by</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">{(demoted ? [...s.explanation.held_back_by.filter((h) => !h.startsWith("nothing")), "cleared_bar_capacity"] : s.explanation.held_back_by).map((x) => <li key={x} className="font-mono text-[13px]">{x}</li>)}</ul>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Adjustments</h3>
          <p className="mt-1 text-sm">
            Penalties: {s.penalties.length ? s.penalties.map((p) => `${p} (${penaltyLabel(p)})`).join(", ") : "none"}
            <br />Bonuses: {s.bonuses.length ? s.bonuses.map((b) => `${b} (${bonusLabel(b)})`).join(", ") : "none"}
          </p>
        </section>
        <section aria-labelledby="probes" className="rounded-lg border border-line p-5">
          <h2 id="probes" className="text-lg font-semibold">Interview probes</h2>
          {s.interview_probes.length ? (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
              {s.interview_probes.map((p) => {
                const m = p.match(/^\[(\w+)\]\s*(.*)$/);
                return <li key={p}><span className="font-mono text-xs text-accent">{m?.[1]}</span> {m?.[2] ?? p}</li>;
              })}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">No probes: the engine does not generate interview probes for the Reject band.</p>
          )}
        </section>
      </div>

      {followUp && (
        <FollowUpPanel resumeId={resumeId} initial={followUp} candidateEmail={v.identity.email}
          firstName={v.identity.full_name.split(/\s+/)[0] ?? ""} recommendation={`${BAND_LABEL[v.finalBand]} (${fmt(s.score)})`} />
      )}

      <details className="rounded-lg border border-line p-5 text-sm">
        <summary className="cursor-pointer font-semibold">About this ranking</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>The Kargo DNA criteria come from 8 past hires (5 thriving). They are a strong hypothesis, not proof.</li>
          <li>There is no senior PM among past hires; the SPM archetype is borrowed from the Head of Engineering.</li>
          <li>The rubric is deliberately exclusive. A thin list is a signal to review the Review band, not to lower the bar.</li>
          <li>The AI only extracts facts from the redacted CV. Every level, score and band is computed by code from rubric config v{s.config_version}.</li>
          <li>Scores support Arjun&apos;s decision; they never make it.</li>
        </ul>
      </details>
    </div>
  );
}
