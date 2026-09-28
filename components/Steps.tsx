export const PIPELINE_STEPS = ["Parsing", "Removing personal info", "Resume ID assigned", "Extracting evidence", "Scoring", "Done"] as const;

/** Step indicator. `current` is the index of the active step; steps before it are complete. */
export function Steps({ current, failedAt }: { current: number; failedAt?: number }) {
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-2 text-xs" aria-label="Progress">
      {PIPELINE_STEPS.map((s, i) => {
        const state = failedAt === i ? "failed" : i < current ? "done" : i === current ? "active" : "todo";
        const cls = {
          done: "bg-green-50 text-green-800 border-green-200",
          active: "bg-accent-soft text-accent border-accent/30 font-semibold",
          todo: "bg-white text-muted border-line",
          failed: "bg-red-50 text-red-800 border-red-200 font-semibold",
        }[state];
        const mark = { done: "✓", active: "●", todo: "○", failed: "✕" }[state];
        return (
          <li key={s} aria-current={state === "active" ? "step" : undefined} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${cls}`}>
            <span aria-hidden="true">{mark}</span>{s}
            <span className="sr-only"> ({state})</span>
          </li>
        );
      })}
    </ol>
  );
}
