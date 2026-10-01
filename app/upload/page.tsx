import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { BulkUpload } from "./BulkUpload";

export const metadata: Metadata = { title: "Upload CVs" };

export default function UploadPage() {
  return (
    <>
      <PageHero tag="Automatic evaluation" title="Upload CVs, Get A Shortlist">
        Choose the role and drop one or many CVs. Each CV is evaluated automatically: the name is read from the CV, personal details are removed, and only the redacted text is scored by the AI. Results appear on the dashboard.{" "}
        <Link href="/examples" className="text-accent underline underline-offset-2">Try an example</Link>
      </PageHero>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><div className="card max-w-4xl p-6"><BulkUpload /></div></div>
    </>
  );
}
