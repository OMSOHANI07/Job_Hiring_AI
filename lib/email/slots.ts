// Proposed interview slots, computed in code (Mon–Fri, IST). Priority candidates get slots within 5 working days
// (email_policy.priority_shortlist); other invites within 7 working days. No calendar integration in this phase.

const TZ = "Asia/Kolkata";
const TIMES = ["11:00", "15:00", "17:30"];

function istParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd: p.weekday as string };
}

export function proposeSlots(opts: { priority: boolean; now?: Date; count?: number }): string[] {
  const now = opts.now ?? new Date();
  const window = opts.priority ? 5 : 7;
  const count = opts.count ?? 3;
  const days: Date[] = [];
  for (let i = 1; days.length < window && i < 20; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const { wd } = istParts(d);
    if (wd !== "Sat" && wd !== "Sun") days.push(d);
  }
  // spread across the window: day 1, middle, last; rotate the time of day
  const picks = count >= days.length ? days : [0, Math.floor((days.length - 1) / 2), days.length - 1].slice(0, count).map((i) => days[i]);
  return picks.map((d, i) => {
    const label = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
    return `${label}, ${TIMES[i % TIMES.length]} IST`;
  });
}
