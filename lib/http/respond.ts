import "server-only";
import { NextResponse } from "next/server";
import { ParseError } from "@/lib/parse";
import { PipelineError } from "@/lib/pipeline";

/** Map known errors to readable JSON responses. Unknown errors are logged by type only (never payloads). */
export function errorResponse(e: unknown, resumeId?: string) {
  if (e instanceof ParseError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "too_large" ? 413 : e.code === "bad_type" ? 415 : 422 });
  }
  if (e instanceof PipelineError) return NextResponse.json({ error: e.message, retryable: e.retryable }, { status: e.status });
  console.error(`[kargo] unexpected error${resumeId ? ` resume=${resumeId}` : ""}: ${(e as Error)?.name ?? "Error"}`);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
