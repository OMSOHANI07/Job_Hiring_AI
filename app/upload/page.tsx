import type { Metadata } from "next";
import Link from "next/link";
import { BulkUpload } from "./BulkUpload";

export const metadata: Metadata = { title: "Upload CVs" };

export default function UploadPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Upload CVs</h1>
      <p className="mt-1 text-sm text-muted">
        Drop one or many CVs. Personal details are removed first; nothing goes to the AI until you click Confirm &amp; score.{" "}
        <Link href="/examples" className="text-accent underline underline-offset-2">Try an example</Link>
      </p>
      <BulkUpload />
    </div>
  );
}
