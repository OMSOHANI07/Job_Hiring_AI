import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getFollowUp, prepareFollowUp } from "@/lib/followup";
import { errorResponse } from "@/lib/http/respond";
import { isResumeId } from "@/lib/ids/resumeId";

export const runtime = "nodejs";
export const maxDuration = 60; // brief + email generated in parallel (~10–20 s)

const Body = z.object({ force: z.enum(["brief", "email", "all"]).optional() }).default({});

/** AI step: interview brief + email draft from redacted inputs. Nothing is sent. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/followup/[resumeId]/prepare">) {
  const { resumeId } = await ctx.params;
  if (!isResumeId(resumeId)) return NextResponse.json({ error: "Invalid Resume ID." }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const out = await prepareFollowUp(resumeId, { force: body.data.force });
    return NextResponse.json({ ...out, state: await getFollowUp(resumeId) });
  } catch (e) {
    return errorResponse(e, resumeId);
  }
}
