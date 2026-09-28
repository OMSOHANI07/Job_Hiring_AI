import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http/respond";
import { isResumeId } from "@/lib/ids/resumeId";
import { reRedact } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ name: z.string().trim().min(2).max(120) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/reredact/[resumeId]">) {
  const { resumeId } = await ctx.params;
  if (!isResumeId(resumeId)) return NextResponse.json({ error: "Invalid Resume ID." }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Enter the candidate's full name." }, { status: 400 });
  try {
    return NextResponse.json(await reRedact(resumeId, body.data.name));
  } catch (e) {
    return errorResponse(e, resumeId);
  }
}
