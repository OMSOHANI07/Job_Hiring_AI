import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http/respond";
import { MAX_UPLOAD_BYTES } from "@/lib/parse";
import { uploadCv } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

const Fields = z.object({
  role: z.enum(["PM", "SPM"]),
  name: z.string().max(120).optional(),
});

/** Trigger + Input + Context: parse -> redact -> Resume ID -> store. No AI call. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const fields = Fields.safeParse({ role: form.get("role"), name: form.get("name") || undefined });
    if (!fields.success) return NextResponse.json({ error: "Select the role the candidate applied for." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF or DOCX file." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File is larger than 4 MB." }, { status: 413 });
    const data = new Uint8Array(await file.arrayBuffer());
    const out = await uploadCv({ data, fileName: file.name, mime: file.type, role: fields.data.role, candidateName: fields.data.name });
    return NextResponse.json(out, { status: out.kind === "duplicate" ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
