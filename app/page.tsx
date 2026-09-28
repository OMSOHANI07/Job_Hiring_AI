import type { Metadata } from "next";
import Link from "next/link";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = { title: "Upload a CV" };

export default function UploadPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Upload a CV</h1>
      <p className="mt-1 text-sm text-muted">
        Personal details are removed before anything is sent to the AI. You&apos;ll see a preview and confirm first.{" "}
        <Link href="/examples" className="text-accent underline underline-offset-2">Try an example</Link>
      </p>
      <UploadForm />
    </div>
  );
}
