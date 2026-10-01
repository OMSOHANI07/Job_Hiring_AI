import type { Metadata } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

const urbanist = Urbanist({ variable: "--font-urbanist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kargo Hiring", template: "%s · Kargo Hiring" },
  description: "Upload, redact and score PM / SPM candidates against Kargo's rubrics.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${urbanist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="bg-navy text-[12px] text-white/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
            <span>Kargo · Hiring for Product Manager &amp; Senior Product Manager · Mumbai</span>
            <span className="hidden sm:inline">The system recommends. Arjun decides.</span>
          </div>
        </div>
        <Nav />
        <main id="main" className="flex-1 w-full">{children}</main>
        <footer className="navy-band mt-16 text-white/80">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <p className="text-lg font-bold text-white">Kargo<span className="text-[#7ea2ff]">.</span> Hiring</p>
              <p className="mt-2 max-w-md text-sm">
                Rubric-based screening for Kargo&apos;s product roles. Personal details are removed before any AI step;
                every score comes from code and is fully explainable.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Workspace</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li><Link href="/candidates" className="hover:text-white">Candidates</Link></li>
                <li><Link href="/interviews" className="hover:text-white">Interviews</Link></li>
                <li><Link href="/upload" className="hover:text-white">Upload CVs</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Learn</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li><Link href="/examples" className="hover:text-white">Worked examples</Link></li>
                <li><Link href="/" className="hover:text-white">How it works</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
            Scores support a decision; they never make it.
          </div>
        </footer>
      </body>
    </html>
  );
}
