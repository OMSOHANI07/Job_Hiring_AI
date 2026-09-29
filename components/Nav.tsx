"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/candidates", label: "Candidates" },
  { href: "/interviews", label: "Interviews" },
  { href: "/upload", label: "Upload CVs" },
  { href: "/examples", label: "Examples" },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => path.startsWith(href) || (href === "/candidates" && path.startsWith("/results"));
  return (
    <header className="border-b border-line bg-white">
      <nav aria-label="Main" className="max-w-6xl mx-auto px-4 sm:px-6 min-h-14 flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
        <Link href="/candidates" className="whitespace-nowrap font-semibold text-accent tracking-tight">Kargo · Hiring</Link>
        <ul className="order-3 flex w-full items-center gap-1 text-sm sm:order-none sm:w-auto">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active(l.href) ? "page" : undefined}
                className={`px-3 py-1.5 rounded-md ${active(l.href) ? "bg-accent-soft text-accent font-medium" : "text-muted hover:text-ink"}`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
