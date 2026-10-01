"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

const LINKS = [
  { href: "/candidates", label: "Candidates" },
  { href: "/interviews", label: "Interviews" },
  { href: "/upload", label: "Upload CVs" },
  { href: "/examples", label: "Examples" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Kargo Hiring home">
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full border-2 border-accent">
        <span className="h-3.5 w-3.5 rounded-full bg-accent" />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-extrabold tracking-tight text-navy">Kargo<span className="text-accent">.</span></span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Hiring dashboard</span>
      </span>
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const active = (href: string) => path.startsWith(href) || (href === "/candidates" && path.startsWith("/results"));
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <Logo />
        <ul className="order-3 flex w-full items-center gap-1 overflow-x-auto text-sm font-semibold sm:order-none sm:mx-auto sm:w-auto">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={active(l.href) ? "page" : undefined}
                className={`block whitespace-nowrap rounded-lg px-3.5 py-2 uppercase tracking-wide text-[12px] transition ${active(l.href) ? "bg-accent text-white shadow-sm" : "text-navy hover:bg-accent-soft"}`}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/upload" className="ml-auto inline-flex items-center gap-2.5 rounded-xl bg-navy py-1.5 pl-4 pr-1.5 text-[12px] font-bold uppercase tracking-wide text-white hover:bg-navy-2 sm:ml-0">
          Evaluate CVs
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-accent"><ArrowUpRight size={15} /></span>
        </Link>
      </nav>
    </header>
  );
}
