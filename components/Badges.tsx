import { DECISION, flagHelp } from "@/lib/decision";
import type { Band } from "@/lib/scoring/types";

const TONE: Record<string, string> = {
  priority: "bg-green-800 text-white border-green-900",
  accept: "bg-green-100 text-green-900 border-green-300",
  review: "bg-amber-100 text-amber-900 border-amber-300",
  reject: "bg-red-100 text-red-900 border-red-300",
};
const ICON: Record<string, string> = { priority: "★", accept: "✓", review: "?", reject: "✕" };

/** Decision badge: colour plus icon plus text, so colour is never the only signal. */
export function DecisionBadge({ band, size = "md" }: { band: Band; size?: "md" | "lg" }) {
  const d = DECISION[band];
  const cls = size === "lg" ? "text-base px-4 py-2" : "text-xs px-2 py-0.5";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${TONE[d.tone]} ${cls}`}>
      <span aria-hidden="true">{ICON[d.tone]}</span>
      {d.label}
    </span>
  );
}

export function FlagChip({ flag }: { flag: string }) {
  const help = flagHelp(flag);
  return (
    <span
      tabIndex={0}
      title={help}
      className="group relative inline-flex items-center rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-xs text-ink cursor-help"
    >
      {flag}
      <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-72 rounded-md bg-ink px-3 py-2 font-sans text-xs text-white shadow-lg group-hover:block group-focus:block">
        {help}
      </span>
    </span>
  );
}

export function PassFail({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="inline-flex items-center gap-1 font-medium text-green-800"><span aria-hidden="true">✓</span>Pass</span>
  ) : (
    <span className="inline-flex items-center gap-1 font-medium text-red-700"><span aria-hidden="true">✕</span>Fail</span>
  );
}
