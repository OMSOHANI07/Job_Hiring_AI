import { NextResponse, type NextRequest } from "next/server";
import { getFollowUp } from "@/lib/followup";
import { errorResponse } from "@/lib/http/respond";
import { isResumeId } from "@/lib/ids/resumeId";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/followup/[resumeId]">) {
  const { resumeId } = await ctx.params;
  if (!isResumeId(resumeId)) return NextResponse.json({ error: "Invalid Resume ID." }, { status: 400 });
  try {
    const s = await getFollowUp(resumeId);
    return s ? NextResponse.json(s) : NextResponse.json({ error: "Not scored yet." }, { status: 404 });
  } catch (e) {
    return errorResponse(e, resumeId);
  }
}
