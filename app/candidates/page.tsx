import type { Metadata } from "next";
import { getRoleRanking } from "@/lib/views";
import { CandidatesTable } from "./CandidatesTable";

export const metadata: Metadata = { title: "Candidates" };
export const dynamic = "force-dynamic";

export default async function CandidatesPage({ searchParams }: PageProps<"/candidates">) {
  const sp = await searchParams;
  const role = sp.role === "SPM" ? "SPM" : "PM";
  const [pm, spm] = await Promise.all([getRoleRanking("PM"), getRoleRanking("SPM")]);
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
      <p className="mt-1 text-sm text-muted">
        Ranked per role by band, then score, then tie-breakers. Each CV is scored only against the role it was submitted for.
        Capacity caps (3 Priority, 6 Accept-or-better per role) are applied here.
      </p>
      <CandidatesTable initialRole={role} data={{ PM: pm, SPM: spm }} />
    </div>
  );
}
