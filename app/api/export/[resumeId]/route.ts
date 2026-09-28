import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/db/client";
import { CANDIDATE_HEADER, candidateBreakdownRows, candidateSummaryRows } from "@/lib/export/build";
import { toCsv } from "@/lib/export/csv";
import { candidateXlsx } from "@/lib/export/xlsx";
import { isResumeId } from "@/lib/ids/resumeId";
import { CFG } from "@/lib/scoring/config";
import { getResultView } from "@/lib/views";

export const runtime = "nodejs";

const Format = z.enum(["csv", "xlsx", "json"]);
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/export/[resumeId]">) {
  const { resumeId } = await ctx.params;
  const format = Format.safeParse(req.nextUrl.searchParams.get("format") ?? "csv");
  if (!isResumeId(resumeId) || !format.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const v = await getResultView(resumeId);
  if (!v) return NextResponse.json({ error: "No scored result for this Resume ID." }, { status: 404 });
  await getStore().audit("exported", resumeId, { format: format.data });
  const name = `${resumeId}_score`;
  const headers = (type: string, ext: string) => ({
    "Content-Type": type, "Content-Disposition": `attachment; filename="${name}.${ext}"`, "Cache-Control": "no-store",
  });

  if (format.data === "csv") {
    const rows = [CANDIDATE_HEADER, ...candidateBreakdownRows(v), [], ...candidateSummaryRows(v)];
    return new NextResponse(toCsv(rows), { headers: headers("text/csv; charset=utf-8", "csv") });
  }
  if (format.data === "xlsx") {
    return new NextResponse(new Uint8Array(await candidateXlsx(v)), { headers: headers(XLSX, "xlsx") });
  }
  const body = {
    resume_id: resumeId,
    identity: v.identity,
    applied_role: v.score.role,
    decision: v.score.decision,
    band_pre_capacity: v.score.band,
    band_final: v.finalBand,
    rank_in_role: { rank: v.rank, of: v.roleCount },
    evaluation: v.score,
    flags_final: v.finalFlags,
    criteria: v.criteria,
    gates: v.gates,
    non_negotiables: v.nonNegotiables,
    extraction: v.extraction?.extraction ?? null,
    model: v.extraction?.model ?? null,
    config_version: CFG.version,
    prompt_version: v.extraction?.prompt_version ?? null,
  };
  return new NextResponse(JSON.stringify(body, null, 2), { headers: headers("application/json; charset=utf-8", "json") });
}
