import type { Metadata } from "next";
import Link from "next/link";
import { BulkUpload } from "./BulkUpload";

export const metadata: Metadata = { title: "Upload CVs" };

export default function UploadPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Upload CVs</h1>
      <p className="mt-1 text-sm text-muted">
        Choose the role and drop one or many CVs. Each CV is evaluated automatically: the name is read from the CV, personal details are removed, and only the redacted text is scored by the AI. Results appear on the dashboard.{" "}
        <Link href="/examples" className="text-accent underline underline-offset-2">Try an example</Link>
      </p>
      <BulkUpload />
    </div>
  );
}
