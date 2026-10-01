import type { Metadata } from "next";
import { emailConfig } from "@/lib/email/resend";
import { CFG } from "@/lib/scoring/config";
import { getRoleRanking } from "@/lib/views";
import { PageHero } from "@/components/PageHero";
import { CandidatesTable } from "./CandidatesTable";

export const metadata: Metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

export default async function CandidatesPage({ searchParams }: PageProps<"/candidates">) {
  const sp = await searchParams;
  const role = sp.role === "SPM" ? "SPM" : "PM";
  const [pm, spm] = await Promise.all([getRoleRanking("PM"), getRoleRanking("SPM")]);
  const cfg = emailConfig();
  const criteria = {
    PM: CFG.roles.PM.criteria.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
    SPM: CFG.roles.SPM.criteria.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
  };
  return (
    <>
      <PageHero tag="Evaluated candidates" title="Find The Right Fit, Faster">
        Every evaluated CV, ranked per role (band, then score, then tie-breakers; capacity caps applied). Each CV is scored against the role it was submitted for.
      </PageHero>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <CandidatesTable initialRole={role} data={{ PM: pm, SPM: spm }} criteria={criteria}
        email={{ ready: cfg.ready, mode: cfg.mode, redirectTo: cfg.redirectTo, problem: cfg.problem }} />
      </div>
    </>
  );
}
