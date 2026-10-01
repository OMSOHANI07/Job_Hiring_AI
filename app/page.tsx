import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck, BrainCircuit, CalendarCheck, ClipboardList, FileSearch, Mail, ShieldCheck, Sparkles, Star, Upload, Users, XCircle,
} from "lucide-react";
import { ArrowButton } from "@/components/ArrowButton";
import { DecisionBadge } from "@/components/Badges";
import { getInterviews } from "@/lib/interviews";
import { getRoleRanking } from "@/lib/views";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const STEPS = [
  { icon: Upload, title: "Bulk upload", body: "Drop PDF or DOCX CVs and pick the role. Evaluation starts on its own." },
  { icon: ShieldCheck, title: "Personal info removed", body: "Name, contact, address and IDs are stripped and verified before any AI step." },
  { icon: FileSearch, title: "Evidence extraction", body: "The AI only reports facts from the redacted CV, with verbatim evidence." },
  { icon: BrainCircuit, title: "Rubric scoring", body: "Code scores 8 criteria built from Kargo's best past hires. Same input, same score." },
  { icon: ClipboardList, title: "Interview brief", body: "Strengths, risks and tailored questions for everyone you invite." },
  { icon: Mail, title: "One-click email", body: "Invite or a warm rejection, drafted for you and sent only when you click." },
  { icon: CalendarCheck, title: "Interviews", body: "Everyone you've invited, with their brief, in one place." },
];

export default async function Home() {
  const [pm, spm, iv] = await Promise.all([getRoleRanking("PM"), getRoleRanking("SPM"), getInterviews()]);
  const rows = [...pm.rows, ...spm.rows];
  const by = (b: string) => rows.filter((r) => r.band === b).length;
  const rejected = rows.filter((r) => r.outreach?.status === "sent" && r.outreach.kind === "rejection").length;
  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, 3);

  const STATS = [
    { icon: Users, label: "Candidates evaluated", value: rows.length, href: "/candidates" },
    { icon: Star, label: "Accept – Priority", value: by("priority_shortlist"), href: "/candidates" },
    { icon: BadgeCheck, label: "Accept", value: by("shortlist"), href: "/candidates" },
    { icon: Sparkles, label: "Review – you decide", value: by("review"), href: "/candidates" },
    { icon: CalendarCheck, label: "Interview invites sent", value: iv.sent.length, href: "/interviews" },
    { icon: XCircle, label: "Rejections sent", value: rejected, href: "/candidates" },
  ];

  return (
    <>
      {/* Hero */}
      <section className="hero-band">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <span className="tag-pill">Screen, Shortlist, Hire <span aria-hidden="true">→</span></span>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight text-navy sm:text-5xl">
              Find Kargo&apos;s Next PM,<br />One CV At A Time
            </h1>
            <p className="mt-4 max-w-xl text-[17px] text-muted">
              Upload CVs and get an explainable shortlist in minutes, scored against the pattern behind Kargo&apos;s best hires.
              Briefs and emails are drafted for you; you make the call.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ArrowButton href="/upload">Evaluate CVs</ArrowButton>
              <ArrowButton href="/candidates" tone="dark">View candidates</ArrowButton>
            </div>
            <div className="mt-10">
              <p className="text-sm font-bold text-navy">Built for two roles</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-navy/80">
                <span className="rounded-lg border border-line bg-white px-3 py-1.5">Product Manager</span>
                <span className="rounded-lg border border-line bg-white px-3 py-1.5">Senior Product Manager</span>
              </div>
            </div>
          </div>

          {/* Illustration: live shortlist preview (initials only) */}
          <div className="relative mx-auto w-full max-w-md" aria-label="Top candidates preview">
            <div aria-hidden="true" className="absolute -right-6 -top-6 h-40 w-40 rounded-full bg-accent/15 blur-2xl" />
            <div aria-hidden="true" className="absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-[#7ea2ff]/25 blur-2xl" />
            <div className="card relative p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-navy">Top of the shortlist</p>
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">Live</span>
              </div>
              <ul className="mt-4 space-y-3">
                {top.length === 0 && <li className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-muted">No candidates yet. Upload CVs to start.</li>}
                {top.map((r, i) => (
                  <li key={r.resumeId} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${["bg-accent", "bg-navy", "bg-[#4f7cff]"][i]}`}>{initials(r.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy">{r.appliedRole === "PM" ? "Product Manager" : "Senior PM"} applicant</span>
                      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(4, r.score)}%` }} />
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg font-extrabold tabular-nums text-navy">{r.score.toFixed(0)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {top[0] && <div className="mt-4 flex justify-end"><DecisionBadge band={top[0].band} /></div>}
            </div>
            <div className="card absolute -bottom-6 -left-4 hidden items-center gap-2 px-3 py-2 text-xs font-semibold text-navy sm:flex">
              <ShieldCheck size={16} className="text-accent" /> Personal details removed before AI
            </div>
          </div>
        </div>
      </section>

      {/* Stats grid */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="tag-pill">Your hiring at a glance <span aria-hidden="true">→</span></span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy">Shortlist With Confidence, Hire Faster</h2>
          </div>
          <ArrowButton href="/candidates" tone="dark">Open dashboard</ArrowButton>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATS.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-accent/40">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent"><s.icon size={26} /></span>
                <span>
                  <span className="block text-base font-bold text-navy">{s.label}</span>
                  <span className="block text-sm text-muted"><span className="font-bold tabular-nums text-ink">{s.value}</span> candidate{s.value === 1 ? "" : "s"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Navy steps band */}
      <section className="navy-band text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <span className="tag-pill">Automated screening <span aria-hidden="true">→</span></span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Streamlining Hiring, One Click At A Time</h2>
          </div>
          <ul className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.title} className="text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent"><s.icon size={22} /></span>
                </span>
                <p className="mt-4 font-bold">{s.title}</p>
                <p className="mx-auto mt-1 max-w-[16rem] text-sm text-white/70">{s.body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex justify-center gap-3">
            <ArrowButton href="/upload">Evaluate CVs</ArrowButton>
            <ArrowButton href="/examples" tone="light">See an example</ArrowButton>
          </div>
        </div>
      </section>

      {/* Two roles */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <span className="tag-pill">The Kargo pattern <span aria-hidden="true">→</span></span>
        <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-navy">Rubrics Built From The People Who Thrive At Kargo</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted">
          Every thriving hire worked inside logistics operations before moving into their current function. The rubrics reward that,
          plus ownership, shipping on evidence and discovery with operations users.
        </p>
        <div className="mt-10 grid gap-5 text-left md:grid-cols-2">
          {[
            { role: "Product Manager", n: pm.rows.length, pts: ["Freight-floor immersion", "Builds the missing thing", "Sole ownership", "Ships and kills on evidence"] },
            { role: "Senior Product Manager", n: spm.rows.length, pts: ["Ops immersion, incl. systems", "Consequential calls", "Owns integrations & data layer", "Candour"] },
          ].map((c) => (
            <div key={c.role} className="card p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-navy">{c.role}</h3>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{c.n} evaluated</span>
              </div>
              <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {c.pts.map((p) => <li key={p} className="flex items-center gap-2"><BadgeCheck size={16} className="shrink-0 text-accent" />{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
