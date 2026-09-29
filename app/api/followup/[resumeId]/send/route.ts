import { NextResponse, type NextRequest } from "next/server";
import { getFollowUp, sendCandidateEmail } from "@/lib/followup";
import { errorResponse } from "@/lib/http/respond";
import { isResumeId } from "@/lib/ids/resumeId";

export const runtime = "nodejs";
export const maxDuration = 30;

/** One-click send via Resend. Only ever triggered by Arjun's click. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/followup/[resumeId]/send">) {
  const { resumeId } = await ctx.params;
  if (!isResumeId(resumeId)) return NextResponse.json({ error: "Invalid Resume ID." }, { status: 400 });
  try {
    const out = await sendCandidateEmail(resumeId);
    return NextResponse.json({ ...out, state: await getFollowUp(resumeId) });
  } catch (e) {
    return errorResponse(e, resumeId);
  }
}
