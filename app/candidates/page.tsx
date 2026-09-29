import type { Metadata } from "next";
import { emailConfig } from "@/lib/email/resend";
import { CFG } from "@/lib/scoring/config";
import { getRoleRanking } from "@/lib/views";
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
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
      <p className="mt-1 text-sm text-muted">
        Every evaluated CV, ranked per role (band, then score, then tie-breakers; capacity caps applied). Each CV is scored against the role it was submitted for.
      </p>
      <CandidatesTable initialRole={role} data={{ PM: pm, SPM: spm }} criteria={criteria}
        email={{ ready: cfg.ready, mode: cfg.mode, redirectTo: cfg.redirectTo, problem: cfg.problem }} />
    </div>
  );
}
