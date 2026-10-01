import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** Theme CTA: label plus a small arrow square, in blue (primary) or navy (dark). */
export function ArrowButton({ href, children, tone = "primary", className = "" }: { href: string; children: React.ReactNode; tone?: "primary" | "dark" | "light"; className?: string }) {
  const cls = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    dark: "bg-navy text-white hover:bg-navy-2",
    light: "bg-white text-navy border border-line hover:border-accent",
  }[tone];
  const sq = tone === "primary" ? "bg-white/15" : tone === "dark" ? "bg-accent" : "bg-accent text-white";
  return (
    <Link href={href} className={`inline-flex items-center gap-3 rounded-xl py-2 pl-4 pr-2 text-sm font-semibold transition ${cls} ${className}`}>
      {children}
      <span aria-hidden="true" className={`grid h-7 w-7 place-items-center rounded-lg ${sq}`}><ArrowUpRight size={16} /></span>
    </Link>
  );
}
