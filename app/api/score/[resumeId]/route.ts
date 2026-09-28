import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http/respond";
import { isResumeId } from "@/lib/ids/resumeId";
import { scoreResume } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60; // Gemini call (~10–20 s) plus one retry with backoff

/** Processing: Gemini extraction on the redacted text, then deterministic scoring. Runs only after "Confirm & score". */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/score/[resumeId]">) {
  const { resumeId } = await ctx.params;
  if (!isResumeId(resumeId)) return NextResponse.json({ error: "Invalid Resume ID." }, { status: 400 });
  try {
    return NextResponse.json(await scoreResume(resumeId));
  } catch (e) {
    return errorResponse(e, resumeId);
  }
}
