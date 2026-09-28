import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mt-16 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted">That page or Resume ID doesn&apos;t exist. <Link href="/candidates" className="text-accent underline">Back to candidates</Link></p>
    </div>
  );
}
