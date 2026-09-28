import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http/respond";
import { uploadCv } from "@/lib/pipeline";
import { SAMPLE_ACCEPT_PM, SAMPLE_REJECT_PM } from "@/samples/sampleCvs";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ sample: z.enum(["accept", "reject"]) });

/** Loads a bundled sample DOCX through the same upload pipeline (then the normal redaction preview). */
export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Unknown example." }, { status: 400 });
  const cv = body.data.sample === "accept" ? SAMPLE_ACCEPT_PM : SAMPLE_REJECT_PM;
  try {
    const data = new Uint8Array(await readFile(path.join(process.cwd(), "samples", cv.file)));
    const out = await uploadCv({
      data, fileName: cv.file, role: cv.appliedRole,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    return NextResponse.json(out, { status: out.kind === "duplicate" ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
