import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getFollowUp, recordDecision } from "@/lib/followup";
import { errorResponse } from "@/lib/http/respond";
import { isResumeId } from "@/lib/ids/resumeId";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ action: z.enum(["invite", "reject"]) });

/** Arjun decides. Records the decision, then drafts the matching email (and a brief for invites). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/followup/[resumeId]/decision">) {
  const { resumeId } = await ctx.params;
  if (!isResumeId(resumeId)) return NextResponse.json({ error: "Invalid Resume ID." }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Choose invite or reject." }, { status: 400 });
  try {
    const out = await recordDecision(resumeId, body.data.action);
    return NextResponse.json({ ...out, state: await getFollowUp(resumeId) });
  } catch (e) {
    return errorResponse(e, resumeId);
  }
}
