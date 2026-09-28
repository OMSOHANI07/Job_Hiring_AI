import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-semibold tracking-tight">Kargo Hiring Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Sign in to review and score candidates.</p>
      <LoginForm />
    </div>
  );
}
