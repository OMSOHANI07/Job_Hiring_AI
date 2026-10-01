import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { RunExample } from "./RunExample";

export const metadata: Metadata = { title: "Worked examples" };

const REPO = "https://github.com/OMSOHANI07/Job_Hiring_AI/blob/main/samples/expected_outputs.md";

const CARDS = [
  {
    sample: "accept" as const, title: "Example: Accept", expect: "Expected: Accept – Priority (PM)",
    body: "Ananya Kulkarni (fictional). Almost four years preparing Bills of Lading and handling customs holds at a Mumbai freight forwarder, then sole PM at a Series A freight-visibility SaaS: killed two features on usage data, ran on-site discovery at six forwarder offices, owns the roadmap.",
  },
  {
    sample: "reject" as const, title: "Example: Reject", expect: "Expected: Reject (PM)",
    body: "Karan Malhotra (fictional). One of nine PMs at a 2,500-person consumer fintech; improved checkout conversion on an established product; CSPO, Reforge and conference talks up front; no operations or logistics experience; no relocation statement.",
  },
];

export default function ExamplesPage() {
  return (
    <>
      <PageHero tag="See it in action" title="Worked Examples">
        Two bundled fictional CVs. Each runs through the real pipeline automatically: parsing, name detection, redaction, Gemini extraction and scoring.
      </PageHero>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid gap-6 md:grid-cols-2">
        {CARDS.map((c) => (
          <article key={c.sample} className="card flex flex-col p-6">
            <h2 className="text-lg font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm font-medium text-accent">{c.expect}</p>
            <p className="mt-3 flex-1 text-sm text-muted">{c.body}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <RunExample sample={c.sample} />
              <a href={`${REPO}#${c.sample === "accept" ? "sample-a--accept" : "sample-b--reject"}`} target="_blank" rel="noreferrer" className="text-sm text-accent underline underline-offset-2">
                Expected output
              </a>
            </div>
          </article>
        ))}
      </div>
      </div>
    </>
  );
}
