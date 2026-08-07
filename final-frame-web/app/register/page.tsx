import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import RegisterForm from "@/components/auth/RegisterForm";
import { loginHref, safeRelativeCallback } from "@/lib/auth/redirects";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a FinalFrame account.",
  alternates: { canonical: "/register" },
  robots: { index: false, follow: false },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    email?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeRelativeCallback(params.callbackUrl);
  const emailValue = Array.isArray(params.email) ? params.email[0] : params.email;
  const initialEmail = typeof emailValue === "string" && emailValue.length <= 254 ? emailValue : "";

  return (
    <AuthShell
      variant="register"
      title="Create account"
      footer={
        <>
          Already have an account?{" "}
          <Link href={loginHref(callbackUrl)} className="font-bold text-[var(--accent)] hover:text-[var(--accent-hover)]">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm callbackUrl={callbackUrl} initialEmail={initialEmail} />
    </AuthShell>
  );
}
