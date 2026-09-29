"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Upload" },
  { href: "/candidates", label: "Dashboard" },
  { href: "/examples", label: "Examples" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="border-b border-line bg-white">
      <nav aria-label="Main" className="max-w-6xl mx-auto px-4 sm:px-6 min-h-14 flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
        <Link href="/" className="whitespace-nowrap font-semibold text-accent tracking-tight">Kargo · Hiring</Link>
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
        <button onClick={signOut} className="ml-auto whitespace-nowrap text-sm text-muted hover:text-ink">Sign out</button>
      </nav>
    </header>
  );
}
