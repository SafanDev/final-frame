import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";
import { registerHref, safeRelativeCallback } from "@/lib/auth/redirects";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to FinalFrame.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    registered?: string | string[];
    email?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeRelativeCallback(params.callbackUrl);
  const registered = (Array.isArray(params.registered) ? params.registered[0] : params.registered) === "1";
  const emailValue = Array.isArray(params.email) ? params.email[0] : params.email;
  const initialEmail = typeof emailValue === "string" && emailValue.length <= 254 ? emailValue : "";

  return (
    <AuthShell
      variant="login"
      title="Sign in"
      footer={
        <>
          New to FinalFrame?{" "}
          <Link href={registerHref(callbackUrl)} className="font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm callbackUrl={callbackUrl} initialEmail={initialEmail} registered={registered} />
    </AuthShell>
  );
}
