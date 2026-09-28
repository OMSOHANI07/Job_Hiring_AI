import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/db/client";
import { allCandidatesHeader, allCandidatesRows } from "@/lib/export/build";
import { toCsv } from "@/lib/export/csv";
import { allCandidatesXlsx } from "@/lib/export/xlsx";
import type { Role } from "@/lib/scoring/types";
import { getRoleRanking } from "@/lib/views";

export const runtime = "nodejs";

const Query = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  role: z.enum(["PM", "SPM", "all"]).default("all"),
  blind: z.enum(["0", "1"]).default("0"),
});
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** One row per candidate for the role they applied for (ranked, capacity caps applied). */
export async function GET(req: NextRequest) {
  const q = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { format, role, blind } = q.data;
  const roles: Role[] = role === "all" ? ["PM", "SPM"] : [role];
  const rankings = await Promise.all(roles.map(async (r) => ({ role: r, ...(await getRoleRanking(r)) })));
  await getStore().audit("exported", null, { format, scope: role, count: rankings.reduce((s, r) => s + r.rows.length, 0) });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `kargo_candidates_${role}_${stamp}`;
  const headers = (type: string, ext: string) => ({
    "Content-Type": type, "Content-Disposition": `attachment; filename="${file}.${ext}"`, "Cache-Control": "no-store",
  });
  if (format === "csv") {
    const header = allCandidatesHeader(role);
    const rows = rankings.flatMap((r) => allCandidatesRows(r.rows, role, blind === "1"));
    return new NextResponse(toCsv([header, ...rows]), { headers: headers("text/csv; charset=utf-8", "csv") });
  }
  const buf = await allCandidatesXlsx(
    rankings.map((r) => ({ role: r.role, title: r.role === "PM" ? "Product Manager" : "Senior Product Manager", rows: r.rows })),
    blind === "1",
  );
  return new NextResponse(new Uint8Array(buf), { headers: headers(XLSX, "xlsx") });
}
