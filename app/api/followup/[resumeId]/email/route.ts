import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { editEmail, getFollowUp } from "@/lib/followup";
import { errorResponse } from "@/lib/http/respond";
import { isResumeId } from "@/lib/ids/resumeId";

export const runtime = "nodejs";

const Body = z.object({ subject: z.string().trim().min(3).max(200), body: z.string().trim().min(20).max(5000) });

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/followup/[resumeId]/email">) {
  const { resumeId } = await ctx.params;
  if (!isResumeId(resumeId)) return NextResponse.json({ error: "Invalid Resume ID." }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });
  try {
    const out = await editEmail(resumeId, body.data.subject, body.data.body);
    return NextResponse.json({ ...out, state: await getFollowUp(resumeId) });
  } catch (e) {
    return errorResponse(e, resumeId);
  }
}
